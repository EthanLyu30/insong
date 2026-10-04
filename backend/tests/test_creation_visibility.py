from io import BytesIO
import base64

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import create_app
from test_private_flow import register, payload


def photo(client, color):
    data = BytesIO()
    Image.new('RGB', (40, 40), color).save(data, format='JPEG')
    response = client.post('/api/photos', json={'data': base64.b64encode(data.getvalue()).decode()})
    assert response.status_code == 201, response.text
    return response.json()['id']


def test_create_public_memory_commits_its_exact_gallery_and_concert_snapshot(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "public-create.db"}')
    with TestClient(app) as owner, TestClient(app) as guest:
        register(owner)
        ids = [photo(owner, 'red'), photo(owner, 'blue')]
        data = payload(story='散场后，我们坐在台阶上唱完最后一句。', title='带回家的一晚', tags=['散场'],
            photo_ids=ids, photo_id=ids[1], life_year=2025,
            event_id='gem-shenzhen-20261002',
            publication={'confirmed': True, 'anonymous': True, 'share_life_time': False})
        response = owner.post('/api/memories', json=data)
        assert response.status_code == 201, response.text
        card = response.json()
        assert card['publication']['published'] is True
        public = guest.get(f'/api/stories/{card["id"]}').json()
        assert public['excerpt'] == data['story']
        assert public['title'] == data['title'] and public['tags'] == ['散场']
        assert [item['id'] for item in public['photos']] == ids
        assert public['photo_id'] == ids[1] and public['event_id'] == 'gem-shenzhen-20261002'
        assert public['author_name'] == '匿名听友'
        assert public['life_time'] is None and public['life_year'] is None
        assert guest.get(f'/api/memories/{card["id"]}').status_code == 404
        assert all(guest.get(item['url']).status_code == 200 for item in public['photos'])
        retry = owner.post('/api/memories', json=data)
        assert retry.status_code == 201 and retry.json()['id'] == card['id']
        assert len(owner.get('/api/memories').json()) == 1
        assert owner.delete(f'/api/memories/{card["id"]}/publication?revision={card["revision"]}').status_code == 200
        assert owner.post('/api/memories', json=data).status_code == 409
        assert guest.get(f'/api/stories/{card["id"]}').status_code == 404, 'a create retry cannot undo withdrawal'


def test_create_public_memory_shares_time_and_name_only_when_selected(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "choices.db"}')) as owner:
        register(owner)
        data = payload(life_year=2025, publication={'confirmed': True, 'anonymous': False, 'share_life_time': True})
        response = owner.post('/api/memories', json=data)
        assert response.status_code == 201, response.text
        public = owner.get(f'/api/stories/{response.json()["id"]}').json()
        assert public['author_name'] == '听歌的人'
        assert public['life_time'] == data['life_time'] and public['life_year'] == 2025


def test_private_location_survives_create_edit_and_read_without_joining_public_snapshot(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "location.db"}')) as owner:
        register(owner)
        response = owner.post('/api/memories', json=payload(location_name='深圳湾体育中心'))
        assert response.status_code == 201, response.text
        card = response.json()
        assert card['location_name'] == '深圳湾体育中心'
        changed = owner.patch(f'/api/memories/{card["id"]}', json={
            'revision': card['revision'], 'location_name': '苏州奥林匹克体育中心',
        })
        assert changed.status_code == 200, changed.text
        assert changed.json()['location_name'] == '苏州奥林匹克体育中心'
        assert owner.get(f'/api/memories/{card["id"]}').json()['location_name'] == '苏州奥林匹克体育中心'


@pytest.mark.parametrize('settings', [
    {}, {'confirmed': False}, {'confirmed': 'true'},
    {'confirmed': True, 'anonymous': 'false'}, {'confirmed': True, 'share_life_time': 'true'},
])
def test_invalid_creation_consent_saves_neither_original_nor_public_story(tmp_path, settings):
    with TestClient(create_app(f'sqlite:///{tmp_path / "invalid.db"}')) as owner:
        register(owner)
        response = owner.post('/api/memories', json=payload(publication=settings))
        assert response.status_code == 422
        assert owner.get('/api/memories').json() == []


def test_create_retry_cannot_change_a_private_save_to_public_or_public_to_private(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "retry.db"}')) as owner:
        register(owner)
        private = payload()
        saved = owner.post('/api/memories', json=private).json()
        public = {**private, 'publication': {'confirmed': True}}
        assert owner.post('/api/memories', json=public).status_code == 409
        assert owner.get(f'/api/stories/{saved["id"]}').status_code == 404
        public['request_key'] = 'another-public-creation'
        response = owner.post('/api/memories', json=public)
        assert response.status_code == 201, response.text
        assert owner.post('/api/memories', json={key: value for key, value in public.items() if key != 'publication'}).status_code == 409
        assert len(owner.get('/api/memories').json()) == 2
