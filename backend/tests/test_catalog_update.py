import copy
import hashlib
import json
from pathlib import Path

import pytest

from app.catalog_update import CatalogError, apply_catalog, preview_catalog


@pytest.fixture
def catalog():
    return json.loads((Path(__file__).parents[1] / 'app' / 'footprint_catalog.json').read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_preview_classifies_changes_without_replacing_ids_or_writing(catalog, tmp_path):
    candidate=copy.deepcopy(catalog)
    original=candidate['events'][0]
    original['date']='2027-11-02'
    original.setdefault('source_references',[]).append({'url':'https://example.com/change','title':'改期公告','kind':'announcement','verified_on':'2026-10-01'})
    candidate['events'][1].update(event_status='cancelled',event_status_note='取消',cancellation_source_url='https://example.com/cancel',cancellation_source_title='取消公告',cancellation_verified_on='2026-10-01')
    new=copy.deepcopy(candidate['events'][2]);new['id']='new-announcement';new['date']='2027-01-01';candidate['events'].append(new)
    changes=preview_catalog(catalog,candidate)['changes']
    assert any(change['id']==original['id'] and '改期' in change['kinds'] for change in changes)
    assert any('取消' in change['kinds'] for change in changes)
    assert any('新增' in change['kinds'] for change in changes)
    assert catalog['events'][0]['date']!=original['date']


def test_removing_old_ids_or_duplicating_a_show_is_rejected(catalog):
    candidate=copy.deepcopy(catalog);candidate['events'].pop()
    with pytest.raises(CatalogError,match='删除'):preview_catalog(catalog,candidate)
    candidate=copy.deepcopy(catalog);new=copy.deepcopy(candidate['events'][0]);new['id']='another-id';candidate['events'].append(new)
    with pytest.raises(CatalogError,match='重复'):preview_catalog(catalog,candidate)


def test_confirmed_live_setlist_requires_event_specific_evidence(catalog):
    candidate=copy.deepcopy(catalog);event=next(event for event in candidate['events'] if event['date']<'2026-10-01' and event.get('event_status')!='cancelled')
    event['setlist_kind']='confirmed'
    with pytest.raises(CatalogError,match='歌单证据'):preview_catalog(catalog,candidate)
    event['setlist_evidence']={'event_id':event['id'],'url':'https://example.com/recording','title':'本场录像核对','kind':'recording','verified_on':'2026-10-01'}
    assert any('歌单' in change['kinds'] for change in preview_catalog(catalog,candidate)['changes'])
    event['setlist_evidence']['kind']='community'
    with pytest.raises(CatalogError,match='完整'):preview_catalog(catalog,candidate)


def test_audio_needs_provenance_and_a_playable_address_not_qq_search(catalog):
    candidate=copy.deepcopy(catalog);song=candidate['events'][0]['songs'][0]
    song['audio_url']=song['url']
    with pytest.raises(CatalogError,match='音源'):preview_catalog(catalog,candidate)
    song.update(audio_url='/api/audio/test.wav',audio_source_url='https://example.com/licensed',audio_source_title='授权音源说明',audio_authorization_note='比赛接口提供的音频')
    assert any('音源' in change['kinds'] for change in preview_catalog(catalog,candidate)['changes'])


def test_bad_dates_and_cancellation_without_evidence_are_rejected(catalog):
    candidate=copy.deepcopy(catalog);candidate['events'][0]['date']='2026-02-30'
    with pytest.raises(CatalogError,match='日期'):preview_catalog(catalog,candidate)
    candidate=copy.deepcopy(catalog);candidate['events'][0]['event_status']='cancelled'
    with pytest.raises(CatalogError,match='取消'):preview_catalog(catalog,candidate)


def test_apply_is_atomic_and_requires_matching_reviewed_base(catalog,tmp_path):
    path=tmp_path/'catalog.json';path.write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8')
    expected=digest(path);candidate=copy.deepcopy(catalog);candidate['events'][0]['title']+='（资料修正）'
    with pytest.raises(CatalogError,match='版本'):apply_catalog(path,candidate,'stale','lxy')
    assert digest(path)==expected
    result=apply_catalog(path,candidate,expected,'lxy')
    stored=json.loads(path.read_text(encoding='utf-8'))
    assert stored['events'][0]['id']==catalog['events'][0]['id']
    assert stored['change_history'][-1]['reviewer']=='lxy'
    assert stored['change_history'][-1]['base_sha256']==expected
    assert result['applied'] is True
    assert {file.name for file in tmp_path.iterdir()}=={'catalog.json'}


@pytest.mark.parametrize('coordinate',['bad',181,float('nan'),True])
def test_city_coordinates_and_names_are_validated(catalog,coordinate):
    candidate=copy.deepcopy(catalog);candidate['cities'][0]['lng']=coordinate
    with pytest.raises(CatalogError,match='城市坐标'):preview_catalog(catalog,candidate)
    candidate=copy.deepcopy(catalog);candidate['cities'][1]['name']=candidate['cities'][0]['name']
    with pytest.raises(CatalogError,match='城市名称重复'):preview_catalog(catalog,candidate)


def test_same_venue_cannot_have_conflicting_coordinates(catalog):
    candidate=copy.deepcopy(catalog);candidate['events'][0]['venue_lng']+=.02
    with pytest.raises(CatalogError,match='坐标不一致'):preview_catalog(catalog,candidate)


def test_cancelled_event_cannot_be_a_confirmed_live_setlist(catalog):
    candidate=copy.deepcopy(catalog);event=next(e for e in candidate['events'] if e.get('event_status')=='cancelled')
    event['setlist_kind']='confirmed';event['setlist_evidence']={'event_id':event['id'],'url':'https://example.com/recording','title':'本场录像','kind':'recording','verified_on':'2026-10-01'}
    with pytest.raises(CatalogError,match='取消.*歌单'):preview_catalog(catalog,candidate)


def test_preview_exposes_order_and_absent_to_null_changes(catalog):
    candidate=copy.deepcopy(catalog);candidate['artists'].reverse();candidate['events'].reverse();candidate['coverage_extra']=None
    event=candidate['events'][0];event['optional_note']=None
    report=preview_catalog(catalog,candidate)
    assert report['order_changes']['artists']['after']==[artist['id'] for artist in candidate['artists']]
    assert report['order_changes']['events']['after']==[e['id'] for e in candidate['events']]
    change=next(change for change in report['changes'] if change['id']==event['id'])
    assert change['fields']['optional_note']['before_present'] is False
    assert change['fields']['optional_note']['after_present'] is True
    assert report['metadata_changes']['coverage_extra']['after_present'] is True


def test_lock_and_write_failure_keep_original_and_clean_only_own_temps(catalog,tmp_path,monkeypatch):
    from app import catalog_update
    path=tmp_path/'catalog.json';path.write_text(json.dumps(catalog),encoding='utf-8');expected=digest(path)
    candidate=copy.deepcopy(catalog);candidate['events'][0]['title']+='修正'
    lock=path.with_name(path.name+'.update.lock');lock.write_text('another writer')
    with pytest.raises(CatalogError,match='正在写入'):apply_catalog(path,candidate,expected,'lxy')
    assert lock.read_text()=='another writer';lock.unlink()
    def fail(*args):raise OSError('simulated replace failure')
    monkeypatch.setattr(catalog_update.os,'replace',fail)
    with pytest.raises(OSError):apply_catalog(path,candidate,expected,'lxy')
    assert digest(path)==expected
    assert {file.name for file in tmp_path.iterdir()}=={'catalog.json'}


def test_late_external_edit_is_never_overwritten(catalog,tmp_path,monkeypatch):
    from app import catalog_update
    path=tmp_path/'catalog.json';raw=json.dumps(catalog).encode();path.write_bytes(raw);expected=digest(path)
    candidate=copy.deepcopy(catalog);candidate['events'][0]['title']+='修正'
    monkeypatch.setattr(catalog_update.os,'fsync',lambda _fd:path.write_bytes(raw+b' '))
    with pytest.raises(CatalogError,match='版本'):apply_catalog(path,candidate,expected,'lxy')
    assert path.read_bytes()==raw+b' '
    assert {file.name for file in tmp_path.iterdir()}=={'catalog.json'}
