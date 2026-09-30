"""Privacy boundaries and durable state introduced by the 9.29 redesign."""
import base64
import io
import json
import sqlite3
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from test_private_flow import payload, register
from test_public_stories import publish


def photo_data(format='JPEG', size=(32, 16), metadata=False):
    image = Image.new('RGB', size, '#bb8877')
    output = io.BytesIO()
    options = {}
    if metadata:
        exif = Image.Exif()
        exif[270] = 'PRIVATE LOCATION AND CAMERA DATA'
        exif[274] = 6
        options['exif'] = exif
    image.save(output, format=format, **options)
    return base64.b64encode(output.getvalue()).decode('ascii')


def upload(client, **kwargs):
    response = client.post('/api/photos', json={'data': photo_data(**kwargs)})
    assert response.status_code == 201, response.text
    return response.json()


def test_uploaded_photo_is_private_sanitized_and_durable(tmp_path):
    url = f'sqlite:///{tmp_path / "photos.db"}'
    app = create_app(url)
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'listener_b')
        guest = TestClient(app)
        assert guest.post('/api/photos', json={'data': photo_data()}).status_code == 401
        photo = upload(owner, size=(3000, 1500), metadata=True)
        assert photo['url'] == f'/api/photos/{photo["id"]}'
        for visitor in (guest, other):
            response = visitor.get(photo['url'])
            assert response.status_code == 404
            assert response.headers['cache-control'] == 'no-store'
        response = owner.get(photo['url'])
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        assert response.headers['content-type'] == 'image/jpeg'
        sanitized = Image.open(io.BytesIO(response.content))
        assert sanitized.height > sanitized.width  # EXIF orientation applied before stripping.
        assert max(sanitized.size) <= 2048
        assert not sanitized.getexif()
        assert b'PRIVATE LOCATION' not in response.content
    with TestClient(create_app(url)) as owner:
        owner.post('/api/accounts/login', json={'username': 'listener_a', 'password': 'Only-my-memory-2026'})
        assert owner.get(photo['url']).status_code == 200


@pytest.mark.parametrize('format', ['JPEG', 'PNG', 'WEBP'])
def test_upload_supports_only_real_allowed_images(tmp_path, format):
    with TestClient(create_app(f'sqlite:///{tmp_path / "formats.db"}')) as client:
        register(client)
        assert client.post('/api/photos', json={'data': photo_data(format)}).status_code == 201
        for invalid in ('not base64', base64.b64encode(b'not an image').decode(), photo_data('GIF')):
            assert client.post('/api/photos', json={'data': invalid}).status_code == 422


def test_upload_rejects_large_body_and_decoded_image(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "limits.db"}')) as client:
        register(client)
        too_large = base64.b64encode(b'x' * (5 * 1024 * 1024 + 1)).decode()
        assert client.post('/api/photos', json={'data': too_large}).status_code == 413
        body = b'{"data":"' + b'x' * (8 * 1024 * 1024) + b'"}'
        assert client.post('/api/photos', content=body, headers={'content-type': 'application/json'}).status_code == 413
        assert client.post('/api/photos', content=iter([body[:100], body[100:]]),
                           headers={'content-type': 'application/json'}).status_code == 413
        assert client.post('/api/photos', json={'data': photo_data(size=(6000, 6000))}).status_code == 422
        assert client.post('/api/photos', json={'data': photo_data()},
                           headers={'origin': 'https://foreign.example'}).status_code == 403


def test_photo_access_tracks_active_publication_and_cannot_cross_owners(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "publish-photos.db"}')
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'listener_b')
        guest = TestClient(app)
        photo = upload(owner)
        note_photo = upload(owner, format='PNG')
        assert other.post('/api/memories', json=payload(photo_id=photo['id'])).status_code == 422
        card = owner.post('/api/memories', json=payload(story='散场后舍不得回家。', photo_id=photo['id'], end_ms=20000)).json()
        assert card['photo_url'] == photo['url']
        path = f'/api/memories/{card["id"]}'
        card = publish(owner, card).json()
        public = guest.get(f'/api/stories/{card["id"]}').json()
        assert public['photo_id'] == photo['id'] and public['photo_url'] == photo['url']
        assert public['end_ms'] == 20000
        assert guest.get(photo['url']).status_code == 200
        card = owner.post(path + '/reflections', json={'revision': card['revision'], 'photo_id': note_photo['id']}).json()
        assert guest.get(note_photo['url']).status_code == 404
        assert note_photo['id'] not in guest.get(f'/api/stories/{card["id"]}').text
        card = owner.patch(path, json={'revision': card['revision'], 'photo_id': note_photo['id']}).json()
        assert guest.get(photo['url']).status_code == 404
        assert guest.get(note_photo['url']).status_code == 404
        assert publish(owner, card, revision=1).status_code == 409
        assert guest.get(note_photo['url']).status_code == 404
        card = publish(owner, card).json()
        assert guest.get(note_photo['url']).status_code == 200
        card = owner.delete(path + f'/publication?revision={card["revision"]}').json()
        assert guest.get(note_photo['url']).status_code == 404
        card = publish(owner, card).json()
        assert owner.delete(path + f'?revision={card["revision"]}').status_code == 204
        assert guest.get(note_photo['url']).status_code == 404
        assert owner.get(note_photo['url']).status_code == 200


def test_ranges_validate_combined_edit_state_and_receipt_payload(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "interval.db"}')) as client:
        register(client)
        for changes in ({'offset_ms': None, 'end_ms': 1000}, {'end_ms': 12300}, {'end_ms': 12299},
                        {'end_ms': 48001}, {'end_ms': True}, {'end_ms': -1}):
            assert client.post('/api/memories', json=payload(**changes)).status_code == 422
        data = payload(offset_ms=0, end_ms=48000)
        response = client.post('/api/memories', json=data)
        assert response.status_code == 201, response.text
        card = response.json()
        assert card['end_ms'] == 48000
        assert client.post('/api/memories', json=data | {'end_ms': 47000}).status_code == 409
        path = f'/api/memories/{card["id"]}'
        assert client.patch(path, json={'revision': 1, 'offset_ms': None}).status_code == 422
        assert client.patch(path, json={'revision': 1, 'offset_ms': 47000, 'end_ms': 46000}).status_code == 422
        cleared = client.patch(path, json={'revision': 1, 'offset_ms': None, 'end_ms': None})
        assert cleared.status_code == 200
        assert cleared.json()['offset_ms'] is None and cleared.json()['end_ms'] is None


def test_reflections_accept_mood_photo_or_text_and_preserve_old_notes(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "reflections.db"}')
    with TestClient(app) as client:
        register(client)
        other = TestClient(app)
        register(other, 'listener_b')
        forbidden = upload(other)
        photo = upload(client)
        card = client.post('/api/memories', json=payload()).json()
        from app.models import MemoryCard
        with app.state.session_factory() as db:
            db.get(MemoryCard, card['id']).reflections_json = json.dumps([{'id': 'legacy', 'text': '旧补记', 'created_at': '2025-01-01'}])
            db.commit()
        path = f'/api/memories/{card["id"]}/reflections'
        for invalid in ({}, {'text': '  '}, {'mood': 'unknown'}, {'photo_id': forbidden['id']}):
            assert client.post(path, json={'revision': card['revision'], **invalid}).status_code == 422
        for changes in ({'mood': 'happy'}, {'photo_id': photo['id']}, {'text': '  今天有点想念  ', 'mood': 'miss'}):
            response = client.post(path, json={'revision': card['revision'], **changes})
            assert response.status_code == 200, response.text
            card = response.json()
            assert card['story'] == payload()['story']
        assert card['reflections'][0]['text'] == '旧补记'
        assert card['reflections'][0]['photo_url'] is None
        assert card['reflections'][1]['mood'] == 'happy'
        assert card['reflections'][2]['photo_url'] == photo['url']
        assert card['reflections'][3]['text'] == '今天有点想念'
        assert client.post(path, json={'revision': 1, 'mood': 'peaceful'}).status_code == 409


def test_footprints_persist_per_owner_and_events_filter_snapshots(tmp_path, monkeypatch):
    from app import footprints
    catalog_path = tmp_path / 'catalog.json'
    catalog = {'artists': [{'id': 'fixture', 'name': '测试歌手'}], 'events': [
        {'id': 'past-event', 'artist_id': 'fixture', 'title': '测试场次', 'date': '2020-01-01', 'songs': []},
        {'id': 'future-event', 'artist_id': 'fixture', 'title': '未来测试', 'date': (datetime.now(timezone(timedelta(hours=8))).date() + timedelta(days=1)).isoformat(), 'songs': []},
    ]}
    catalog_path.write_text(json.dumps(catalog), encoding='utf-8')
    monkeypatch.setattr(footprints, 'CATALOG_PATH', catalog_path)
    url = f'sqlite:///{tmp_path / "footprints.db"}'
    app = create_app(url)
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'listener_b')
        guest = TestClient(app)
        assert guest.get('/api/footprints/catalog').json() == catalog | {'today': datetime.now(timezone(timedelta(hours=8))).date().isoformat()}
        assert guest.get('/api/footprints').status_code == 401
        assert guest.put('/api/footprints/past-event', json={'attended': True}).status_code == 401
        assert owner.put('/api/footprints/unknown', json={'attended': True}).status_code == 422
        assert owner.put('/api/footprints/future-event', json={'attended': True}).status_code == 422
        assert owner.put('/api/footprints/past-event', json={'attended': 'yes'}).status_code == 422
        for _ in range(2):
            assert owner.put('/api/footprints/past-event', json={'attended': True}).json() == ['past-event']
        assert other.get('/api/footprints').json() == []
        assert owner.post('/api/memories', json=payload(event_id='unknown')).status_code == 422
        data = payload(story='散场后舍不得回家。', event_id='past-event')
        card = owner.post('/api/memories', json=data).json()
        assert card['event_id'] == 'past-event'
        assert owner.post('/api/memories', json=data | {'event_id': None}).status_code == 409
        card = publish(owner, card).json()
        assert [story['id'] for story in guest.get('/api/stories?event_id=past-event').json()] == [card['id']]
        assert guest.get('/api/stories?event_id=unknown').json() == []
        assert owner.get('/api/memories?event_id=unknown').json() == []
        assert len(owner.get('/api/memories?event_id=past-event').json()) == 1
        card = owner.patch(f'/api/memories/{card["id"]}', json={'revision': card['revision'], 'event_id': None}).json()
        assert guest.get('/api/stories?event_id=past-event').json() == []
    with TestClient(create_app(url)) as owner:
        owner.post('/api/accounts/login', json={'username': 'listener_a', 'password': 'Only-my-memory-2026'})
        assert owner.get('/api/footprints').json() == ['past-event']
        for _ in range(2):
            assert owner.put('/api/footprints/past-event', json={'attended': False}).json() == []


def test_additive_migration_preserves_existing_snapshot_and_reflection(tmp_path):
    path = tmp_path / 'before-redesign.db'
    url = f'sqlite:///{path}'
    with sqlite3.connect(path) as connection:
        # A literal pre-redesign schema exercises the actual upgrade, including
        # a pre-existing public_stories table that create_all cannot alter.
        connection.executescript('''
            CREATE TABLE users(id INTEGER PRIMARY KEY,display_name VARCHAR(80) NOT NULL,is_demo BOOLEAN NOT NULL);
            CREATE TABLE songs(id INTEGER PRIMARY KEY,title VARCHAR(160) NOT NULL,artist VARCHAR(160) NOT NULL,version VARCHAR(100) NOT NULL,source_label VARCHAR(100) NOT NULL,is_demo BOOLEAN NOT NULL,audio_available BOOLEAN NOT NULL,created_at DATETIME NOT NULL);
            CREATE TABLE memory_cards(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL,song_id INTEGER NOT NULL,story TEXT NOT NULL,life_time VARCHAR(80),scene VARCHAR(160),visibility VARCHAR(10) NOT NULL DEFAULT 'private',is_demo_sample BOOLEAN NOT NULL DEFAULT 0,reflections_json TEXT NOT NULL DEFAULT '[]',created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE public_stories(memory_id INTEGER PRIMARY KEY,excerpt TEXT NOT NULL,life_time VARCHAR(80),life_year INTEGER,share_life_time BOOLEAN NOT NULL,anonymous BOOLEAN NOT NULL,author_name VARCHAR(80) NOT NULL,offset_ms INTEGER,lyric_id VARCHAR(40),theme_id VARCHAR(40),published BOOLEAN NOT NULL,version INTEGER NOT NULL,published_at DATETIME NOT NULL);
            INSERT INTO users VALUES(1,'保留用户',1);
            INSERT INTO songs VALUES(1,'保留的歌','作者','旧版本','旧来源',1,0,CURRENT_TIMESTAMP);
            INSERT INTO memory_cards(id,owner_id,song_id,story) VALUES(99,1,1,'散场后舍不得回家。私人原文');
            INSERT INTO public_stories(memory_id,excerpt,share_life_time,anonymous,author_name,published,version,published_at) VALUES(99,'散场后舍不得回家。',0,1,'匿名听友',1,3,CURRENT_TIMESTAMP);
        ''')
        connection.execute('UPDATE memory_cards SET reflections_json=? WHERE id=99',
                           (json.dumps([{'id': 'old', 'text': '旧版本补记', 'created_at': '2025-01-01'}]),))
    for _ in range(2):
        with TestClient(create_app(url)) as client:
            client.post('/api/demo/sessions', json={'user_id': 1})
            stored = client.get('/api/memories/99').json()
            assert stored['photo_id'] is None and stored['end_ms'] is None and stored['event_id'] is None
            assert stored['reflections'][0]['text'] == '旧版本补记'
            assert stored['story'] == '散场后舍不得回家。私人原文'
            public = client.get('/api/stories/99').json()
            assert public['excerpt'] == '散场后舍不得回家。'
            assert public['photo_url'] is None


def test_footprint_dates_use_china_midnight_for_catalog_and_attendance(tmp_path, monkeypatch):
    from app import footprints
    from fastapi import HTTPException

    class ChinaMidnight(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 9, 30, 16, 30, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(footprints, 'datetime', ChinaMidnight)
    catalog_path = tmp_path / 'china-midnight.json'
    catalog_path.write_text(json.dumps({'artists': [], 'events': [
        {'id': 'today', 'date': '2026-10-01'}, {'id': 'tomorrow', 'date': '2026-10-02'}
    ]}), encoding='utf-8')
    monkeypatch.setattr(footprints, 'CATALOG_PATH', catalog_path)
    assert footprints.load_catalog()['today'] == '2026-10-01'
    footprints.validate_event('today', past=True)
    with pytest.raises(HTTPException) as error:
        footprints.validate_event('tomorrow', past=True)
    assert error.value.status_code == 422
