from fastapi.testclient import TestClient
from app.main import create_app
from test_private_flow import register, payload
import pytest
from fastapi import HTTPException
from app.models import MemoryCard, PublicStory
from app.memories import update_card


def publish(client, card, **changes):
    return client.post(f'/api/memories/{card["id"]}/publication', json={
        'revision': card['revision'], 'excerpt': '散场后舍不得回家。',
        'share_life_time': False, 'anonymous': True, 'confirmed': True, **changes,
    })


def test_private_to_public_snapshot_and_withdrawal(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "public.db"}')
    with TestClient(app) as owner:
        register(owner)
        guest = TestClient(app)
        card = owner.post('/api/memories', json=payload(story='散场后舍不得回家。后半段不想分享。',
            life_time='私人时间', life_year=2022, lyric_id='1-v1-1', offset_ms=16000, theme_id='concert')).json()
        assert card['lyric']['text'] and card['life_year'] == 2022
        path = f'/api/stories/{card["id"]}'
        assert guest.get(path).status_code == 404
        assert publish(guest, card).status_code == 401
        assert publish(owner, card, confirmed=False).status_code == 422
        assert publish(owner, card, excerpt='AI编的经历').status_code == 422
        result = publish(owner, card)
        assert result.status_code == 200, result.text
        card = result.json()
        assert card['publication']['published'] is True
        public = guest.get(path).json()
        assert public['excerpt'] == '散场后舍不得回家。'
        assert public['author_name'] == '匿名听友'
        assert public['is_mine'] is False
        assert owner.get(path).json()['is_mine'] is True
        assert owner.get('/api/stories').json()[0]['is_mine'] is True
        assert guest.get('/api/stories').json()[0]['is_mine'] is False
        assert public['life_time'] is None and public['life_year'] is None
        assert '后半段' not in str(public) and '私人时间' not in str(public)
        assert not {'story', 'reflections', 'owner_id', 'request_key'} & set(public)
        assert guest.get(f'/api/memories/{card["id"]}').status_code == 404
        found = guest.post('/api/stories/search', json={'query': '舍不得回家', 'mode': 'keyword'}).json()
        assert found['items'][0]['story']['id'] == card['id']
        assert any(s['id'] == card['id'] for s in guest.get('/api/stories?theme_id=concert&lyric_id=1-v1-1&song_id=1').json())
        assert owner.delete(f'/api/memories/{card["id"]}/publication?revision={card["revision"]}').status_code == 200
        assert guest.get(path).status_code == 404
        assert owner.get(f'/api/memories/{card["id"]}').json()['story'].endswith('后半段不想分享。')


def test_edit_withdraws_reflections_stay_private_delete_removes(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "edit.db"}')
    with TestClient(app) as client:
        register(client)
        card = client.post('/api/memories', json=payload(story='散场后舍不得回家。', life_year=2020)).json()
        card = publish(client, card, share_life_time=True, anonymous=False).json()
        assert client.get(f'/api/stories/{card["id"]}').json()['life_year'] == 2020
        card = client.post(f'/api/memories/{card["id"]}/reflections', json={'revision':card['revision'], 'text':'只有自己知道'}).json()
        assert '只有自己知道' not in client.get(f'/api/stories/{card["id"]}').text
        card = client.patch(f'/api/memories/{card["id"]}', json={'revision':card['revision'], 'life_year':2021}).json()
        assert client.get(f'/api/stories/{card["id"]}').status_code == 404
        assert publish(client, card, revision=1).status_code == 409
        card = publish(client, card).json()
        assert client.delete(f'/api/memories/{card["id"]}?revision={card["revision"]}').status_code == 204
        assert client.get(f'/api/stories/{card["id"]}').status_code == 404


def test_search_only_consented_text_and_rechecks_withdrawal(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "search.db"}')
    with TestClient(app) as client:
        register(client)
        card = client.post('/api/memories', json=payload(story='散场后舍不得回家。秘密标识SECRET', life_time='SECRET时间')).json()
        card = publish(client, card).json()
        class RevokeDuringInference:
            def scores(self, query, texts):
                assert not any('SECRET' in text for text in texts)
                assert client.delete(f'/api/memories/{card["id"]}/publication?revision={card["revision"]}').status_code == 200
                return [.99] * len(texts)
        app.state.recall = RevokeDuringInference()
        result = client.post('/api/stories/search', json={'query':'散场'}).json()
        assert card['id'] not in [item['story']['id'] for item in result['items']]


def test_named_artist_search_excludes_other_artists_when_semantic_falls_back(tmp_path):
    class Unavailable:
        ready = False
        def scores(self, query, texts):
            raise RuntimeError('model unavailable')

    app = create_app(f'sqlite:///{tmp_path / "artist-fallback.db"}')
    with TestClient(app) as client:
        app.state.recall = Unavailable()
        result = client.post('/api/stories/search', json={
            'query': '第一次一个人看邓紫棋现场，原本怕孤单，后来旁边听友陪我举灯',
            'mode': 'semantic',
        }).json()
        assert result['mode'] == 'keyword'
        assert result['items']
        assert {item['story']['song']['artist'] for item in result['items']} == {'邓紫棋'}


def test_artist_alias_limits_candidates_before_semantic_scoring(tmp_path):
    class AllSimilar:
        ready = True
        def scores(self, query, texts):
            assert texts
            assert all('邓紫棋' in text for text in texts)
            return [.95] * len(texts)

    app = create_app(f'sqlite:///{tmp_path / "artist-alias.db"}')
    with TestClient(app) as client:
        app.state.recall = AllSimilar()
        result = client.post('/api/stories/search', json={
            'query': 'G.E.M. 演唱会的灯海', 'mode': 'semantic',
        }).json()
        assert result['mode'] == 'semantic'
        assert result['items']
        assert {item['story']['song']['artist'] for item in result['items']} == {'邓紫棋'}


def test_coordinate_validation_and_migration_does_not_republish(tmp_path):
    url = f'sqlite:///{tmp_path / "migration.db"}'
    with TestClient(create_app(url)) as client:
        assert client.get('/api/songs/1').json()['lyrics'][1]['start_ms'] == 16000
        assert len(client.get('/api/themes').json()) == 3
        client.post('/api/demo/sessions', json={'user_id':2})
        seed = client.get('/api/memories/2').json()
        assert client.get('/api/stories/2').status_code == 200
        client.delete(f'/api/memories/2/publication?revision={seed["revision"]}')
        for changes in ({'lyric_id':'2-v1-1'}, {'lyric_id':'1-v1-1','offset_ms':12000},
                        {'life_year':1899}, {'life_year':9999}, {'theme_id':'made-up'}):
            assert client.post('/api/memories', json=payload(**changes)).status_code == 422
    with TestClient(create_app(url)) as client:
        assert client.get('/api/stories/2').status_code == 404
        assert client.get('/api/memories/2').status_code == 404


def test_simultaneous_first_publications_return_conflict_not_integrity_error(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "race.db"}')
    with TestClient(app) as client:
        register(client)
        card = client.post('/api/memories', json=payload()).json()
        with app.state.session_factory() as first, app.state.session_factory() as second:
            first_card = first.get(MemoryCard, card['id'])
            second_card = second.get(MemoryCard, card['id'])
            assert first_card.publication is None and second_card.publication is None
            for db in (first, second):
                db.add(PublicStory(memory_id=card['id'], excerpt=card['story'], author_name='匿名听友'))
            assert update_card(first, first_card, 1, {})['revision'] == 2
            with pytest.raises(HTTPException) as error:
                update_card(second, second_card, 1, {})
            assert error.value.status_code == 409
        assert client.get(f'/api/memories/{card["id"]}').json()['revision'] == 2
