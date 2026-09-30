"""A local contract test: the UI stream and saved messages agree."""

import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
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
