"""HTTP entry point for the demo H5."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession, sessionmaker

from .database import DEFAULT_DB_PATH, create_sqlite_engine, initialize_database
from .models import Song


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
        song = db.get(Song, song_id)
        if song is None:
            raise HTTPException(status_code=404, detail="找不到这首演示歌曲")
        return serialize_song(song)

    return app


app = create_app()
