from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession


def test_seed_counts_and_labels(tmp_path):
    from app.database import create_sqlite_engine, initialize_database
    from app.models import MemoryCard, MemoryCardTag, Session, Song, Tag, User

    engine = create_sqlite_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    initialize_database(engine)

    with OrmSession(engine) as db:
        users = db.scalars(select(User).order_by(User.id)).all()
        songs = db.scalars(select(Song).order_by(Song.id)).all()
        cards = db.scalars(select(MemoryCard).order_by(MemoryCard.id)).all()
        tags = db.scalars(select(Tag)).all()

        assert [(user.id, user.display_name, user.is_demo) for user in users] == [
            (1, "小林", True),
            (2, "阿远", True),
        ]
        assert [song.id for song in songs] == [1, 2, 3, 4, 5]
        assert all(song.artist == "Demo Artist" for song in songs)
        assert all(song.source_label == "虚构演示曲目" for song in songs)
        assert all(song.audio_available is False and song.is_demo is True for song in songs)
        assert len(cards) >= 5
        assert all(card.visibility == "private" and card.publication.published for card in cards)
        assert all(card.is_demo_sample is True for card in cards)
        assert all(10 <= len(card.story) <= 500 for card in cards)
        assert all(len(card.tag_links) <= 3 for card in cards)
        assert all(tag.name and not tag.name.startswith("#") for tag in tags)
        assert db.scalar(select(func.count()).select_from(MemoryCardTag)) >= 5
        assert db.scalar(select(func.count()).select_from(Session)) == 0


def test_seed_is_idempotent_and_does_not_resurrect(tmp_path):
    from app.database import create_sqlite_engine, initialize_database
    from app.models import MemoryCard, Song, User

    engine = create_sqlite_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    initialize_database(engine)
    initialize_database(engine)

    with OrmSession(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 2
        assert db.scalar(select(func.count()).select_from(Song)) == 5
        assert db.scalar(select(func.count()).select_from(MemoryCard)) == 5
        card_1 = db.get(MemoryCard, 1)
        card_1.visibility = "private"
        db.delete(db.get(MemoryCard, 2))
        db.commit()

    initialize_database(engine)
    with OrmSession(engine) as db:
        assert db.get(MemoryCard, 1).visibility == "private"
        assert db.get(MemoryCard, 2) is None
        assert db.scalar(select(func.count()).select_from(MemoryCard)) == 4


def test_deleting_seed_marker_does_not_reseed_existing_database(tmp_path):
    from app.database import create_sqlite_engine, initialize_database
    from app.models import MemoryCard, Song, User

    engine = create_sqlite_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    initialize_database(engine)

    with OrmSession(engine) as db:
        db.delete(db.get(MemoryCard, 1))
        db.delete(db.get(Song, 1))
        db.commit()

    initialize_database(engine)
    with OrmSession(engine) as db:
        assert db.get(Song, 1) is None
        assert db.get(MemoryCard, 1) is None
        assert db.scalar(select(func.count()).select_from(User)) == 2
        assert db.scalar(select(func.count()).select_from(Song)) == 4
