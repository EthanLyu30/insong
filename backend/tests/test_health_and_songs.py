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
    songs = response.json()
    assert len(songs) == 5
    assert songs[0]["title"] == "散场以后"
    assert all(song["is_demo"] is True for song in songs)
    assert all(song["audio_available"] is False for song in songs)
    assert all(song["source_label"] == "虚构演示曲目" for song in songs)


def test_unknown_song_returns_not_found(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'missing.db'}")
    with TestClient(app) as client:
        response = client.get("/api/songs/999")

    assert response.status_code == 404
