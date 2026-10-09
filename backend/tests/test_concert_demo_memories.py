"""New sample memories stay private and additive; public concert pages are real pages."""
import hashlib
import json

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.concert_demo_memories import seed_concert_demo_memories
from app.database import create_sqlite_engine, initialize_database
from app.main import create_app
from app.models import Base, MemoryCard, MemoryReceipt, Photo, SeedMigration, Song, User
from app.sample_media import SAMPLE_DIR


EVENT = 'liu-yuxin-shanghai-20250705'
MARKER = 'concert-demo-memories-v1'


def new_cards(db):
    return list(db.scalars(select(MemoryCard).join(MemoryReceipt,
        MemoryReceipt.id == MemoryCard.id).where(
        MemoryReceipt.request_key.like(f'{MARKER}-%')).order_by(MemoryCard.id)))


def test_shanghai_has_one_complete_private_memory_and_twelve_distinct_public_perspectives(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "shanghai.db"}')
    with TestClient(app) as owner, TestClient(app) as guest:
        owner.post('/api/demo/sessions', json={'user_id': 1})
        mine = owner.get(f'/api/memories?event_id={EVENT}').json()
        assert len(mine) == 1
        assert mine[0]['publication'] is None
        assert mine[0]['story'].startswith('（虚构示例）')
        assert len(mine[0]['photos']) >= 3
        assert guest.get(f'/api/stories/{mine[0]["id"]}').status_code == 404
        assert guest.get(mine[0]['photos'][0]['url']).status_code == 404
        assert owner.get(mine[0]['photos'][0]['url']).status_code == 200
        stories, cursor, pages = [], None, 0
        while True:
            params = {'event_id': EVENT, 'exclude_mine': 'true', 'limit': 5}
            if cursor:
                params['cursor'] = cursor
            response = owner.get('/api/public-feed', params=params)
            assert response.status_code == 200
            page = response.json()
            stories.extend(page['items'])
            pages += 1
            cursor = page['next_cursor']
            if not cursor:
                break
            assert pages < 4, 'pagination must terminate without cycling'
        assert pages == 3
        assert len(stories) == len({story['id'] for story in stories}) == 12
        assert len({story['author_name'] for story in stories}) == 12
        assert len({story['title'] for story in stories}) == 12
        for story in stories:
            assert story['is_demo_sample'] is True
            assert story['excerpt'].startswith('（虚构示例）')
            assert story['event_snapshot']['date'] == '2025-07-05'
            assert story['event_snapshot']['venue'] == '浦发银行东方体育中心'
            assert story['song']['artist'] == '刘雨昕'
            assert guest.get(story['photos'][0]['url']).status_code == 200
            assert guest.get(f'/api/memories/{story["id"]}').status_code == 404


def test_personal_additions_use_artist_matched_photos_without_invented_catalog_events(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "personal.db"}')
    with TestClient(app) as owner, TestClient(app) as guest:
        owner.post('/api/demo/sessions', json={'user_id': 1})
        with app.state.session_factory() as db:
            cards = [card for card in new_cards(db) if card.owner_id == 1]
            assert len(cards) == 4
            assert {card.song.artist for card in cards} == {'刘雨昕', '薛之谦', '毛不易', '华晨宇'}
            for card in cards:
                assert card.is_demo_sample and card.owner.is_demo
                assert card.publication is None and card.visibility == 'private'
                assert card.story.startswith('（虚构示例）')
                assert len(json.loads(card.photo_ids_json)) >= 2
                if card.song.artist in ('毛不易', '华晨宇'):
                    assert card.event_id is None and card.life_time is None
                    assert card.event_snapshot_json is None
                assert guest.get(f'/api/stories/{card.id}').status_code == 404
                assert guest.get(f'/api/photos/{card.photo_id}').status_code == 404
            for artist, filenames in {
                '薛之谦': [f'user-xue-{i:02d}' for i in range(1, 8)],
                '毛不易': [f'user-mao-{i:02d}' for i in range(1, 5)],
                '华晨宇': [f'user-hua-{i:02d}' for i in range(1, 3)],
            }.items():
                card = next(card for card in cards if card.song.artist == artist)
                actual = [db.get(Photo, photo_id).content for photo_id in json.loads(card.photo_ids_json)]
                assert actual == [(SAMPLE_DIR / f'{name}.jpg').read_bytes() for name in filenames]
                assert len({hashlib.sha256(content).hexdigest() for content in actual}) == len(filenames)


def test_restart_and_lost_marker_preserve_edited_deleted_and_withdrawn_samples(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "restart.db"}')
    with TestClient(app) as client:
        with app.state.session_factory() as db:
            cards = new_cards(db)
            assert len(cards) == 16
            edited, deleted = cards[0], cards[1]
            withdrawn = next(card for card in cards if card.publication)
            edited_id, deleted_id, withdrawn_id = edited.id, deleted.id, withdrawn.id
            edited.story = '我后来重新写的个人记忆，不能被样例覆盖。'
            edited.revision += 1
            withdrawn.publication.published = False
            db.delete(deleted)
            db.delete(db.get(SeedMigration, MARKER))
            before = list(db.scalars(select(MemoryReceipt.id).order_by(MemoryReceipt.id)))
            photo_count = db.scalar(select(func.count()).select_from(Photo))
            db.commit()
        initialize_database(app.state.session_factory.kw['bind'])
        initialize_database(app.state.session_factory.kw['bind'])
        with app.state.session_factory() as db:
            assert db.get(MemoryCard, edited_id).story == '我后来重新写的个人记忆，不能被样例覆盖。'
            assert db.get(MemoryCard, deleted_id) is None
            assert not db.get(MemoryCard, withdrawn_id).publication.published
            assert list(db.scalars(select(MemoryReceipt.id).order_by(MemoryReceipt.id))) == before
            assert db.scalar(select(func.count()).select_from(Photo)) == photo_count


def test_personal_accounts_named_like_demo_authors_do_not_receive_samples(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "real.db"}')
    with TestClient(app) as client:
        response = client.post('/api/accounts/register', json={
            'username': 'shanghai_real', 'password': 'my-memory-is-private-2026', 'display_name': '小林'})
        assert response.status_code == 201
        identity = response.json()['user']['id']
        with app.state.session_factory() as db:
            db.delete(db.get(SeedMigration, MARKER))
            db.commit()
        initialize_database(app.state.session_factory.kw['bind'])
        assert client.get('/api/memories').json() == []
        with app.state.session_factory() as db:
            assert not db.get(User, identity).is_demo
            assert db.scalar(select(func.count()).select_from(MemoryReceipt).where(
                MemoryReceipt.owner_id == identity)) == 0


def test_preexisting_personal_concert_note_wins_and_is_not_backfilled_after_deletion(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "existing-note.db"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        owner = User(display_name='小林', is_demo=True)
        song = Song(title='REALITY', artist='刘雨昕', version='用户选择的版本', source_label='用户选择')
        db.add_all([owner, song])
        db.flush()
        baseline = MemoryReceipt(owner_id=owner.id, request_key='event-records-showcase-v1-liu-my-meeting')
        original = MemoryReceipt(owner_id=owner.id, request_key='my-own-shanghai-note')
        db.add_all([baseline, original])
        db.flush()
        note = MemoryCard(id=original.id, owner_id=owner.id, song_id=song.id,
            story='我自己写的上海记忆，不是系统样例。', event_id=EVENT, is_demo_sample=False)
        db.add(note)
        db.flush()
        seed_concert_demo_memories(db)
        db.flush()
        own = list(db.scalars(select(MemoryCard).where(MemoryCard.owner_id == owner.id,
            MemoryCard.event_id == EVENT)))
        assert own == [note]
        assert note.story == '我自己写的上海记忆，不是系统样例。'
        assert not note.is_demo_sample
        db.delete(note)
        db.delete(db.get(SeedMigration, MARKER))
        db.flush()
        seed_concert_demo_memories(db)
        db.flush()
        assert db.scalar(select(func.count()).select_from(MemoryCard).where(
            MemoryCard.owner_id == owner.id, MemoryCard.event_id == EVENT)) == 0


def test_non_demo_baseline_owner_cannot_receive_samples_or_create_fan_identities(tmp_path):
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "non-demo.db"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        owner = User(display_name='小林', is_demo=False)
        db.add(owner)
        db.flush()
        db.add(MemoryReceipt(owner_id=owner.id, request_key='event-records-showcase-v1-liu-my-meeting'))
        db.flush()
        seed_concert_demo_memories(db)
        db.flush()
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(MemoryCard)) == 0
        assert db.scalar(select(func.count()).select_from(Photo)) == 0
        assert db.scalar(select(func.count()).select_from(Song)) == 0
        assert db.get(SeedMigration, MARKER) is None
