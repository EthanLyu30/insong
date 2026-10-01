"""Verified event catalog and owner-scoped attendance."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session as OrmSession

from .models import ConcertPlaylist, Footprint, User

CATALOG_PATH = Path(__file__).with_name('footprint_catalog.json')


def load_catalog():
    if not CATALOG_PATH.is_file():
        return {'artists': [], 'events': []}
    value = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    value['today'] = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    return value


def validate_event(event_id, *, past=False):
    if event_id is None:
        return
    event = next((item for item in load_catalog()['events'] if item['id'] == event_id), None)
    if event is None:
        raise HTTPException(422, '找不到这个场次，请重新选择。')
    if past and event.get('event_status') == 'cancelled':
        raise HTTPException(422, '这场演出已取消，不能标记到场。')
    if past and event['date'] > datetime.now(timezone(timedelta(hours=8))).date().isoformat():
        raise HTTPException(422, '演出发生后才能标记到场。')


class AttendanceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    attended: StrictBool


def owner_footprints(db, user):
    return list(db.scalars(select(Footprint.event_id).where(Footprint.owner_id == user.id).order_by(Footprint.event_id)))


def serialize_playlist(record):
    return {
        **json.loads(record.snapshot_json), 'id': record.id, 'event_id': record.event_id,
        'created_at': record.created_at.isoformat(),
    }


def install_footprints(app, get_db, get_user):
    @app.get('/api/playlists')
    def playlists(db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        records = db.scalars(select(ConcertPlaylist).where(ConcertPlaylist.owner_id == user.id).order_by(ConcertPlaylist.id.desc()))
        return [serialize_playlist(record) for record in records]

    @app.get('/api/playlists/{playlist_id}')
    def playlist(playlist_id: int, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        record = db.scalar(select(ConcertPlaylist).where(ConcertPlaylist.id == playlist_id, ConcertPlaylist.owner_id == user.id)) if 0 < playlist_id < 2**63 else None
        if record is None:
            raise HTTPException(404, '这张歌单不存在。')
        return serialize_playlist(record)

    @app.put('/api/playlists/concerts/{event_id}')
    def save_concert_playlist(event_id: str, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        catalog = load_catalog()
        event = next((item for item in catalog['events'] if item['id'] == event_id), None)
        if event is None:
            raise HTTPException(422, '找不到这个场次，请重新选择。')
        if not event['songs']:
            raise HTTPException(422, '这场还没有曲目，暂时不能收藏。')
        artist = next((item['name'] for item in catalog['artists'] if item['id'] == event['artist_id']), '')
        snapshot = {
            'name': f'{artist} · {event["city"]} · {event["date"]}',
            'artist': artist, 'date': event['date'], 'city': event['city'], 'venue': event['venue'],
            'songs': [{'title': song['title'], 'artist': song['artist']} for song in event['songs']],
            'setlist_kind': event.get('setlist_kind', 'artist_collection'),
        }
        db.execute(insert(ConcertPlaylist).values(owner_id=user.id, event_id=event_id, snapshot_json=json.dumps(snapshot, ensure_ascii=False)).on_conflict_do_nothing(index_elements=['owner_id', 'event_id']))
        db.commit()
        record = db.scalar(select(ConcertPlaylist).where(ConcertPlaylist.owner_id == user.id, ConcertPlaylist.event_id == event_id))
        return serialize_playlist(record)

    @app.get('/api/footprints/catalog')
    def catalog():
        return load_catalog()

    @app.get('/api/footprints')
    def list_footprints(db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        return owner_footprints(db, user)

    @app.put('/api/footprints/{event_id}')
    def set_attendance(event_id: str, data: AttendanceInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        validate_event(event_id, past=data.attended)
        if data.attended:
            db.execute(insert(Footprint).values(owner_id=user.id, event_id=event_id).on_conflict_do_nothing())
        else:
            db.execute(delete(Footprint).where(Footprint.owner_id == user.id, Footprint.event_id == event_id))
        db.commit()
        return owner_footprints(db, user)
