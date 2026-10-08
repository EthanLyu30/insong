import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select


def test_song_api_reads_persisted_data(tmp_path):
    from app.main import create_app
    from app.models import Song

    app = create_app(f"sqlite:///{tmp_path / 'app.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as db:
            db.get(Song, 1).title = "更新后的歌名"
            db.commit()

        list_response = client.get("/api/songs")
        detail_response = client.get("/api/songs/1")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert list_response.json()[0]["title"] == "更新后的歌名"
    assert detail_response.json()["title"] == "更新后的歌名"
    assert set(detail_response.json()) == {
        "id", "title", "artist", "version", "source_label", "is_demo", "audio_available",
        "audio_url", "duration_ms", "recording_label",
        "lyrics", "lyrics_note", "cover_url", "qq_music_url",
    }
    assert detail_response.json()["qq_music_url"] is None


def test_fresh_database_directory_and_restart(tmp_path):
    from app.main import create_app
    from app.models import MemoryCard, Song, User

    db_path = tmp_path / "new" / "nested" / "demo.db"
    db_url = f"sqlite:///{db_path}"

    first_app = create_app(db_url)
    with TestClient(first_app) as client:
        assert db_path.is_file()
        assert len(client.get("/api/songs").json()) == 13
        with first_app.state.session_factory() as db:
            db.get(Song, 1).title = "保存后的名字"
            db.commit()

    second_app = create_app(db_url)
    with TestClient(second_app) as client:
        assert client.get("/api/songs/1").json()["title"] == "保存后的名字"
        with second_app.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 2
            assert db.scalar(select(func.count()).select_from(Song)) == 13
            assert db.scalar(select(func.count()).select_from(MemoryCard)) == 30


@pytest.mark.parametrize("song_id", ["9223372036854775808", "-9223372036854775809"])
def test_out_of_range_song_ids_keep_not_found(tmp_path, song_id):
    from app.main import create_app

    app = create_app(f"sqlite:///{tmp_path / 'app.db'}")
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(f"/api/songs/{song_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": "找不到这首演示歌曲"}


@pytest.mark.parametrize("db_url", ["sqlite:///:memory:", "sqlite://"])
def test_in_memory_database_can_serve_songs(db_url):
    from app.main import create_app

    app = create_app(db_url)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/songs")

    assert response.status_code == 200
    assert len(response.json()) == 13
