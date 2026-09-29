"""SQLite setup for the H5 demo."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from .models import Base
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
    }
    with engine.begin() as connection:
        for name, declaration in additions.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE memory_cards ADD COLUMN {name} {declaration}'))
        connection.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_request ON memory_cards(owner_id, request_key)'))
    with OrmSession(engine) as db, db.begin():
        seed_demo_data(db)
    with engine.begin() as connection:
        # Explicit IDs advance SQLite's durable AUTOINCREMENT sequence, including
        # on legacy databases. Keep receipts when the corresponding card is deleted.
        connection.execute(text('INSERT OR IGNORE INTO memory_receipts(id, owner_id, request_key) SELECT id, owner_id, request_key FROM memory_cards'))
