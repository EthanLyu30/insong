"""Concert collections are server-built, durable and scoped to their owner."""
from fastapi.testclient import TestClient

from app.main import create_app
from test_private_flow import register


def test_concert_collection_is_idempotent_owner_only_and_survives_restart(tmp_path):
    url = f'sqlite:///{tmp_path / "playlists.db"}'
    with TestClient(create_app(url)) as owner:
        assert owner.get('/api/playlists').status_code == 401
        assert owner.put('/api/playlists/concerts/gem-sanya-20251207').status_code == 401
        identity = register(owner)
        catalog = owner.get('/api/footprints/catalog').json()
        event = next(e for e in catalog['events'] if e['id'] == 'gem-sanya-20251207')
        first = owner.put('/api/playlists/concerts/' + event['id'])
        assert first.status_code == 200, first.text
        saved = first.json()
        assert saved['songs'] == [{'title': s['title'], 'artist': s['artist']} for s in event['songs']]
        assert saved['event_id'] == event['id']
        assert saved['id'] == owner.put('/api/playlists/concerts/' + event['id']).json()['id']
        assert len(owner.get('/api/playlists').json()) == 1
        with TestClient(create_app(url)) as other:
            register(other, 'playlist_other')
            assert other.get('/api/playlists').json() == []
            assert other.get(f'/api/playlists/{saved["id"]}').status_code == 404
            assert other.put('/api/playlists/concerts/' + event['id']).json()['id'] != saved['id']
        assert owner.put('/api/playlists/concerts/unknown').status_code == 422
    with TestClient(create_app(url)) as restarted:
        restarted.post('/api/accounts/login', json={'username': 'listener_a', 'password': 'Only-my-memory-2026'})
        assert restarted.get(f'/api/playlists/{saved["id"]}').json() == saved
        assert restarted.get('/api/me').json()['user']['id'] == identity['id']


def test_empty_concert_cannot_create_an_empty_playlist(tmp_path, monkeypatch):
    from app import footprints
    monkeypatch.setattr(footprints, 'load_catalog', lambda: {'artists': [], 'events': [{'id': 'empty', 'songs': []}]})
    with TestClient(create_app(f'sqlite:///{tmp_path / "empty.db"}')) as owner:
        register(owner)
        response = owner.put('/api/playlists/concerts/empty')
        assert response.status_code == 422
        assert owner.get('/api/playlists').json() == []


def test_cancelled_show_cannot_be_marked_as_attended(tmp_path, monkeypatch):
    from app import footprints
    monkeypatch.setattr(footprints, 'load_catalog', lambda: {'events': [
        {'id': 'cancelled', 'date': '2026-07-10', 'event_status': 'cancelled'}
    ]})
    with TestClient(create_app(f'sqlite:///{tmp_path / "cancelled.db"}')) as owner:
        register(owner)
        response = owner.put('/api/footprints/cancelled', json={'attended': True})
        assert response.status_code == 422
        assert '取消' in response.json()['detail']
        assert owner.get('/api/footprints').json() == []
        assert owner.put('/api/footprints/cancelled', json={'attended': False}).status_code == 200
