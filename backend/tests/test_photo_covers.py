from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import create_sqlite_engine, initialize_database
from app.models import MemoryCard, SeedMigration, Song


def test_existing_showcase_cover_refresh_preserves_custom_data_and_deletions(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "photos.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        # Simulate the previous release's seed data without its later photo marker.
        marker = db.get(SeedMigration, 'showcase-photography-v1')
        if marker:
            db.delete(marker)
        db.get(Song, 101).cover_url = '/scenes/venues/shanghai-stadium-interior.webp'
        db.get(Song, 101).source_label = '歌手作品资料 · 场景插画'
        db.get(Song, 102).cover_url = '/custom/my-photo.jpg'
        db.get(Song, 102).source_label = '自己的封面'
        db.get(Song, 103).title = '已修改的曲名'
        db.get(Song, 103).cover_url = '/scenes/venues/shanghai-stadium-exterior.webp'
        db.get(Song, 1).cover_url = None
        removed = db.scalar(select(MemoryCard).where(MemoryCard.song_id == 101))
        removed_id = removed.id
        db.delete(removed)
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(Song, 101).cover_url == '/photos/live-lights.webp'
        assert db.get(Song, 101).source_label == '歌手作品资料 · 摄影配图'
        assert db.get(Song, 102).cover_url == '/custom/my-photo.jpg'
        assert db.get(Song, 102).source_label == '自己的封面'
        assert db.get(Song, 103).cover_url == '/scenes/venues/shanghai-stadium-exterior.webp'
        assert db.get(Song, 1).cover_url == '/photos/live-lights.webp'
        assert db.get(MemoryCard, removed_id) is None
        assert db.get(SeedMigration, 'showcase-photography-v1') is not None
        db.get(Song, 101).cover_url = '/custom/later.jpg'
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(Song, 101).cover_url == '/custom/later.jpg'
