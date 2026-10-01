"""A saved collection changes only after its owner accepts a reviewed refresh."""
import copy
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event as sql_event, text

from app import footprints
from app.main import create_app
from app.models import ConcertPlaylist
from test_private_flow import register


@pytest.fixture
def snapshot_catalog(monkeypatch):
    value = {
        'verified_on': '2026-10-01', 'artists': [{'id': 'gem', 'name': '邓紫棋'}],
        'events': [{
            'id': 'concert', 'artist_id': 'gem', 'date': '2025-12-07',
            'city': '三亚', 'venue': '体育场', 'event_status': 'scheduled',
            'songs': [
                {'title': '光年之外', 'artist': '邓紫棋', 'audio_url': '/old.mp3'},
                {'title': '泡沫', 'artist': '邓紫棋'},
            ],
            'setlist_kind': 'artist_collection', 'setlist_note': '实际曲目待核实。',
            'source_url': 'https://example.com/announcement', 'source_title': '演出公告',
            'source_kind': 'announcement', 'verified_on': '2026-09-30',
        }],
    }
    monkeypatch.setattr(footprints, 'load_catalog', lambda: copy.deepcopy(value))
    return value


def stored_json(app, playlist_id):
    with app.state.session_factory() as db:
        return db.get(ConcertPlaylist, playlist_id).snapshot_json


def refresh_input(saved):
    return {'expected_snapshot_version': saved['snapshot_version'], 'expected_current_version': saved['current_version']}


def test_new_snapshot_keeps_specific_provenance_and_versions(snapshot_catalog):
    source = snapshot_catalog['events'][0]
    source.update({
        'setlist_kind': 'confirmed', 'setlist_note': '完整录像逐首核对。',
        'setlist_evidence': {'event_id': 'concert', 'url': 'https://example.com/recording',
                             'title': '本场完整录像', 'kind': 'recording', 'verified_on': '2026-10-01'},
    })
    with TestClient(create_app('sqlite:///:memory:')) as owner:
        register(owner)
        response = owner.put('/api/playlists/concerts/concert')
        assert response.status_code == 200, response.text
        saved = response.json()
        assert saved['setlist_note'] == '完整录像逐首核对。'
        assert saved['setlist_verified_on'] == '2026-10-01'
        assert saved['setlist_evidence'] == source['setlist_evidence']
        assert saved['catalog_checked_on'] == '2026-10-01'
        assert saved['source_url'] == 'https://example.com/announcement'
        assert saved['event_status'] == 'scheduled'
        assert len(saved['snapshot_version']) == 64
        assert saved['current_version'] == saved['snapshot_version']
        assert saved['update_available'] is False
        assert saved['legacy_snapshot'] is False
        assert saved['current_setlist_kind'] == 'confirmed'
        assert saved['current_setlist_verified_on'] == '2026-10-01'


def test_changed_catalog_is_previewed_until_explicit_refresh(snapshot_catalog):
    app = create_app('sqlite:///:memory:')
    with TestClient(app) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        original_json = stored_json(app, saved['id'])
        source = snapshot_catalog['events'][0]
        source.update({
            'setlist_kind': 'partial', 'setlist_note': '录像可确认两首，顺序待补。',
            'setlist_evidence': {'event_id': 'concert', 'url': 'https://example.com/clips',
                                 'title': '本场片段', 'kind': 'community', 'verified_on': '2026-10-01'},
        })
        source['songs'].reverse()
        preview = owner.get(f'/api/playlists/{saved["id"]}').json()
        assert preview['update_available'] is True
        assert preview['snapshot_version'] == saved['snapshot_version']
        assert preview['current_version'] != saved['snapshot_version']
        assert preview['current_setlist_kind'] == 'partial'
        assert preview['setlist_kind'] == 'artist_collection'
        assert preview['songs'] == saved['songs']
        assert stored_json(app, saved['id']) == original_json
        assert owner.put('/api/playlists/concerts/concert').json() == preview
        assert owner.get('/api/playlists').json() == [preview]
        assert stored_json(app, saved['id']) == original_json
        response = owner.post(f'/api/playlists/{saved["id"]}/refresh', json=refresh_input(preview))
        assert response.status_code == 200, response.text
        refreshed = response.json()
        assert refreshed['snapshot_version'] == preview['current_version']
        assert refreshed['current_version'] == refreshed['snapshot_version']
        assert refreshed['update_available'] is False
        assert refreshed['setlist_kind'] == 'partial'
        assert refreshed['setlist_verified_on'] == '2026-10-01'
        assert refreshed['songs'] == [{'title': '泡沫', 'artist': '邓紫棋'}, {'title': '光年之外', 'artist': '邓紫棋'}]
        assert refreshed['created_at'] == saved['created_at']


@pytest.mark.parametrize('change', ['date', 'venue', 'city', 'status', 'song_title', 'song_artist', 'song_order', 'note', 'evidence', 'specific_check'])
def test_substantive_catalog_changes_change_the_content_version(change, snapshot_catalog):
    source = snapshot_catalog['events'][0]
    with TestClient(create_app('sqlite:///:memory:')) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        if change in {'date', 'venue', 'city'}:
            source[change] += ' changed'
        elif change == 'status':
            source['event_status'] = 'cancelled'
        elif change == 'song_title':
            source['songs'][0]['title'] = '新歌'
        elif change == 'song_artist':
            source['songs'][0]['artist'] = '嘉宾'
        elif change == 'song_order':
            source['songs'].reverse()
        elif change == 'note':
            source['setlist_note'] = '新的核验说明。'
        elif change == 'specific_check':
            source['setlist_verified_on'] = '2026-10-01'
        else:
            source['setlist_evidence'] = {'event_id': 'concert', 'url': 'https://example.com/new-proof', 'title': '新证据', 'kind': 'recording', 'verified_on': '2026-10-01'}
        preview = owner.get(f'/api/playlists/{saved["id"]}').json()
        assert preview['current_version'] != saved['snapshot_version']
        assert preview['update_available'] is True


def test_catalog_checked_date_and_song_links_do_not_create_noise_updates(snapshot_catalog):
    app = create_app('sqlite:///:memory:')
    with TestClient(app) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        raw = stored_json(app, saved['id'])
        snapshot_catalog['verified_on'] = '2026-10-02'
        snapshot_catalog['events'][0]['songs'][0]['audio_url'] = '/new.mp3'
        snapshot_catalog['events'][0]['songs'][0]['url'] = 'https://example.com/search'
        current = owner.get(f'/api/playlists/{saved["id"]}').json()
        assert current['current_version'] == saved['snapshot_version']
        assert current['update_available'] is False
        assert current['catalog_checked_on'] == '2026-10-01'
        assert stored_json(app, saved['id']) == raw


def test_legacy_reads_and_save_preserve_original_until_refresh(snapshot_catalog):
    app = create_app('sqlite:///:memory:')
    with TestClient(app) as owner:
        identity = register(owner)
        legacy = {'name': '原来收藏的歌单', 'artist': '邓紫棋', 'date': '2025-12-07',
                  'city': '三亚', 'venue': '旧场馆', 'songs': [{'title': '旧曲目', 'artist': '邓紫棋'}],
                  'setlist_kind': 'artist_collection'}
        raw = json.dumps(legacy, ensure_ascii=False)
        with app.state.session_factory() as db:
            record = ConcertPlaylist(owner_id=identity['id'], event_id='concert', snapshot_json=raw)
            db.add(record)
            db.commit()
            playlist_id = record.id
        preview = owner.get(f'/api/playlists/{playlist_id}').json()
        assert preview['legacy_snapshot'] is True
        assert len(preview['snapshot_version']) == 64
        assert preview['update_available'] is True
        assert all(preview[key] == value for key, value in legacy.items())
        assert preview.get('setlist_verified_on') is None
        assert preview.get('setlist_note') is None
        assert stored_json(app, playlist_id) == raw
        assert owner.put('/api/playlists/concerts/concert').json() == preview
        assert stored_json(app, playlist_id) == raw
        refreshed = owner.post(f'/api/playlists/{playlist_id}/refresh', json=refresh_input(preview)).json()
        assert refreshed['legacy_snapshot'] is False
        assert refreshed['songs'][0]['title'] == '光年之外'
        assert stored_json(app, playlist_id) != raw


def test_missing_catalog_event_preserves_snapshot(snapshot_catalog):
    app = create_app('sqlite:///:memory:')
    with TestClient(app) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        raw = stored_json(app, saved['id'])
        snapshot_catalog['events'].clear()
        preview = owner.get(f'/api/playlists/{saved["id"]}').json()
        assert preview['songs'] == saved['songs']
        assert preview['current_version'] is None
        assert preview['current_setlist_kind'] is None
        assert preview['current_setlist_verified_on'] is None
        assert preview['update_available'] is False
        assert owner.post(f'/api/playlists/{saved["id"]}/refresh', json=refresh_input(saved)).status_code == 409
        assert stored_json(app, saved['id']) == raw


def test_refresh_rejects_stale_versions_and_other_owner(snapshot_catalog):
    app = create_app('sqlite:///:memory:')
    with TestClient(app) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        source = snapshot_catalog['events'][0]
        source['setlist_note'] = '第一版更新说明。'
        preview = owner.get(f'/api/playlists/{saved["id"]}').json()
        path = f'/api/playlists/{saved["id"]}/refresh'
        other = TestClient(app)
        register(other, 'listener_b')
        assert other.post(path, json=refresh_input(preview)).status_code == 404
        guest = TestClient(app)
        assert guest.post(path, json=refresh_input(preview)).status_code == 401
        assert owner.post(path, json=refresh_input(saved)).status_code == 409
        assert owner.post(path, json={**refresh_input(preview), 'expected_snapshot_version': 'wrong'}).status_code == 409
        source['setlist_note'] = '第二版更新说明。'
        assert owner.post(path, json=refresh_input(preview)).status_code == 409
        latest = owner.get(f'/api/playlists/{saved["id"]}').json()
        assert owner.post(path, json=refresh_input(latest)).status_code == 200
        assert owner.post(path, json=refresh_input(latest)).status_code == 409
        assert owner.post('/api/playlists/9223372036854775808/refresh', json=refresh_input(latest)).status_code == 404


@pytest.mark.parametrize('body', [{}, {'expected_snapshot_version': 1, 'expected_current_version': 'x'},
    {'expected_snapshot_version': 'x', 'expected_current_version': None},
    {'expected_snapshot_version': 'x', 'expected_current_version': 'x', 'owner_id': 1}])
def test_refresh_requires_strict_version_input(body, snapshot_catalog):
    with TestClient(create_app('sqlite:///:memory:')) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        assert owner.post(f'/api/playlists/{saved["id"]}/refresh', json=body).status_code == 422


def test_refresh_detects_snapshot_change_between_read_and_write(snapshot_catalog, tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "concurrent-refresh.db"}')
    with TestClient(app) as owner:
        register(owner)
        saved = owner.put('/api/playlists/concerts/concert').json()
        snapshot_catalog['events'][0]['setlist_note'] = '待接受的更新。'
        preview = owner.get(f'/api/playlists/{saved["id"]}').json()
        original_json = stored_json(app, saved['id'])
        concurrent = json.loads(original_json)
        concurrent['setlist_note'] = '另一个已接受的更新。'
        concurrent_json = json.dumps(concurrent, ensure_ascii=False)
        with app.state.session_factory() as db:
            engine = db.get_bind()
        raced = False

        def concurrent_write(connection, cursor, statement, parameters, context, executemany):
            nonlocal raced
            if statement.startswith('UPDATE concert_playlists') and not raced:
                raced = True
                with app.state.session_factory() as competing:
                    competing.execute(text('UPDATE concert_playlists SET snapshot_json=:snapshot WHERE id=:id'),
                                      {'snapshot': concurrent_json, 'id': saved['id']})
                    competing.commit()

        sql_event.listen(engine, 'before_cursor_execute', concurrent_write)
        try:
            response = owner.post(f'/api/playlists/{saved["id"]}/refresh', json=refresh_input(preview))
        finally:
            sql_event.remove(engine, 'before_cursor_execute', concurrent_write)
        assert response.status_code == 409, response.text
        assert raced
        assert stored_json(app, saved['id']) == concurrent_json
