import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import create_app
from app.models import Session
from app.settings import load_settings


@pytest.fixture(autouse=True)
def isolated_migration_environment(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic@db.example.test/example')
    monkeypatch.delenv('MIGRATION_READ_ONLY', raising=False)


def make_client(tmp_path):
    return TestClient(create_app(f'sqlite:///{tmp_path / "migration.db"}'),
                      base_url='https://insong.me')


def test_read_only_rejects_writes_before_creating_a_session_but_keeps_reads(monkeypatch, tmp_path):
    monkeypatch.setenv('MIGRATION_READ_ONLY', '1')
    with make_client(tmp_path) as client:
        response = client.post('/api/demo/sessions', json={'user_id': 1},
                               headers={'Origin': 'https://insong.me'})
        assert response.status_code == 503
        assert response.headers['retry-after'] == '60'
        assert response.headers['cache-control'] == 'no-store'
        assert 'set-cookie' not in response.headers
        with client.app.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(Session)) == 0
        assert client.get('/api/songs').status_code == 200
        assert client.get('/api/me').json() == {'user': None}


def test_default_mode_still_allows_login(tmp_path):
    with make_client(tmp_path) as client:
        assert client.post('/api/demo/sessions', json={'user_id': 1},
                           headers={'Origin': 'https://insong.me'}).status_code == 200
        assert client.get('/api/me').json()['user']['id'] == 1


def test_read_only_does_not_accept_an_untrusted_origin(monkeypatch, tmp_path):
    monkeypatch.setenv('MIGRATION_READ_ONLY', '1')
    with make_client(tmp_path) as client:
        assert client.post('/api/demo/sessions', json={'user_id': 1},
                           headers={'Origin': 'https://untrusted.example'}).status_code == 403


@pytest.mark.parametrize('method', ['POST', 'PUT', 'PATCH', 'DELETE'])
def test_read_only_rejects_every_api_write_method(monkeypatch, tmp_path, method):
    monkeypatch.setenv('MIGRATION_READ_ONLY', '1')
    with make_client(tmp_path) as client:
        response = client.request(method, '/api/photos', content=b'invalid-upload',
                                  headers={'Origin': 'https://insong.me'})
        assert response.status_code == 503
        assert response.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('value', ['true', 'false', '2', 'invalid'])
def test_invalid_freeze_flag_cannot_silently_leave_the_site_writable(monkeypatch, value):
    monkeypatch.setenv('MIGRATION_READ_ONLY', value)
    with pytest.raises(ValueError, match='MIGRATION_READ_ONLY'):
        load_settings()
