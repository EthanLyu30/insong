from fastapi.testclient import TestClient
from sqlalchemy import select, func
from app.main import create_app
from app.models import Song

def payload():
    return {'song_input': {'title': '平凡之路', 'artist': '朴树'},
            'event_input': {'title': '巡演深圳场', 'artist': '朴树', 'date': '2026-09-25', 'city': '深圳', 'venue': '我记下的场馆'},
            'story': '散场后还舍不得离开。', 'request_key': 'manual-recording-request'}

def test_manual_record_is_private_playback_unavailable_and_retry_safe(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'manual.db'}")
    with TestClient(app) as owner, TestClient(app) as other:
        owner.post('/api/demo/sessions', json={'user_id': 1})
        other.post('/api/demo/sessions', json={'user_id': 2})
        result = owner.post('/api/memories', json=payload())
        assert result.status_code == 201
        card = result.json()
        assert card['song']['title'] == '平凡之路'
        assert card['song']['audio_available'] is False and card['song']['audio_url'] is None
        assert card['event_id'] is None
        assert card['event_snapshot']['venue'] == '我记下的场馆'
        assert card['event_snapshot']['manual'] is True
        assert other.get(f"/api/songs/{card['song_id']}").status_code == 404
        assert card['song_id'] not in [song['id'] for song in other.get('/api/songs').json()]
        assert owner.post('/api/memories', json=payload()).json()['id'] == card['id']
        with app.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(Song).where(Song.owner_id == 1)) == 1
        stolen = other.post('/api/memories', json={
            'song_id': card['song_id'], 'story': '不能私自关联他人的私人曲目', 'request_key': 'other-custom-song-request'})
        assert stolen.status_code == 404
        published = owner.post(f"/api/memories/{card['id']}/publication", json={
            'revision': card['revision'], 'confirmed': True, 'excerpt': card['story']})
        assert published.status_code == 200
        public = other.get(f"/api/stories/{card['id']}").json()
        assert public['event_snapshot'] == card['event_snapshot']
        assert other.get(f"/api/songs/{card['song_id']}").status_code == 200

def test_public_manual_song_can_anchor_another_listeners_record_after_original_withdrawal(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'shared.db'}")) as owner, TestClient(create_app(f"sqlite:///{tmp_path / 'shared.db'}")) as other:
        owner.post('/api/demo/sessions', json={'user_id': 1})
        other.post('/api/demo/sessions', json={'user_id': 2})
        original = owner.post('/api/memories', json={**payload(), 'publication': {'confirmed': True}}).json()
        record = other.post('/api/memories', json={'song_id': original['song_id'], 'story': '同一首歌，我自己的经历', 'request_key': 'public-custom-song-record'})
        assert record.status_code == 201
        withdrawn = owner.delete(f"/api/memories/{original['id']}/publication?revision={original['revision']}")
        assert withdrawn.status_code == 200
        assert other.get(f"/api/songs/{original['song_id']}").status_code == 200
        assert other.get(f"/api/memories/{record.json()['id']}").json()['story'] == '同一首歌，我自己的经历'

def test_manual_data_rejects_ambiguous_or_invalid_metadata(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'invalid.db'}")) as client:
        client.post('/api/demo/sessions', json={'user_id': 1})
        for extra in ({'song_id': 1}, {'event_id': 'also-official'},
                      {'event_input': {**payload()['event_input'], 'date': '2026-02-30'}},
                      {'song_input': {'title': ' ', 'artist': '朴树'}}):
            assert client.post('/api/memories', json={**payload(), **extra}).status_code == 422
