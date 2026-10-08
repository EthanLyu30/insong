from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.main import create_app
from app.models import MemoryCard, PublicStory
from test_private_flow import register


def feed_fixture(app, owner_id):
    """Hand-ranked snapshots; private originals deliberately contain secrets."""
    with app.state.session_factory() as db:
        db.execute(update(PublicStory).values(published=False))
        for identity, reads, day, event, theme, published, author in (
            (901, 0, 1, 'feed-event', 'concert', True, 1),
            (902, 7, 2, 'feed-event', 'concert', True, 1),
            (903, 7, 2, 'feed-event', 'concert', True, 1),
            (904, 100, 3, 'feed-event', 'concert', False, 1),
            (905, 99, 3, 'other-event', 'graduation', True, 1),
            (906, 9, 3, 'feed-event', 'concert', True, owner_id),
        ):
            card = MemoryCard(id=identity, owner_id=author, song_id=1, story='PRIVATE SECRET',
                              visibility='private', event_id=event)
            db.add(card)
            db.flush()
            db.add(PublicStory(memory_id=identity, excerpt=f'approved {identity}',
                               author_name='听友', event_id=event, theme_id=theme,
                               published=published, read_count=reads,
                               published_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=day)))
        db.commit()


def test_public_feed_keyset_excludes_owner_private_and_wrong_scope(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "feed.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        feed_fixture(app, user['id'])
        query = {'event_id': 'feed-event', 'exclude_mine': True, 'sort': 'popular', 'limit': 2}
        response = owner.get('/api/public-feed', params=query)
        assert response.status_code == 200, response.text
        first = response.json()
        assert [item['id'] for item in first['items']] == [903, 902]
        assert [item['views'] for item in first['items']] == [7, 7]
        assert first['next_cursor']
        second = owner.get('/api/public-feed', params={**query, 'cursor': first['next_cursor']}).json()
        assert [item['id'] for item in second['items']] == [901]
        assert second['next_cursor'] is None
        assert 'SECRET' not in response.text
        assert not {'story', 'owner_id', 'reflections'} & set(first['items'][0])
        assert owner.get('/api/stories?event_id=feed-event').json()[0]['id'] == 906
        with app.state.session_factory() as db:
            assert db.get(PublicStory, 903).read_count == 7
            assert db.get(PublicStory, 901).read_count == 0


def test_theme_feed_popularity_then_recency_and_withdrawal_between_pages(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "theme.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        feed_fixture(app, user['id'])
        guest = TestClient(app)
        query = {'theme_id': 'concert', 'sort': 'popular', 'limit': 2}
        first = guest.get('/api/public-feed', params=query)
        assert first.status_code == 200, first.text
        first = first.json()
        assert [item['id'] for item in first['items']] == [906, 903]
        with app.state.session_factory() as db:
            db.get(PublicStory, 902).published = False
            db.commit()
        second = guest.get('/api/public-feed', params={**query, 'cursor': first['next_cursor']}).json()
        assert [item['id'] for item in second['items']] == [901]
        assert second['next_cursor'] is None
        recent = guest.get('/api/public-feed', params={'event_id': 'feed-event', 'sort': 'recent'}).json()
        assert [item['id'] for item in recent['items']] == [906, 903, 901]


def test_feed_cursor_rejects_changed_scope_account_order_and_invalid_parameters(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "guards.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        feed_fixture(app, user['id'])
        query = {'event_id': 'feed-event', 'exclude_mine': True, 'limit': 1}
        response = owner.get('/api/public-feed', params=query)
        assert response.status_code == 200, response.text
        cursor = response.json()['next_cursor']
        for change in ({'event_id': 'other-event'}, {'theme_id': 'concert'}, {'sort': 'popular'}, {'exclude_mine': False}):
            assert owner.get('/api/public-feed', params={**query, **change, 'cursor': cursor}).status_code == 422
        assert TestClient(app).get('/api/public-feed', params={**query, 'cursor': cursor}).status_code == 422
        for bad in ({'cursor': 'bad'}, {'limit': 0}, {'limit': 31}, {'sort': 'invented'}, {'event_id': ''}):
            assert owner.get('/api/public-feed', params={**query, **bad}).status_code == 422
        empty = owner.get('/api/public-feed', params={'event_id': 'no-public-data'}).json()
        assert empty == {'items': [], 'next_cursor': None}


def test_popular_pagination_does_not_skip_unseen_cards_when_views_increase(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "rank.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        feed_fixture(app, user['id'])
        guest = TestClient(app)
        query = {'theme_id': 'concert', 'sort': 'popular', 'limit': 2}
        first = guest.get('/api/public-feed', params=query).json()
        assert [item['id'] for item in first['items']] == [906, 903]
        assert guest.get('/api/stories/902').json()['views'] == 8
        second = guest.get('/api/public-feed', params={**query, 'cursor': first['next_cursor']}).json()
        assert [item['id'] for item in second['items']] == [902, 901]
        assert second['next_cursor'] is None
        repeated = guest.get('/api/public-feed', params={**query, 'cursor': first['next_cursor']}).json()
        assert [item['id'] for item in repeated['items']] == [902, 901]
        fresh = guest.get('/api/public-feed', params=query).json()
        assert [item['id'] for item in fresh['items']] == [906, 902]


def test_expired_ranking_cursor_reports_reload_and_new_reads_can_start_fresh(tmp_path, monkeypatch):
    from app import public_feed
    clock = [10.0]
    monkeypatch.setattr(public_feed, 'monotonic', lambda: clock[0], raising=False)
    app = create_app(f'sqlite:///{tmp_path / "expired.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        feed_fixture(app, user['id'])
        query = {'theme_id': 'concert', 'sort': 'popular', 'limit': 1}
        cursor = owner.get('/api/public-feed', params=query).json()['next_cursor']
        clock[0] = 2000.0
        assert owner.get('/api/public-feed', params={**query, 'cursor': cursor}).status_code == 410
        assert owner.get('/api/public-feed', params=query).status_code == 200
