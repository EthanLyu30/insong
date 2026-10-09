"""User-supplied illustrations make untouched private demo memories more lifelike."""

import hashlib
import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import create_sqlite_engine, initialize_database
from app.models import MemoryCard, MemoryReceipt, Photo, SeedMigration


MARKER = 'personal-concert-sample-refresh-v1'
EXPECTED_COVERS = {
    'event-records-showcase-v1-gem-my-walk': 'b267f1137eb2c117102f7e2a3dcd592513f9cb84cacf4d5e2cfe83cf889cd803',
    'event-records-expanded-v2-my-gem-first-night': '0099c0f23a8d3380bb7f8ef560cbf072fce2e32c766593618b4bf5390aa83804',
    'event-records-expanded-v2-my-gem-reunion-night': 'b449fb4dc4944b069e907410a778fef441dd76bdd633f85d149a1557f9c1805d',
    'event-records-expanded-v2-my-gem-xiamen': 'b46ae693863587af44c6364f9922a192b802c52d8dabc35cc7a44f1af129485f',
    'event-records-expanded-v2-my-tnt-shanghai': '1d5274979b706f0b9abf0eab3744c0f8d2f7d2bc410c6ae55b1a6bbb7d9c6548',
    'event-records-expanded-v2-my-phoenix-shenzhen': '188a81132e1a6c272929dab62419ce7b4b82721e5f112bbb3e0185133c0b9b0f',
}
SUPPLIED_DIGESTS = {
    '865f4f0abeeb63bf0a57386922cf0446dc4288842a0b80ef3d42762bc2c0e652',
    '1d5274979b706f0b9abf0eab3744c0f8d2f7d2bc410c6ae55b1a6bbb7d9c6548',
    'c38817ab2e3813f20ca94671012585f17032362a02e097baf88fa12f47d1cb48',
    'b46ae693863587af44c6364f9922a192b802c52d8dabc35cc7a44f1af129485f',
    '0099c0f23a8d3380bb7f8ef560cbf072fce2e32c766593618b4bf5390aa83804',
    'b449fb4dc4944b069e907410a778fef441dd76bdd633f85d149a1557f9c1805d',
    'b267f1137eb2c117102f7e2a3dcd592513f9cb84cacf4d5e2cfe83cf889cd803',
    'b0b9e380ad7c73666c64573c0226b185fdc22a74a5c8052971f5b2cf855150aa',
    '9df5a271c9425a8e8569e1f1a0d5975289e01ea32223935729268ce2866944f9',
    'cdc33d365aaab62ffc6b67e8b5b7c0869398744cd0d473efe916abd58f23914e',
    '188a81132e1a6c272929dab62419ce7b4b82721e5f112bbb3e0185133c0b9b0f',
    '1630c67305a84500d3fc8b89135e48c85336c45616ed106c6c31bee62ac79b5b',
}


def _card(db, request_key):
    receipt = db.scalar(select(MemoryReceipt).where(MemoryReceipt.request_key == request_key))
    assert receipt is not None
    card = db.get(MemoryCard, receipt.id)
    assert card is not None
    return card


def _digest(db, photo_id):
    return hashlib.sha256(db.get(Photo, photo_id).content).hexdigest()


def test_private_demo_memories_use_artist_matched_user_photos_and_concert_stories(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "personal.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(SeedMigration, MARKER) is not None
        used = set()
        for key, expected_cover in EXPECTED_COVERS.items():
            card = _card(db, key)
            assert card.owner.display_name == '小林' and card.owner.is_demo
            assert card.is_demo_sample and card.publication is None
            assert card.story.startswith('（虚构示例）')
            assert any(word in card.title for word in ('演唱会', '现场', '谢幕', '开唱'))
            assert _digest(db, card.photo_id) == expected_cover
            used.update(_digest(db, photo_id) for photo_id in json.loads(card.photo_ids_json))
        assert used == SUPPLIED_DIGESTS


def test_refresh_does_not_restore_deleted_or_overwrite_edited_private_memories(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "preserve.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        edited = _card(db, 'event-records-expanded-v2-my-gem-first-night')
        deleted = _card(db, 'event-records-expanded-v2-my-phoenix-shenzhen')
        edited_id, deleted_id = edited.id, deleted.id
        edited.story = '我自己修改后的演唱会记忆'
        edited.revision += 1
        edited_photo = edited.photo_id
        db.delete(deleted)
        db.delete(db.get(SeedMigration, MARKER))
        photo_count = db.scalar(select(func.count()).select_from(Photo))
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(MemoryCard, edited_id).story == '我自己修改后的演唱会记忆'
        assert db.get(MemoryCard, edited_id).photo_id == edited_photo
        assert db.get(MemoryCard, deleted_id) is None
        assert db.scalar(select(func.count()).select_from(Photo)) == photo_count
