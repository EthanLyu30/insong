from datetime import datetime, timezone

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession


def test_schema_has_private_account_table_alongside_existing_tables(tmp_path):
    from app.database import create_sqlite_engine, initialize_database

    engine = create_sqlite_engine(f"sqlite:///{tmp_path / 'test.db'}")
    initialize_database(engine)

    assert set(inspect(engine).get_table_names()) == {
        "users",
        "songs",
        "memory_cards",
        "tags",
        "memory_card_tags",
        "sessions",
        "account_credentials",
        "memory_receipts",
    }


def test_card_defaults_private_and_bad_foreign_key_fails(tmp_path):
    from app.database import create_sqlite_engine
    from app.models import Base, MemoryCard, MemoryCardTag, Song, Tag, User

    engine = create_sqlite_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    with OrmSession(engine) as db:
        db.add_all(
            [
                User(id=1, display_name="小林", is_demo=True),
                Song(
                    id=1,
                    title="散场以后",
                    artist="Demo Artist",
                    version="演示录音室版",
                    source_label="虚构演示曲目",
                    is_demo=True,
                    audio_available=False,
                ),
                Tag(id=1, name="告别"),
            ]
        )
        db.commit()

    # Even a direct SQL insert must not accidentally publish a new memory.
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO memory_cards (id, owner_id, song_id, story) "
                 "VALUES (1, 1, 1, '散场后，我坐在路边听完了这首歌。')")
        )

    with OrmSession(engine) as db:
        card = db.get(MemoryCard, 1)
        assert card is not None
        assert card.visibility == "private"
        assert card.is_demo_sample is False
        assert card.created_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
        assert card.updated_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
        assert card.owner.display_name == "小林"
        assert card.song.title == "散场以后"

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO memory_cards (owner_id, song_id, story) "
                     "VALUES (999, 1, '不存在的用户')")
            )

    with OrmSession(engine) as db:
        db.add(MemoryCardTag(memory_card_id=1, tag_id=1))
        db.commit()
        assert len(db.scalars(select(MemoryCardTag)).all()) == 1

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO memory_card_tags (memory_card_id, tag_id) VALUES (1, 1)")
            )
