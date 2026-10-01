"""Local, reviewed catalog maintenance. Never fetches sources or invents data.

Preview: python -m app.catalog_update candidate.json
Apply:   python -m app.catalog_update candidate.json --apply --expect-sha HASH --reviewer lxy
"""
import argparse
import copy
import hashlib
import json
import math
import os
import re
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from .footprints import CATALOG_PATH


class CatalogError(ValueError):
    pass


def _today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def _text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise CatalogError(f'{label}不能为空。')


def _date(value, label, *, checked=False):
    try:
        valid=isinstance(value,str) and date.fromisoformat(value).isoformat()==value
    except ValueError:
        valid=False
    if not valid or (checked and value>_today().isoformat()):
        raise CatalogError(f'{label}日期无效或核验日期在未来。')


def _url(value, label):
    try:
        parsed=urlsplit(value)
        valid=parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password
    except (ValueError,TypeError):
        valid=False
    if not valid:
        raise CatalogError(f'{label}需要有效的HTTPS来源地址。')


def _indexed(items, label):
    if not isinstance(items,list):
        raise CatalogError(f'{label}必须是列表。')
    found={}
    for item in items:
        if not isinstance(item,dict):
            raise CatalogError(f'{label}记录无效。')
        _text(item.get('id'),f'{label}ID')
        if item['id'] in found:
            raise CatalogError(f'{label}ID重复：{item["id"]}')
        found[item['id']]=item
    return found


def _coordinate(value, bound, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > bound:
        raise CatalogError(f'{label}无效。')


def _fields_before_after(before, after, excluded=()):
    # Missing keys and explicit nulls are different writes and must be reviewed.
    missing = object()
    return {
        key: {'before': before.get(key), 'after': after.get(key),
              'before_present': key in before, 'after_present': key in after}
        for key in sorted(before.keys() | after.keys())
        if key not in excluded and before.get(key, missing) != after.get(key, missing)
    }


def _validate(value):
    if not isinstance(value,dict):
        raise CatalogError('目录必须是JSON对象。')
    artists=_indexed(value.get('artists'),'歌手');cities=_indexed(value.get('cities'),'城市')
    for artist in artists.values():_text(artist.get('name'),'歌手名称')
    city_names=set()
    for city in cities.values():
        _text(city.get('name'),'城市名称')
        if city['name'] in city_names:
            raise CatalogError(f'城市名称重复：{city["name"]}')
        city_names.add(city['name'])
        for field, bound in (('lng', 180), ('lat', 85.05113)):
            _coordinate(city.get(field), bound, f'{city["name"]}城市坐标')
    events=_indexed(value.get('events'),'场次');seen=set();venue_coordinates={}
    _date(value.get('verified_on'),'目录核验',checked=True)
    for event in events.values():
        label=event['id']
        for field in ('title','city','venue','source_title'):
            _text(event.get(field),f'{label} {field}')
        if event.get('artist_id') not in artists or event['city'] not in city_names:
            raise CatalogError(f'{label}歌手或城市未收录。')
        _date(event.get('date'),f'{label}演出')
        _url(event.get('source_url'),f'{label}公告')
        _date(event.get('verified_on'),f'{label}核验',checked=True)
        if event.get('source_kind') not in {'announcement','report'}:
            raise CatalogError(f'{label}需要公告或报道类型。')
        references=event.get('source_references',[])
        if not isinstance(references,list):raise CatalogError(f'{label}来源列表无效。')
        for reference in references:
            if not isinstance(reference,dict):raise CatalogError(f'{label}来源记录无效。')
            _url(reference.get('url'),f'{label}补充来源');_text(reference.get('title'),f'{label}补充来源标题')
            _date(reference.get('verified_on'),f'{label}来源核验',checked=True)
        if event.get('time'):
            if not isinstance(event['time'],str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',event['time']):
                raise CatalogError(f'{label}开演时间无效。')
        else:
            _text(event.get('time_note'),f'{label}未知时间说明')
        key=(event['artist_id'],event['date'],event['city'],event['venue'])
        if key in seen:
            raise CatalogError(f'{label}重复收录同一日期／歌手／场馆；请修正原ID。')
        seen.add(key)
        status=event.get('event_status','scheduled')
        if status not in {'scheduled','cancelled'}:
            raise CatalogError(f'{label}演出状态无效。')
        if status=='cancelled':
            _text(event.get('event_status_note'),f'{label}取消说明')
            _url(event.get('cancellation_source_url'),f'{label}取消公告')
            _text(event.get('cancellation_source_title'),f'{label}取消公告标题')
            _date(event.get('cancellation_verified_on'),f'{label}取消核验',checked=True)
        coordinates=('venue_lng','venue_lat')
        if any(field in event for field in coordinates):
            for field,bound in zip(coordinates,(180,90)):
                _coordinate(event.get(field), bound, f'{label}场馆坐标')
            if event.get('venue_coordinate_system')!='WGS84':
                raise CatalogError(f'{label}坐标系必须明确为WGS84。')
            _url(event.get('venue_location_source'),f'{label}场馆坐标来源')
        venue_key=(event['city'],event['venue'])
        position=tuple(event.get(field) for field in coordinates)
        if venue_key in venue_coordinates and venue_coordinates[venue_key]!=position:
            raise CatalogError(f'{label}同一场馆坐标不一致，请同步修正相关场次。')
        venue_coordinates[venue_key]=position
        songs=event.get('songs')
        if not isinstance(songs,list) or len(songs)>200:
            raise CatalogError(f'{label}曲目列表无效或超过200首。')
        kind=event.get('setlist_kind')
        if kind not in {'confirmed','partial','artist_collection'}:
            raise CatalogError(f'{label}歌单类别无效。')
        _text(event.get('setlist_note'),f'{label}歌单说明')
        if kind in {'confirmed','partial'}:
            if status=='cancelled':
                raise CatalogError(f'{label}已取消，不能标记真实现场歌单。')
            proof=event.get('setlist_evidence',{})
            if not isinstance(proof,dict) or proof.get('event_id')!=label:
                raise CatalogError(f'{label}需要对应场次的歌单证据。')
            _url(proof.get('url'),f'{label}歌单证据')
            _text(proof.get('title'),f'{label}歌单证据标题')
            _date(proof.get('verified_on'),f'{label}歌单证据核验',checked=True)
            if proof.get('kind') not in {'official','recording','community'}:
                raise CatalogError(f'{label}歌单证据类型无效。')
            if kind=='confirmed' and proof['kind']=='community':
                raise CatalogError(f'{label}社区线索不能直接标记为完整确认歌单。')
            if event['date']>proof['verified_on']:
                raise CatalogError(f'{label}尚未演出，不能确认真实现场歌单。')
            if not songs:
                raise CatalogError(f'{label}确认歌单不能为空。')
        for song in songs:
            if not isinstance(song,dict):
                raise CatalogError(f'{label}曲目无效。')
            _text(song.get('title'),f'{label}歌名');_text(song.get('artist'),f'{label}曲目歌手')
            _url(song.get('url'),f'{label}曲目链接')
            if urlsplit(song['url']).hostname!='y.qq.com':
                raise CatalogError(f'{label}曲目链接只使用QQ音乐。')
            if song.get('audio_url'):
                audio=song['audio_url']
                if not isinstance(audio,str) or 'y.qq.com/n/ryqq' in audio:
                    raise CatalogError(f'{label}音源必须是音频资源，QQ搜索页不是音源。')
                if not audio.startswith('/api/audio/'):
                    _url(audio,f'{label}音源')
                _url(song.get('audio_source_url'),f'{label}音源来源')
                _text(song.get('audio_source_title'),f'{label}音源来源标题')
                _text(song.get('audio_authorization_note'),f'{label}音源授权说明')
    return events


def preview_catalog(current, candidate):
    old=_indexed(current.get('events'),'原场次');new=_validate(candidate)
    removed=old.keys()-new.keys()
    if removed:
        raise CatalogError('不能删除已有场次ID；取消／改期应修正原记录：'+', '.join(sorted(removed)))
    changes=[]
    for event_id,event in new.items():
        prior=old.get(event_id)
        fields=_fields_before_after(prior or {},event)
        if not fields:continue
        kinds=[]
        if prior is None:kinds.append('新增')
        else:
            if 'date' in fields or 'time' in fields:kinds.append('改期')
            if 'venue' in fields or 'city' in fields:kinds.append('换场馆')
            if event.get('event_status')=='cancelled' and prior.get('event_status')!='cancelled':kinds.append('取消')
            elif prior.get('event_status')=='cancelled' and event.get('event_status')!='cancelled':kinds.append('恢复')
            if any(key.startswith('setlist') for key in fields) or 'songs' in fields:kinds.append('歌单')
            if any(song.get('audio_url') for song in event['songs']) and event['songs']!=prior.get('songs'):kinds.append('音源')
        changes.append({'id':event_id,'kinds':kinds or ['资料修正'],'fields':fields})
    structure={}
    for field in ('artists','cities'):
        before=_indexed(current.get(field),field);after=_indexed(candidate.get(field),field)
        if before.keys()-after.keys():raise CatalogError(f'不能删除已有{field}ID。')
        structure[field]=[{'id':key,'before':before.get(key),'after':item} for key,item in after.items() if before.get(key)!=item]
    metadata=_fields_before_after(current,candidate,{'artists','cities','events','change_history','today','updated_on'})
    order={}
    for field in ('artists','cities','events'):
        before=[item['id'] for item in current[field]];after=[item['id'] for item in candidate[field]]
        if before!=after:order[field]={'before':before,'after':after}
    return {'changes':changes,'structure_changes':structure,'metadata_changes':metadata,'order_changes':order,'event_count':len(new),'warnings':['元数据校验不代表来源内容、授权或音频可播放性已经核实；写入前请人工核对。']}


def apply_catalog(path, candidate, expected_sha, reviewer):
    _text(reviewer,'审核人')
    path=Path(path).resolve();lock=path.with_name(path.name+'.update.lock');temporary=None
    try:
        handle=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    except FileExistsError as error:
        raise CatalogError('另一份目录更新正在写入，请稍后重试。') from error
    try:
        os.close(handle);raw=path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=expected_sha:
            raise CatalogError('目录版本已改变，请重新预览后再审核。')
        current=json.loads(raw);result=preview_catalog(current,candidate)
        if not result['changes'] and not any(result['structure_changes'].values()) and not result['metadata_changes'] and not result['order_changes']:
            return {**result,'applied':False}
        updated=copy.deepcopy(candidate);updated.pop('today',None)
        updated['updated_on']=_today().isoformat()
        updated['change_history']=[*current.get('change_history',[]),{'reviewer':reviewer,'reviewed_on':_today().isoformat(),'base_sha256':expected_sha,'changes':result['changes'],'structure_changes':result['structure_changes'],'metadata_changes':result['metadata_changes'],'order_changes':result['order_changes']}]
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,prefix=path.name+'.',suffix='.tmp',delete=False) as output:
            temporary=Path(output.name);json.dump(updated,output,ensure_ascii=False,indent=2);output.write('\n');output.flush();os.fsync(output.fileno())
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected_sha:
            raise CatalogError('目录版本已改变，未写入。')
        os.replace(temporary,path);temporary=None
        return {**result,'applied':True}
    finally:
        if temporary is not None:temporary.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser(description='预览并审核本地演出目录更新，不进行自动采集。')
    parser.add_argument('candidate',type=Path);parser.add_argument('--catalog',type=Path,default=CATALOG_PATH)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--expect-sha');parser.add_argument('--reviewer')
    args=parser.parse_args()
    try:
        candidate=json.loads(args.candidate.read_text(encoding='utf-8'))
        raw=args.catalog.read_bytes();base=hashlib.sha256(raw).hexdigest()
        if args.apply:
            if not args.expect_sha or not args.reviewer:raise CatalogError('写入需要预览版本--expect-sha和审核人--reviewer。')
            result=apply_catalog(args.catalog,candidate,args.expect_sha,args.reviewer)
        else:result={**preview_catalog(json.loads(raw),candidate),'base_sha256':base,'applied':False}
        print(json.dumps(result,ensure_ascii=False,indent=2));return 0
    except (CatalogError,OSError,json.JSONDecodeError) as error:
        print(str(error),file=sys.stderr);return 2


if __name__=='__main__':
    raise SystemExit(main())
