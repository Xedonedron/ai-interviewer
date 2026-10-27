"""Ephemeral Session JWT Authentication & Single-Connection Lock (`app/services/auth_token.py`).

Implements Contract 1 Section 1 (`docs/contracts/websocket-protocol.md`) &
Contract 5 Section 1 (`docs/contracts/rest-api-contract.md`):
- Short-lived JWT signed with `HS256` containing `sub` (`session_id`), `role` (`candidate`), `exp`, `iat`, `jti`.
- Single active WebSocket connection lock per `session_id` (`4002 SESSION_ALREADY_ACTIVE`).
"""

from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings


class TokenVerificationError(Exception):
    """Raised when an ephemeral token is missing, invalid, expired, or mismatched."""

    def __init__(self, code: str, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class EphemeralTokenClaims:
    """Decoded and verified JWT claims for a candidate session."""

    sub: str
    role: str
    jti: str
    exp: int
    iat: int


@dataclass(frozen=True)
class IssuedEphemeralToken:
    """Result of generating a new ephemeral session JWT."""

    token: str
    jti: str
    expires_at: datetime


def create_ephemeral_session_token(
    session_id: str,
    *,
    ttl_hours: int | None = None,
    jti: str | None = None,
    expires_delta: timedelta | None = None,
) -> IssuedEphemeralToken:
    """Issue a signed `HS256` Ephemeral Session JWT for a candidate."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if expires_delta is not None:
        expires_at = now + expires_delta
    else:
        hours = ttl_hours if ttl_hours is not None else settings.default_token_ttl_hours
        expires_at = now + timedelta(hours=hours)

    token_jti = jti or f"jti_{secrets.token_hex(16)}"
    payload = {
        "sub": session_id,
        "role": "candidate",
        "jti": token_jti,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    encoded = jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return IssuedEphemeralToken(
        token=encoded,
        jti=token_jti,
        expires_at=expires_at,
    )


def verify_ephemeral_session_token(
    token: str | None,
    *,
    expected_session_id: str | None = None,
    expected_jti: str | None = None,
) -> EphemeralTokenClaims:
    """Verify signature, expiration, `sub`, and `jti` of an Ephemeral Session JWT."""
    if not token or not token.strip():
        raise TokenVerificationError(
            code="AUTH_TOKEN_MISSING",
            message="Ephemeral session token tidak ditemukan.",
            status_code=401,
        )

    settings = get_settings()
    raw_token = token.strip()
    if raw_token.lower().startswith("bearer "):
        raw_token = raw_token[7:].strip()

    try:
        decoded = jwt.decode(
            raw_token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "role", "jti", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenVerificationError(
            code="AUTH_TOKEN_EXPIRED",
            message="Ephemeral session token telah kedaluwarsa.",
            status_code=401,
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise TokenVerificationError(
            code="AUTH_TOKEN_INVALID",
            message="Tanda tangan atau format Ephemeral JWT tidak valid.",
            status_code=401,
        ) from exc

    sub = str(decoded.get("sub", ""))
    role = str(decoded.get("role", ""))
    jti = str(decoded.get("jti", ""))
    exp = int(decoded.get("exp", 0))
    iat = int(decoded.get("iat", 0))

    if expected_session_id is not None and sub != expected_session_id:
        raise TokenVerificationError(
            code="SESSION_TOKEN_MISMATCH",
            message=f"Token ini diterbitkan untuk sesi '{sub}', bukan '{expected_session_id}'.",
            status_code=403,
        )

    if expected_jti is not None and jti != expected_jti:
        raise TokenVerificationError(
            code="AUTH_TOKEN_INVALID",
            message="Klaim jti token tidak cocok dengan sesi aktif.",
            status_code=401,
        )

    return EphemeralTokenClaims(
        sub=sub,
        role=role,
        jti=jti,
        exp=exp,
        iat=iat,
    )


class ActiveSessionConnectionRegistry:
    """In-memory single-active-connection lock registry for WebSocket sessions.

    Prevents concurrent WebSocket connections to the same `session_id`
    (enforcing Close Code `4002 SESSION_ALREADY_ACTIVE`).
    """

    def __init__(self) -> None:
        self._active_sessions: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def try_acquire(self, session_id: str, connection_id: str) -> bool:
        """Return True if the session lock was acquired, or False if already active."""
        async with self._lock:
            if session_id in self._active_sessions:
                return False
            self._active_sessions[session_id] = connection_id
            return True

    async def release(self, session_id: str, connection_id: str | None = None) -> None:
        """Release the active connection lock for `session_id`."""
        async with self._lock:
            current = self._active_sessions.get(session_id)
            if current is None:
                return
            if connection_id is None or current == connection_id:
                self._active_sessions.pop(session_id, None)

    def is_active(self, session_id: str) -> bool:
        return session_id in self._active_sessions

    @property
    def active_count(self) -> int:
        return len(self._active_sessions)

    def clear_all(self) -> None:
        self._active_sessions.clear()


active_connection_registry = ActiveSessionConnectionRegistry()
