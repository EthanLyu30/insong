"""Whole-concert cards preserve selected music and explicit public consent."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app import footprints
from test_private_flow import register

EVENT = 'gem-shenzhen-20261005'
ALL = ['光年之外', '泡沫', '句号', '再见', '倒数', '喜欢你', '多远都要在一起', '我的秘密']


def data(mode='tracks', titles=None, **extra):
    return {'story': '一起听完整场演唱会。', 'event_id': EVENT,
            'request_key': str(uuid4()),
            'music_selection': {'mode': mode, 'track_titles': titles or ['泡沫', '光年之外']}, **extra}


@pytest.mark.parametrize('mode,titles', [('tracks', ['泡沫', '光年之外']), ('playlist', ALL)])
def test_concert_music_saves_one_card_and_idempotent_retry(tmp_path, mode, titles):
    with TestClient(create_app(f'sqlite:///{tmp_path / "selection.db"}')) as owner:
        register(owner)
        body = data(mode, titles)
        response = owner.post('/api/memories', json=body)
        assert response.status_code == 201, response.text
        card = response.json()
        music = card['music_selection']
        assert music['mode'] == mode and music['event_id'] == EVENT
        assert [track['title'] for track in music['tracks']] == titles
        assert music['setlist_kind'] == 'artist_collection'
        assert '实际' in music['note'] and '待核实' in music['note']
        assert all(track['artist'] == '邓紫棋' and track['url'].startswith('https://y.qq.com/') for track in music['tracks'])
        assert owner.post('/api/memories', json=body).json()['id'] == card['id']
        assert len(owner.get('/api/memories?event_id=' + EVENT).json()) == 1
        assert owner.post('/api/memories', json=body | {'music_selection': {'mode': 'tracks', 'track_titles': ['再见']}}).status_code == 409


@pytest.mark.parametrize('changes', [
    {'event_id': None}, {'event_id': 'unknown-event'},
    {'music_selection': {'mode': 'tracks', 'track_titles': []}},
    {'music_selection': {'mode': 'tracks', 'track_titles': ['不是这场的作品']}},
    {'music_selection': {'mode': 'tracks', 'track_titles': ['泡沫', '泡沫']}},
    {'music_selection': {'mode': 'tracks', 'track_titles': [1]}},
    {'song_id': 1}, {'song_input': {'title': '别的歌', 'artist': '别人'}},
    {'offset_ms': 100},
])
def test_invalid_concert_music_never_creates_a_card(tmp_path, changes):
    with TestClient(create_app(f'sqlite:///{tmp_path / "invalid.db"}')) as owner:
        register(owner)
        assert owner.post('/api/memories', json=data(**changes)).status_code == 422
        assert owner.get('/api/memories').json() == []


def test_playlist_change_requires_reselection_instead_of_silent_extra_tracks(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "stale.db"}')) as owner:
        register(owner)
        assert owner.post('/api/memories', json=data('playlist', ['泡沫'])).status_code == 409


def test_music_edit_withdraws_public_snapshot_and_preserves_other_fields(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "public.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        card = owner.post('/api/memories', json=data(publication={'confirmed': True, 'anonymous': False})).json()
        path = f'/api/memories/{card["id"]}'
        public_path = f'/api/stories/{card["id"]}'
        public = guest.get(public_path).json()
        assert public['music_selection'] == card['music_selection']
        assert public['author_name'] == '听歌的人'
        edited = owner.patch(path, json={'revision': card['revision'], 'music_selection': {'mode': 'playlist', 'track_titles': ALL}})
        assert edited.status_code == 200, edited.text
        updated = edited.json()
        assert updated['story'] == card['story'] and updated['event_id'] == EVENT
        assert updated['music_selection']['mode'] == 'playlist'
        assert guest.get(public_path).status_code == 404
        assert owner.patch(path, json={'revision': card['revision'], 'music_selection': None}).status_code == 409
        assert guest.get(path).status_code == 404
        assert owner.patch(path, json={'revision': updated['revision'], 'event_id': 'gem-shenzhen-20260926'}).status_code == 422


def test_saved_selection_survives_catalog_changes_and_retry(tmp_path, monkeypatch):
    with TestClient(create_app(f'sqlite:///{tmp_path / "snapshot.db"}')) as owner:
        register(owner)
        body = data()
        card = owner.post('/api/memories', json=body).json()
        original = footprints.load_catalog()
        for event in original['events']:
            if event['id'] == EVENT:
                event['songs'] = []
        monkeypatch.setattr(footprints, 'load_catalog', lambda: original)
        assert owner.get(f'/api/memories/{card["id"]}').json()['music_selection'] == card['music_selection']
        assert owner.post('/api/memories', json=body).json()['id'] == card['id']
        edited = owner.patch(f'/api/memories/{card["id"]}', json={'revision': card['revision'],
            'story': '只修改文字，音乐保持原样。', 'music_selection': body['music_selection']})
        assert edited.status_code == 200, edited.text
        assert edited.json()['music_selection'] == card['music_selection']
