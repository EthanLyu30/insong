"""User-supplied concert imagery illustrates, but does not authenticate, demo stories."""

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import create_sqlite_engine, initialize_database
from app.models import MemoryCard, MemoryReceipt, Photo, SeedMigration
from app.sample_media import SAMPLE_DIR


SUPPLIED_HASHES = {
    '7b5e6feef9bcab9521441dd3ef05192124693a7adac9cd4327b837675f01aa40',
    '1ef9d0d557f901308c6cced9cd776f1084b49ae95e822d44cb9190319987c3c9',
    '788aae9855b8f82fe0773569fdd0d4ab58e0fc27d42fe7070683786c6ab336d7',
    'e9904b8a61b39972b5405effcef357add3bc37e8c95938caecff98c4ec1655ab',
    '74307314142a0d540f71618c699f1cef7a39fafc01b6b3ddc6cd98343b1ea420',
    'ad60f4baaa8df0756ffe38991a33989e9d2961cb52b2c9fa5247854d7a3c7447',
    '6b71a41d5b86a9490b0dc8bda0c13499a4deaabd7aa2c73a2468b30bf57ec765',
    '0239243355205d61abacc656f869600bdec779c852ee0a14fbe7f1087f217501',
    '1bc7ffb20234acdbc5bb6eab7d132c057c71f3714fde3173868abe45a8df2ccc',
    'b58741d15ce9ccd7c8f44264b70ee87eb891dc42b8562827ee9f6e5584e3b666',
}


def card_for(db, request_key):
    receipt = db.scalar(select(MemoryReceipt).where(MemoryReceipt.request_key == request_key))
    assert receipt is not None
    card = db.get(MemoryCard, receipt.id)
    assert card is not None
    return card


def photo_digest(db, photo_id):
    return hashlib.sha256(db.get(Photo, photo_id).content).hexdigest()


def test_public_gem_and_liu_samples_use_all_ten_supplied_images(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "concert-photos.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        gem = card_for(db, 'event-records-showcase-v1-gem-listener-chorus')
        liu = card_for(db, 'event-records-showcase-v1-liu-listener-first')
        assert photo_digest(db, gem.photo_id) == '7b5e6feef9bcab9521441dd3ef05192124693a7adac9cd4327b837675f01aa40'
        assert photo_digest(db, liu.photo_id) == '6b71a41d5b86a9490b0dc8bda0c13499a4deaabd7aa2c73a2468b30bf57ec765'
        used = set()
        for receipt in db.scalars(select(MemoryReceipt).where(
                MemoryReceipt.request_key.like('fandom-showcase-v1-%')
                | MemoryReceipt.request_key.like('event-records-showcase-v1-%')
                | MemoryReceipt.request_key.like('event-records-expanded-v2-%'))):
            card = db.get(MemoryCard, receipt.id)
            if card is None or card.song.artist not in ('邓紫棋', '刘雨昕') or not card.publication:
                continue
            assert card.publication.photo_id == card.photo_id
            assert card.publication.photo_ids_json == card.photo_ids_json
            used.update(photo_digest(db, photo_id) for photo_id in json.loads(card.photo_ids_json))
        assert SUPPLIED_HASHES <= used
        other = card_for(db, 'fandom-showcase-v1-0')
        assert db.get(Photo, other.photo_id).content == (SAMPLE_DIR / 'concert.jpg').read_bytes()


def test_user_changes_and_withdrawals_are_not_overwritten_on_retry(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "preserve-photos.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        edited = card_for(db, 'event-records-showcase-v1-gem-listener-chorus')
        withdrawn = card_for(db, 'event-records-showcase-v1-liu-listener-first')
        original_ids = [db.scalar(select(Photo.id).where(
            Photo.owner_id == edited.owner_id,
            Photo.content == (SAMPLE_DIR / f'{name}.jpg').read_bytes()))
            for name in ('concert', 'arrival')]
        assert all(original_ids)
        edited.photo_id = edited.publication.photo_id = original_ids[0]
        edited.photo_ids_json = edited.publication.photo_ids_json = json.dumps(original_ids)
        # A user can revise another field while keeping the original sample text
        # and images; the revision alone must still protect their record.
        edited.revision += 1
        edited_photo_id = edited.photo_id
        withdrawn.publication.published = False
        withdrawn_photo_id = withdrawn.photo_id
        db.delete(db.get(SeedMigration, 'user-concert-sample-photos-v1'))
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        edited = card_for(db, 'event-records-showcase-v1-gem-listener-chorus')
        withdrawn = card_for(db, 'event-records-showcase-v1-liu-listener-first')
        assert edited.revision == 2 and edited.photo_id == edited_photo_id
        assert not withdrawn.publication.published and withdrawn.photo_id == withdrawn_photo_id
