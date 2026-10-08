"""The additional walkthroughs are additive, fictional and deletion safe."""
import json
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import create_sqlite_engine, initialize_database
from app.footprints import load_catalog
from app.main import create_app
from app.models import Base, MemoryCard, MemoryReceipt, Photo, SeedMigration, Song, User
from app.event_record_samples import seed_expanded_event_record_samples


MARKER = 'event-records-expanded-v2'


def expanded_cards(db):
    return list(db.scalars(select(MemoryCard).join(MemoryReceipt, MemoryReceipt.id == MemoryCard.id)
        .where(MemoryReceipt.request_key.like(f'{MARKER}-%')).order_by(MemoryCard.id)))


def test_additional_samples_are_fourteen_unique_demo_nights_using_existing_catalog(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "expanded.db"}')
    initialize_database(engine)
    catalog = load_catalog()
    events = {event['id']: event for event in catalog['events']}
    with Session(engine) as db:
        cards = expanded_cards(db)
        assert len(cards) == 14
        mine = [card for card in cards if card.owner.display_name == '小林']
        public = [card for card in cards if card.owner.display_name == '阿远']
        assert len(mine) == 6 and all(card.publication is None for card in mine)
        assert len(public) == 8 and all(card.publication.published for card in public)
        assert len({(card.owner_id, card.event_id) for card in cards}) == 14
        assert sum(events[card.event_id]['city'] in ('深圳', '广州') for card in cards) == 10
        assert len({events[card.event_id]['artist_id'] for card in cards}) >= 4
        for card in cards:
            assert card.owner.is_demo and card.is_demo_sample
            assert card.visibility == 'private' and card.story.startswith('（虚构示例）')
            assert events[card.event_id].get('event_status') != 'cancelled'
            assert (card.song.title, card.song.artist) in {
                (song['title'], song['artist']) for song in events[card.event_id]['songs']}
            assert not card.song.audio_available and not card.song.is_demo
            photos = json.loads(card.photo_ids_json)
            assert len(photos) >= 2
            for photo_id in photos:
                photo = db.get(Photo, photo_id)
                assert photo.owner_id == card.owner_id
                with Image.open(BytesIO(photo.content)) as image:
                    assert image.format == 'JPEG'
                    image.verify()
            if card.publication:
                assert card.publication.author_name == '阿远'
                assert card.publication.photo_ids_json == card.photo_ids_json
                assert getattr(card.publication, 'read_count', None) == 0
        assert db.get(SeedMigration, 'event-records-showcase-v1') is not None
        assert db.get(SeedMigration, MARKER) is not None


def test_expanded_seed_restart_and_missing_marker_preserve_every_user_change(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "preserve-expanded.db"}')
    initialize_database(engine)
    with Session(engine) as db:
        cards = expanded_cards(db)
        assert len(cards) == 14
        edited, withdrawn, deleted = cards[0], next(card for card in cards if card.publication), cards[-1]
        edited_id, withdrawn_id, deleted_id = edited.id, withdrawn.id, deleted.id
        edited.story = '用户修改后保留的原文'
        edited.photo_ids_json = '[]'
        edited.photo_id = None
        withdrawn.publication.published = False
        db.delete(deleted)
        db.delete(db.get(SeedMigration, MARKER))
        before = list(db.scalars(select(MemoryReceipt.id).order_by(MemoryReceipt.id)))
        photo_count = db.scalar(select(func.count()).select_from(Photo))
        song_count = db.scalar(select(func.count()).select_from(Song))
        db.commit()
    initialize_database(engine)
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(MemoryCard, edited_id).story == '用户修改后保留的原文'
        assert db.get(MemoryCard, edited_id).photo_ids_json == '[]'
        assert not db.get(MemoryCard, withdrawn_id).publication.published
        assert db.get(MemoryCard, deleted_id) is None
        assert list(db.scalars(select(MemoryReceipt.id).order_by(MemoryReceipt.id))) == before
        assert db.scalar(select(func.count()).select_from(Photo)) == photo_count
        assert db.scalar(select(func.count()).select_from(Song)) == song_count


def test_expanded_seed_never_populates_real_accounts_even_with_demo_display_names(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "real-expanded.db"}')
    with TestClient(app) as client:
        result = client.post('/api/accounts/register', json={
            'username': 'real_xiaolin', 'password': 'actual-listener-2026', 'display_name': '小林'})
        assert result.status_code == 201
        user_id = result.json()['user']['id']
        with app.state.session_factory() as db:
            assert len(expanded_cards(db)) == 14
            db.delete(db.get(SeedMigration, MARKER))
            db.commit()
        initialize_database(app.state.session_factory.kw['bind'])
        assert client.get('/api/memories').json() == []
        with app.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(MemoryReceipt).where(MemoryReceipt.owner_id == user_id)) == 0
            assert db.get(User, user_id).is_demo is False


def test_new_seed_skips_existing_owner_night_and_consumes_its_receipt(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "existing-night.db"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(id=1, display_name='小林', is_demo=True), User(id=2, display_name='阿远', is_demo=True)])
        song = Song(title='光年之外', artist='邓紫棋', version='曲目资料（无音频）', source_label='既有资料')
        db.add(song)
        db.flush()
        receipt = MemoryReceipt(owner_id=1, request_key='existing-owner-record')
        db.add(receipt)
        db.flush()
        existing = MemoryCard(id=receipt.id, owner_id=1, song_id=song.id,
            event_id='gem-shenzhen-20260911', story='自己写的原文', is_demo_sample=False)
        db.add(existing)
        db.flush()
        seed_expanded_event_record_samples(db)
        db.commit()
        assert existing.story == '自己写的原文' and existing.publication is None
        assert len(expanded_cards(db)) == 13
        assert db.scalar(select(func.count()).select_from(MemoryCard).where(
            MemoryCard.owner_id == 1, MemoryCard.event_id == 'gem-shenzhen-20260911')) == 1
        db.delete(existing)
        db.delete(db.get(SeedMigration, MARKER))
        db.commit()
        seed_expanded_event_record_samples(db)
        db.commit()
        assert db.scalar(select(func.count()).select_from(MemoryCard).where(
            MemoryCard.owner_id == 1, MemoryCard.event_id == 'gem-shenzhen-20260911')) == 0


def test_new_seed_does_not_create_demo_identities_or_reuse_real_names(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "real-only.db"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(display_name='小林', is_demo=False), User(display_name='阿远', is_demo=False)])
        db.flush()
        seed_expanded_event_record_samples(db)
        db.commit()
        assert db.scalar(select(func.count()).select_from(User)) == 2
        assert db.scalar(select(func.count()).select_from(Song)) == 0
        assert db.scalar(select(func.count()).select_from(MemoryCard)) == 0
        assert db.scalar(select(func.count()).select_from(MemoryReceipt)) == 0
