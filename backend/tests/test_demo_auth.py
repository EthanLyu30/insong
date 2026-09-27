from fastapi.testclient import TestClient
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.auth import SESSION_COOKIE_NAME
from app.main import create_app
from app.models import Session, User


def test_guest_and_login(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'auth.db'}")
    with TestClient(app) as client:
        assert client.get("/api/me").json() == {"user": None}

        response = client.post("/api/demo/sessions", json={"user_id": 1})

        assert response.status_code == 200
        assert response.json() == {
            "user": {"id": 1, "display_name": "小林", "is_demo": True}
        }
        assert client.get("/api/me").json() == response.json()


def test_cookie_flags_match_transport(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'cookie.db'}")
    with TestClient(app) as client:
        cookie = client.post("/api/demo/sessions", json={"user_id": 1}).headers["set-cookie"]
        assert "httponly" in cookie.lower()
        assert "samesite=lax" in cookie.lower()
        assert "path=/" in cookie.lower()
        assert "max-age=86400" in cookie.lower()
        assert "secure" not in cookie.lower()

    with TestClient(app, base_url="https://testserver") as client:
        cookie = client.post("/api/demo/sessions", json={"user_id": 1}).headers["set-cookie"]
        assert "secure" in cookie.lower()


def test_logout_clears_identity(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'logout.db'}")
    with TestClient(app) as client:
        client.post("/api/demo/sessions", json={"user_id": 1})

        response = client.post("/api/demo/logout")

        assert response.status_code == 204
        assert client.get("/api/me").json() == {"user": None}


def test_invalid_selection_keeps_current_session(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'invalid.db'}")
    with TestClient(app) as client:
        client.post("/api/demo/sessions", json={"user_id": 1})
        with app.state.session_factory() as db:
            db.get(User, 2).is_demo = False
            db.commit()

        for user_id in (0, 3, 2):
            assert client.post("/api/demo/sessions", json={"user_id": user_id}).status_code == 400
            assert client.get("/api/me").json()["user"]["id"] == 1
        assert client.post("/api/demo/sessions", json={"user_id": "1"}).status_code == 422
        assert client.get("/api/me").json()["user"]["id"] == 1


def test_clients_are_independent_and_old_cookies_are_revoked(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'isolation.db'}")
    with TestClient(app) as client_a:
        client_b = TestClient(app)
        client_a.post("/api/demo/sessions", json={"user_id": 1})
        old_a_cookie = client_a.cookies.get(SESSION_COOKIE_NAME)
        assert client_b.get("/api/me").json() == {"user": None}

        client_a.post("/api/demo/sessions", json={"user_id": 2})
        old_b_cookie = client_a.cookies.get(SESSION_COOKIE_NAME)
        assert client_a.get("/api/me").json()["user"]["id"] == 2
        client_b.cookies.set(SESSION_COOKIE_NAME, old_a_cookie)
        assert client_b.get("/api/me").json() == {"user": None}

        client_a.post("/api/demo/logout")
        client_b.cookies.set(SESSION_COOKIE_NAME, old_b_cookie)
        assert client_b.get("/api/me").json() == {"user": None}
        assert client_a.post("/api/demo/logout").status_code == 204


def test_sessions_survive_restart_but_bad_tokens_are_guests(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'restart.db'}"
    app = create_app(db_url)
    with TestClient(app) as client:
        client.post("/api/demo/sessions", json={"user_id": 1})
        token = client.cookies.get(SESSION_COOKIE_NAME)
        with app.state.session_factory() as db:
            row = db.scalar(select(Session))
            assert len(row.id) == 64
            assert row.id != token

    restarted_app = create_app(db_url)
    with TestClient(restarted_app) as client:
        client.cookies.set(SESSION_COOKIE_NAME, token)
        assert client.get("/api/me").json()["user"]["id"] == 1
        client.cookies.set(SESSION_COOKIE_NAME, "forged-token")
        assert client.get("/api/me").json() == {"user": None}

        client.cookies.set(SESSION_COOKIE_NAME, token)
        with restarted_app.state.session_factory() as db:
            row = db.scalar(select(Session))
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
        assert client.get("/api/me").json() == {"user": None}

        with restarted_app.state.session_factory() as db:
            row = db.scalar(select(Session))
            row.expires_at = None
            db.commit()
        assert client.get("/api/me").json() == {"user": None}
