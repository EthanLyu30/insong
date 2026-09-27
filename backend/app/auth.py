"""Server-owned demo sessions and reusable authorization helpers."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session as OrmSession

from .models import Session, User

SESSION_COOKIE_NAME = "song_memory_session"
SESSION_LIFETIME_SECONDS = 86400


def _session_id(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_session(db: OrmSession, user: User) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.add(Session(
        id=_session_id(token),
        user_id=user.id,
        created_at=now,
        expires_at=now + timedelta(seconds=SESSION_LIFETIME_SECONDS),
    ))
    db.commit()
    return token


def resolve_user(db: OrmSession, raw_token: str | None) -> User | None:
    if not raw_token:
        return None
    session = db.get(Session, _session_id(raw_token))
    if session is None or session.expires_at is None:
        return None
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        return None
    user = db.get(User, session.user_id)
    if user is None or user.id not in (1, 2) or not user.is_demo:
        return None
    return user


def revoke_session(db: OrmSession, raw_token: str | None) -> None:
    if not raw_token:
        return
    session = db.get(Session, _session_id(raw_token))
    if session is not None:
        db.delete(session)
        db.commit()


def require_user(user: User | None) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="请先切换到演示帐号。")
    return user
