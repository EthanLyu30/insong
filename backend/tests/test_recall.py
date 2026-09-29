from fastapi.testclient import TestClient
from app.main import create_app
from test_private_flow import register, payload


def test_keyword_search_is_owner_only_and_deleted_text_disappears(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "recall.db"}')
    with TestClient(app) as a:
        register(a)
        b = TestClient(app)
        register(b, 'another_person')
        card = a.post('/api/memories', json=payload()).json()
        b.post('/api/memories', json=payload(story='毕业晚会秘密地址，不应出现在另一个人的结果里。'))
        result = a.post('/api/memories/search', json={'query': '操场', 'mode': 'keyword'}).json()
        assert result['mode'] == 'keyword'
        assert [x['memory']['id'] for x in result['items']] == [card['id']]
        assert result['items'][0]['evidence'] in card['story']
        assert a.post('/api/memories/search', json={'query': '火星矿石化学实验', 'mode': 'keyword'}).json()['items'] == []
        a.delete(f'/api/memories/{card["id"]}?revision=1')
        assert a.post('/api/memories/search', json={'query': '操场', 'mode': 'keyword'}).json()['items'] == []
        assert TestClient(app).post('/api/memories/search', json={'query': '毕业'}).status_code == 401


def test_semantic_failure_falls_back_honestly(tmp_path):
    class Unavailable:
        ready = False
        def scores(self, query, texts):
            raise RuntimeError('model unavailable')
    app = create_app(f'sqlite:///{tmp_path / "fallback.db"}')
    with TestClient(app) as client:
        app.state.recall = Unavailable()
        register(client)
        client.post('/api/memories', json=payload())
        result = client.post('/api/memories/search', json={'query': '操场', 'mode': 'semantic'}).json()
        assert result['mode'] == 'keyword'
        assert result['notice']
        assert len(result['items']) == 1


def test_model_receives_only_owner_text_and_evidence_is_original(tmp_path):
    class Ranked:
        ready = True
        def scores(self, query, texts):
            assert all('秘密地址' not in text for text in texts)
            return [.94] * len(texts)
    app = create_app(f'sqlite:///{tmp_path / "scope.db"}')
    with TestClient(app) as a:
        app.state.recall = Ranked()
        register(a)
        b = TestClient(app)
        register(b, 'another_person')
        own = a.post('/api/memories', json=payload()).json()
        b.post('/api/memories', json=payload(story='秘密地址'))
        result = a.post('/api/memories/search', json={'query': '结束学生时代'}).json()
        assert result['mode'] == 'semantic'
        assert result['items'][0]['memory']['id'] == own['id']
        assert result['items'][0]['evidence'] in own['story']


def test_low_similarity_can_return_no_result(tmp_path):
    class Distant:
        ready = True
        def scores(self, query, texts):
            # E5 similarities cluster high; .84 is not evidence of a match.
            return [.84] * len(texts)
    app = create_app(f'sqlite:///{tmp_path / "none.db"}')
    with TestClient(app) as client:
        app.state.recall = Distant()
        register(client)
        client.post('/api/memories', json=payload())
        result = client.post('/api/memories/search', json={'query': '火星矿石化学实验'}).json()
        assert result['items'] == []


def test_audio_is_playable_and_range_requests_work(tmp_path):
    with TestClient(create_app(f'sqlite:///{tmp_path / "audio.db"}')) as client:
        song = client.get('/api/songs/1').json()
        assert song['audio_available'] and song['duration_ms'] == 48000
        response = client.get(song['audio_url'], headers={'Range': 'bytes=0-43'})
        assert response.status_code == 206
        assert response.content.startswith(b'RIFF') and b'WAVE' in response.content
