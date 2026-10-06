"""Password-backed local accounts; no TME account integration is implied."""
import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from .auth import SESSION_COOKIE_NAME, SESSION_LIFETIME_SECONDS, create_session, revoke_session
from .models import AccountCredential, User


class LoginInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=10, max_length=128)

    @field_validator('username')
    @classmethod
    def normalize_username(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[a-z0-9_]{3,32}', value):
            raise ValueError('用户名应为3–32位字母、数字或下划线')
        return value


class RegisterInput(LoginInput):
    display_name: str = Field(min_length=1, max_length=40)

    @field_validator('display_name')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('请填写昵称')
        return value.strip()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600_000).hex()
    return f'{salt}${digest}'


def verify_password(password: str, stored: str) -> bool:
    salt, expected = stored.split('$')
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600_000).hex()
    return hmac.compare_digest(actual, expected)


def install_accounts(app, get_db, serialize_user):
    attempts = defaultdict(deque)
    lock = threading.Lock()
    dummy_hash = hash_password('constant-time-unknown-user')

    def rate_limit(request: Request):
        host = request.client.host if request.client else 'unknown'
        now = time.monotonic()
        with lock:
            for key in list(attempts):
                while attempts[key] and attempts[key][0] < now - 300:
                    attempts[key].popleft()
                if not attempts[key]:
                    del attempts[key]
            if host not in attempts and len(attempts) >= 2048:
                raise HTTPException(429, '暂时无法登录，请稍后重试。')
            if len(attempts[host]) >= 15:
                raise HTTPException(429, '尝试较多，请5分钟后再试。')
            attempts[host].append(now)

    def sign_in(db, user, request, response):
        revoke_session(db, request.cookies.get(SESSION_COOKIE_NAME))
        token = create_session(db, user)
        response.set_cookie(SESSION_COOKIE_NAME, token, max_age=SESSION_LIFETIME_SECONDS,
                            httponly=True, secure=request.app.state.settings.cookie_secure or request.url.scheme == 'https', samesite='lax', path='/')
        return serialize_user(user)

    @app.post('/api/accounts/register', status_code=201)
    def register(data: RegisterInput, request: Request, response: Response, db: OrmSession = Depends(get_db)):
        rate_limit(request)
        if db.scalar(select(AccountCredential).where(AccountCredential.username == data.username)):
            raise HTTPException(409, '这个用户名已被使用，换一个试试。')
        user = User(display_name=data.display_name, is_demo=False)
        db.add(user)
        db.flush()
        db.add(AccountCredential(user_id=user.id, username=data.username, password_hash=hash_password(data.password)))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, '这个用户名已被使用，换一个试试。')
        return sign_in(db, user, request, response)

    @app.post('/api/accounts/login')
    def login(data: LoginInput, request: Request, response: Response, db: OrmSession = Depends(get_db)):
        rate_limit(request)
        credential = db.scalar(select(AccountCredential).where(AccountCredential.username == data.username))
        correct = verify_password(data.password, credential.password_hash if credential else dummy_hash)
        if not credential or not correct:
            raise HTTPException(401, '用户名或密码不正确。')
        return sign_in(db, db.get(User, credential.user_id), request, response)

    @app.post('/api/accounts/logout', status_code=204)
    def logout(request: Request, response: Response, db: OrmSession = Depends(get_db)):
        revoke_session(db, request.cookies.get(SESSION_COOKIE_NAME))
        response.delete_cookie(SESSION_COOKIE_NAME, path='/')
