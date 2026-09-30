"""A local contract test: the UI stream and saved messages agree."""

import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient


class ChatContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        os.environ["DATABASE_URL"] = f"sqlite:///{cls.directory.name}/test.db"
        from app import main

        cls.main = main

    @classmethod
    def tearDownClass(cls):
        cls.main.engine.dispose()
        cls.directory.cleanup()
        os.environ.pop("DATABASE_URL", None)

    def test_stream_persists_both_turns(self):
        original_client = httpx.AsyncClient

        def gemini_response(request):
            self.assertIn("streamGenerateContent", str(request.url))
            return httpx.Response(
                200,
                text='data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}]}}]}\n\n',
                headers={"content-type": "text/event-stream"},
            )

        with TestClient(self.main.app) as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Test"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"):
                with patch.object(
                    self.main.httpx,
                    "AsyncClient",
                    side_effect=lambda **kwargs: original_client(
                        transport=httpx.MockTransport(gemini_response), **kwargs
                    ),
                ):
                    response = client.post(
                        "/api/v1/agent/stream",
                        json={"conversationId": conversation["id"], "message": "Hello"},
                    )

            self.assertEqual(response.status_code, 200)
            self.assertIn("event: stream:chunk", response.text)
            self.assertIn("event: run:complete", response.text)
            messages = client.get(f"/api/v1/conversations/{conversation['id']}/messages").json()
            self.assertEqual([message["content"] for message in messages], ["Hello", "Hello from Gemini"])

    def test_google_connect_read_and_disconnect(self):
        original_client = httpx.AsyncClient

        def google_response(request):
            if request.url.path == "/token" and b"authorization_code" in request.content:
                return httpx.Response(200, json={"refresh_token": "refresh-test", "scope": " ".join(self.main.GOOGLE_SCOPES)})
            if request.url.path == "/token":
                return httpx.Response(200, json={"access_token": "access-test"})
            if request.url.path.endswith("/messages"):
                return httpx.Response(200, json={"messages": [{"id": "m1"}]})
            if request.url.path.endswith("/messages/m1"):
                return httpx.Response(200, json={"snippet": "Hello", "payload": {"headers": [{"name": "Subject", "value": "Status"}]}})
            if request.url.path.endswith("/events"):
                return httpx.Response(200, json={"items": [{"summary": "Planning", "start": {"dateTime": "2026-10-01T09:00:00Z"}}]})
            return httpx.Response(404)

        with TestClient(self.main.app) as client:
            with patch.object(self.main.settings, "google_client_id", "client-id"), \
                 patch.object(self.main.settings, "google_client_secret", "client-secret"), \
                 patch.object(self.main.settings, "google_token_key", Fernet.generate_key().decode()), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(google_response), **kwargs)):
                start = client.post("/api/v1/integrations/app_gmail/connect")
                self.assertEqual(start.status_code, 200)
                state = parse_qs(urlparse(start.json()["authUrl"]).query)["state"][0]
                self.assertEqual(client.get("/api/v1/integrations/google/callback", params={"state": "wrong", "code": "code"}).status_code, 400)
                callback = client.get("/api/v1/integrations/google/callback", params={"state": state, "code": "code"}, follow_redirects=False)
                self.assertEqual(callback.status_code, 303)
                self.assertEqual(client.get("/api/v1/google/gmail/unread").json()["messages"][0]["subject"], "Status")
                self.assertEqual(client.get("/api/v1/google/calendar/upcoming").json()["events"][0]["summary"], "Planning")
                self.assertEqual(client.post("/api/v1/integrations/app_calendar/disconnect").status_code, 200)
                self.assertEqual(client.get("/api/v1/google/gmail/unread").status_code, 409)

    def test_briefing_passes_real_read_results_to_gemini(self):
        original_client = httpx.AsyncClient
        captured = []

        def gemini_response(request):
            captured.append(request.content.decode())
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"Briefing"}]}}]}\n\n')

        with TestClient(self.main.app) as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Briefing"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main, "unread_gmail", new=AsyncMock(return_value={"messages": [{"subject": "Status"}]})), \
                 patch.object(self.main, "upcoming_calendar", new=AsyncMock(return_value={"events": [{"summary": "Planning"}]})), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(gemini_response), **kwargs)):
                response = client.post("/api/v1/agent/stream", json={"conversationId": conversation["id"], "message": "Brief my unread email and calendar"})
            self.assertIn("event: tool:start", response.text)
            self.assertIn("event: run:complete", response.text)
            self.assertIn("Status", captured[0])
            self.assertIn("Planning", captured[0])

    def test_busy_model_uses_fallback_without_duplicate_message(self):
        original_client = httpx.AsyncClient
        requested_models = []

        def gemini_response(request):
            requested_models.append(str(request.url))
            if "primary-test" in str(request.url):
                return httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}})
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"Fallback reply"}]}}]}\n\n')

        with TestClient(self.main.app) as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Fallback"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main.settings, "gemini_model", "primary-test"), \
                 patch.object(self.main.settings, "gemini_fallback_model", "fallback-test"), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(gemini_response), **kwargs)):
                response = client.post("/api/v1/agent/stream", json={"conversationId": conversation["id"], "message": "Hello"})
            self.assertEqual(response.status_code, 200)
            self.assertIn("event: run:complete", response.text)
            self.assertEqual(len(requested_models), 2)
            messages = client.get(f"/api/v1/conversations/{conversation['id']}/messages").json()
            self.assertEqual([message["content"] for message in messages], ["Hello", "Fallback reply"])
