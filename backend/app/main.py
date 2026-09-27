"""HTTP entry point for the demo H5."""

from contextlib import asynccontextmanager

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, StrictInt
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession, sessionmaker

from .auth import (
    SESSION_COOKIE_NAME,
    SESSION_LIFETIME_SECONDS,
    can_read_memory,
    create_session,
    require_user,
    resolve_user,
    revoke_session,
)
from .database import DEFAULT_DB_PATH, create_sqlite_engine, initialize_database
from .models import MemoryCard, Song, User


class DemoSessionRequest(BaseModel):
    user_id: StrictInt


def serialize_user(user: User | None) -> dict:
    if user is None:
        return {"user": None}
    return {"user": {
        "id": user.id,
        "display_name": user.display_name,
        "is_demo": user.is_demo,
    }}


def serialize_song(song: Song) -> dict:
    return {
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "version": song.version,
        "source_label": song.source_label,
        "is_demo": song.is_demo,
        "audio_available": song.audio_available,
    }


def create_app(database_url: str | None = None) -> FastAPI:
    db_url = database_url or f"sqlite:///{DEFAULT_DB_PATH}"

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_sqlite_engine(db_url)
        try:
            initialize_database(engine)
            app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="歌里有我 Demo", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_db():
        with app.state.session_factory() as db:
            yield db

    def get_optional_user(
        db: OrmSession = Depends(get_db),
        token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    ) -> User | None:
        return resolve_user(db, token)

    def get_required_user(user: User | None = Depends(get_optional_user)) -> User:
        return require_user(user)

    @app.get("/api/me")
    def get_me(user: User | None = Depends(get_optional_user)) -> dict:
        return serialize_user(user)

    @app.post("/api/demo/sessions")
    def start_demo_session(
        selection: DemoSessionRequest,
        request: Request,
        response: Response,
        db: OrmSession = Depends(get_db),
    ) -> dict:
        user = db.get(User, selection.user_id) if selection.user_id in (1, 2) else None
        if user is None or not user.is_demo:
            raise HTTPException(status_code=400, detail="只能选择小林或阿远的演示帐号。")
        revoke_session(db, request.cookies.get(SESSION_COOKIE_NAME))
        token = create_session(db, user)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            max_age=SESSION_LIFETIME_SECONDS,
            path="/",
            secure=request.url.scheme == "https",
            httponly=True,
            samesite="lax",
        )
        return serialize_user(user)

    @app.post("/api/demo/logout", status_code=204)
    def logout_demo(request: Request, response: Response, db: OrmSession = Depends(get_db)) -> None:
        revoke_session(db, request.cookies.get(SESSION_COOKIE_NAME))
        response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/songs")
    def list_songs(db: OrmSession = Depends(get_db)) -> list[dict]:
        return [
            serialize_song(song)
            for song in db.scalars(select(Song).order_by(Song.id)).all()
        ]

    @app.get("/api/songs/{song_id}")
    def get_song(song_id: int, db: OrmSession = Depends(get_db)) -> dict:
        song = db.get(Song, song_id) if -(2**63) <= song_id < 2**63 else None
        if song is None:
            raise HTTPException(status_code=404, detail="找不到这首演示歌曲")
        return serialize_song(song)

    @app.get("/api/memories/{memory_id}")
    def get_memory(
        memory_id: int,
        db: OrmSession = Depends(get_db),
        user: User | None = Depends(get_optional_user),
    ) -> dict:
        card = db.get(MemoryCard, memory_id) if -(2**63) <= memory_id < 2**63 else None
        if card is None or not can_read_memory(card, user):
            raise HTTPException(status_code=404, detail="这段音乐记忆已经不可见。")
        return {
            "id": card.id,
            "owner_id": card.owner_id,
            "owner_display_name": card.owner.display_name,
            "song_id": card.song_id,
            "story": card.story,
            "tags": [link.tag.name for link in card.tag_links],
            "life_time": card.life_time,
            "scene": card.scene,
            "visibility": card.visibility,
            "is_demo_sample": card.is_demo_sample,
            "created_at": card.created_at.isoformat(),
            "updated_at": card.updated_at.isoformat(),
        }

    return app


app = create_app()
