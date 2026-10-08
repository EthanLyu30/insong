"""Fandom memory contract and publication privacy through the real HTTP API."""
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import MemoryCard, Song
from test_private_flow import payload, register
from test_public_stories import publish
from test_redesign import upload


def create_card(client, **changes):
    response = client.post('/api/memories', json=payload(story='散场后舍不得回家。', **changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_title_tags_gallery_roundtrip_selected_cover_and_retry(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "gallery.db"}')) as owner:
        register(owner)
        photos = [upload(owner) for _ in range(9)]
        data = payload(title='  第一次跨城追星  ', tags=[' #演唱会 ', '演唱会', ' ##散场 ', '  '],
                       photo_ids=[photo['id'] for photo in photos], photo_id=photos[4]['id'])
        response = owner.post('/api/memories', json=data)
        assert response.status_code == 201, response.text
        card = response.json()
        assert card['title'] == '第一次跨城追星'
        assert card['tags'] == ['演唱会', '散场']
        assert card['photos'] == photos
        assert card['photo_id'] == photos[4]['id'] and card['photo_url'] == photos[4]['url']
        assert owner.get(f'/api/memories/{card["id"]}').json()['photos'] == photos
        assert owner.post('/api/memories', json=data).json()['id'] == card['id']
        for changes in ({'title': '不同的标题'}, {'tags': ['新标签']}, {'photo_ids': [photos[4]['id']]}):
            assert owner.post('/api/memories', json=data | changes).status_code == 409
        cleared = owner.patch(f'/api/memories/{card["id"]}', json={
            'revision': card['revision'], 'title': None, 'tags': [], 'photo_ids': [], 'photo_id': None,
        }).json()
        assert cleared['title'] is None and cleared['tags'] == [] and cleared['photos'] == []
        assert cleared['photo_id'] is None and cleared['photo_url'] is None


def test_gallery_validates_every_photo_and_cover_membership(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "ownership.db"}')
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'listener_b')
        own = upload(owner)
        foreign = upload(other)
        for changes in ({'photo_ids': [own['id'], foreign['id']]},
                        {'photo_ids': [own['id']], 'photo_id': foreign['id']},
                        {'photo_ids': [], 'photo_id': own['id']},
                        {'photo_ids': [own['id']] * 10}):
            assert owner.post('/api/memories', json=payload(**changes)).status_code == 422
        card = create_card(owner, photo_ids=[own['id']])
        assert card['photo_id'] == own['id']
        assert owner.patch(f'/api/memories/{card["id"]}', json={
            'revision': 1, 'photo_ids': [own['id'], foreign['id']],
        }).status_code == 422
        legacy = create_card(owner, photo_id=own['id'])
        assert legacy['photos'] == [own]


@pytest.mark.parametrize('changes', [
    {'title': '字' * 81}, {'tags': [str(i) for i in range(9)]}, {'tags': ['字' * 25]},
    {'tags': [123]}, {'photo_ids': None},
])
def test_title_and_tag_limits_are_enforced(tmp_path, changes):
    with TestClient(create_app(f'sqlite:///{tmp_path / "limits.db"}')) as owner:
        register(owner)
        assert owner.post('/api/memories', json=payload(**changes)).status_code == 422


@pytest.mark.parametrize('change', ['title', 'tags', 'photo_ids'])
def test_approved_metadata_snapshot_and_entire_gallery_access_withdraw_on_edit(tmp_path, change):
    app = create_app(f'sqlite:///{tmp_path / "public-gallery.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        photos = [upload(owner) for _ in range(3)]
        card = create_card(owner, title='一起等安可', tags=['演唱会', '散场'],
                           photo_ids=[photo['id'] for photo in photos], photo_id=photos[1]['id'])
        assert guest.get(f'/api/stories/{card["id"]}').status_code == 404
        assert all(guest.get(photo['url']).status_code == 404 for photo in photos)
        card = publish(owner, card).json()
        public = guest.get(f'/api/stories/{card["id"]}').json()
        assert public['title'] == '一起等安可' and public['tags'] == ['演唱会', '散场']
        assert public['photos'] == photos and public['photo_id'] == photos[1]['id']
        assert card['publication']['photos'] == photos
        assert all(guest.get(photo['url']).status_code == 200 for photo in photos)
        changes = {'title': 'PRIVATE TITLE', 'tags': ['PRIVATE TAG'],
                   'photo_ids': [photos[1]['id']]}
        result = owner.patch(f'/api/memories/{card["id"]}', json={'revision': card['revision'], change: changes[change]})
        assert result.status_code == 200, result.text
        assert guest.get(f'/api/stories/{card["id"]}').status_code == 404
        assert all(guest.get(photo['url']).status_code == 404 for photo in photos)
        assert all(owner.get(photo['url']).status_code == 200 for photo in photos)


def test_keyword_and_exact_tag_search_return_all_public_matches_only(tmp_path, monkeypatch):
    from app import footprints
    catalog_path = tmp_path / 'catalog.json'
    catalog_path.write_text(json.dumps({'artists': [{'id': 'fixture', 'name': '示例歌手'}], 'events': [
        {'id': 'fixture-event', 'artist_id': 'fixture', 'title': '夏日音乐节', 'city': '杭州',
         'venue': '草地舞台', 'date': '2020-01-01', 'songs': []},
    ]}), encoding='utf-8')
    monkeypatch.setattr(footprints, 'CATALOG_PATH', catalog_path)
    app = create_app(f'sqlite:///{tmp_path / "search.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        expected = []
        for index in range(5):
            card = create_card(owner, song_id=102, offset_ms=None, title=f'同行人的夜晚{index}',
                               tags=['跨城追星测试'], event_id='fixture-event')
            card = publish(owner, card).json()
            expected.append(card['id'])
        private = create_card(owner, title='PRIVATE TITLE', tags=['PRIVATE TAG'])
        for query in ('跨城追星', '邓紫棋', 'G.E.M.', '光年之外', '夏日音乐节', '草地舞台', '同行人的夜晚'):
            response = guest.post('/api/stories/search', json={'query': query, 'mode': 'keyword'}).json()
            assert set(expected) <= {item['story']['id'] for item in response['items']}, (query, response)
        exact = guest.post('/api/stories/search', json={'query': '#跨城追星测试'}).json()
        assert {item['story']['id'] for item in exact['items']} == set(expected)
        assert {story['id'] for story in guest.get('/api/stories', params={'tag': '#跨城追星测试'}).json()} == set(expected)
        for query in ('PRIVATE TITLE', '#PRIVATE TAG'):
            found = guest.post('/api/stories/search', json={'query': query, 'mode': 'keyword'}).json()
            assert private['id'] not in [item['story']['id'] for item in found['items']]


def test_inference_uses_approved_metadata_and_rechecks_after_metadata_edit(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "race.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        card = create_card(owner, title='等安可', tags=['散场'])
        card = publish(owner, card).json()
        create_card(owner, title='PRIVATE TITLE', tags=['PRIVATE TAG'])
        class EditDuringInference:
            def scores(self, query, texts):
                assert any('等安可' in text and '散场' in text for text in texts)
                assert not any('PRIVATE' in text for text in texts)
                edited = owner.patch(f'/api/memories/{card["id"]}', json={
                    'revision': card['revision'], 'title': 'PRIVATE UPDATE',
                })
                assert edited.status_code == 200
                return [.99] * len(texts)
        app.state.recall = EditDuringInference()
        found = guest.post('/api/stories/search', json={'query': '等安可'}).json()
        assert card['id'] not in [item['story']['id'] for item in found['items']]


def test_metadata_catalog_and_showcase_upgrade_do_not_overwrite_or_resurrect(tmp_path):
    path = tmp_path / 'upgrade.db'
    url = f'sqlite:///{path}'
    app = create_app(url)
    with TestClient(app) as client:
        songs = client.get('/api/songs').json()
        originals = [song for song in songs if song['id'] < 101]
        metadata = [song for song in songs if song['id'] >= 101]
        assert len(originals) == 5 and all(song['audio_available'] for song in originals)
        assert {(song['title'], song['artist']) for song in metadata} == {
            ('稻香', '周杰伦'), ('光年之外', '邓紫棋'), ('泡沫', '邓紫棋'),
            ('REALITY', '刘雨昕'), ('倔强', '五月天'),
            ('奢香夫人', '凤凰传奇'), ('相遇', '时代少年团'), ('演员', '薛之谦'),
        }
        assert all(song['audio_url'] is None and not song['audio_available'] and not song['is_demo'] for song in metadata)
        assert all(song['lyrics'] == [] and song['cover_url'].startswith('/photos/') for song in metadata)
        showcase = [story for story in client.get('/api/stories').json() if story['song_id'] >= 101]
        assert len(showcase) >= 5 and all(story['is_demo_sample'] for story in showcase)
        assert {'演唱会', '散场', '音乐节', '跨城追星'} <= {tag for story in showcase for tag in story['tags']}
        removed, revoked, edited = showcase[:3]
        with app.state.session_factory() as db:
            db.delete(db.get(MemoryCard, removed['id']))
            db.get(MemoryCard, revoked['id']).publication.published = False
            db.get(MemoryCard, edited['id']).title = '保留的编辑'
            db.get(Song, 101).title = '保留的曲目编辑'
            db.commit()
    with TestClient(create_app(url)) as client:
        assert client.get(f'/api/stories/{removed["id"]}').status_code == 404
        assert client.get(f'/api/stories/{revoked["id"]}').status_code == 404
        assert client.get('/api/songs/101').json()['title'] == '保留的曲目编辑'
        with client.app.state.session_factory() as db:
            assert db.get(MemoryCard, edited['id']).title == '保留的编辑'


def test_legacy_public_snapshot_does_not_gain_private_title_tags_or_gallery(tmp_path):
    path = tmp_path / 'legacy.db'
    app = create_app(f'sqlite:///{path}')
    with TestClient(app) as owner:
        register(owner)
        photo = upload(owner)
        card = create_card(owner, title='PRIVATE TITLE', tags=['PRIVATE TAG'], photo_ids=[photo['id']])
        card = publish(owner, card).json()
    with sqlite3.connect(path) as connection:
        # Simulate a database whose public snapshot predates these consent fields.
        connection.execute('ALTER TABLE public_stories DROP COLUMN title')
        connection.execute('ALTER TABLE public_stories DROP COLUMN tags_json')
        connection.execute('ALTER TABLE public_stories DROP COLUMN photo_ids_json')
        connection.execute('UPDATE public_stories SET photo_id=NULL WHERE memory_id=?', (card['id'],))
    with TestClient(create_app(f'sqlite:///{path}')) as guest:
        public = guest.get(f'/api/stories/{card["id"]}').json()
        assert public['title'] is None and public['tags'] == [] and public['photos'] == []
        assert guest.get(photo['url']).status_code == 404


def test_showcase_addition_handles_existing_song_and_memory_ids_safely(tmp_path):
    from app.database import create_sqlite_engine, initialize_database
    from app.models import Base, MemoryReceipt, User
    from sqlalchemy.orm import Session
    engine = create_sqlite_engine(f'sqlite:///{tmp_path / "collisions.db"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(id=1, display_name='保留用户', is_demo=False))
        db.add(Song(id=101, title='自己的歌', artist='自己的作者', version='原版', source_label='保留来源'))
        db.commit()
        db.add(MemoryCard(id=1001, owner_id=1, song_id=101, story='保留的原文'))
        db.add(MemoryReceipt(id=1009, owner_id=1, request_key='already-deleted-key'))
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(Song, 101).title == '自己的歌'
        assert db.get(MemoryCard, 1001).story == '保留的原文'
        samples = list(db.scalars(select(MemoryCard).where(MemoryCard.is_demo_sample.is_(True))))
        assert len(samples) >= 5 and all(card.id > 1009 for card in samples)
        assert db.get(MemoryCard, 1009) is None
