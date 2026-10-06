"""SQLite setup for the H5 demo."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event, inspect, text, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from .models import Base, MemoryCard, PublicStory
from .seed import seed_demo_data, seed_fandom_showcase, refresh_showcase_photos, refresh_recent_showcase_photos
from .sample_media import refresh_generated_covers, seed_sample_galleries
from .event_snapshots import capture_event, snapshot_json
from . import footprints

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "demo.db"


def create_sqlite_engine(database_url: str) -> Engine:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        raise ValueError("Only SQLite databases are supported")

    if url.database and url.database != ":memory:":
        Path(url.database).parent.mkdir(parents=True, exist_ok=True)

    connection_options = {"check_same_thread": False}
    if url.database in (None, ":memory:"):
        engine = create_engine(
            database_url, connect_args=connection_options, poolclass=StaticPool
        )
    else:
        engine = create_engine(database_url, connect_args=connection_options)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def initialize_database(engine: Engine) -> None:
    Base.metadata.create_all(engine)
    # Additive migration for existing installations. Preserve every existing row.
    existing = {column['name'] for column in inspect(engine).get_columns('memory_cards')}
    additions = {
        'offset_ms': 'INTEGER', 'life_precision': "VARCHAR(16) NOT NULL DEFAULT 'unknown'",
        'revision': 'INTEGER NOT NULL DEFAULT 1', 'request_key': 'VARCHAR(80)',
        'reflections_json': "TEXT NOT NULL DEFAULT '[]'",
        'lyric_id': 'VARCHAR(40)', 'life_year': 'INTEGER', 'theme_id': 'VARCHAR(40)',
        'photo_id': 'VARCHAR(36) REFERENCES photos(id)', 'end_ms': 'INTEGER', 'event_id': 'VARCHAR(100)',
        'title': 'VARCHAR(80)', 'tags_json': 'TEXT',
        'location_name': 'VARCHAR(160)',
        'event_snapshot_json': 'TEXT',
        'photo_ids_json': "TEXT NOT NULL DEFAULT '[]'",
    }
    with engine.begin() as connection:
        for name, declaration in additions.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE memory_cards ADD COLUMN {name} {declaration}'))
        connection.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_request ON memory_cards(owner_id, request_key)'))
        song_columns = {column['name'] for column in inspect(connection).get_columns('songs')}
        if 'owner_id' not in song_columns:
            connection.execute(text('ALTER TABLE songs ADD COLUMN owner_id INTEGER REFERENCES users(id)'))
        if 'cover_url' not in song_columns:
            connection.execute(text('ALTER TABLE songs ADD COLUMN cover_url VARCHAR(240)'))
        public_columns = {column['name'] for column in inspect(connection).get_columns('public_stories')}
        for name in ('photo_id', 'end_ms', 'event_id', 'title', 'tags_json', 'photo_ids_json', 'event_snapshot_json'):
            if name not in public_columns:
                declaration = "TEXT NOT NULL DEFAULT '[]'" if name == 'tags_json' else additions[name]
                connection.execute(text(f'ALTER TABLE public_stories ADD COLUMN {name} {declaration}'))
    with OrmSession(engine) as db, db.begin():
        seed_demo_data(db)
        # Previously public cards already had publication consent (including samples).
        # Move that existing public text once; never publish a private record.
        for card in db.scalars(select(MemoryCard).where(MemoryCard.visibility == 'public')):
            if db.get(PublicStory, card.id) is None:
                db.add(PublicStory(memory_id=card.id, excerpt=card.story,
                    life_time=card.life_time, life_year=card.life_year, share_life_time=True,
                    anonymous=False, author_name=card.owner.display_name, offset_ms=card.offset_ms,
                    lyric_id=card.lyric_id, theme_id=card.theme_id, photo_id=card.photo_id,
                    end_ms=card.end_ms, event_id=card.event_id, published=True))
            card.visibility = 'private'
        db.flush()
        # Explicit IDs advance SQLite's durable AUTOINCREMENT sequence, including
        # on legacy databases. Keep receipts when the corresponding card is deleted.
        db.execute(text('INSERT OR IGNORE INTO memory_receipts(id, owner_id, request_key) SELECT id, owner_id, request_key FROM memory_cards'))
        seed_fandom_showcase(db)
        refresh_showcase_photos(db)
        refresh_recent_showcase_photos(db)
        refresh_generated_covers(db)
        seed_sample_galleries(db)
        # Legacy records get one best-effort snapshot from surviving catalog data.
        # A stored snapshot is never refreshed by startup or catalog updates.
        catalog = footprints.load_catalog()
        for model in (MemoryCard, PublicStory):
            for record in db.scalars(select(model).where(model.event_id.is_not(None), model.event_snapshot_json.is_(None))):
                record.event_snapshot_json = snapshot_json(capture_event(record.event_id, catalog, required=False))
