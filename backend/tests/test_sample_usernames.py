from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import create_app
from app.database import initialize_database
from app.models import MemoryCard, MemoryReceipt, PublicStory, SeedMigration
from test_private_flow import register, payload


def test_every_seeded_public_card_has_a_specific_consistent_username(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "names.db"}')
    with TestClient(app) as client:
        stories = client.get('/api/stories').json()
        assert stories
        assert {story['author_name'] for story in stories if story['is_demo_sample']} <= {'小林', '阿远'}
        with app.state.session_factory() as db:
            expected = {card.id: card.owner.display_name for card in db.scalars(select(MemoryCard))}
        assert all(story['author_name'] == expected[story['id']] for story in stories if story['is_demo_sample'])


def test_name_refresh_preserves_withdrawal_and_real_user_anonymity(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "privacy.db"}')
    with TestClient(app) as owner:
        register(owner)
        card = owner.post('/api/memories', json=payload(offset_ms=None, publication={'confirmed': True, 'anonymous': True})).json()
        assert owner.get(f'/api/stories/{card["id"]}').json()['author_name'] == '匿名听友'
        with app.state.session_factory() as db:
            sample = db.scalar(select(PublicStory).join(MemoryCard).where(MemoryCard.is_demo_sample.is_(True)))
            sample.published = False
            sample.author_name = '虚构歌迷 · 演示故事'
            sample_id = sample.memory_id
            for key in ('sample-usernames-v1', 'sample-usernames-v2'):
                marker = db.get(SeedMigration, key)
                if marker:
                    db.delete(marker)
            db.commit()
            engine = db.get_bind()
        initialize_database(engine)
        assert owner.get(f'/api/stories/{sample_id}').status_code == 404
        assert owner.get(f'/api/stories/{card["id"]}').json()['author_name'] == '匿名听友'


def test_legacy_sample_receipt_migrates_even_if_v1_marker_was_consumed(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "upgrade.db"}')
    with TestClient(app) as guest:
        with app.state.session_factory() as db:
            public = db.scalar(select(PublicStory).join(MemoryCard).join(MemoryReceipt,
                MemoryReceipt.id == MemoryCard.id).where(MemoryReceipt.request_key.like('fandom-showcase-v1-%')))
            identity, expected = public.memory_id, public.memory.owner.display_name
            public.memory.request_key = None
            public.author_name = '虚构歌迷 · 演示故事'
            public.anonymous = True
            public.published = True
            old = db.get(SeedMigration, 'sample-usernames-v1')
            if old is None:
                db.add(SeedMigration(key='sample-usernames-v1'))
            new = db.get(SeedMigration, 'sample-usernames-v2')
            if new:
                db.delete(new)
            db.commit()
            engine = db.get_bind()
        initialize_database(engine)
        assert guest.get(f'/api/stories/{identity}').json()['author_name'] == expected
