from fastapi.testclient import TestClient

from app.main import create_app


def test_health_reports_service_is_ready(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'health.db'}")
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_can_load_five_clearly_labeled_demo_songs(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'songs.db'}")
    with TestClient(app) as client:
        response = client.get("/api/songs")

    assert response.status_code == 200
    catalog = response.json()
    songs = [song for song in catalog if song['is_demo']]
    assert len(catalog) == 10 and len(songs) == 5
    assert songs[0]["title"] == "散场以后"
    assert all(song["is_demo"] is True for song in songs)
    assert all(song["audio_available"] is True for song in songs)
    assert all(song["recording_label"] == "原创器乐样例 v1" for song in songs)
    assert all(song["source_label"] == "虚构演示曲目" for song in songs)


def test_unknown_song_returns_not_found(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'missing.db'}")
    with TestClient(app) as client:
        response = client.get("/api/songs/999")

    assert response.status_code == 404


def test_real_song_links_open_exact_qq_tracks_and_demo_does_not_impersonate_one(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'qq-links.db'}")) as client:
        songs = client.get('/api/songs').json()
        assert client.get('/api/songs/104').json()['qq_music_url'] == 'https://y.qq.com/n/ryqq/songDetail/000h6xTe1LRGfl'
    expected = {101: '003aAYrm3GE0Ac', 102: '002E3MtF0IAMMY', 103: '001X0PDf0W4lBq',
                104: '000h6xTe1LRGfl', 105: '004HyLC74RYiBC'}
    for song in songs:
        assert song['qq_music_url'] == (f"https://y.qq.com/n/ryqq/songDetail/{expected[song['id']]}" if not song['is_demo'] else None)
