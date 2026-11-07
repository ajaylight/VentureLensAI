import asyncio
import json
import tempfile
import unittest
from pathlib import Path

import httpx

from app import mattermost


class MattermostSessionTests(unittest.TestCase):
    def setUp(self):
        self.original = {
            "url": mattermost.MATTERMOST_URL,
            "username": mattermost.MATTERMOST_USERNAME,
            "password": mattermost.MATTERMOST_PASSWORD,
            "pat": mattermost.MATTERMOST_TOKEN,
            "channel_name": mattermost.MATTERMOST_CHANNEL_NAME,
            "session": mattermost._session_token,
            "factory": mattermost.CLIENT_FACTORY,
            "path": mattermost.CREDENTIALS_PATH,
        }
        mattermost.MATTERMOST_URL = "http://127.0.0.1:55041"
        mattermost.MATTERMOST_USERNAME = "user"
        mattermost.MATTERMOST_PASSWORD = "test-password"
        mattermost.MATTERMOST_TOKEN = ""
        mattermost.MATTERMOST_CHANNEL_NAME = "venturelens-diligence"
        mattermost._session_token = None
        mattermost._login_lock = asyncio.Lock()

    def tearDown(self):
        mattermost.MATTERMOST_URL = self.original["url"]
        mattermost.MATTERMOST_USERNAME = self.original["username"]
        mattermost.MATTERMOST_PASSWORD = self.original["password"]
        mattermost.MATTERMOST_TOKEN = self.original["pat"]
        mattermost.MATTERMOST_CHANNEL_NAME = self.original["channel_name"]
        mattermost._session_token = self.original["session"]
        mattermost.CLIENT_FACTORY = self.original["factory"]
        mattermost.CREDENTIALS_PATH = self.original["path"]
        mattermost._login_lock = asyncio.Lock()

    def use_handler(self, handler):
        transport = httpx.MockTransport(handler)
        mattermost.CLIENT_FACTORY = lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs)

    def test_login_uses_login_id_and_password_then_checks_users_me(self):
        seen = []

        def handler(request):
            seen.append(request)
            if request.url.path.endswith("/users/login"):
                self.assertEqual(request.method, "POST")
                self.assertEqual(json.loads(request.content), {"login_id": "user", "password": "test-password"})
                return httpx.Response(200, headers={"Token": "session-secret"}, json={})
            self.assertEqual(request.method, "GET")
            self.assertEqual(request.url.path, "/api/v4/users/me")
            self.assertEqual(request.headers.get("Authorization"), "Bearer session-secret")
            return httpx.Response(200, json={"username": "user", "first_name": "Local User"})

        self.use_handler(handler)
        result = asyncio.run(mattermost.test_connection())
        self.assertEqual(result, {"ok": True})
        self.assertNotIn("session-secret", json.dumps(result))
        self.assertNotIn("test-password", json.dumps(result))
        self.assertEqual([request.method for request in seen], ["POST", "GET"])

    def test_401_reauthenticates_once_and_retries_with_new_token(self):
        login_count = 0
        me_count = 0

        def handler(request):
            nonlocal login_count, me_count
            if request.url.path.endswith("/users/login"):
                login_count += 1
                return httpx.Response(200, headers={"Token": f"session-{login_count}"}, json={})
            me_count += 1
            if me_count == 1:
                self.assertEqual(request.headers.get("Authorization"), "Bearer session-1")
                return httpx.Response(401, json={"message": "expired"})
            self.assertEqual(request.headers.get("Authorization"), "Bearer session-2")
            return httpx.Response(200, json={"username": "user"})

        self.use_handler(handler)
        result = asyncio.run(mattermost.test_connection())
        self.assertTrue(result["ok"])
        self.assertEqual(login_count, 2)
        self.assertEqual(me_count, 2)

    def test_resolves_room_and_reads_posts_using_only_get_after_login(self):
        methods = []

        def handler(request):
            methods.append((request.method, request.url.path))
            if request.url.path.endswith("/users/login"):
                return httpx.Response(200, headers={"Token": "read-token"}, json={})
            self.assertEqual(request.headers.get("Authorization"), "Bearer read-token")
            if request.url.path.endswith("/users/me/teams"):
                return httpx.Response(200, json=[{"id": "team-1", "name": "venturelens"}])
            if request.url.path.endswith("/teams/team-1/channels"):
                return httpx.Response(200, json=[{"id": "channel-1", "name": "venturelens-diligence"}])
            if request.url.path.endswith("/channels/channel-1/posts"):
                return httpx.Response(200, json={
                    "order": ["new", "old"],
                    "posts": {
                        "new": {"id": "new", "message": "latest", "user_id": "u", "create_at": 2},
                        "old": {"id": "old", "message": "earlier", "user_id": "u", "create_at": 1},
                    },
                    "users": {"u": {"username": "analyst", "is_bot": True}},
                })
            self.fail(f"Unexpected Mattermost GET path: {request.url.path}")

        self.use_handler(handler)
        posts = asyncio.run(mattermost.get_posts())
        self.assertEqual([post["message"] for post in posts], ["earlier", "latest"])
        self.assertTrue(all(method == "GET" for method, path in methods if not path.endswith("/users/login")))
        self.assertEqual([method for method, _ in methods].count("POST"), 1)

    def test_pat_remains_optional_fallback_and_public_status_has_no_credentials(self):
        mattermost.MATTERMOST_PASSWORD = ""
        mattermost.MATTERMOST_TOKEN = "pat-secret"

        def handler(request):
            self.assertEqual(request.method, "GET")
            self.assertEqual(request.headers.get("Authorization"), "Bearer pat-secret")
            return httpx.Response(200, json={"username": "user"})

        self.use_handler(handler)
        result = asyncio.run(mattermost.test_connection())
        public = mattermost.public_settings()
        self.assertTrue(result["ok"])
        encoded = json.dumps(public)
        self.assertNotIn("pat-secret", encoded)
        self.assertNotIn("test-password", encoded)
        self.assertNotIn("username", public)
        self.assertEqual(public["mattermost_auth_mode"], "pat")

    def test_saves_settings_only_on_backend_and_never_returns_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            mattermost.CREDENTIALS_PATH = Path(folder) / "mattermost_credentials.json"
            response = mattermost.save_settings(
                server_url="http://127.0.0.1:55041/",
                username="user",
                password="new-secret",
                pat="",
            )
            saved = json.loads(mattermost.CREDENTIALS_PATH.read_text(encoding="utf-8"))
        self.assertEqual(saved["password"], "new-secret")
        self.assertEqual(response["mattermost_url"], "http://127.0.0.1:55041")
        self.assertNotIn("password", response)
        self.assertNotIn("new-secret", json.dumps(response))


if __name__ == "__main__":
    unittest.main()



class MattermostSettingsRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_settings_endpoint_never_echoes_submitted_credentials(self):
        from app.main import app

        original = {
            "url": mattermost.MATTERMOST_URL,
            "username": mattermost.MATTERMOST_USERNAME,
            "password": mattermost.MATTERMOST_PASSWORD,
            "pat": mattermost.MATTERMOST_TOKEN,
            "settings": mattermost._settings.copy(),
            "session": mattermost._session_token,
            "path": mattermost.CREDENTIALS_PATH,
        }
        try:
            with tempfile.TemporaryDirectory() as folder:
                mattermost.CREDENTIALS_PATH = Path(folder) / "credentials.json"
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/integrations/mattermost/settings", json={
                        "server_url": "http://127.0.0.1:55041",
                        "username": "private-user",
                        "password": "private-password-value",
                        "pat": "",
                    })
                self.assertEqual(response.status_code, 200)
                serialized = response.text
                self.assertNotIn("private-user", serialized)
                self.assertNotIn("private-password-value", serialized)
                self.assertNotIn("username", response.json())
        finally:
            mattermost.MATTERMOST_URL = original["url"]
            mattermost.MATTERMOST_USERNAME = original["username"]
            mattermost.MATTERMOST_PASSWORD = original["password"]
            mattermost.MATTERMOST_TOKEN = original["pat"]
            mattermost._settings = original["settings"]
            mattermost._session_token = original["session"]
            mattermost.CREDENTIALS_PATH = original["path"]
            mattermost._login_lock = asyncio.Lock()


