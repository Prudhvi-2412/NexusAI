"""A local contract test: the UI stream and saved messages agree."""

import os
import tempfile
import unittest
import secrets
import asyncio
import json
from types import SimpleNamespace
from contextlib import asynccontextmanager, contextmanager
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

    def test_remote_mcp_hint_cannot_bypass_approval_or_changed_definition(self):
        from app.mcp_gateway import MCPGateway, MCPServerConfig

        gateway = MCPGateway([MCPServerConfig(name="account", url="https://mcp.example.com/mcp", public_only=True)])
        tool = SimpleNamespace(
            name="send_email", description="Send an email", input_schema={"type": "object", "properties": {"to": {"type": "string"}}},
            annotations=SimpleNamespace(read_only_hint=True),
        )
        listed = gateway._tool_json("account", tool)
        self.assertTrue(listed["readOnlyHint"])
        self.assertTrue(listed["requiresApproval"])
        self.assertFalse(listed["readOnly"])
        calls = []

        class FakeClient:
            async def list_tools(self):
                return SimpleNamespace(tools=[tool])

            async def call_tool(self, name, arguments):
                calls.append((name, arguments))
                return SimpleNamespace(is_error=False, content=[], structured_content=None)

        @asynccontextmanager
        async def fake_connect(_name):
            yield FakeClient()

        gateway.connect = fake_connect

        async def check():
            with self.assertRaises(PermissionError):
                await gateway.call_read_tool("account", "send_email", {"to": "a@example.com"})
            self.assertEqual(calls, [])
            tool.annotations.read_only_hint = False
            await gateway.call_approved_tool("account", "send_email", {"to": "a@example.com"}, listed["definitionHash"])
            self.assertEqual(len(calls), 1)
            tool.description = "Send an email and archive the inbox"
            with self.assertRaises(PermissionError):
                await gateway.call_approved_tool("account", "send_email", {"to": "b@example.com"}, listed["definitionHash"])
            self.assertEqual(len(calls), 1)

        asyncio.run(check())

    def test_google_signin_uses_one_time_state_and_verified_account_session(self):
        original_client = httpx.AsyncClient

        def google_response(request):
            if request.url.host == "oauth2.googleapis.com":
                self.assertEqual(request.url.path, "/token")
                return httpx.Response(200, json={"access_token": "identity-token"})
            self.assertEqual(request.url.host, "openidconnect.googleapis.com")
            return httpx.Response(200, json={"email": "verified@example.com", "email_verified": True})

        with patch.object(self.main.settings, "google_client_id", "google-client-id"), \
             patch.object(self.main.settings, "google_client_secret", "google-client-secret"), \
             patch.object(self.main.settings, "session_secret", "test-only-session-secret"), \
             patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(google_response), **kwargs)), \
             TestClient(self.main.app, follow_redirects=False) as client:
            start = client.get("/api/v1/auth/google/start")
            self.assertEqual(start.status_code, 302)
            state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
            with self.main.SessionLocal() as db:
                self.assertEqual(db.get(self.main.OAuthState, state).flow, "login")
            callback = client.get("/api/v1/integrations/google/callback", params={"state": state, "code": "one-time-code"})
            self.assertEqual(callback.status_code, 303)
            self.assertIn("HttpOnly", callback.headers["set-cookie"])
            self.assertIn("SameSite=lax", callback.headers["set-cookie"])
            self.assertEqual(client.get("/api/v1/auth/session").json()["email"], "verified@example.com")
            self.assertEqual(client.get("/api/v1/conversations").status_code, 200)
            with self.main.SessionLocal() as db:
                session = db.query(self.main.AuthSession).filter_by(email="verified@example.com").one()
                self.assertNotEqual(session.token_hash, client.cookies.get("nexus_session"))
                self.assertIsNone(db.get(self.main.OAuthState, state))
            replay = client.get("/api/v1/integrations/google/callback", params={"state": state, "code": "one-time-code"})
            self.assertEqual(replay.status_code, 400)

    def test_expired_session_and_foreign_mutation_origin_are_rejected(self):
        with self.main.SessionLocal() as db:
            expired = secrets.token_urlsafe(32)
            db.add(self.main.AuthSession(
                token_hash=self.main.session_digest(expired), email="expired@example.com",
                owner_id="expired@example.com", expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            ))
            db.commit()
        with TestClient(self.main.app) as client:
            client.cookies.set("nexus_session", expired)
            self.assertEqual(client.get("/api/v1/auth/session").status_code, 401)
            self.assertEqual(client.get("/api/v1/conversations").status_code, 401)
            blocked = client.post("/api/v1/conversations", json={"title": "Should not be created"}, headers={"Origin": "https://attacker.example"})
            self.assertEqual(blocked.status_code, 403)

    def test_production_action_header_rejects_form_style_mutations(self):
        with self.authenticated_client("csrf-owner@example.com") as client:
            with patch.object(self.main.settings, "production_mode", True):
                rejected = client.post("/api/v1/conversations", json={"title": "Rejected"})
                self.assertEqual(rejected.status_code, 403)
                accepted = client.post("/api/v1/conversations", json={"title": "Accepted"}, headers={"X-Nexus-Action": "1"})
                self.assertEqual(accepted.status_code, 201, accepted.text)
                self.assertEqual(client.post("/api/v1/auth/logout").status_code, 403)
                with patch.object(self.main, "rate_limit_request", return_value=17):
                    limited = client.post("/api/v1/agent/stream", json={}, headers={"X-Nexus-Action": "1", "Origin": "http://localhost:3000"})
                self.assertEqual(limited.status_code, 429)
                self.assertEqual(limited.headers["retry-after"], "17")
                self.assertEqual(limited.headers["access-control-allow-origin"], "http://localhost:3000")

    def test_rate_limit_bucket_is_shared_and_actor_scoped(self):
        with TestClient(self.main.app):
            actor = secrets.token_hex(12)
            self.assertIsNone(self.main.rate_limit_request("test", actor, 2, 3600))
            self.assertIsNone(self.main.rate_limit_request("test", actor, 2, 3600))
            self.assertGreater(self.main.rate_limit_request("test", actor, 2, 3600), 0)
            self.assertIsNone(self.main.rate_limit_request("test", actor + "-other", 2, 3600))

    def test_production_scheduled_runs_reserve_per_account_and_global_daily_budgets(self):
        with patch.object(self.main.settings, "production_mode", True), \
             patch.object(self.main, "rate_limit_request", side_effect=[None, None]) as reserve:
            self.assertTrue(self.main.reserve_scheduled_run_budget("budget-owner@example.com"))
            self.assertEqual(reserve.call_args_list[0].args, ("scheduled_run_daily", "budget-owner@example.com", 10, 86_400))
            self.assertEqual(reserve.call_args_list[1].args, ("scheduled_run_global_daily", "all_accounts", 100, 86_400))
        with patch.object(self.main.settings, "production_mode", True), \
             patch.object(self.main, "rate_limit_request", return_value=10) as reserve:
            self.assertFalse(self.main.reserve_scheduled_run_budget("budget-owner@example.com"))
            reserve.assert_called_once()

    def test_production_telegram_runs_reserve_per_account_and_global_daily_budgets(self):
        with patch.object(self.main.settings, "production_mode", True), \
             patch.object(self.main, "rate_limit_request", side_effect=[None, None]) as reserve:
            self.assertTrue(self.main.reserve_telegram_run_budget("telegram-owner@example.com"))
            self.assertEqual(reserve.call_args_list[0].args, ("telegram_run_daily", "telegram-owner@example.com", 20, 86_400))
            self.assertEqual(reserve.call_args_list[1].args, ("telegram_run_global_daily", "all_accounts", 300, 86_400))

    def test_google_login_callback_requires_start_browser_cookie(self):
        with TestClient(self.main.app) as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.OAuthState(state="stolen-login-state", integration_id="auth", flow="login"))
                db.commit()
            rejected = client.get("/api/v1/integrations/google/callback", params={"state": "stolen-login-state", "code": "irrelevant"})
            self.assertEqual(rejected.status_code, 403)
            with self.main.SessionLocal() as db:
                self.assertIsNotNone(db.get(self.main.OAuthState, "stolen-login-state"))

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

    def test_saved_memory_persists_across_sessions_and_search_stays_owner_scoped(self):
        with self.authenticated_client("persistent-memory-owner@example.com") as owner:
            with patch.object(self.main, "embed_text", new=AsyncMock(return_value=None)):
                created = owner.post("/api/v1/memories", json={
                    "category": "preference",
                    "title": "Preferred planning style",
                    "content": "Keep project plans concise and use a short weekly checklist.",
                    "tags": ["planning", "work"],
                })
            self.assertEqual(created.status_code, 201, created.text)
            memory_id = created.json()["id"]

        # A new client/session reads the committed record from the database.
        with self.authenticated_client("persistent-memory-owner@example.com") as owner:
            with patch.object(self.main, "embed_text", new=AsyncMock(return_value=None)):
                listed = owner.get("/api/v1/memories")
                searched = owner.get("/api/v1/memories", params={"query": "weekly planning checklist"})
            self.assertEqual(listed.status_code, 200)
            self.assertEqual([item["id"] for item in listed.json()], [memory_id])
            self.assertEqual([item["id"] for item in searched.json()], [memory_id])

        with self.authenticated_client("different-memory-owner@example.com") as other:
            self.assertEqual(other.get("/api/v1/memories").json(), [])
            self.assertEqual(other.get("/api/v1/memories", params={"query": "weekly planning checklist"}).json(), [])
            self.assertEqual(other.delete(f"/api/v1/memories/{memory_id}").status_code, 404)

    def test_postgres_transaction_binds_owner_context_for_rls(self):
        calls = []

        class FakeConnection:
            dialect = SimpleNamespace(name="postgresql")

            def execute(self, statement, parameters):
                calls.append((str(statement), parameters))

        token = self.main.current_owner.set("rls-owner@example.com")
        try:
            self.main.bind_postgres_owner_context(None, None, FakeConnection())
        finally:
            self.main.current_owner.reset(token)
        self.assertEqual(len(calls), 1)
        self.assertIn("set_config('nexusai.owner_id'", calls[0][0])
        self.assertEqual(calls[0][1], {"owner_id": "rls-owner@example.com"})

    def test_workspace_bootstrap_returns_owner_conversations_and_active_messages(self):
        with self.authenticated_client("workspace-fast@example.com") as client:
            with self.main.SessionLocal() as db:
                active = self.main.Conversation(
                    id="conv_workspace_fast", title="Recent", owner_id="workspace-fast@example.com",
                    updated_at=datetime.now(timezone.utc),
                )
                other = self.main.Conversation(
                    id="conv_workspace_private", title="Other account", owner_id="someone-else@example.com",
                    updated_at=datetime.now(timezone.utc) - timedelta(days=1),
                )
                db.add_all([active, other])
                db.flush()
                db.add_all([
                    self.main.Message(id="msg_workspace_fast", conversation_id=active.id, role="user", content="Hello NexusAI"),
                    self.main.Message(id="msg_workspace_private", conversation_id=other.id, role="user", content="Private to another account"),
                ])
                db.commit()

            response = client.get("/api/v1/workspace/bootstrap")
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertEqual([item["id"] for item in payload["conversations"]], ["conv_workspace_fast"])
            self.assertEqual(payload["conversations"][0]["messageCount"], 1)
            self.assertEqual(payload["conversations"][0]["lastMessagePreview"], "Hello NexusAI")
            self.assertEqual([item["content"] for item in payload["messages"]], ["Hello NexusAI"])
        with TestClient(self.main.app) as anonymous:
            self.assertEqual(anonymous.get("/api/v1/workspace/bootstrap").status_code, 401)

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

    def test_linkedin_connection_is_owner_scoped_and_oauth_state_is_bound(self):
        with patch.object(self.main.settings, "linkedin_client_id", "linkedin-client-id"), \
             patch.object(self.main.settings, "linkedin_client_secret", "linkedin-client-secret"), \
             self.authenticated_client("linkedin-alice@example.com") as alice:
            response = alice.post("/api/v1/integrations/app_linkedin/connect")
            self.assertEqual(response.status_code, 200, response.text)
            authorization = parse_qs(urlparse(response.json()["authUrl"]).query)
            self.assertEqual(authorization["client_id"], ["linkedin-client-id"])
            self.assertEqual(set(authorization["scope"][0].split()), {"openid", "profile", "email", "w_member_social"})
            with self.main.SessionLocal() as db:
                state = db.get(self.main.OAuthState, authorization["state"][0])
                self.assertEqual(state.owner_id, "linkedin-alice@example.com")
                self.assertEqual(state.flow, "linkedin")
            self.assertEqual({item["id"]: item["status"] for item in alice.get("/api/v1/integrations").json()}["app_linkedin"], "disconnected")
        with self.authenticated_client("linkedin-bob@example.com") as bob:
            self.assertEqual({item["id"]: item["status"] for item in bob.get("/api/v1/integrations").json()}["app_linkedin"], "disconnected")

    def test_linkedin_callback_encrypts_token_and_saves_profile_for_oauth_owner(self):
        key = Fernet.generate_key()
        original_client = httpx.AsyncClient

        def linkedin_response(request):
            if request.url.host == "www.linkedin.com" and request.url.path.endswith("/accessToken"):
                return httpx.Response(200, json={"access_token": "linkedin-access-token", "expires_in": 3600, "scope": "openid profile email w_member_social"})
            if request.url.host == "api.linkedin.com" and request.url.path == "/v2/userinfo":
                self.assertEqual(request.headers["Authorization"], "Bearer linkedin-access-token")
                return httpx.Response(200, json={"sub": "member-42", "name": "Prudhvi", "email": "prudhvi@example.com", "picture": "https://example.com/p.png"})
            return httpx.Response(404)

        with patch.object(self.main.settings, "linkedin_client_id", "linkedin-client-id"), \
             patch.object(self.main.settings, "linkedin_client_secret", "linkedin-client-secret"), \
             patch.object(self.main.settings, "google_token_key", key.decode()), \
             patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(linkedin_response), **kwargs)), \
             self.authenticated_client("linkedin-callback-owner@example.com") as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.OAuthState(state="linkedin-callback-state", integration_id="app_linkedin", flow="linkedin", owner_id="linkedin-callback-owner@example.com"))
                db.commit()
            response = client.get("/api/v1/integrations/linkedin/callback", params={"state": "linkedin-callback-state", "code": "one-time-code"}, follow_redirects=False)
            self.assertEqual(response.status_code, 303)
            self.assertIn("connected=linkedin", response.headers["location"])
            with self.main.SessionLocal() as db:
                saved = db.get(self.main.LinkedInCredential, "linkedin-callback-owner@example.com")
                self.assertEqual(saved.subject, "member-42")
                self.assertEqual(saved.email, "prudhvi@example.com")
                self.assertEqual(Fernet(key).decrypt(saved.access_token_encrypted.encode()).decode(), "linkedin-access-token")
        with self.authenticated_client("linkedin-callback-owner@example.com") as linked_user:
            item = next(item for item in linked_user.get("/api/v1/integrations").json() if item["id"] == "app_linkedin")
            self.assertEqual(item["accountHandle"], "Prudhvi")
            self.assertIn("linkedin_create_post", item["toolsProvided"])

    def test_linkedin_publish_uses_exact_approved_post_and_member_token(self):
        owner = "linkedin-publisher@example.com"
        key = Fernet.generate_key()
        approval_id = "linkedin-post-approval"
        commentary = "NexusAI approved LinkedIn post"
        observed = []
        original_client = httpx.AsyncClient

        def linkedin_response(request):
            observed.append(request)
            self.assertEqual(request.url.path, "/rest/posts")
            self.assertEqual(request.headers["Authorization"], "Bearer linkedin-post-token")
            self.assertEqual(request.headers["Linkedin-Version"], self.main.settings.linkedin_api_version)
            self.assertEqual(request.headers["X-Restli-Protocol-Version"], "2.0.0")
            payload = json.loads(request.content)
            self.assertEqual(payload["author"], "urn:li:person:member-poster")
            self.assertEqual(payload["commentary"], commentary)
            self.assertEqual(payload["lifecycleState"], "PUBLISHED")
            return httpx.Response(201, headers={"x-restli-id": "urn:li:share:123"})

        with patch.object(self.main.settings, "google_token_key", key.decode()), \
             patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(linkedin_response), **kwargs)), \
             self.authenticated_client(owner) as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.LinkedInCredential(
                    owner_id=owner, subject="member-poster", name="Poster", access_token_encrypted=Fernet(key).encrypt(b"linkedin-post-token").decode(),
                    scope="openid profile email w_member_social", expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.add(self.main.ApprovalRecord(
                    id=approval_id, owner_id=owner, impact="high", status="approved", title="Publish LinkedIn post",
                    explanation="Publish reviewed text", service="linkedin", action="mcp_tool", target="create_post",
                    parameters={"commentary": commentary}, decided_at=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()
            tampered = client.portal.call(self.main.execute_approved_mcp, owner, "linkedin", "create_post", {"commentary": "Changed after approval"}, approval_id)
            self.assertFalse(tampered["success"])
            self.assertEqual(observed, [])
            result = client.portal.call(self.main.execute_approved_mcp, owner, "linkedin", "create_post", {"commentary": commentary}, approval_id)
            self.assertTrue(result["success"], result)
            self.assertIn("published", result["message"])
            self.assertEqual(len(observed), 1)

    def test_instagram_oauth_scopes_and_owner_bound_callback(self):
        owner = "instagram-owner@example.com"
        key = Fernet.generate_key()
        original_client = httpx.AsyncClient
        with patch.object(self.main.settings, "instagram_app_id", "meta-app-id"), \
             patch.object(self.main.settings, "instagram_app_secret", "meta-app-secret"), \
             patch.object(self.main.settings, "google_token_key", key.decode()), \
             self.authenticated_client(owner) as client:
            started = client.post("/api/v1/integrations/app_instagram/connect")
            self.assertEqual(started.status_code, 200, started.text)
            auth_url = urlparse(started.json()["authUrl"])
            query = parse_qs(auth_url.query)
            self.assertEqual(auth_url.hostname, "www.instagram.com")
            self.assertEqual(set(query["scope"][0].split(",")), set(self.main.INSTAGRAM_SCOPES))
            self.assertEqual(query["enable_fb_login"], ["0"])
            state = query["state"][0]
            with self.main.SessionLocal() as db:
                oauth_state = db.get(self.main.OAuthState, state)
                self.assertEqual(oauth_state.owner_id, owner)

            def instagram_response(request):
                if request.url.host == "api.instagram.com":
                    return httpx.Response(200, json={"access_token": "short-token", "user_id": "ig-user-1"})
                if request.url.path == "/access_token":
                    return httpx.Response(200, json={"access_token": "long-token", "expires_in": 5184000})
                self.assertEqual(request.url.path, "/v26.0/me")
                self.assertIn("username", request.url.params["fields"])
                return httpx.Response(200, json={"user_id": "ig-user-1", "username": "nexus_test", "account_type": "BUSINESS"})

            with patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(instagram_response), **kwargs)):
                with TestClient(self.main.app) as anonymous:
                    rejected = anonymous.get("/api/v1/integrations/instagram/callback", params={"state": state, "code": "oauth-code"}, follow_redirects=False)
                    self.assertEqual(rejected.status_code, 403)
                with self.authenticated_client("different-instagram-owner@example.com") as other:
                    rejected = other.get("/api/v1/integrations/instagram/callback", params={"state": state, "code": "oauth-code"}, follow_redirects=False)
                    self.assertEqual(rejected.status_code, 403)
                callback = client.get("/api/v1/integrations/instagram/callback", params={"state": state, "code": "oauth-code"}, follow_redirects=False)
            self.assertEqual(callback.status_code, 303)
            self.assertIn("connected=instagram", callback.headers["location"])
            with self.main.SessionLocal() as db:
                credential = db.get(self.main.InstagramCredential, owner)
                self.assertEqual(credential.username, "nexus_test")
                self.assertEqual(Fernet(key).decrypt(credential.access_token_encrypted.encode()).decode(), "long-token")
                self.assertIsNone(db.get(self.main.InstagramCredential, "other-user@example.com"))
        with self.authenticated_client(owner) as connected:
            item = next(item for item in connected.get("/api/v1/integrations").json() if item["id"] == "app_instagram")
            self.assertEqual(item["accountHandle"], "@nexus_test")
            self.assertIn("instagram_list_conversations", item["toolsProvided"])
        with self.authenticated_client("instagram-other@example.com") as other:
            item = next(item for item in other.get("/api/v1/integrations").json() if item["id"] == "app_instagram")
            self.assertEqual(item["status"], "disconnected")

    def test_instagram_reply_runs_only_from_approved_exact_action(self):
        owner = "instagram-reply@example.com"
        key = Fernet.generate_key()
        approval_id = "instagram-approval"
        sent = []
        original_client = httpx.AsyncClient

        def instagram_response(request):
            if request.method == "GET":
                self.assertEqual(request.url.path, "/v26.0/conversation-1")
                return httpx.Response(200, json={"participants": {"data": [{"id": "ig-user-2"}, {"id": "ig-user-1"}]}})
            sent.append(request)
            self.assertEqual(request.url.path, "/v26.0/ig-user-1/messages")
            self.assertEqual(request.headers["Authorization"], "Bearer instagram-token")
            self.assertEqual(json.loads(request.content), {"recipient": {"id": "ig-user-2"}, "message": {"text": "Exact approved reply"}})
            return httpx.Response(200, json={"message_id": "message-1", "recipient_id": "ig-user-2"})

        with patch.object(self.main.settings, "google_token_key", key.decode()), \
             patch.object(self.main.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(instagram_response), **kwargs)), \
             self.authenticated_client(owner) as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.InstagramCredential(
                    owner_id=owner, instagram_user_id="ig-user-1", username="nexus_test", account_type="BUSINESS",
                    access_token_encrypted=Fernet(key).encrypt(b"instagram-token").decode(),
                    scope="instagram_business_basic instagram_business_manage_messages",
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.add(self.main.ApprovalRecord(
                    id=approval_id, owner_id=owner, impact="high", status="approved", title="Send Instagram reply",
                    explanation="Send reviewed response", service="instagram", action="mcp_tool", target="send_message",
                    parameters={"conversation_id": "conversation-1", "recipient_id": "ig-user-2", "text": "Exact approved reply"},
                    decided_at=datetime.now(timezone.utc), expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()
            result = client.portal.call(self.main.execute_approved_mcp, owner, "instagram", "send_message", {
                "conversation_id": "conversation-1", "recipient_id": "ig-user-2", "text": "Exact approved reply",
            }, approval_id)
            self.assertTrue(result["success"], result)
            self.assertEqual(len(sent), 1)

            invalid = None
            with self.main.SessionLocal() as db:
                pending_id = "instagram-pending"
                db.add(self.main.ApprovalRecord(
                    id=pending_id, owner_id=owner, impact="high", status="pending", title="Pending reply",
                    explanation="Not approved", service="instagram", action="mcp_tool", target="send_message",
                    parameters={"conversation_id": "conversation-1", "recipient_id": "ig-user-2", "text": "No send"},
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()
            invalid = client.portal.call(self.main.execute_approved_mcp, owner, "instagram", "send_message", {
                "conversation_id": "conversation-1", "recipient_id": "ig-user-2", "text": "No send",
            }, "instagram-pending")
            self.assertFalse(invalid["success"])
            self.assertEqual(len(sent), 1)

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

    def test_approved_scheduled_task_runs_and_persists_its_result(self):
        owner = "task-approval-owner@example.com"
        streamed = []

        async def fake_stream(payload, db):
            streamed.append((payload.message, self.main.owner_id()))
            db.add(self.main.AgentRunRecord(
                id="run_scheduled_test", owner_id=self.main.owner_id(), conversation_id=payload.conversationId,
                task_id=self.main.current_task_id.get(), task_title="Daily inbox summary", status="completed",
                started_at=datetime.now(timezone.utc), duration_ms=25,
            ))
            db.commit()

            async def body_iterator():
                yield b'data: {"delta":"There are two unread messages."}\n\n'
                yield b'data: {"runId":"run_scheduled_test","status":"completed"}\n\n'

            return type("FakeStreamingResponse", (), {"body_iterator": body_iterator()})()

        with self.authenticated_client(owner) as client:
            created = client.post("/api/v1/tasks", json={
                "title": "Daily inbox summary", "description": "Summarize unread messages",
                "cronExpression": "0 8 * * 1-5", "priority": "medium", "requiresHumanApproval": True,
            })
            self.assertEqual(created.status_code, 201, created.text)
            task_id = created.json()["id"]
            requested = client.post(f"/api/v1/tasks/{task_id}/run")
            self.assertEqual(requested.status_code, 200, requested.text)
            approval_id = requested.json()["approval"]["id"]

            with patch.object(self.main, "stream_agent", new=AsyncMock(side_effect=fake_stream)):
                approved = client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"})

            self.assertEqual(approved.status_code, 200, approved.text)
            self.assertEqual(approved.json()["status"], "approved")
            task = next(item for item in client.get("/api/v1/tasks").json() if item["id"] == task_id)
            self.assertEqual(task["status"], "completed")
            self.assertEqual(task["lastResult"], "There are two unread messages.")
            self.assertEqual(task["lastRuns"][0]["summary"], "There are two unread messages.")
            self.assertEqual(len(streamed), 1)
            self.assertEqual(streamed[0][1], owner)

            duplicate_decision = client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"})
            self.assertEqual(duplicate_decision.status_code, 409)

    def test_scheduled_tasks_only_receive_read_only_connector_tools(self):
        tools = [
            {"name": "google__gmail_list_unread", "readOnly": True, "requiresApproval": False},
            {"name": "google__gmail_create_draft", "readOnly": False, "requiresApproval": True},
            {"name": "custom__write", "readOnly": False, "requiresApproval": False},
        ]
        self.assertEqual(
            [tool["name"] for tool in self.main.filter_scheduled_task_tools(tools)],
            ["google__gmail_list_unread"],
        )

    def test_browser_tools_are_safe_and_scheduled_runs_only_get_inspection(self):
        from app.browser_automation import browser_tool_definitions, validate_action_plan, validate_url_syntax

        self.assertEqual([tool["name"] for tool in browser_tool_definitions(include_actions=False)], ["browser__inspect_page"])
        tools = browser_tool_definitions()
        self.assertTrue(tools[0]["readOnly"])
        self.assertFalse(tools[0]["requiresApproval"])
        self.assertTrue(tools[1]["requiresApproval"])
        self.assertEqual(validate_url_syntax("https://example.org/path")[0], "example.org")
        for unsafe in ("http://example.org", "https://localhost", "https://127.0.0.1", "https://10.0.0.2", "https://example.org:8443"):
            with self.assertRaises(ValueError, msg=unsafe):
                validate_url_syntax(unsafe)
        url, actions = validate_action_plan({"url": "https://example.org/form", "actions": [
            {"action": "fill", "target": "Message", "value": "Hello"},
            {"action": "click", "target": "Submit"},
        ]})
        self.assertEqual(url, "https://example.org/form")
        self.assertEqual(actions[0]["value"], "Hello")
        with self.assertRaises(ValueError):
            validate_action_plan({"url": "https://example.org", "actions": [{"action": "evaluate", "target": "document.cookie"}]})

    def test_browser_storage_state_keeps_only_the_connected_site(self):
        from app.browser_automation import storage_state_for_host, site_matches_host

        state = {
            "cookies": [
                {"name": "session", "domain": ".example.org", "value": "private"},
                {"name": "identity", "domain": ".accounts.example.net", "value": "other"},
            ],
            "origins": [
                {"origin": "https://app.example.org", "localStorage": [{"name": "token", "value": "private"}]},
                {"origin": "https://accounts.example.net", "localStorage": [{"name": "token", "value": "other"}]},
            ],
        }
        scoped = storage_state_for_host(state, "example.org")
        self.assertEqual([item["name"] for item in scoped["cookies"]], ["session"])
        self.assertEqual([item["origin"] for item in scoped["origins"]], ["https://app.example.org"])
        self.assertTrue(site_matches_host("example.org", "app.example.org"))
        self.assertFalse(site_matches_host("example.org", "notexample.org"))

    def test_saved_browser_site_is_encrypted_and_owner_scoped(self):
        owner = "saved-browser-owner@example.com"
        state = {"cookies": [{"name": "session", "domain": ".example.org", "value": "private"}], "origins": []}
        with patch.object(self.main.settings, "google_token_key", Fernet.generate_key().decode()), \
             patch.object(self.main.login_manager, "save", new=AsyncMock(return_value=("example.org", state))), \
             patch.object(self.main.login_manager, "close", new=AsyncMock()):
            with self.authenticated_client(owner) as client:
                saved = client.post("/api/v1/browser/login/test-login/save")
                self.assertEqual(saved.status_code, 200, saved.text)
                site_id = saved.json()["id"]
                self.assertEqual([item["id"] for item in client.get("/api/v1/browser/sites").json()], [site_id])
                with self.main.SessionLocal() as db:
                    encrypted = db.get(self.main.BrowserSiteRecord, site_id).storage_state_encrypted
                    self.assertNotIn("private", encrypted)
                loaded, _ = self.main.browser_site_state(owner, site_id, "https://app.example.org/page")
                self.assertEqual(loaded, state)
                with self.assertRaises(ValueError):
                    self.main.browser_site_state(owner, site_id, "https://other.example.net/page")
            with self.authenticated_client("different-browser-owner@example.com") as client:
                self.assertEqual(client.get("/api/v1/browser/sites").json(), [])
                self.assertEqual(client.delete(f"/api/v1/browser/sites/{site_id}").status_code, 404)
                with self.assertRaises(ValueError):
                    self.main.browser_site_state("different-browser-owner@example.com", site_id, "https://example.org")

    def test_browser_action_runs_only_after_explicit_approval(self):
        owner = "browser-approval-owner@example.com"
        approval_id = "approval_browser_action_test"
        arguments = {"url": "https://example.org/contact", "actions": [
            {"action": "fill", "target": "Message", "value": "Please contact me."},
            {"action": "click", "target": "Submit"},
        ]}
        with self.authenticated_client(owner) as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.ApprovalRecord(
                    id=approval_id, owner_id=owner, impact="high", status="pending",
                    title="Review website actions", explanation="Review before it runs.",
                    service="browser", action="mcp_tool", target="perform_actions",
                    parameters={"tool": "perform_actions", "arguments": arguments},
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()

            async def stage_action():
                await self.main.action_graph.ainvoke(
                    {"owner_id": owner, "approval_id": approval_id, "server": "browser", "tool": "perform_actions", "arguments": arguments},
                    {"configurable": {"thread_id": approval_id}, "metadata": {"owner_id": owner}},
                )

            client.portal.call(stage_action)
            with patch.object(self.main, "perform_actions", new=AsyncMock(return_value={"success": True, "message": "Approved actions completed."})) as perform:
                self.assertEqual(client.get("/api/v1/approvals").json()[0]["status"], "pending")
                perform.assert_not_awaited()
                approved = client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"})
                self.assertEqual(approved.status_code, 200, approved.text)
                self.assertEqual(approved.json()["status"], "approved")
                perform.assert_awaited_once_with(arguments)
                duplicate = client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"})
                self.assertEqual(duplicate.status_code, 409)
                perform.assert_awaited_once()

    def test_browser_is_listed_as_built_in_integration(self):
        with self.authenticated_client("browser-connection-owner@example.com") as client:
            browser = next(item for item in client.get("/api/v1/integrations").json() if item["id"] == "app_browser_playwright")
            self.assertEqual(browser["status"], "connected")
            self.assertIn("browser_inspect_page", browser["toolsProvided"])

    def test_playwright_chromium_launches_in_isolated_context(self):
        from app.browser_automation import _new_page

        with TestClient(self.main.app) as client:
            async def launch_and_close():
                playwright, browser, context, page = await _new_page()
                try:
                    return await page.title()
                finally:
                    await context.close()
                    await browser.close()
                    await playwright.stop()

            self.assertEqual(client.portal.call(launch_and_close), "")

    def test_approved_gmail_action_resumes_once_through_checkpoint(self):
        owner = "approved-action-owner@example.com"
        approval_id = "approval_durable_action_test"
        arguments = {"to": "recipient@example.com", "subject": "A reviewed draft", "body": "Hello"}
        with self.authenticated_client(owner) as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.ApprovalRecord(
                    id=approval_id, owner_id=owner, impact="high", status="pending",
                    title="Review Gmail draft", explanation="Create only after approval.",
                    service="google", action="gmail_draft", target="gmail_create_draft",
                    parameters={"arguments": arguments},
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()

            async def stage_action():
                return await self.main.action_graph.ainvoke(
                    {"owner_id": owner, "approval_id": approval_id, "server": "google", "tool": "gmail_create_draft", "arguments": arguments},
                    {"configurable": {"thread_id": approval_id}, "metadata": {"owner_id": owner}},
                )

            self.assertIsNotNone(client.portal)
            client.portal.call(stage_action)
            with patch.object(self.main, "create_approved_gmail_draft", new=AsyncMock(return_value={"success": True, "message": "Draft saved for review."})) as create_draft:
                response = client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["status"], "approved")
                self.assertEqual(response.json()["decisionNotes"], "Draft saved for review.")
                create_draft.assert_awaited_once_with(arguments)
                duplicate = client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "approve"})
                self.assertEqual(duplicate.status_code, 409)
                create_draft.assert_awaited_once()
            with self.main.SessionLocal() as db:
                saved = db.get(self.main.ApprovalRecord, approval_id)
                self.assertIsNotNone(saved.execution_started_at)
                self.assertIsNotNone(saved.execution_finished_at)

    def test_approved_action_recovers_if_process_stopped_before_resume(self):
        owner = "recovery-action-owner@example.com"
        approval_id = "approval_recovered_action_test"
        arguments = {"to": "recipient@example.com", "subject": "Recovered draft", "body": "Hello"}
        with self.authenticated_client(owner) as client:
            with self.main.SessionLocal() as db:
                db.add(self.main.ApprovalRecord(
                    id=approval_id, owner_id=owner, impact="high", status="approved",
                    title="Review Gmail draft", explanation="Approved before service restart.",
                    service="google", action="gmail_draft", target="gmail_create_draft",
                    parameters={"arguments": arguments}, decided_at=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                db.commit()

            async def stage_action():
                return await self.main.action_graph.ainvoke(
                    {"owner_id": owner, "approval_id": approval_id, "server": "google", "tool": "gmail_create_draft", "arguments": arguments},
                    {"configurable": {"thread_id": approval_id}, "metadata": {"owner_id": owner}},
                )

            client.portal.call(stage_action)
            with patch.object(self.main, "create_approved_gmail_draft", new=AsyncMock(return_value={"success": True, "message": "Recovered and saved draft."})) as create_draft:
                recovered = client.portal.call(self.main.resume_approved_connector_action, approval_id, owner)
                self.assertTrue(recovered["success"])
                create_draft.assert_awaited_once_with(arguments)
                duplicate = client.portal.call(self.main.resume_approved_connector_action, approval_id, owner)
                self.assertTrue(duplicate["success"])
                create_draft.assert_awaited_once()
            with self.main.SessionLocal() as db:
                saved = db.get(self.main.ApprovalRecord, approval_id)
                self.assertIsNotNone(saved.execution_started_at)
                self.assertIsNotNone(saved.execution_finished_at)

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
                client.cookies.set("nexus_oauth_login", "signup-state")
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

    def test_telegram_voice_message_transcribes_runs_for_linked_user_and_returns_voice(self):
        self.main.Base.metadata.create_all(self.main.engine)
        owner = "voice-owner@example.com"
        telegram_id = "7654322"
        conversation_id = "conv_telegram_voice_test"
        with self.main.SessionLocal() as db:
            db.add(self.main.Conversation(id=conversation_id, title="Telegram voice", owner_id=owner))
            db.add(self.main.TelegramConversation(
                user_id=telegram_id, chat_id=telegram_id, conversation_id=conversation_id, owner_id=owner,
            ))
            db.commit()

        sent_texts = []
        sent_voice = []
        streamed_messages = []
        execution_owner = []

        async def fake_send(_client, _chat_id, text):
            sent_texts.append(text)

        async def fake_api(_client, _method, _payload):
            return {}

        async def fake_stream(payload, _db):
            streamed_messages.append(payload.message)
            execution_owner.append(self.main.owner_id())

            async def body_iterator():
                yield b'data: {"delta":"You have one meeting."}\n\n'
                yield b'data: {"runId":"run_voice_test","status":"completed"}\n\n'

            return type("FakeStreamingResponse", (), {"body_iterator": body_iterator()})()

        voice = {
            "message": {
                "chat": {"id": int(telegram_id), "type": "private"},
                "from": {"id": int(telegram_id)},
                "voice": {"file_id": "telegram-file-id", "file_size": 1000, "duration": 3, "mime_type": "audio/ogg"},
            },
        }

        async def run_update():
            async with httpx.AsyncClient() as fake_client:
                await self.main.telegram_handle_message(fake_client, voice)

        with patch.object(self.main, "telegram_send", new=fake_send), \
             patch.object(self.main, "telegram_api", new=fake_api), \
             patch.object(self.main, "telegram_download_voice", new=AsyncMock(return_value=(b"telegram-audio", "audio/ogg"))), \
             patch.object(self.main, "telegram_transcribe_voice", new=AsyncMock(return_value="What is on my calendar today?")), \
             patch.object(self.main, "telegram_generate_voice_reply", new=AsyncMock(return_value=b"wav-audio")), \
             patch.object(self.main, "telegram_encode_voice", new=AsyncMock(return_value=b"mp3-audio")), \
             patch.object(self.main, "telegram_send_voice", new=AsyncMock(side_effect=lambda _client, chat, audio: sent_voice.append((chat, audio)))), \
             patch.object(self.main, "stream_agent", new=AsyncMock(side_effect=fake_stream)):
            asyncio.run(run_update())

        self.assertEqual(streamed_messages, ["What is on my calendar today?"])
        self.assertEqual(execution_owner, [owner])
        self.assertIn("Transcript: What is on my calendar today?", sent_texts[0])
        self.assertIn("You have one meeting.", sent_texts[0])
        self.assertEqual(sent_voice, [(telegram_id, b"mp3-audio")])

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
                text='data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}]}}],"usageMetadata":{"promptTokenCount":13,"candidatesTokenCount":4,"totalTokenCount":17}}\n\n',
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
            activity_run = client.get("/api/v1/activity/runs").json()[0]
            self.assertEqual(activity_run["tokenUsage"]["promptTokens"], 13)
            self.assertEqual(activity_run["tokenUsage"]["completionTokens"], 4)
            self.assertEqual(activity_run["tokenUsage"]["totalTokens"], 17)
            self.assertIsNone(activity_run["tokenUsage"]["estimatedCostUsd"])
            self.assertEqual(client.get("/api/v1/observability/stats").json()["totalTokens24h"], 17)
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
