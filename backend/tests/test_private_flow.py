import sqlite3
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import User


def register(client, name='listener_a'):
    response = client.post('/api/accounts/register', json={
        'username': name, 'password': 'Only-my-memory-2026', 'display_name': '听歌的人',
    })
    assert response.status_code == 201, response.text
    return response.json()['user']


def payload(**changes):
    return {'song_id': 1, 'story': '毕业那晚，一个人走过操场。', 'offset_ms': 12300,
            'life_time': '毕业那年', 'life_precision': 'unknown',
            'request_key': str(uuid4()), **changes}


def test_personal_account_password_session_and_demo_cannot_impersonate(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "account.db"}')
    with TestClient(app) as client:
        user = register(client)
        assert not user['is_demo']
        assert client.get('/api/me').json()['user'] == user
        assert client.post('/api/demo/sessions', json={'user_id': user['id']}).status_code == 400
        client.post('/api/accounts/logout')
        assert client.get('/api/me').json()['user'] is None
        assert client.post('/api/accounts/login', json={'username': 'listener_a', 'password': 'wrong-password'}).status_code == 401
        assert client.post('/api/accounts/login', json={'username': 'LISTENER_A', 'password': 'Only-my-memory-2026'}).status_code == 200
        assert client.post('/api/accounts/register', json={'username': 'listener_a', 'password': 'Only-my-memory-2026', 'display_name': 'x'}).status_code == 409


def test_private_capture_retry_edit_reflection_delete_and_owner_guards(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "flow.db"}')
    with TestClient(app) as owner:
        register(owner)
        other = TestClient(app)
        register(other, 'listener_b')
        guest = TestClient(app)
        data = payload()
        assert guest.post('/api/memories', json=data).status_code == 401
        response = owner.post('/api/memories', json=data)
        assert response.status_code == 201, response.text
        card = response.json()
        assert card['visibility'] == 'private'
        assert card['offset_ms'] == 12300
        assert card['revision'] == 1
        assert card['song']['id'] == 1
        assert owner.post('/api/memories', json=data).json()['id'] == card['id']
        assert len(owner.get('/api/memories').json()) == 1
        assert other.get('/api/memories').json() == []
        path = f'/api/memories/{card["id"]}'
        for visitor in (guest, other):
            assert visitor.get(path).status_code == 404
        assert other.patch(path, json={'revision': 1, 'story': '篡改'}).status_code == 404
        assert other.delete(path + '?revision=1').status_code == 404
        edited = owner.patch(path, json={'revision': 1, 'story': '后来，我终于敢一个人出发了。', 'offset_ms': None}).json()
        assert edited['revision'] == 2 and edited['offset_ms'] is None
        assert owner.patch(path, json={'revision': 1, 'story': '旧页面'}).status_code == 409
        reply = owner.post(path + '/reflections', json={'revision': 2, 'text': '今天再次听见，已经不害怕了。'})
        assert reply.status_code == 200
        assert reply.json()['story'] == edited['story']
        assert reply.json()['reflections'][0]['text'] == '今天再次听见，已经不害怕了。'
        assert owner.delete(path + '?revision=2').status_code == 409
        assert owner.delete(path + '?revision=3').status_code == 204
        assert owner.get(path).status_code == 404
        assert owner.get('/api/memories').json() == []


def test_validation_does_not_publish_or_accept_invalid_anchor(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "validation.db"}')) as client:
        register(client)
        for changes in [{'story': '   '}, {'story': 'x' * 501}, {'offset_ms': -1},
                        {'offset_ms': 9999999}, {'visibility': 'public'}, {'owner_id': 2},
                        {'song_id': 999}, {'offset_ms': True}, {'life_precision': 'invented'}]:
            assert client.post('/api/memories', json=payload(**changes)).status_code in (404, 422)
        short = client.post('/api/memories', json=payload(story='风', offset_ms=None, life_time=None))
        assert short.status_code == 201


def test_memory_survives_restart_and_legacy_schema_is_migrated(tmp_path):
    path = tmp_path / 'legacy.db'
    con = sqlite3.connect(path)
    con.executescript('''
        CREATE TABLE users(id INTEGER PRIMARY KEY,display_name VARCHAR(80) NOT NULL,is_demo BOOLEAN NOT NULL);
        CREATE TABLE songs(id INTEGER PRIMARY KEY,title VARCHAR(160) NOT NULL,artist VARCHAR(160) NOT NULL,version VARCHAR(100) NOT NULL,source_label VARCHAR(100) NOT NULL,is_demo BOOLEAN NOT NULL,audio_available BOOLEAN NOT NULL,created_at DATETIME NOT NULL);
        CREATE TABLE memory_cards(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL,song_id INTEGER NOT NULL,story TEXT NOT NULL,life_time VARCHAR(80),scene VARCHAR(160),visibility VARCHAR(10) NOT NULL DEFAULT 'private',is_demo_sample BOOLEAN NOT NULL DEFAULT 0,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO users VALUES(1,'保留的用户',1);
        INSERT INTO songs VALUES(1,'保留的歌','作者','原版本','原来源',1,0,CURRENT_TIMESTAMP);
        INSERT INTO memory_cards(owner_id,song_id,story) VALUES(1,1,'不能丢的原文');
    ''')
    con.close()
    for _ in range(2):
        with TestClient(create_app(f'sqlite:///{path}')) as client:
            client.post('/api/demo/sessions', json={'user_id': 1})
            card = client.get('/api/memories/1').json()
            assert card['story'] == '不能丢的原文'
            assert card['offset_ms'] is None and card['revision'] == 1
            assert client.get('/api/songs/1').json()['title'] == '保留的歌'


def test_cross_origin_mutations_are_rejected(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "csrf.db"}')) as client:
        response = client.post('/api/demo/sessions', json={'user_id': 1}, headers={'Origin': 'https://not-this-app.example'})
        assert response.status_code == 403
def test_retry_key_cannot_silently_discard_changed_text(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "retry.db"}')
    with TestClient(app) as client:
        register(client)
        original = payload()
        first = client.post('/api/memories', json=original).json()
        changed = client.post('/api/memories', json=original | {'story': '后来补充的这句话也需要保存。'})
        assert changed.status_code == 409
        assert client.get(f'/api/memories/{first["id"]}').json()['story'] == first['story']
def test_deleted_id_is_never_reused_by_a_new_memory(tmp_path):
    url = f'sqlite:///{tmp_path / "stable-ids.db"}'
    with TestClient(create_app(url)) as client:
        register(client)
        old = client.post('/api/memories', json=payload()).json()
        assert client.delete(f'/api/memories/{old["id"]}?revision=1').status_code == 204
    # Also covers sequence persistence across an additive upgrade / restart.
    with TestClient(create_app(url)) as client:
        assert client.post('/api/accounts/login', json={'username': 'listener_a', 'password': 'Only-my-memory-2026'}).status_code == 200
        fresh = client.post('/api/memories', json=payload(story='新的一页，旧页面不能修改它。')).json()
        assert fresh['id'] != old['id']
        assert client.patch(f'/api/memories/{old["id"]}', json={'revision':1,'story':'过期页面的修改'}).status_code == 404
        assert client.delete(f'/api/memories/{old["id"]}?revision=1').status_code == 404
        assert client.get(f'/api/memories/{fresh["id"]}').json()['story'] == fresh['story']


def test_retry_after_delete_does_not_resurrect_private_text(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "tombstone.db"}')) as client:
        register(client)
        original = payload()
        card = client.post('/api/memories', json=original).json()
        client.delete(f'/api/memories/{card["id"]}?revision=1')
        assert client.post('/api/memories', json=original).status_code == 409
        assert client.get('/api/memories').json() == []
