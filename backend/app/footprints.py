"""Verified catalog, owner interests, attendance, and saved collection snapshots."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr
from sqlalchemy import delete, select, update
from .database_compat import conflict_insert
from sqlalchemy.orm import Session as OrmSession

from .models import ArtistFollow, ConcertPlaylist, EventWish, Footprint, User

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


class FollowInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    followed: StrictBool


class WishInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    wanted: StrictBool


class PlaylistRefreshInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_snapshot_version: StrictStr
    expected_current_version: StrictStr


def owner_footprints(db, user):
    return list(db.scalars(select(Footprint.event_id).where(Footprint.owner_id == user.id).order_by(Footprint.event_id)))


def owner_interests(db, user):
    return {
        'artist_ids': list(db.scalars(select(ArtistFollow.artist_id).where(
            ArtistFollow.owner_id == user.id).order_by(ArtistFollow.artist_id))),
        'wish_event_ids': list(db.scalars(select(EventWish.event_id).where(
            EventWish.owner_id == user.id).order_by(EventWish.event_id))),
    }


SNAPSHOT_EVIDENCE_FIELDS = (
    'source_url', 'source_title', 'source_kind', 'verified_on', 'source_references',
    'event_status_note', 'cancellation_source_url', 'cancellation_source_title',
    'cancellation_verified_on',
)
SONG_EVIDENCE_FIELDS = ('source_url', 'source_title', 'verified_on')
CONTENT_FIELDS = (
    'artist', 'date', 'city', 'venue', 'event_status', 'setlist_kind', 'setlist_note',
    'setlist_verified_on', 'setlist_evidence', *SNAPSHOT_EVIDENCE_FIELDS,
)


def content_version(snapshot):
    """Content and specific evidence change versions; catalog checks and links do not."""
    content = {field: snapshot.get(field) for field in CONTENT_FIELDS}
    content['songs'] = [
        {field: song.get(field) for field in ('title', 'artist', *SONG_EVIDENCE_FIELDS)}
        for song in snapshot.get('songs', [])
    ]
    encoded = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def build_snapshot(catalog, event):
    artist = next((item['name'] for item in catalog['artists'] if item['id'] == event['artist_id']), '')
    evidence = event.get('setlist_evidence')
    snapshot = {
        'name': f'{artist} · {event["city"]} · {event["date"]}',
        'artist': artist, 'date': event['date'], 'city': event['city'], 'venue': event['venue'],
        'songs': [
            {'title': song['title'], 'artist': song['artist'],
             **{field: song[field] for field in SONG_EVIDENCE_FIELDS if field in song}}
            for song in event['songs']
        ],
        'setlist_kind': event.get('setlist_kind', 'artist_collection'),
        'setlist_note': event.get('setlist_note'),
        'setlist_verified_on': event.get('setlist_verified_on') or (evidence or {}).get('verified_on'),
        'setlist_evidence': evidence,
        'event_status': event.get('event_status', 'scheduled'),
        'catalog_checked_on': catalog.get('verified_on'),
        **{field: event[field] for field in SNAPSHOT_EVIDENCE_FIELDS if field in event},
    }
    snapshot['snapshot_version'] = content_version(snapshot)
    return snapshot


def current_snapshot(catalog, event_id):
    event = next((item for item in catalog['events'] if item['id'] == event_id), None)
    return build_snapshot(catalog, event) if event is not None else None


def serialize_playlist(record, catalog=None):
    snapshot = json.loads(record.snapshot_json)
    current = current_snapshot(catalog if catalog is not None else load_catalog(), record.event_id)
    version = snapshot.get('snapshot_version') or content_version(snapshot)
    latest_version = current['snapshot_version'] if current is not None else None
    return {
        **snapshot, 'id': record.id, 'event_id': record.event_id,
        'created_at': record.created_at.isoformat(),
        'snapshot_version': version, 'current_version': latest_version,
        'update_available': latest_version is not None and version != latest_version,
        'current_setlist_kind': current['setlist_kind'] if current is not None else None,
        'current_setlist_verified_on': current['setlist_verified_on'] if current is not None else None,
        'legacy_snapshot': not bool(snapshot.get('snapshot_version')),
    }


def install_footprints(app, get_db, get_user):
    @app.get('/api/playlists')
    def playlists(db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        catalog = load_catalog()
        records = db.scalars(select(ConcertPlaylist).where(ConcertPlaylist.owner_id == user.id).order_by(ConcertPlaylist.id.desc()))
        return [serialize_playlist(record, catalog) for record in records]

    @app.get('/api/playlists/{playlist_id}')
    def playlist(playlist_id: int, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        record = db.scalar(select(ConcertPlaylist).where(ConcertPlaylist.id == playlist_id, ConcertPlaylist.owner_id == user.id)) if 0 < playlist_id < 2**63 else None
        if record is None:
            raise HTTPException(404, '这张歌单不存在。')
        return serialize_playlist(record)

    @app.put('/api/playlists/concerts/{event_id}')
    def save_concert_playlist(event_id: str, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        catalog = load_catalog()
        record = db.scalar(select(ConcertPlaylist).where(ConcertPlaylist.owner_id == user.id, ConcertPlaylist.event_id == event_id))
        if record is not None:
            return serialize_playlist(record, catalog)
        event = next((item for item in catalog['events'] if item['id'] == event_id), None)
        if event is None:
            raise HTTPException(422, '找不到这个场次，请重新选择。')
        if not event['songs']:
            raise HTTPException(422, '这场还没有曲目，暂时不能收藏。')
        snapshot = build_snapshot(catalog, event)
        db.execute(conflict_insert(db, ConcertPlaylist).values(owner_id=user.id, event_id=event_id, snapshot_json=json.dumps(snapshot, ensure_ascii=False)).on_conflict_do_nothing(index_elements=['owner_id', 'event_id']))
        db.commit()
        record = db.scalar(select(ConcertPlaylist).where(ConcertPlaylist.owner_id == user.id, ConcertPlaylist.event_id == event_id))
        return serialize_playlist(record, catalog)

    @app.delete('/api/playlists/concerts/{event_id}', status_code=204)
    def remove_concert_playlist(event_id: str, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        # Unsave even if the catalog entry has since disappeared. Other owners'
        # snapshots and attendance records are unaffected.
        db.execute(delete(ConcertPlaylist).where(ConcertPlaylist.owner_id == user.id,
                                                 ConcertPlaylist.event_id == event_id))
        db.commit()
        return Response(status_code=204)

    @app.post('/api/playlists/{playlist_id}/refresh')
    def refresh_playlist(playlist_id: int, data: PlaylistRefreshInput,
                         db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        record = db.scalar(select(ConcertPlaylist).where(ConcertPlaylist.id == playlist_id,
            ConcertPlaylist.owner_id == user.id)) if 0 < playlist_id < 2**63 else None
        if record is None:
            raise HTTPException(404, '这张歌单不存在。')
        previous_json = record.snapshot_json
        snapshot = json.loads(previous_json)
        version = snapshot.get('snapshot_version') or content_version(snapshot)
        catalog = load_catalog()
        current = current_snapshot(catalog, record.event_id)
        if (version != data.expected_snapshot_version or current is None
                or current['snapshot_version'] != data.expected_current_version):
            raise HTTPException(409, '歌单或目录已有更新，请重新查看后再确认。')
        if not current['songs']:
            raise HTTPException(422, '这场还没有曲目，暂时不能更新收藏。')
        result = db.execute(update(ConcertPlaylist).where(
            ConcertPlaylist.id == record.id, ConcertPlaylist.owner_id == user.id,
            ConcertPlaylist.snapshot_json == previous_json,
        ).values(snapshot_json=json.dumps(current, ensure_ascii=False)).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, '歌单已有更新，请重新查看后再确认。')
        db.commit()
        db.refresh(record)
        return serialize_playlist(record, catalog)

    @app.get('/api/footprints/catalog')
    def catalog():
        return load_catalog()

    @app.get('/api/footprints/interests')
    def interests(db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        return owner_interests(db, user)

    @app.put('/api/footprints/follows/{artist_id}')
    def set_follow(artist_id: str, data: FollowInput,
                   db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        if not any(artist['id'] == artist_id for artist in load_catalog()['artists']):
            raise HTTPException(422, '找不到这位歌手，请重新选择。')
        if data.followed:
            db.execute(conflict_insert(db, ArtistFollow).values(owner_id=user.id, artist_id=artist_id).on_conflict_do_nothing())
        else:
            db.execute(delete(ArtistFollow).where(ArtistFollow.owner_id == user.id, ArtistFollow.artist_id == artist_id))
        db.commit()
        return owner_interests(db, user)

    @app.put('/api/footprints/wishes/{event_id}')
    def set_wish(event_id: str, data: WishInput,
                 db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        if data.wanted:
            catalog = load_catalog()
            event = next((item for item in catalog['events'] if item['id'] == event_id), None)
            if event is None:
                raise HTTPException(422, '找不到这个场次，请重新选择。')
            today = catalog.get('today') or datetime.now(timezone(timedelta(hours=8))).date().isoformat()
            if event.get('event_status') == 'cancelled' or event['date'] < today:
                raise HTTPException(422, '只能把尚未结束且未取消的场次加入想去。')
            db.execute(conflict_insert(db, EventWish).values(owner_id=user.id, event_id=event_id).on_conflict_do_nothing())
        else:
            db.execute(delete(EventWish).where(EventWish.owner_id == user.id, EventWish.event_id == event_id))
        db.commit()
        return owner_interests(db, user)

    @app.get('/api/footprints')
    def list_footprints(db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        return owner_footprints(db, user)

    @app.put('/api/footprints/{event_id}')
    def set_attendance(event_id: str, data: AttendanceInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        validate_event(event_id, past=data.attended)
        if data.attended:
            db.execute(conflict_insert(db, Footprint).values(owner_id=user.id, event_id=event_id).on_conflict_do_nothing())
        else:
            db.execute(delete(Footprint).where(Footprint.owner_id == user.id, Footprint.event_id == event_id))
        db.commit()
        return owner_footprints(db, user)
