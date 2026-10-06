"""SQLite and PostgreSQL bootstrap for the H5 application."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event, inspect, text, select, true
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from .models import Base, MemoryCard, MemoryReceipt, PublicStory
from .seed import seed_demo_data, seed_fandom_showcase, refresh_showcase_photos, refresh_recent_showcase_photos
from .sample_media import refresh_generated_covers, seed_sample_galleries
from .event_snapshots import capture_event, snapshot_json
from .event_record_samples import seed_event_record_samples
from . import footprints
from .settings import validate_schema
from .database_compat import conflict_insert, synchronize_sequences

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


def create_database_engine(database_url: str, schema: str = 'insong') -> Engine:
    """Connect to a supported database without falling back after errors."""
    try:
        url = make_url(database_url)
        if url.drivername == 'postgres':
            url = url.set(drivername='postgresql')
        backend = url.get_backend_name()
    except Exception:
        raise ValueError('数据库连接配置无效。') from None
    if backend == 'sqlite':
        return create_sqlite_engine(database_url)
    if backend != 'postgresql':
        raise ValueError('数据库只支持 SQLite 或 PostgreSQL。')
    schema = validate_schema(schema)
    engine = create_engine(url.set(drivername='postgresql+psycopg'), pool_pre_ping=True,
                           pool_size=2, max_overflow=1, pool_timeout=10,
                           connect_args={'connect_timeout': 10})

    @event.listens_for(engine, 'connect')
    def set_private_schema(dbapi_connection, connection_record):
        # SET must survive SQLAlchemy's rollback on a newly pooled connection.
        previous = dbapi_connection.autocommit
        dbapi_connection.autocommit = True
        try:
            with dbapi_connection.cursor() as cursor:
                cursor.execute(f'SET search_path TO "{schema}"')
        finally:
            dbapi_connection.autocommit = previous

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    engine.dialect.default_schema_name = schema
    return engine


def _upgrade_database(connection) -> None:
    Base.metadata.create_all(connection)
    # Additive migration for existing installations. Preserve every existing row.
    existing = {column['name'] for column in inspect(connection).get_columns('memory_cards')}
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
    for name, declaration in additions.items():
        if name not in existing:
            connection.execute(text(f'ALTER TABLE memory_cards ADD COLUMN {name} {declaration}'))
    connection.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_request ON memory_cards(owner_id, request_key)'))
    song_columns = {column['name'] for column in inspect(connection).get_columns('songs')}
    if 'owner_id' not in song_columns:
        id_type = 'BIGINT' if connection.dialect.name == 'postgresql' else 'INTEGER'
        connection.execute(text(f'ALTER TABLE songs ADD COLUMN owner_id {id_type} REFERENCES users(id)'))
    if 'cover_url' not in song_columns:
        connection.execute(text('ALTER TABLE songs ADD COLUMN cover_url VARCHAR(240)'))
    public_columns = {column['name'] for column in inspect(connection).get_columns('public_stories')}
    for name in ('photo_id', 'end_ms', 'event_id', 'title', 'tags_json', 'photo_ids_json', 'event_snapshot_json'):
        if name not in public_columns:
            declaration = "TEXT NOT NULL DEFAULT '[]'" if name == 'tags_json' else additions[name]
            connection.execute(text(f'ALTER TABLE public_stories ADD COLUMN {name} {declaration}'))


def _seed_database(db: OrmSession) -> None:
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
    db.execute(conflict_insert(db, MemoryReceipt).from_select(
        ['id', 'owner_id', 'request_key'], select(MemoryCard.id, MemoryCard.owner_id,
            MemoryCard.request_key).where(true())).on_conflict_do_nothing())
    synchronize_sequences(db.connection())
    seed_fandom_showcase(db)
    db.flush()
    synchronize_sequences(db.connection())
    refresh_showcase_photos(db)
    refresh_recent_showcase_photos(db)
    refresh_generated_covers(db)
    seed_sample_galleries(db)
    seed_event_record_samples(db)
    db.flush()
    synchronize_sequences(db.connection())
    # Legacy records get one best-effort snapshot from surviving catalog data.
    # A stored snapshot is never refreshed by startup or catalog updates.
    catalog = footprints.load_catalog()
    for model in (MemoryCard, PublicStory):
        for record in db.scalars(select(model).where(model.event_id.is_not(None), model.event_snapshot_json.is_(None))):
            record.event_snapshot_json = snapshot_json(capture_event(record.event_id, catalog, required=False))


def initialize_database(engine: Engine) -> None:
    if engine.dialect.name == 'postgresql':
        # Keep fresh-schema DDL and all seeds under one transaction / startup lock.
        with engine.begin() as connection:
            connection.execute(text('SELECT pg_advisory_xact_lock(hashtext(current_schema()))'))
            _upgrade_database(connection)
            with OrmSession(connection) as db, db.begin():
                _seed_database(db)
    else:
        with engine.begin() as connection:
            _upgrade_database(connection)
        with OrmSession(engine) as db, db.begin():
            _seed_database(db)
