import json
from io import BytesIO

from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import create_sqlite_engine, initialize_database
from app.models import MemoryCard, MemoryReceipt, Photo, SeedMigration, Song


MARKER = 'showcase-gallery-v1'


def samples(db):
    return [db.get(MemoryCard, receipt.id) for receipt in db.scalars(
        select(MemoryReceipt).where(MemoryReceipt.request_key.like('fandom-showcase-v1-%')).order_by(MemoryReceipt.id))]


def test_samples_have_owned_distinct_images_and_matching_public_snapshots(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "gallery.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        cards = samples(db)
        assert [len(json.loads(card.photo_ids_json)) for card in cards] == [3, 2, 3, 2, 2]
        for card in cards:
            ids = json.loads(card.photo_ids_json)
            assert len(set(ids)) == len(ids)
            assert card.photo_id == ids[0]
            assert card.publication.photo_ids_json == card.photo_ids_json
            assert card.publication.photo_id == card.photo_id
            data = []
            for photo_id in ids:
                photo = db.get(Photo, photo_id)
                assert photo.owner_id == card.owner_id
                image = Image.open(BytesIO(photo.content))
                assert image.format == 'JPEG'
                assert min(image.size) >= 600
                data.append(photo.content)
            assert len(set(data)) == len(data)
        count = db.scalar(select(func.count()).select_from(Photo))
    initialize_database(engine)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Photo)) == count


def test_gallery_upgrade_preserves_edits_withdrawals_custom_photos_and_deleted_samples(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "upgrade.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        db.delete(db.get(SeedMigration, MARKER))
        cards = samples(db)
        for card in cards:
            card.photo_id = None
            card.photo_ids_json = '[]'
            card.publication.photo_id = None
            card.publication.photo_ids_json = '[]'
        cards[0].story = '用户改过的记忆，不应再塞入样例照片'
        cards[1].publication.published = False
        db.add(Photo(id='custom', owner_id=cards[2].owner_id, content=b'custom'))
        db.flush()
        cards[2].photo_id = 'custom'
        cards[2].photo_ids_json = '["custom"]'
        cards[3].publication.excerpt = '用户单独编辑过的公开版本'
        removed_id = cards[4].id
        db.delete(cards[4])
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        cards = samples(db)
        assert cards[0].photo_ids_json == '[]'
        assert cards[1].photo_ids_json == '[]'
        assert cards[1].publication.published is False
        assert cards[2].photo_ids_json == '["custom"]'
        assert cards[3].photo_ids_json == '[]'
        assert db.get(MemoryCard, removed_id) is None


def test_retired_seed_covers_replaced_once_without_touching_custom_covers(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "covers.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        db.delete(db.get(SeedMigration, 'showcase-generated-covers-v1'))
        db.get(Song, 1).cover_url = '/photos/live-lights.webp'
        db.get(Song, 101).cover_url = '/photos/live-lights.webp'
        db.get(Song, 105).cover_url = '/my-own-picture.jpg'
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(Song, 1).cover_url == '/photos/memory-concert-20261002.webp'
        assert db.get(Song, 101).cover_url == '/photos/memory-concert-20261002.webp'
        assert db.get(Song, 105).cover_url == '/my-own-picture.jpg'
