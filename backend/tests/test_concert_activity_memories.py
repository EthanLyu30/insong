from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import MemoryCard, PublicStory
from test_private_flow import register
from test_public_feed import feed_fixture


def test_activity_memories_keep_owner_scope_and_public_snapshot_pagination(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "activity.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        feed_fixture(app, user['id'])
        with app.state.session_factory() as db:
            db.get(PublicStory, 905).event_id = 'night-two'
            for identity, author, event in [(907, 1, 'unrelated'), (908, user['id'], 'night-two'), (909, user['id'], 'unrelated')]:
                card = MemoryCard(id=identity, owner_id=author, song_id=1, event_id=event,
                                  story=f'original {identity}', life_time='2026-08-03', visibility='private')
                db.add(card)
                db.flush()
                if identity == 907:
                    db.add(PublicStory(memory_id=identity, event_id=event, excerpt='unrelated public',
                                       author_name='别人的记忆', published=True,
                                       published_at=datetime(2026, 1, 5, tzinfo=timezone.utc)))
            db.commit()
        scope = [('event_ids', 'feed-event'), ('event_ids', 'night-two')]
        private = owner.get('/api/memories', params=scope)
        assert private.status_code == 200, private.text
        assert {item['id'] for item in private.json()} == {906, 908}
        assert next(item for item in private.json() if item['id'] == 908)['life_time'] == '2026-08-03'
        assert TestClient(app).get('/api/memories', params=scope).status_code == 401
        query = scope + [('exclude_mine', 'true'), ('limit', '2')]
        first = owner.get('/api/public-feed', params=query)
        assert first.status_code == 200, first.text
        page = first.json()
        assert [item['id'] for item in page['items']] == [905, 903]
        assert 'PRIVATE SECRET' not in first.text
        second = owner.get('/api/public-feed', params=query + [('cursor', page['next_cursor'])]).json()
        assert [item['id'] for item in second['items']] == [902, 901]
        assert second['next_cursor'] is None
        large_query = query + [('event_ids', f'{i}-' + 'x' * 90) for i in range(48)]
        large_first = owner.get('/api/public-feed', params=large_query).json()
        assert owner.get('/api/public-feed', params=large_query + [('cursor', large_first['next_cursor'])]).status_code == 200
        changed = [('event_ids', 'feed-event'), ('exclude_mine', 'true'), ('cursor', page['next_cursor'])]
        assert owner.get('/api/public-feed', params=changed).status_code == 422
        for route in ['/api/memories', '/api/public-feed']:
            assert owner.get(route, params=[('event_ids', '')]).status_code == 422
        with app.state.session_factory() as db:
            assert db.get(MemoryCard, 908).story == 'original 908'
            assert db.get(MemoryCard, 908).event_id == 'night-two'
