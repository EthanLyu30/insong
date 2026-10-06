"""Deployment configuration; credentials stay in backend environment variables."""

from dataclasses import dataclass, field
import os
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.engine import make_url


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / 'data' / 'demo.db'
LOCAL_ORIGINS = ('http://localhost:5173', 'http://127.0.0.1:5173')


def validate_schema(schema: str) -> str:
    if (not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', schema)
            or schema in ('public', 'information_schema') or schema.startswith('pg_')):
        raise ValueError('数据库 schema 配置无效；请使用独立的私有 schema。')
    return schema


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str = field(repr=False)
    database_schema: str
    allowed_origins: tuple[str, ...]
    cookie_secure: bool


def _database_url(raw: str, production: bool) -> str:
    try:
        url = make_url(raw)
        if url.drivername == 'postgres':
            url = url.set(drivername='postgresql')
        backend = url.get_backend_name()
        if backend not in ('sqlite', 'postgresql'):
            raise ValueError('unsupported database')
    except Exception:
        raise ValueError('数据库 DATABASE_URL 配置无效。') from None
    if production and backend != 'postgresql':
        raise ValueError('生产环境必须配置持久化的 PostgreSQL 数据库。')
    if backend == 'postgresql':
        url = url.set(drivername='postgresql+psycopg')
        if production:
            if not url.host:
                raise ValueError('生产数据库需要有效的服务器地址。')
            if url.query.get('sslmode', 'verify-full') != 'verify-full':
                raise ValueError('生产数据库 TLS 必须使用 verify-full 验证服务端证书。')
            query = dict(url.query)
            query['sslmode'] = 'verify-full'
            query.setdefault('sslrootcert', os.environ.get('DATABASE_SSLROOTCERT', 'system'))
            url = url.set(query=query)
    return url.render_as_string(hide_password=False)


def _origin(value: str) -> str:
    try:
        url = urlsplit(value.strip())
        if (url.scheme not in ('http', 'https') or not url.hostname
                or url.username is not None or url.password is not None
                or url.path not in ('', '/') or url.query or url.fragment):
            raise ValueError('invalid origin')
        url.port
        return urlunsplit((url.scheme, url.netloc.lower(), '', '', ''))
    except Exception:
        raise ValueError('允许来源 CORS_ORIGINS 配置无效；请填写完整的页面来源。') from None


def load_settings() -> Settings:
    app_env = os.environ.get('APP_ENV', 'development').strip().lower()
    if app_env not in ('development', 'test', 'production'):
        raise ValueError('APP_ENV 必须是 development、test 或 production。')
    production = app_env == 'production'
    raw = os.environ.get('DATABASE_URL', '').strip()
    if not raw:
        if production:
            raise ValueError('生产环境必须设置 DATABASE_URL。')
        raw = f'sqlite:///{DEFAULT_DB_PATH}'
    schema = validate_schema(os.environ.get('DATABASE_SCHEMA', 'insong'))
    origins = [*LOCAL_ORIGINS]
    if production:
        origins.append('https://insong.me')
    origins.extend(_origin(value) for value in os.environ.get('CORS_ORIGINS', '').split(',') if value.strip())
    return Settings(app_env=app_env, database_url=_database_url(raw, production),
                    database_schema=schema, allowed_origins=tuple(dict.fromkeys(origins)),
                    cookie_secure=production)
