"""Integration contracts, run with TEST_POSTGRES_URL against an isolated schema."""
import base64
from io import BytesIO
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select, text

from app.database import create_database_engine
from app.main import create_app
from app.models import MemoryReceipt


@pytest.fixture
def postgres_factory(monkeypatch):
    url = os.environ.get('TEST_POSTGRES_URL')
    if not url:
        pytest.skip('TEST_POSTGRES_URL is required for PostgreSQL integration')
    schema = 'insong_test_' + uuid4().hex
    monkeypatch.setenv('APP_ENV', 'test')
    monkeypatch.setenv('DATABASE_SCHEMA', schema)
    monkeypatch.delenv('DATABASE_URL', raising=False)
    try:
        yield lambda: create_app(url)
    finally:
        # Only this fixture's fresh random schema is removed; never insong/public.
        assert schema.startswith('insong_test_') and len(schema) == 44
        engine = create_database_engine(url, schema)
        try:
            with engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        finally:
            engine.dispose()


def login(client, user_id=1):
    response = client.post('/api/demo/sessions', json={'user_id': user_id})
    assert response.status_code == 200, response.text


def create_record(client, **values):
    response = client.post('/api/memories', json={
        'song_id': 1, 'story': '散场以后，和朋友一起走回去。',
        'request_key': uuid4().hex, **values,
    })
    assert response.status_code == 201, response.text
    return response.json()


def upload_photo(client, color):
    data = BytesIO()
    Image.new('RGB', (32, 32), color).save(data, format='JPEG')
    response = client.post('/api/photos', json={'data': base64.b64encode(data.getvalue()).decode()})
    assert response.status_code == 201, response.text
    return response.json()['id']


def test_seed_restart_preserves_changes_and_deleted_samples(postgres_factory):
    with TestClient(postgres_factory(), base_url='https://insong.test') as client:
        login(client)
        cards = client.get('/api/memories').json()
        edited, removed = cards[:2]
        changed = client.patch(f'/api/memories/{edited["id"]}', json={
            'revision': edited['revision'], 'story': '后来补充的原文必须跨启动保留。',
        })
        assert changed.status_code == 200
        assert client.delete(f'/api/memories/{removed["id"]}?revision={removed["revision"]}').status_code == 204
    with TestClient(postgres_factory(), base_url='https://insong.test') as client:
        login(client)
        assert client.get(f'/api/memories/{edited["id"]}').json()['story'] == '后来补充的原文必须跨启动保留。'
        assert client.get(f'/api/memories/{removed["id"]}').status_code == 404


def test_new_account_and_record_ids_follow_seeded_ids(postgres_factory):
    app = postgres_factory()
    with TestClient(app, base_url='https://insong.test') as client:
        with app.state.session_factory() as db:
            consumed = db.scalar(select(func.max(MemoryReceipt.id)))
        account = client.post('/api/accounts/register', json={
            'username': 'postgres_test', 'password': 'synthetic-password', 'display_name': 'PostgreSQL 测试',
        })
        assert account.status_code == 201, account.text
        assert account.json()['user']['id'] > 2
        first = create_record(client)
        assert first['id'] > consumed
        assert client.delete(f'/api/memories/{first["id"]}?revision={first["revision"]}').status_code == 204
        second = create_record(client)
        assert second['id'] > first['id']


def test_public_unicode_tag_matches_exact_tag(postgres_factory):
    with TestClient(postgres_factory(), base_url='https://insong.test') as client:
        login(client)
        card = create_record(client, tags=['跨城追星'], publication={'confirmed': True})
        assert card['id'] in [item['id'] for item in client.get('/api/stories', params={'tag': '跨城追星'}).json()]
        assert card['id'] not in [item['id'] for item in client.get('/api/stories', params={'tag': '跨城'}).json()]


def test_multi_photo_publication_and_withdrawal_enforce_access(postgres_factory):
    app = postgres_factory()
    with TestClient(app, base_url='https://insong.test') as owner:
        guest = TestClient(app, base_url='https://insong.test')
        login(owner)
        photos = [upload_photo(owner, 'red'), upload_photo(owner, 'blue')]
        card = create_record(owner, photo_ids=photos)
        for photo_id in photos:
            assert guest.get(f'/api/photos/{photo_id}').status_code == 404
        published = owner.post(f'/api/memories/{card["id"]}/publication', json={
            'revision': card['revision'], 'excerpt': card['story'], 'confirmed': True,
        })
        assert published.status_code == 200, published.text
        for photo_id in photos:
            assert guest.get(f'/api/photos/{photo_id}').status_code == 200
        withdrawn = owner.delete(f'/api/memories/{card["id"]}/publication?revision={published.json()["revision"]}')
        assert withdrawn.status_code == 200, withdrawn.text
        for photo_id in photos:
            assert guest.get(f'/api/photos/{photo_id}').status_code == 404
            assert owner.get(f'/api/photos/{photo_id}').status_code == 200
        guest.close()


def test_record_photo_snapshot_and_collections_survive_restart(postgres_factory):
    event_id = 'gem-shenzhen-20261002'
    with TestClient(postgres_factory(), base_url='https://insong.test') as client:
        login(client)
        photo_id = upload_photo(client, 'green')
        card = create_record(client, photo_ids=[photo_id], event_id=event_id)
        photo_bytes = client.get(f'/api/photos/{photo_id}').content
        assert client.put('/api/footprints/follows/gem', json={'followed': True}).status_code == 200
        assert client.put(f'/api/footprints/{event_id}', json={'attended': True}).status_code == 200
        playlist = client.put(f'/api/playlists/concerts/{event_id}')
        assert playlist.status_code == 200, playlist.text
    with TestClient(postgres_factory(), base_url='https://insong.test') as client:
        login(client)
        restored = client.get(f'/api/memories/{card["id"]}').json()
        assert restored['story'] == card['story']
        assert restored['event_snapshot'] == card['event_snapshot']
        assert client.get(f'/api/photos/{photo_id}').content == photo_bytes
        assert event_id in client.get('/api/footprints').json()
        assert any(item['event_id'] == event_id for item in client.get('/api/playlists').json())
        assert 'gem' in client.get('/api/footprints/interests').json()['artist_ids']


def test_large_missing_ids_keep_not_found_contract(postgres_factory):
    with TestClient(postgres_factory(), base_url='https://insong.test') as client:
        login(client)
        assert client.get('/api/songs/9223372036854775807').status_code == 404
        assert client.get('/api/memories/9223372036854775807').status_code == 404
