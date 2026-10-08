"""Map images must reflect current ownership, consent and real story opens."""
import json
import sqlite3
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.database import initialize_database
from app.main import create_app
from app.models import MemoryCard, Photo, PublicStory
from test_private_flow import payload, register
from test_public_stories import publish
from test_redesign import upload


EVENT = 'gem-sanya-20251207'


def memory(client, **changes):
    response = client.post('/api/memories', json=payload(
        event_id=EVENT, offset_ms=None, story='散场后舍不得回家。私人原文不公开。', **changes))
    assert response.status_code == 201, response.text
    return response.json()


def map_images(client):
    response = client.get('/api/footprints/photos')
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    assert response.json()['ranking'] == 'views_then_recent'
    images = response.json()['photos']
    assert len({item['event_id'] for item in images}) == len(images)
    return {item['event_id']: item for item in images}


def test_private_map_photo_is_owner_only_and_missing_events_have_no_placeholder(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "private-map.db"}')
    with TestClient(app) as owner:
        user = register(owner)
        other = TestClient(app)
        register(other, 'map_other')
        guest = TestClient(app)
        image = upload(owner)
        card = memory(owner, photo_ids=[image['id']])
        assert map_images(owner)[EVENT] == {
            'event_id': EVENT, 'url': image['url'], 'source': 'mine',
            'memory_id': card['id'], 'author_name': user['display_name'],
            'is_demo_sample': False, 'views': 0,
        }
        for viewer in (other, guest):
            assert EVENT not in map_images(viewer)
            assert viewer.get(image['url']).status_code == 404
        assert owner.get(image['url']).status_code == 200
        assert owner.delete(f'/api/memories/{card["id"]}?revision=1').status_code == 204
        assert EVENT not in map_images(owner)


def test_owner_photo_wins_over_a_more_popular_public_story(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "own-first.db"}')
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'popular_listener')
        guest = TestClient(app)
        own_image = upload(owner)
        own = memory(owner, photo_ids=[own_image['id']])
        public_image = upload(other)
        public = publish(other, memory(other, photo_ids=[public_image['id']])).json()
        for _ in range(4):
            assert guest.get(f'/api/stories/{public["id"]}').status_code == 200
        assert map_images(owner)[EVENT]['memory_id'] == own['id']
        assert map_images(owner)[EVENT]['source'] == 'mine'
        assert map_images(guest)[EVENT]['memory_id'] == public['id']
        assert map_images(guest)[EVENT]['views'] == 4


def test_public_map_ranking_uses_successful_reads_then_recent_and_stable_id(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "ranking.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        cards = [publish(owner, memory(owner, photo_ids=[upload(owner)['id']])).json() for _ in range(3)]
        with app.state.session_factory() as db:
            for card in cards:
                db.get(PublicStory, card['id']).published_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
            db.commit()
        assert map_images(guest)[EVENT]['memory_id'] == cards[2]['id']
        guest.get('/api/stories')
        guest.post('/api/stories/search', json={'query': '散场', 'mode': 'keyword'})
        assert map_images(guest)[EVENT]['views'] == 0
        assert guest.get(f'/api/stories/{cards[0]["id"]}').json()['views'] == 1
        assert map_images(guest)[EVENT]['memory_id'] == cards[0]['id']
        assert guest.get(f'/api/stories/{cards[1]["id"]}').json()['views'] == 1
        assert map_images(guest)[EVENT]['memory_id'] == cards[1]['id']
        with app.state.session_factory() as db:
            db.get(PublicStory, cards[0]['id']).published_at = datetime(2026, 2, 1, tzinfo=timezone.utc)
            db.commit()
        assert map_images(guest)[EVENT]['memory_id'] == cards[0]['id']
        assert guest.get(f'/api/stories/{cards[1]["id"]}').json()['views'] == 2
        assert map_images(guest)[EVENT]['memory_id'] == cards[1]['id']


def test_withdrawn_and_deleted_public_photos_disappear_immediately(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "withdrawal-map.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        image = upload(owner)
        card = publish(owner, memory(owner, photo_ids=[image['id']])).json()
        assert map_images(guest)[EVENT]['url'] == image['url']
        assert owner.delete(f'/api/memories/{card["id"]}/publication?revision={card["revision"]}').status_code == 200
        assert EVENT not in map_images(guest)
        assert guest.get(image['url']).status_code == 404
        assert guest.get(f'/api/stories/{card["id"]}').status_code == 404
        with app.state.session_factory() as db:
            assert getattr(db.get(PublicStory, card['id']), 'read_count', None) == 0
        assert map_images(owner)[EVENT]['source'] == 'mine'
        card = owner.get(f'/api/memories/{card["id"]}').json()
        card = publish(owner, card).json()
        assert owner.delete(f'/api/memories/{card["id"]}?revision={card["revision"]}').status_code == 204
        assert EVENT not in map_images(guest)
        assert guest.get(image['url']).status_code == 404


def test_map_uses_only_public_photo_snapshot_and_valid_image_bytes(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "snapshot-map.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        approved = upload(owner)
        secret = upload(owner)
        card = publish(owner, memory(owner, photo_ids=[approved['id']])).json()
        with app.state.session_factory() as db:
            original = db.get(MemoryCard, card['id'])
            original.photo_id = secret['id']
            original.photo_ids_json = json.dumps([secret['id']])
            # A stale/invalid cover must never widen the approved gallery.
            original.publication.photo_id = secret['id']
            db.commit()
        chosen = map_images(guest)[EVENT]
        assert chosen['url'] == approved['url']
        assert chosen['author_name'] == '匿名听友'
        assert '私人原文' not in json.dumps(chosen, ensure_ascii=False)
        with app.state.session_factory() as db:
            db.get(Photo, approved['id']).content = b'not a decodable image'
            db.commit()
        assert EVENT not in map_images(guest)
        assert map_images(owner)[EVENT]['url'] == secret['url']


def test_map_rejects_foreign_photo_metadata_and_non_catalog_events(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "invalid-map.db"}')
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'foreign_photo')
        guest = TestClient(app)
        foreign = upload(other)
        card = publish(owner, memory(owner)).json()
        with app.state.session_factory() as db:
            public = db.get(PublicStory, card['id'])
            public.photo_id = foreign['id']
            public.photo_ids_json = json.dumps([foreign['id']])
            db.commit()
        assert EVENT not in map_images(guest)
        own = upload(owner)
        with app.state.session_factory() as db:
            public = db.get(PublicStory, card['id'])
            public.photo_id = own['id']
            public.photo_ids_json = json.dumps([own['id']])
            public.event_id = 'user-entered-unverified-event'
            db.commit()
        assert 'user-entered-unverified-event' not in map_images(guest)


def test_real_read_counts_survive_restart_and_additive_legacy_migration(tmp_path):
    path = tmp_path / 'legacy-reads.db'
    url = f'sqlite:///{path}'
    app = create_app(url)
    with TestClient(app) as owner:
        register(owner)
        card = publish(owner, memory(owner)).json()
        assert owner.get(f'/api/stories/{card["id"]}').json().get('views') == 1
    with TestClient(create_app(url)) as guest:
        assert guest.get(f'/api/stories/{card["id"]}').json()['views'] == 2
    with sqlite3.connect(path) as connection:
        connection.execute('ALTER TABLE public_stories DROP COLUMN read_count')
    migrated = create_app(url)
    with TestClient(migrated) as guest:
        columns = {column['name']: column for column in inspect(migrated.state.session_factory.kw['bind']).get_columns('public_stories')}
        assert columns['read_count']['nullable'] is False
        assert guest.get(f'/api/stories/{card["id"]}').json()['views'] == 1
        initialize_database(migrated.state.session_factory.kw['bind'])
        assert guest.get(f'/api/stories/{card["id"]}').json()['views'] == 2
