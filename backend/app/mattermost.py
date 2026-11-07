from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import httpx

from .config import (
    DATA_DIR,
    MATTERMOST_CHANNEL_NAME as ENV_CHANNEL_NAME,
    MATTERMOST_PASSWORD as ENV_PASSWORD,
    MATTERMOST_TOKEN as ENV_TOKEN,
    MATTERMOST_URL as ENV_URL,
    MATTERMOST_USERNAME as ENV_USERNAME,
)

CREDENTIALS_PATH = DATA_DIR / "mattermost_credentials.json"
CLIENT_FACTORY: Callable[..., httpx.AsyncClient] = httpx.AsyncClient


def _load_settings() -> dict[str, str]:
    settings = {
        "server_url": ENV_URL,
        "username": ENV_USERNAME,
        "password": ENV_PASSWORD,
        "pat": ENV_TOKEN,
        "channel_name": ENV_CHANNEL_NAME,
    }
    try:
        saved = json.loads(CREDENTIALS_PATH.read_text(encoding="utf-8"))
        if isinstance(saved, dict):
            for key in settings:
                value = saved.get(key)
                if isinstance(value, str):
                    settings[key] = value
    except (OSError, json.JSONDecodeError):
        pass
    return settings


_settings = _load_settings()
MATTERMOST_URL = _settings["server_url"].rstrip("/")
MATTERMOST_USERNAME = _settings["username"]
MATTERMOST_PASSWORD = _settings["password"]
MATTERMOST_TOKEN = _settings["pat"]
MATTERMOST_CHANNEL_NAME = _settings["channel_name"] or "venturelens-diligence"
_session_token: str | None = None
_login_lock = asyncio.Lock()


class MattermostNotConfigured(RuntimeError):
    pass


def _uses_session_auth() -> bool:
    return bool(MATTERMOST_USERNAME and MATTERMOST_PASSWORD)


def is_configured() -> bool:
    return bool(MATTERMOST_URL and (_uses_session_auth() or MATTERMOST_TOKEN))


def public_settings() -> dict[str, Any]:
    """Return non-secret integration status; credentials and tokens never leave this module."""
    mode = "session" if _uses_session_auth() else "pat" if MATTERMOST_TOKEN else "unconfigured"
    return {
        "mattermost_configured": is_configured(),
        "mattermost_auth_mode": mode,
        "mattermost_session_configured": _uses_session_auth(),
        "mattermost_pat_configured": bool(MATTERMOST_TOKEN),
        "mattermost_url": MATTERMOST_URL,
        "mattermost_channel_name": MATTERMOST_CHANNEL_NAME,
        "mattermost_channel_configured": bool(MATTERMOST_CHANNEL_NAME),
    }


def save_settings(
    *, server_url: str, username: str, password: str | None, pat: str | None
) -> dict[str, Any]:
    """Persist integration credentials locally on the backend only."""
    global MATTERMOST_URL, MATTERMOST_USERNAME, MATTERMOST_PASSWORD, MATTERMOST_TOKEN, _session_token, _settings
    normalized_url = server_url.strip().rstrip("/")
    parsed = urlparse(normalized_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Enter a valid Mattermost server URL, including http:// or https://.")
    MATTERMOST_URL = normalized_url
    if username.strip():
        MATTERMOST_USERNAME = username.strip()
    if password:
        MATTERMOST_PASSWORD = password
    if pat:
        MATTERMOST_TOKEN = pat
    _session_token = None
    _settings = {
        "server_url": MATTERMOST_URL,
        "username": MATTERMOST_USERNAME,
        "password": MATTERMOST_PASSWORD,
        "pat": MATTERMOST_TOKEN,
        "channel_name": MATTERMOST_CHANNEL_NAME,
    }
    CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = CREDENTIALS_PATH.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(_settings), encoding="utf-8")
    temporary_path.replace(CREDENTIALS_PATH)
    return public_settings()


async def _login() -> str:
    global _session_token
    if not _uses_session_auth():
        raise MattermostNotConfigured("Enter a Mattermost username and password in Settings, or configure a PAT.")
    async with _login_lock:
        if _session_token:
            return _session_token
        async with CLIENT_FACTORY(timeout=12) as client:
            response = await client.post(
                f"{MATTERMOST_URL}/api/v4/users/login",
                json={"login_id": MATTERMOST_USERNAME, "password": MATTERMOST_PASSWORD},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            token = response.headers.get("Token")
            if not token:
                raise MattermostNotConfigured("Mattermost login did not return a session token.")
            _session_token = token
            return token


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _request(method: str, path: str, *, params: dict[str, Any] | None = None) -> httpx.Response:
    """Perform a Mattermost API request, retrying one expired session after re-login."""
    global _session_token
    use_session = _uses_session_auth()
    token = await _login() if use_session else MATTERMOST_TOKEN
    if not token:
        raise MattermostNotConfigured("Configure a Mattermost username and password in Settings.")
    url = f"{MATTERMOST_URL}/api/v4/{path.lstrip('/')}"
    async with CLIENT_FACTORY(timeout=15) as client:
        response = await client.request(method, url, headers=_auth_headers(token), params=params)
    if response.status_code == 401 and use_session:
        _session_token = None
        token = await _login()
        async with CLIENT_FACTORY(timeout=15) as client:
            response = await client.request(method, url, headers=_auth_headers(token), params=params)
    response.raise_for_status()
    return response


async def test_connection() -> dict[str, Any]:
    """Verify authentication via GET /users/me without returning any credential."""
    if not is_configured():
        raise MattermostNotConfigured("Enter a Mattermost username and password in Settings, or configure a PAT.")
    response = await _request("GET", "users/me")
    user = response.json()
    return {"ok": True}


async def resolve_channel() -> dict[str, Any]:
    """Find the configured channel by name among the authenticated user's teams."""
    if not MATTERMOST_CHANNEL_NAME:
        raise MattermostNotConfigured("The Mattermost channel name is not configured.")
    teams_response = await _request("GET", "users/me/teams")
    for team in teams_response.json():
        response = await _request("GET", f"users/me/teams/{team['id']}/channels")
        for channel in response.json():
            if channel.get("name") == MATTERMOST_CHANNEL_NAME:
                return {
                    "id": channel["id"],
                    "name": channel["name"],
                    "team": team.get("name", ""),
                }
    raise MattermostNotConfigured(f"Channel '{MATTERMOST_CHANNEL_NAME}' was not found in the signed-in user's teams.")


async def get_posts(limit: int = 40) -> list[dict[str, Any]]:
    channel = await resolve_channel()
    response = await _request(
        "GET",
        f"channels/{channel['id']}/posts",
        params={"per_page": min(max(limit, 1), 100), "page": 0},
    )
    payload = response.json()
    users = payload.get("users", {})
    posts = payload.get("posts", {})
    ordered = [posts[post_id] for post_id in payload.get("order", []) if post_id in posts]
    result = []
    for post in ordered:
        user = users.get(post.get("user_id"), {})
        result.append(
            {
                "id": post.get("id"),
                "message": post.get("message", ""),
                "username": user.get("username", "unknown"),
                "is_bot": bool(user.get("is_bot")),
                "created_at": post.get("create_at"),
                "root_id": post.get("root_id"),
            }
        )
    result.reverse()
    return result




