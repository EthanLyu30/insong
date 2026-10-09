"""Additional fictional perspectives for the Liu Yuxin Shenzhen event."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import initialize_database
from app.main import create_app
from app.models import MemoryCard, MemoryReceipt, SeedMigration


EVENT = 'liu-yuxin-shenzhen-20260801'
MARKER = 'liu-shenzhen-other-moments-v1'


def test_other_moments_have_four_distinct_demo_authors_and_readable_photos(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "moments.db"}')
    with TestClient(app) as guest:
        stories = guest.get(f'/api/stories?event_id={EVENT}').json()
        assert len(stories) == 5  # Existing sample plus four new perspectives.
        new = [story for story in stories if story['author_name'] != '阿远']
        assert len(new) == 4
        assert len({story['author_name'] for story in new}) == 4
        for story in new:
            assert story['is_demo_sample'] is True
            assert story['title'] and story['excerpt']
            assert story['photos']
            assert guest.get(story['photos'][0]['url']).status_code == 200
            assert story['event_snapshot']['date'] == '2026-08-01'
        with app.state.session_factory() as db:
            assert all(db.get(MemoryCard, story['id']).owner.is_demo for story in new)
            assert all(db.get(MemoryCard, story['id']).owner.display_name == story['author_name'] for story in new)


def test_other_moments_are_additive_and_do_not_resurrect_deleted_examples(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "restart.db"}')
    with TestClient(app) as guest:
        stories = guest.get(f'/api/stories?event_id={EVENT}').json()
        removed = next(story for story in stories if story['author_name'] != '阿远')
        with app.state.session_factory() as db:
            db.delete(db.get(MemoryCard, removed['id']))
            db.delete(db.get(SeedMigration, MARKER))
            receipt_count = len(list(db.scalars(select(MemoryReceipt.id))))
            db.commit()
            engine = db.get_bind()
        initialize_database(engine)
        initialize_database(engine)
        assert guest.get(f'/api/stories/{removed["id"]}').status_code == 404
        assert len(guest.get(f'/api/stories?event_id={EVENT}').json()) == 4
        with app.state.session_factory() as db:
            assert len(list(db.scalars(select(MemoryReceipt.id)))) == receipt_count
