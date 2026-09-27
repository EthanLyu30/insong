"""SQLite setup for the H5 demo."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event
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
    with OrmSession(engine) as db, db.begin():
        seed_demo_data(db)
