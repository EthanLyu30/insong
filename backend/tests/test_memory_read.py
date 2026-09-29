from fastapi.testclient import TestClient

from app.main import create_app
from app.models import MemoryCard


HIDDEN = {"detail": "这段音乐记忆已经不可见。"}


def test_private_card_direct_url_is_owner_only(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'private.db'}")
    with TestClient(app) as owner, TestClient(app) as other, TestClient(app) as guest:
        with app.state.session_factory() as db:
            db.get(MemoryCard, 1).visibility = "private"
            db.commit()

        owner.post("/api/demo/sessions", json={"user_id": 1})
        other.post("/api/demo/sessions", json={"user_id": 2})
        response = owner.get("/api/memories/1")
        assert response.status_code == 200
        assert response.json()["story"].startswith("毕业晚会散场后")
        assert set(response.json()["tags"]) == {"毕业", "告别"}
        assert response.json()["visibility"] == "private"

        for client in (other, guest):
            response = client.get("/api/memories/1")
            assert response.status_code == 404
            assert response.json() == HIDDEN


def test_public_snapshot_is_readable_but_private_original_is_owner_only(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'public.db'}")
    with TestClient(app) as owner, TestClient(app) as other, TestClient(app) as guest:
        owner.post("/api/demo/sessions", json={"user_id": 2})
        other.post("/api/demo/sessions", json={"user_id": 1})
        for client in (owner, other, guest):
            response = client.get("/api/stories/2")
            assert response.status_code == 200
            card = response.json()
            assert card["author_name"] == "阿远"
            assert card["song_id"] == 2
            assert 'excerpt' in card
            assert not {'owner_id', 'story', 'reflections', 'scene', 'tags'} & set(card)
        assert owner.get('/api/memories/2').status_code == 200
        assert other.get('/api/memories/2').status_code == 404
        assert guest.get('/api/memories/2').status_code == 404


def test_missing_and_overflow_memory_ids_look_the_same(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'missing.db'}")
    with TestClient(app) as client:
        for memory_id in ("999", "9223372036854775808"):
            response = client.get(f"/api/memories/{memory_id}")
            assert response.status_code == 404
            assert response.json() == HIDDEN
