"""A local contract test: the UI stream and saved messages agree."""

import os
import tempfile
import unittest
import secrets
import asyncio
import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
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
        cls.main.settings.google_auth_allowed_email = "owner@example.com"
        cls.main.settings.session_secret = "test-only-session-secret"
        cls.main.settings.telegram_bot_token = ""

    @contextmanager
    def authenticated_client(self, email="owner@example.com"):
        with TestClient(self.main.app) as client:
            token = secrets.token_urlsafe(32)
            with self.main.SessionLocal() as db:
                db.add(self.main.AuthSession(
                    token_hash=self.main.session_digest(token),
                    email=email,
                    owner_id=email.casefold(),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()
            client.cookies.set("nexus_session", token)
            yield client

    def test_api_rejects_missing_session(self):
        with TestClient(self.main.app) as client:
            self.assertEqual(client.get("/api/v1/conversations").status_code, 401)

    def test_users_cannot_read_or_mutate_each_others_data(self):
        with self.authenticated_client("alice@example.com") as alice:
            conversation = alice.post("/api/v1/conversations", json={"title": "Alice private"}).json()
            memory = alice.post("/api/v1/memories", json={"title": "Private", "content": "Alice's private memory"}).json()
            with self.main.SessionLocal() as db:
                db.add(self.main.GoogleCredential(id="alice@example.com", owner_id="alice@example.com", refresh_token="encrypted-test", scope="https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"))
                db.commit()
            alice_integrations = {item["id"]: item["status"] for item in alice.get("/api/v1/integrations").json()}
            self.assertEqual(alice_integrations["app_gmail"], "connected")
            self.assertEqual(len(alice.get("/api/v1/conversations").json()), 1)
        with self.authenticated_client("bob@example.com") as bob:
            self.assertEqual(bob.get("/api/v1/conversations").json(), [])
            self.assertEqual(bob.get(f"/api/v1/conversations/{conversation['id']}/messages").status_code, 404)
            self.assertEqual(bob.delete(f"/api/v1/conversations/{conversation['id']}").status_code, 404)
            self.assertEqual(bob.get("/api/v1/memories").json(), [])
            self.assertEqual(bob.delete(f"/api/v1/memories/{memory['id']}").status_code, 404)
            connected = {item["id"]: item["status"] for item in bob.get("/api/v1/integrations").json()}
            self.assertEqual(connected["app_gmail"], "disconnected")

    def test_memory_suggestions_are_private_and_require_approval_to_save(self):
        with self.authenticated_client("memory-owner@example.com") as owner:
            with self.main.SessionLocal() as db:
                db.add(self.main.MemorySuggestionRecord(
                    id="suggestion_private", owner_id="memory-owner@example.com", conversation_id="conv_private",
                    category="preference", title="Concise replies", content="Prefers concise responses.",
                    tags=["communication"], status="pending",
                ))
                db.commit()
            pending = owner.get("/api/v1/memory-suggestions")
            self.assertEqual(pending.status_code, 200)
            self.assertEqual([item["id"] for item in pending.json()], ["suggestion_private"])
            with self.main.SessionLocal() as db:
                self.assertEqual(db.query(self.main.MemoryRecord).filter_by(owner_id="memory-owner@example.com").count(), 0)
        with self.authenticated_client("other-user@example.com") as other:
            self.assertEqual(other.get("/api/v1/memory-suggestions").json(), [])
            self.assertEqual(other.post("/api/v1/memory-suggestions/suggestion_private/decision", json={"decision": "approve"}).status_code, 404)
        with self.authenticated_client("memory-owner@example.com") as owner:
            with patch.object(self.main, "embed_text", new=AsyncMock(return_value=None)):
                approved = owner.post("/api/v1/memory-suggestions/suggestion_private/decision", json={
                    "decision": "approve", "title": "Concise replies", "content": "Prefers concise responses.",
                })
            self.assertEqual(approved.status_code, 200)
            self.assertTrue(approved.json()["memory"]["metadata"]["verifiedByUser"])
            self.assertEqual(owner.get("/api/v1/memory-suggestions").json(), [])

    def test_mcp_connectors_encrypt_credentials_and_are_account_scoped(self):
        encryption_key = Fernet.generate_key().decode()
        with patch.object(self.main.settings, "google_token_key", encryption_key):
            with self.authenticated_client("mcp-alice@example.com") as alice:
                response = alice.post("/api/v1/mcp/servers", json={
                    "name": "project-tools", "url": "https://mcp.example.com/mcp", "token": "private-test-token",
                })
                self.assertEqual(response.status_code, 201, response.text)
                server_id = response.json()["id"]
                self.assertTrue(response.json()["hasToken"])
                with self.main.SessionLocal() as db:
                    record = db.get(self.main.MCPServerRecord, server_id)
                    self.assertNotEqual(record.token_encrypted, "private-test-token")
                    self.assertEqual(Fernet(encryption_key.encode()).decrypt(record.token_encrypted.encode()).decode(), "private-test-token")
                gateway = self.main.mcp_gateway_for_account("mcp-alice@example.com")
                config = next(iter(gateway.servers.values()))
                self.assertEqual(config.headers["Authorization"], "Bearer private-test-token")
            with self.authenticated_client("mcp-bob@example.com") as bob:
                self.assertEqual(bob.get("/api/v1/mcp/servers").json(), [])
                self.assertEqual(bob.delete(f"/api/v1/mcp/servers/{server_id}").status_code, 404)
                self.assertEqual(self.main.mcp_gateway_for_account("mcp-bob@example.com").servers, {})

    def test_account_mcp_connector_rejects_insecure_or_local_urls(self):
        with self.authenticated_client("mcp-url@example.com") as client:
            self.assertEqual(client.post("/api/v1/mcp/servers", json={"name": "bad-http", "url": "http://example.com/mcp"}).status_code, 422)
            self.assertEqual(client.post("/api/v1/mcp/servers", json={"name": "bad-local", "url": "https://localhost/mcp"}).status_code, 422)
            self.assertEqual(client.post("/api/v1/mcp/servers", json={"name": "bad-query", "url": "https://example.com/mcp?token=secret"}).status_code, 422)

    def test_github_connection_and_repository_data_are_account_scoped(self):
        with self.authenticated_client("github-alice@example.com") as alice:
            with self.main.SessionLocal() as db:
                db.add(self.main.GitHubCredential(
                    owner_id="github-alice@example.com", login="alice-dev", avatar_url=None,
                    access_token="encrypted-test-token", refresh_token=None,
                ))
                db.commit()
            integrations = {item["id"]: item for item in alice.get("/api/v1/integrations").json()}
            self.assertEqual(integrations["app_github"]["status"], "connected")
        with self.authenticated_client("github-bob@example.com") as bob:
            integrations = {item["id"]: item for item in bob.get("/api/v1/integrations").json()}
            self.assertEqual(integrations["app_github"]["status"], "disconnected")
            self.assertEqual(bob.get("/api/v1/github/repositories").status_code, 409)

    def test_github_connect_uses_pkce_and_binds_state_to_signed_in_user(self):
        with patch.object(self.main.settings, "github_app_client_id", "github-client-id"), \
             patch.object(self.main.settings, "github_app_client_secret", "github-client-secret"), \
             self.authenticated_client("pkce-user@example.com") as client:
            response = client.post("/api/v1/integrations/app_github/connect")
            self.assertEqual(response.status_code, 200, response.text)
            authorization = parse_qs(urlparse(response.json()["authUrl"]).query)
            self.assertEqual(authorization["code_challenge_method"], ["S256"])
            self.assertTrue(authorization["code_challenge"][0])
            with self.main.SessionLocal() as db:
                state = db.get(self.main.OAuthState, authorization["state"][0])
                self.assertEqual(state.owner_id, "pkce-user@example.com")
                self.assertEqual(state.flow, "github")
                self.assertTrue(state.code_verifier)

    def test_github_callback_encrypts_user_tokens_and_saves_account(self):
        key = Fernet.generate_key()
        original_client = httpx.AsyncClient

        def github_response(request):
            if request.url.host == "github.com" and request.url.path.endswith("/access_token"):
                self.assertIn(b"code_verifier", request.content)
                return httpx.Response(200, json={
                    "access_token": "github-access-token", "refresh_token": "github-refresh-token",
                    "expires_in": 28800, "refresh_token_expires_in": 15811200,
                })
            if request.url.host == "api.github.com" and request.url.path == "/user":
                self.assertEqual(request.headers["Authorization"], "Bearer github-access-token")
                return httpx.Response(200, json={"login": "nexus-user", "avatar_url": "https://avatars.githubusercontent.com/u/1"})
            return httpx.Response(404)

        with patch.object(self.main.settings, "github_app_client_id", "github-client-id"), \
             patch.object(self.main.settings, "github_app_client_secret", "github-client-secret"), \
             patch.object(self.main.settings, "google_token_key", key.decode()), \
             patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(github_response), **kwargs)), \
             self.authenticated_client("callback-user@example.com") as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.OAuthState(
                    state="github-callback-state", integration_id="app_github", flow="github",
                    owner_id="callback-user@example.com", code_verifier="test-pkce-verifier",
                ))
                db.commit()
            response = client.get("/api/v1/integrations/github/callback", params={"state": "github-callback-state", "code": "one-time-code"}, follow_redirects=False)
            self.assertEqual(response.status_code, 303)
            self.assertIn("connected=github", response.headers["location"])
            with self.main.SessionLocal() as db:
                saved = db.get(self.main.GitHubCredential, "callback-user@example.com")
                self.assertEqual(saved.login, "nexus-user")
                self.assertEqual(Fernet(key).decrypt(saved.access_token.encode()).decode(), "github-access-token")
                self.assertEqual(Fernet(key).decrypt(saved.refresh_token.encode()).decode(), "github-refresh-token")

    def test_settings_and_runs_are_account_scoped_and_settings_are_applied(self):
        with self.authenticated_client("prefs-a@example.com") as alice:
            settings = alice.get("/api/v1/settings").json()
            settings["user"].update({"name": "A", "timezone": "Asia/Kolkata", "preferredTone": "technical"})
            settings["model"].update({"temperature": 0.65, "maxOutputTokens": 3072})
            saved = alice.put("/api/v1/settings", json=settings)
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(saved.json()["user"]["timezone"], "Asia/Kolkata")
            self.assertEqual(saved.json()["model"]["temperature"], 0.65)
            self.assertEqual(alice.get("/api/v1/activity/runs").json(), [])
        with self.authenticated_client("prefs-b@example.com") as bob:
            other = bob.get("/api/v1/settings").json()
            self.assertNotEqual(other["user"]["name"], "A")
            self.assertEqual(other["user"]["timezone"], "UTC")

    def test_tasks_and_approval_decisions_are_account_scoped(self):
        with self.authenticated_client("tasks-a@example.com") as alice:
            created = alice.post("/api/v1/tasks", json={
                "title": "Daily check", "description": "Summarize unread mail", "cronExpression": "*/5 * * * *",
                "priority": "medium", "requiresHumanApproval": False,
            })
            self.assertEqual(created.status_code, 201, created.text)
            task = created.json()
            self.assertTrue(task["requiresHumanApproval"])  # strict account policy
            queued = alice.post(f"/api/v1/tasks/{task['id']}/run").json()
            self.assertTrue(queued["approvalRequired"])
            approval_id = queued["approval"]["id"]
            self.assertEqual(len(alice.get("/api/v1/approvals").json()), 1)
        with self.authenticated_client("tasks-b@example.com") as bob:
            self.assertEqual(bob.get("/api/v1/tasks").json(), [])
            self.assertEqual(bob.get("/api/v1/approvals").json(), [])
            self.assertEqual(bob.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"}).status_code, 404)
        with self.authenticated_client("tasks-a@example.com") as alice:
            denied = alice.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "reject", "notes": "Not now"})
            self.assertEqual(denied.status_code, 200, denied.text)
            self.assertEqual(denied.json()["status"], "rejected")

    def test_google_sign_in_registers_verified_new_email(self):
        original_client = httpx.AsyncClient

        def google_response(request):
            if request.url.path == "/token":
                return httpx.Response(200, json={"access_token": "login-access"})
            if request.url.path == "/v1/userinfo":
                return httpx.Response(200, json={"email": "new-user@example.com", "email_verified": True})
            return httpx.Response(404)

        with TestClient(self.main.app) as client:
            with patch.object(self.main.settings, "google_client_id", "client-id"), \
                 patch.object(self.main.settings, "google_client_secret", "client-secret"), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(google_response), **kwargs)):
                with self.main.SessionLocal() as db:
                    db.add(self.main.OAuthState(state="signup-state", integration_id="auth", flow="login"))
                    db.commit()
                response = client.get("/api/v1/integrations/google/callback", params={"state": "signup-state", "code": "code"}, follow_redirects=False)
                self.assertEqual(response.status_code, 303)
                session = client.get("/api/v1/auth/session")
                self.assertEqual(session.status_code, 200)
                self.assertEqual(session.json()["email"], "new-user@example.com")
                self.assertEqual(client.get("/api/v1/conversations").json(), [])

    def test_telegram_link_code_is_single_use_and_binds_to_account(self):
        with self.authenticated_client("link-owner@example.com") as client:
            with patch.object(self.main.settings, "telegram_bot_token", "test-bot-token"):
                response = client.post("/api/v1/telegram/link")
                self.assertEqual(response.status_code, 200)
                code = response.json()["code"]
                self.assertEqual(client.get("/api/v1/telegram/link").json()["linked"], False)

            sent = []

            async def fake_send(_client, _method, payload):
                sent.append(payload["text"])
                return {}

            update = {"message": {
                "chat": {"id": 7654321, "type": "private"},
                "from": {"id": 7654321},
                "text": f"/link {code}",
            }}
            async def handle_update():
                async with httpx.AsyncClient() as fake_client:
                    await self.main.telegram_handle_message(fake_client, update)

            with patch.object(self.main, "telegram_api", new=fake_send):
                asyncio.run(handle_update())
            self.assertIn("linked to your NexusAI account", sent[-1])
            with self.main.SessionLocal() as db:
                link = db.get(self.main.TelegramConversation, "7654321")
                self.assertEqual(link.owner_id, "link-owner@example.com")
                self.assertIsNotNone(db.get(self.main.Conversation, link.conversation_id))
                self.assertIsNone(db.get(self.main.TelegramLinkCode, self.main.telegram_code_digest(code)))

    def test_cors_preflight_is_allowed_without_session(self):
        with TestClient(self.main.app) as client:
            response = client.options(
                "/api/v1/conversations",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:3000")
            self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")

    def test_cookie_authenticated_mutations_reject_foreign_origins(self):
        with self.authenticated_client() as client:
            response = client.post(
                "/api/v1/conversations",
                json={"title": "Should not be created"},
                headers={"Origin": "https://attacker.invalid"},
            )
            self.assertEqual(response.status_code, 403)

    def test_integrations_omits_whatsapp(self):
        with self.authenticated_client() as client:
            response = client.get("/api/v1/integrations")
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("app_whatsapp", {item["id"] for item in response.json()})
            self.assertEqual(client.get("/api/v1/integrations/whatsapp/webhook").status_code, 404)

    @classmethod
    def tearDownClass(cls):
        cls.main.engine.dispose()
        cls.directory.cleanup()
        os.environ.pop("DATABASE_URL", None)

    def test_stream_persists_both_turns(self):
        original_client = httpx.AsyncClient

        def gemini_response(request):
            if "generateContent" in str(request.url) and "streamGenerateContent" not in str(request.url):
                return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"suggestions":[{"category":"preference","title":"Prefers concise replies","content":"Prefers concise responses.","tags":["style"]}]}'}]}}]})
            self.assertIn("streamGenerateContent", str(request.url))
            return httpx.Response(
                200,
                text='data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}]}}]}\n\n',
                headers={"content-type": "text/event-stream"},
            )

        with self.authenticated_client() as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Test"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main, "embed_text", new=AsyncMock(return_value=None)):
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
            self.assertIn("event: memory:suggestions", response.text)
            self.assertIn("event: run:complete", response.text)
            messages = client.get(f"/api/v1/conversations/{conversation['id']}/messages").json()
            self.assertEqual([message["content"] for message in messages], ["Hello", "Hello from Gemini"])
            self.assertEqual(client.get("/api/v1/memories").json(), [])
            suggestions = client.get("/api/v1/memory-suggestions").json()
            self.assertEqual(len(suggestions), 1)
            approved = client.post(f"/api/v1/memory-suggestions/{suggestions[0]['id']}/decision", json={"decision": "approve"})
            self.assertEqual(approved.status_code, 200)
            self.assertEqual(client.get("/api/v1/memories").json()[0]["content"], "Prefers concise responses.")

    def test_tool_call_preserves_gemini_thought_signature(self):
        original_client = httpx.AsyncClient
        tool_name = "context7__query_docs"
        signature = "test-thought-signature"

        async def list_tools():
            return [{
                "name": tool_name, "server": "context7", "tool": "query_docs",
                "description": "Look up documentation", "inputSchema": {
                    "type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"],
                }, "readOnly": True, "requiresApproval": False,
            }]

        async def call_read_tool(_server, _tool, _arguments):
            return {"isError": False, "content": [{"type": "text", "text": "Docs result"}]}

        gateway = type("MockGateway", (), {
            "list_tools": staticmethod(list_tools),
            "call_read_tool": staticmethod(call_read_tool),
        })()
        requests = []

        def gemini_response(request):
            if "streamGenerateContent" not in str(request.url):
                return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
            body = request.read()
            requests.append(json.loads(body))
            if len(requests) == 1:
                event = {"candidates": [{"content": {"parts": [{
                    "functionCall": {"name": tool_name, "args": {"query": "LangGraph checkpoints"}},
                    "thoughtSignature": signature,
                }]}}]}
                return httpx.Response(200, text=(
                    "data: " + json.dumps(event) + "\n\n"
                ), headers={"content-type": "text/event-stream"})
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"Here are the docs."}]}}]}\n\n', headers={"content-type": "text/event-stream"})

        with self.authenticated_client() as client:
            conversation = client.post("/api/v1/conversations", json={"title": "MCP handoff"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main, "mcp_gateway_for_account", return_value=gateway), \
                 patch.object(self.main, "suggest_memories", new=AsyncMock(return_value=[])), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(gemini_response), **kwargs)):
                response = client.post("/api/v1/agent/stream", json={
                    "conversationId": conversation["id"], "message": "Find LangGraph checkpoint docs",
                })

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: run:complete", response.text)
        self.assertEqual(len(requests), 2)
        model_turn = next(item for item in requests[1]["contents"] if item.get("role") == "model")
        self.assertEqual(model_turn["parts"][0]["thoughtSignature"], signature)

    def test_google_connect_read_and_disconnect(self):
        original_client = httpx.AsyncClient

        def google_response(request):
            if request.url.path == "/v1/userinfo":
                return httpx.Response(200, json={"email": "owner@example.com", "email_verified": True})
            if request.url.path == "/token" and b"authorization_code" in request.content:
                scopes = {scope for values in self.main.GOOGLE_INTEGRATION_SCOPES.values() for scope in values}
                return httpx.Response(200, json={"refresh_token": "refresh-test", "access_token": "access-test", "scope": " ".join(scopes)})
            if request.url.path == "/token":
                return httpx.Response(200, json={"access_token": "access-test"})
            if request.url.path.endswith("/messages"):
                return httpx.Response(200, json={"messages": [{"id": "m1"}]})
            if request.url.path.endswith("/messages/m1"):
                return httpx.Response(200, json={"snippet": "Hello", "payload": {"headers": [{"name": "Subject", "value": "Status"}]}})
            if request.url.path.endswith("/events"):
                return httpx.Response(200, json={"items": [{"summary": "Planning", "start": {"dateTime": "2026-10-01T09:00:00Z"}}]})
            return httpx.Response(404)

        with self.authenticated_client() as client:
            with patch.object(self.main.settings, "google_client_id", "client-id"), \
                 patch.object(self.main.settings, "google_client_secret", "client-secret"), \
                 patch.object(self.main.settings, "google_token_key", Fernet.generate_key().decode()), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(google_response), **kwargs)):
                start = client.post("/api/v1/integrations/app_gmail/connect")
                self.assertEqual(start.status_code, 200)
                authorization = parse_qs(urlparse(start.json()["authUrl"]).query)
                self.assertEqual(
                    set(authorization["scope"][0].split()) & {
                        "https://www.googleapis.com/auth/gmail.readonly",
                        "https://www.googleapis.com/auth/gmail.compose",
                    },
                    {"https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"},
                )
                state = authorization["state"][0]
                self.assertEqual(client.get("/api/v1/integrations/google/callback", params={"state": "wrong", "code": "code"}).status_code, 400)
                callback = client.get("/api/v1/integrations/google/callback", params={"state": state, "code": "code"}, follow_redirects=False)
                self.assertEqual(callback.status_code, 303)
                self.assertEqual(client.get("/api/v1/google/gmail/unread").json()["messages"][0]["subject"], "Status")
                self.assertEqual(client.get("/api/v1/google/calendar/upcoming").json()["events"][0]["summary"], "Planning")
                self.assertEqual(client.post("/api/v1/integrations/app_gmail/disconnect").status_code, 200)
                self.assertEqual(client.get("/api/v1/google/gmail/unread").status_code, 409)

    def test_approved_gmail_draft_saves_but_never_sends(self):
        original_client = httpx.AsyncClient
        observed = []
        self.main.settings.google_token_key = Fernet.generate_key().decode()

        def google_response(request):
            if request.url.host == "oauth2.googleapis.com":
                return httpx.Response(200, json={"access_token": "gmail-access"})
            observed.append(request)
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.url.path, "/gmail/v1/users/me/drafts")
            self.assertIn("gmail-access", request.headers.get("authorization", ""))
            self.assertNotIn("/messages/send", str(request.url))
            return httpx.Response(200, json={"id": "draft-test"})

        with self.authenticated_client() as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.GoogleCredential(
                    id="owner@example.com", owner_id="owner@example.com",
                    refresh_token=self.main.cipher().encrypt(b"refresh-test").decode(),
                    scope="https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
                ))
                db.commit()
            with patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(google_response), **kwargs)):
                owner_token = self.main.current_owner.set("owner@example.com")
                try:
                    result = asyncio.run(self.main.create_approved_gmail_draft({"to": "person@example.com", "subject": "Review", "body": "Draft only"}))
                finally:
                    self.main.current_owner.reset(owner_token)
            self.assertTrue(result["success"])
            self.assertIn("did not send it", result["message"])
            self.assertEqual(len(observed), 1)

    def test_briefing_passes_real_read_results_to_gemini(self):
        original_client = httpx.AsyncClient
        captured = []

        def gemini_response(request):
            captured.append(request.content.decode())
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"Briefing"}]}}]}\n\n')

        with self.authenticated_client() as client:
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

    def test_specialist_handoffs_and_checkpoint_are_account_scoped(self):
        original_client = httpx.AsyncClient

        def gemini_response(_request):
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"Your briefing"}]}}]}\n\n')

        with self.authenticated_client("graph-owner@example.com") as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Graph run"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main, "unread_gmail", new=AsyncMock(return_value={"messages": [{"subject": "Private mail"}]})), \
                 patch.object(self.main, "upcoming_calendar", new=AsyncMock(return_value={"events": [{"summary": "Private meeting"}]})), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(gemini_response), **kwargs)):
                response = client.post("/api/v1/agent/stream", json={"conversationId": conversation["id"], "message": "Brief my unread email and calendar"})
            self.assertIn("event: agent:handoff", response.text)
            self.assertIn("Communications Agent", response.text)
            self.assertIn("Calendar Agent", response.text)
            run = client.get("/api/v1/activity/runs").json()[0]
            checkpoint = client.get(f"/api/v1/agent/runs/{run['id']}/checkpoint")
            self.assertEqual(checkpoint.status_code, 200, checkpoint.text)
            self.assertEqual(checkpoint.json()["plannedAgents"], ["memory", "communications", "calendar"])
            self.assertEqual(checkpoint.json()["pendingAgents"], [])
            self.assertNotIn("Private mail", checkpoint.text)
            run_id = run["id"]
        with self.authenticated_client("graph-other@example.com") as other:
            self.assertEqual(other.get(f"/api/v1/agent/runs/{run_id}/checkpoint").status_code, 404)
        with self.authenticated_client("graph-owner@example.com") as owner:
            self.assertEqual(owner.delete(f"/api/v1/conversations/{conversation['id']}").status_code, 200)
            self.assertEqual(owner.get(f"/api/v1/agent/runs/{run_id}/checkpoint").status_code, 404)

    def test_gemini_supervisor_routes_broad_read_request(self):
        original_client = httpx.AsyncClient

        def gemini_response(request):
            if "generateContent" in str(request.url) and "streamGenerateContent" not in str(request.url):
                return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '["calendar"]'}]}}]})
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"You have one event"}]}}]}\n\n')

        with self.authenticated_client("planner@example.com") as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Planning"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main, "upcoming_calendar", new=AsyncMock(return_value={"events": [{"summary": "Review"}]})), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(gemini_response), **kwargs)):
                response = client.post("/api/v1/agent/stream", json={"conversationId": conversation["id"], "message": "What needs my attention today?"})
            self.assertIn("event: run:complete", response.text)
            self.assertIn("Calendar Agent", response.text)

    def test_busy_model_uses_fallback_without_duplicate_message(self):
        original_client = httpx.AsyncClient
        requested_models = []

        def gemini_response(request):
            requested_models.append(str(request.url))
            if "generateContent" in str(request.url) and "streamGenerateContent" not in str(request.url):
                return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"suggestions":[]}'}]}}]})
            if "primary-test" in str(request.url):
                return httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}})
            return httpx.Response(200, text='data: {"candidates":[{"content":{"parts":[{"text":"Fallback reply"}]}}]}\n\n')

        with self.authenticated_client() as client:
            conversation = client.post("/api/v1/conversations", json={"title": "Fallback"}).json()
            with patch.object(self.main.settings, "gemini_api_key", "test-key"), \
                 patch.object(self.main.settings, "gemini_model", "primary-test"), \
                 patch.object(self.main.settings, "gemini_fallback_model", "fallback-test"), \
                 patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(gemini_response), **kwargs)):
                response = client.post("/api/v1/agent/stream", json={"conversationId": conversation["id"], "message": "Hello"})
            self.assertEqual(response.status_code, 200)
            self.assertIn("event: run:complete", response.text)
            self.assertEqual(len([url for url in requested_models if "streamGenerateContent" in url]), 2)
            messages = client.get(f"/api/v1/conversations/{conversation['id']}/messages").json()
            self.assertEqual([message["content"] for message in messages], ["Hello", "Fallback reply"])
