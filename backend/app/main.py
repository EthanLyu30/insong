"""HTTP entry point for the demo H5."""

from contextlib import asynccontextmanager

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
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
from .database import create_database_engine, initialize_database
from .settings import load_settings
from .models import MemoryCard, Song, User
from .accounts import install_accounts
from .memories import install_memories, serialize_memory
from .media import AUDIO_ROOT, serialize_song, can_read_song
from .recall import install_recall
from .stories import install_stories
from .photos import install_photos
from .footprints import install_footprints


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


def create_app(database_url: str | None = None) -> FastAPI:
    settings = load_settings()
    db_url = database_url or settings.database_url

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_database_engine(db_url, settings.database_schema)
        try:
            initialize_database(engine)
            app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="歌里有我 Demo", lifespan=lifespan)
    app.state.settings = settings
    @app.middleware('http')
    async def private_responses(request, call_next):
        origin = request.headers.get('origin')
        trusted = set(settings.allowed_origins)
        if settings.app_env != 'production':
            trusted.add(str(request.base_url).rstrip('/'))
        if request.method in ('POST', 'PATCH', 'DELETE', 'PUT') and origin and origin not in trusted:
            return JSONResponse({'detail': '请求来源不受支持。'}, status_code=403)
        if (settings.migration_read_only and request.url.path.startswith('/api/')
                and request.method not in ('GET', 'HEAD', 'OPTIONS')):
            return JSONResponse(
                {'detail': '站点正在迁移，暂时不能保存。请保留当前内容，稍后重试。'},
                status_code=503, headers={'Retry-After': '60', 'Cache-Control': 'no-store'})
        response = await call_next(request)
        if request.url.path.startswith('/api/') and not request.url.path.startswith('/api/audio/'):
            response.headers['Cache-Control'] = 'no-store'
        return response
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
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

    install_accounts(app, get_db, serialize_user)
    install_memories(app, get_db, get_required_user)
    install_recall(app, get_db, get_required_user)
    install_stories(app, get_db, get_required_user, get_optional_user)
    install_photos(app, get_db, get_required_user, get_optional_user)
    install_footprints(app, get_db, get_required_user)
    app.mount('/api/audio', StaticFiles(directory=str(AUDIO_ROOT), check_dir=False), name='audio')

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
            secure=settings.cookie_secure or request.url.scheme == "https",
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
    def list_songs(db: OrmSession = Depends(get_db), user: User | None = Depends(get_optional_user)) -> list[dict]:
        return [
            serialize_song(song)
            for song in db.scalars(select(Song).where((Song.owner_id.is_(None)) | (Song.owner_id == (user.id if user else None)) | (Song.id.in_(select(MemoryCard.song_id).where(MemoryCard.owner_id == (user.id if user else None))))).order_by(Song.id)).all()
        ]

    @app.get("/api/songs/{song_id}")
    def get_song(song_id: int, db: OrmSession = Depends(get_db), user: User | None = Depends(get_optional_user)) -> dict:
        song = db.get(Song, song_id) if -(2**63) <= song_id < 2**63 else None
        if not can_read_song(db, song, user):
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
        return serialize_memory(card)

    return app


app = create_app()
