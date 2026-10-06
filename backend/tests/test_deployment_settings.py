from dataclasses import FrozenInstanceError

import pytest
from sqlalchemy.engine import make_url


@pytest.fixture(autouse=True)
def isolated_configuration(monkeypatch):
    for key in ('APP_ENV', 'DATABASE_URL', 'DATABASE_SCHEMA', 'CORS_ORIGINS', 'DATABASE_SSLROOTCERT'):
        monkeypatch.delenv(key, raising=False)


def test_local_configuration_keeps_sqlite_and_is_immutable():
    from app.settings import load_settings

    settings = load_settings()
    assert make_url(settings.database_url).get_backend_name() == 'sqlite'
    assert settings.database_schema == 'insong'
    assert 'http://127.0.0.1:5173' in settings.allowed_origins
    assert not settings.cookie_secure
    with pytest.raises(FrozenInstanceError):
        settings.app_env = 'production'


def test_postgres_url_uses_psycopg(monkeypatch):
    from app.settings import load_settings

    monkeypatch.setenv('DATABASE_URL', 'postgres://demo:synthetic-password@localhost:5432/example')
    settings = load_settings()
    url = make_url(settings.database_url)
    assert url.drivername == 'postgresql+psycopg'
    assert url.username == 'demo'
    assert url.password == 'synthetic-password'
    assert 'synthetic-password' not in repr(settings)


def test_production_requires_a_persistent_database(monkeypatch):
    from app.settings import load_settings

    monkeypatch.setenv('APP_ENV', 'production')
    with pytest.raises(ValueError, match='DATABASE_URL'):
        load_settings()
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///ephemeral.db')
    with pytest.raises(ValueError, match='PostgreSQL'):
        load_settings()


def test_production_uses_certificate_validation_and_secure_cookie(monkeypatch):
    from app.settings import load_settings

    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('DATABASE_URL', 'postgresql://demo:synthetic-password@db.example.com/example')
    settings = load_settings()
    url = make_url(settings.database_url)
    assert url.query['sslmode'] == 'verify-full'
    assert url.query['sslrootcert'] == 'system'
    assert settings.cookie_secure
    assert 'https://insong.me' in settings.allowed_origins


@pytest.mark.parametrize('mode', ['disable', 'allow', 'prefer', 'require', 'verify-ca'])
def test_production_rejects_unverified_database_tls(monkeypatch, mode):
    from app.settings import load_settings

    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('DATABASE_URL', f'postgresql://demo:synthetic-password@db.example.com/example?sslmode={mode}')
    with pytest.raises(ValueError) as failure:
        load_settings()
    assert 'synthetic-password' not in str(failure.value)


@pytest.mark.parametrize('schema', ['public', 'pg_catalog', '../data', 'insong; DROP TABLE users'])
def test_database_schema_rejects_unsafe_or_exposed_names(monkeypatch, schema):
    from app.settings import load_settings

    monkeypatch.setenv('DATABASE_SCHEMA', schema)
    with pytest.raises(ValueError, match='schema'):
        load_settings()


def test_configured_origins_are_normalized_and_not_wildcards(monkeypatch):
    from app.settings import load_settings

    monkeypatch.setenv('CORS_ORIGINS', ' https://insong.me/,https://preview.example.com ')
    settings = load_settings()
    assert 'https://insong.me' in settings.allowed_origins
    assert 'https://preview.example.com' in settings.allowed_origins
    monkeypatch.setenv('CORS_ORIGINS', '*')
    with pytest.raises(ValueError, match='来源'):
        load_settings()


def test_invalid_database_configuration_does_not_disclose_input(monkeypatch):
    from app.settings import load_settings

    monkeypatch.setenv('DATABASE_URL', 'synthetic-password://not-a-database')
    with pytest.raises(ValueError) as failure:
        load_settings()
    assert 'synthetic-password' not in str(failure.value)


def test_create_app_reads_database_url_from_environment(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    path = tmp_path / 'configured' / 'demo.db'
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{path}')
    with TestClient(create_app()) as client:
        assert client.get('/api/health').status_code == 200
        assert path.is_file()
