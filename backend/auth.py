"""
auth.py — Admin authentication for NexusIQ.
Uses JWT tokens that survive container restarts.
Tokens persist until explicit logout.
"""

import os
import uuid

import jwt
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

# JWT secret — stable across restarts (derived from admin password)
_JWT_SECRET = os.getenv("ADMIN_PASSWORD", "nexusiq2026") + "-nexusiq-jwt-secret"
_JWT_ALGORITHM = "HS256"

# Revoked tokens (only cleared on container restart, which is acceptable)
_revoked_tokens: set[str] = set()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    role: str


def _get_admin_credentials() -> tuple[str, str]:
    """Get admin credentials from environment."""
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "nexusiq2026")
    return username, password


def authenticate(username: str, password: str) -> LoginResponse | None:
    """Check credentials and return a JWT token if valid."""
    admin_user, admin_pass = _get_admin_credentials()

    if username == admin_user and password == admin_pass:
        payload = {
            "username": username,
            "role": "admin",
            "jti": str(uuid.uuid4()),
        }
        token = jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)
        return LoginResponse(token=token, username=username, role="admin")

    return None


def validate_token(token: str) -> dict | None:
    """Validate a JWT token. Returns user info or None."""
    if token in _revoked_tokens:
        return None
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        return {"username": payload["username"], "role": payload["role"]}
    except jwt.InvalidTokenError:
        return None


def revoke_token(token: str):
    """Revoke a token (logout)."""
    _revoked_tokens.add(token)


def get_current_user(request: Request) -> dict:
    """FastAPI dependency: extract and validate the auth token."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]
    user = validate_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return user
