"""SQLite setup for the H5 demo."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event, inspect, text, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from .models import Base, MemoryCard, PublicStory
from .seed import seed_demo_data

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
    }
    with engine.begin() as connection:
        for name, declaration in additions.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE memory_cards ADD COLUMN {name} {declaration}'))
        connection.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_request ON memory_cards(owner_id, request_key)'))
        public_columns = {column['name'] for column in inspect(connection).get_columns('public_stories')}
        for name in ('photo_id', 'end_ms', 'event_id'):
            if name not in public_columns:
                connection.execute(text(f'ALTER TABLE public_stories ADD COLUMN {name} {additions[name]}'))
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
    with engine.begin() as connection:
        # Explicit IDs advance SQLite's durable AUTOINCREMENT sequence, including
        # on legacy databases. Keep receipts when the corresponding card is deleted.
        connection.execute(text('INSERT OR IGNORE INTO memory_receipts(id, owner_id, request_key) SELECT id, owner_id, request_key FROM memory_cards'))
