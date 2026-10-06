from fastapi.testclient import TestClient

from app.main import create_app
from app import footprints
from app.models import MemoryCard
import sqlite3


def test_record_keeps_original_event_after_catalog_changes_and_removal(tmp_path, monkeypatch):
    event = {'id': 'original-night', 'artist_id': 'gem', 'title': '巡演 · 深圳站',
             'date': '2026-10-01', 'city': '深圳', 'venue': '大运体育场'}
    catalog = {'artists': [{'id': 'gem', 'name': '邓紫棋'}], 'events': [event]}
    monkeypatch.setattr(footprints, 'load_catalog', lambda: catalog)
    app = create_app(f"sqlite:///{tmp_path / 'snapshots.db'}")
    with TestClient(app) as client:
        client.post('/api/demo/sessions', json={'user_id': 1})
        body = {'song_id': 1, 'story': '这一晚，和朋友一起唱。',
                'event_id': event['id'], 'request_key': 'snapshot-original-night',
                'publication': {'confirmed': True}}
        result = client.post('/api/memories', json=body)
        assert result.status_code == 201
        saved = result.json()
        expected = {key: event[key] for key in ('id', 'title', 'date', 'city', 'venue')}
        expected['artist'] = '邓紫棋'
        assert saved['event_snapshot'] == expected
        event.update(date='2026-10-03', venue='改期后的场馆')
        assert client.get(f"/api/memories/{saved['id']}").json()['event_snapshot'] == expected
        catalog['events'] = []
        assert client.get(f"/api/stories/{saved['id']}").json()['event_snapshot'] == expected
        edited = client.patch(f"/api/memories/{saved['id']}", json={
            'revision': saved['revision'], 'event_id': 'original-night', 'story': '后来再看这一晚。'})
        assert edited.status_code == 200
        assert edited.json()['event_snapshot'] == expected
        published = client.post(f"/api/memories/{saved['id']}/publication", json={
            'revision': edited.json()['revision'], 'excerpt': '后来再看这一晚。', 'confirmed': True})
        assert published.status_code == 200
        assert client.get(f"/api/stories/{saved['id']}").json()['event_snapshot'] == expected
        retry = client.post('/api/memories', json=body)
        assert retry.status_code == 409  # Existing receipt is retained even without catalog data.


def test_changing_event_refreshes_snapshot_and_unlinking_clears_it(tmp_path, monkeypatch):
    events = [{'id': name, 'artist_id': 'gem', 'title': name, 'date': '2026-09-01',
               'city': '上海', 'venue': name + '场馆'} for name in ('one', 'two')]
    monkeypatch.setattr(footprints, 'load_catalog', lambda: {
        'artists': [{'id': 'gem', 'name': '邓紫棋'}], 'events': events})
    app = create_app(f"sqlite:///{tmp_path / 'change.db'}")
    with TestClient(app) as client:
        client.post('/api/demo/sessions', json={'user_id': 1})
        saved = client.post('/api/memories', json={'song_id': 1, 'story': '现场',
            'event_id': 'one', 'request_key': 'changing-event-snapshot'}).json()
        changed = client.patch(f"/api/memories/{saved['id']}", json={
            'revision': saved['revision'], 'event_id': 'two'})
        assert changed.status_code == 200
        assert changed.json()['event_snapshot']['id'] == 'two'
        removed = client.patch(f"/api/memories/{saved['id']}", json={
            'revision': changed.json()['revision'], 'event_id': None})
        assert removed.status_code == 200
        assert removed.json()['event_snapshot'] is None


def test_legacy_database_adds_snapshot_columns_and_backfills_only_once(tmp_path, monkeypatch):
    path = tmp_path / 'legacy.db'
    event = {'id': 'legacy-night', 'artist_id': 'gem', 'title': '旧记录的演出',
             'date': '2026-09-25', 'city': '深圳', 'venue': '原场馆'}
    monkeypatch.setattr(footprints, 'load_catalog', lambda: {
        'artists': [{'id': 'gem', 'name': '邓紫棋'}], 'events': [event]})
    app = create_app(f'sqlite:///{path}')
    with TestClient(app):
        with app.state.session_factory() as db:
            db.get(MemoryCard, 1).event_id = event['id']
            db.commit()
    with sqlite3.connect(path) as db:
        db.execute('ALTER TABLE memory_cards DROP COLUMN event_snapshot_json')
        db.execute('ALTER TABLE public_stories DROP COLUMN event_snapshot_json')
    with TestClient(create_app(f'sqlite:///{path}')) as client:
        client.post('/api/demo/sessions', json={'user_id': 1})
        original = client.get('/api/memories/1').json()
        assert original['event_snapshot']['venue'] == '原场馆'
    event['venue'] = '后来的场馆'
    with TestClient(create_app(f'sqlite:///{path}')) as client:
        client.post('/api/demo/sessions', json={'user_id': 1})
        assert client.get('/api/memories/1').json()['event_snapshot'] == original['event_snapshot']
