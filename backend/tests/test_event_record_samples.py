from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import initialize_database
from app.main import create_app
from app.models import MemoryCard, MemoryReceipt, SeedMigration


GEM = 'gem-shenzhen-20261005'
LIU = 'liu-yuxin-shenzhen-20260801'


def test_event_samples_have_owner_records_and_other_listeners_with_protected_photos(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "records.db"}')
    with TestClient(app) as owner, TestClient(app) as guest:
        owner.post('/api/demo/sessions', json={'user_id': 1})
        mine = owner.get(f'/api/memories?event_id={GEM}').json()
        shared = guest.get(f'/api/stories?event_id={GEM}').json()
        assert len(mine) == 2
        assert len(shared) == 3
        assert {bool(card['publication'] and card['publication']['published']) for card in mine} == {False, True}
        other = [card for card in owner.get(f'/api/stories?event_id={GEM}').json() if not card['is_mine']]
        assert len(other) == 2
        for card in [*mine, *other]:
            assert card['is_demo_sample']
            assert len(card['photos']) >= 2
            assert card['event_snapshot']['date'] == '2026-10-05'
            assert card['event_snapshot']['venue'] == '深圳大运中心体育场'
        private = next(card for card in mine if not card['publication'])
        assert guest.get(f'/api/stories/{private["id"]}').status_code == 404
        assert guest.get(private['photos'][0]['url']).status_code == 404
        assert owner.get(private['photos'][0]['url']).status_code == 200
        assert guest.get(other[0]['photos'][0]['url']).status_code == 200
        assert guest.get(f'/api/memories/{other[0]["id"]}').status_code == 404
        assert len(owner.get(f'/api/memories?event_id={LIU}').json()) == 1
        assert len(guest.get(f'/api/stories?event_id={LIU}').json()) == 5


def test_restart_and_lost_marker_preserve_edited_withdrawn_and_deleted_samples(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "restart.db"}')
    with TestClient(app) as client:
        client.post('/api/demo/sessions', json={'user_id': 1})
        samples = client.get(f'/api/memories?event_id={GEM}').json()
        assert len(samples) == 2
        private = next(card for card in samples if not card['publication'])
        published = next(card for card in samples if card['publication'])
        assert client.patch(f'/api/memories/{private["id"]}', json={'revision': private['revision'], 'story': '用户后来补写的真实文字。'}).status_code == 200
        assert client.delete(f'/api/memories/{published["id"]}/publication?revision={published["revision"]}').status_code == 200
        others = [card for card in client.get(f'/api/stories?event_id={GEM}').json() if not card['is_mine']]
        deleted_id = others[0]['id']
        with app.state.session_factory() as db:
            db.delete(db.get(MemoryCard, deleted_id))
            db.delete(db.get(SeedMigration, 'event-records-showcase-v1'))
            before = list(db.scalars(select(MemoryReceipt.id)))
            db.commit()
        initialize_database(app.state.session_factory.kw['bind'])
        initialize_database(app.state.session_factory.kw['bind'])
        assert client.get(f'/api/memories/{private["id"]}').json()['story'] == '用户后来补写的真实文字。'
        assert client.get(f'/api/stories/{published["id"]}').status_code == 404
        assert client.get(f'/api/stories/{deleted_id}').status_code == 404
        with app.state.session_factory() as db:
            assert list(db.scalars(select(MemoryReceipt.id))) == before


def test_event_samples_do_not_fill_personal_accounts(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "personal.db"}')
    with TestClient(app) as client:
        result = client.post('/api/accounts/register', json={'username': 'sample_check', 'password': 'correct-horse-123', 'display_name': '个人账号'})
        assert result.status_code == 201
        assert client.get('/api/memories').json() == []
