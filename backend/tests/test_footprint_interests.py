"""Follows and wishes belong to a server account, including after a restart."""
import copy

import pytest
from fastapi.testclient import TestClient

from app import footprints
from app.main import create_app
from test_private_flow import register


@pytest.fixture
def interest_catalog(monkeypatch):
    value = {
        'today': '2026-10-01',
        'artists': [{'id': 'gem', 'name': '邓紫棋'}, {'id': 'liu-yuxin', 'name': '刘雨昕'}],
        'events': [
            {'id': 'future', 'date': '2026-10-02', 'event_status': 'scheduled'},
            {'id': 'today', 'date': '2026-10-01', 'event_status': 'scheduled'},
            {'id': 'past', 'date': '2026-09-30', 'event_status': 'scheduled'},
            {'id': 'cancelled', 'date': '2026-10-03', 'event_status': 'cancelled'},
        ],
    }
    monkeypatch.setattr(footprints, 'load_catalog', lambda: copy.deepcopy(value))
    return value


def test_interests_are_idempotent_isolated_and_durable(tmp_path, interest_catalog):
    url = f'sqlite:///{tmp_path / "interests.db"}'
    app = create_app(url)
    with TestClient(app) as owner:
        assert owner.get('/api/footprints/interests').status_code == 401
        assert owner.put('/api/footprints/follows/gem', json={'followed': True}).status_code == 401
        assert owner.put('/api/footprints/wishes/future', json={'wanted': True}).status_code == 401
        register(owner)
        assert owner.get('/api/footprints/interests').json() == {'artist_ids': [], 'wish_event_ids': []}
        expected = {'artist_ids': ['gem'], 'wish_event_ids': []}
        for _ in range(2):
            response = owner.put('/api/footprints/follows/gem', json={'followed': True})
            assert response.status_code == 200, response.text
            assert response.json() == expected
        expected['wish_event_ids'] = ['future']
        for _ in range(2):
            response = owner.put('/api/footprints/wishes/future', json={'wanted': True})
            assert response.status_code == 200, response.text
            assert response.json() == expected
        other = TestClient(app)
        register(other, 'listener_b')
        assert other.get('/api/footprints/interests').json() == {'artist_ids': [], 'wish_event_ids': []}
        assert other.put('/api/footprints/follows/gem', json={'followed': False}).json() == {'artist_ids': [], 'wish_event_ids': []}
        assert other.put('/api/footprints/wishes/future', json={'wanted': False}).json() == {'artist_ids': [], 'wish_event_ids': []}
        assert owner.get('/api/footprints/interests').json() == expected
        assert owner.put('/api/footprints/follows/gem', json={'followed': False}).json() == {'artist_ids': [], 'wish_event_ids': ['future']}
        owner.put('/api/footprints/follows/liu-yuxin', json={'followed': True})
    with TestClient(create_app(url)) as restarted:
        restarted.post('/api/accounts/login', json={'username': 'listener_a', 'password': 'Only-my-memory-2026'})
        assert restarted.get('/api/footprints/interests').json() == {'artist_ids': ['liu-yuxin'], 'wish_event_ids': ['future']}


@pytest.mark.parametrize('route,field', [('follows/gem', 'followed'), ('wishes/future', 'wanted')])
@pytest.mark.parametrize('invalid', ['true', 1, 0, None, [], {}])
def test_interests_reject_coerced_booleans(route, field, invalid, interest_catalog):
    with TestClient(create_app('sqlite:///:memory:')) as owner:
        register(owner)
        assert owner.put('/api/footprints/' + route, json={field: invalid}).status_code == 422
        assert owner.get('/api/footprints/interests').json() == {'artist_ids': [], 'wish_event_ids': []}


@pytest.mark.parametrize('route,body', [
    ('follows/gem', {}), ('wishes/future', {}),
    ('follows/gem', {'followed': True, 'owner_id': 1}),
    ('wishes/future', {'wanted': True, 'owner_id': 1}),
    ('follows/unknown', {'followed': True}), ('follows/unknown', {'followed': False}),
    ('wishes/unknown', {'wanted': True}), ('wishes/past', {'wanted': True}),
    ('wishes/cancelled', {'wanted': True}),
])
def test_interests_reject_unknown_or_ineligible_targets(route, body, interest_catalog):
    with TestClient(create_app('sqlite:///:memory:')) as owner:
        register(owner)
        assert owner.put('/api/footprints/' + route, json=body).status_code == 422
        assert owner.get('/api/footprints/interests').json() == {'artist_ids': [], 'wish_event_ids': []}


@pytest.mark.parametrize('change', ['past', 'cancelled', 'missing'])
def test_wish_can_be_removed_after_the_event_becomes_ineligible(change, interest_catalog):
    with TestClient(create_app('sqlite:///:memory:')) as owner:
        register(owner)
        assert owner.put('/api/footprints/wishes/today', json={'wanted': True}).status_code == 200
        if change == 'past':
            interest_catalog['today'] = '2026-10-02'
        elif change == 'cancelled':
            interest_catalog['events'][1]['event_status'] = 'cancelled'
        else:
            interest_catalog['events'].pop(1)
        response = owner.put('/api/footprints/wishes/today', json={'wanted': False})
        assert response.status_code == 200, response.text
        assert response.json() == {'artist_ids': [], 'wish_event_ids': []}
