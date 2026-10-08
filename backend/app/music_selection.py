"""Music attached to a whole-concert note; never a second note or live setlist claim."""
import json
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator
from sqlalchemy import or_, select

from . import footprints
from .models import Song


class MusicSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['tracks', 'playlist']
    track_titles: list[StrictStr] = Field(min_length=1, max_length=120)

    @field_validator('track_titles')
    @classmethod
    def valid_titles(cls, value):
        if any(not title.strip() or len(title) > 160 for title in value) or len(set(value)) != len(value):
            raise ValueError('请选择不重复的有效曲目')
        return value


def selected_music(record):
    try:
        value = json.loads(record.music_selection_json or 'null')
        if isinstance(value, dict) and value.get('mode') in ('tracks', 'playlist') and isinstance(value.get('tracks'), list):
            return value
    except (ValueError, TypeError):
        pass
    return None


def selection_matches(snapshot, choice):
    return bool(snapshot and choice and snapshot['mode'] == choice.mode and
                [track['title'] for track in snapshot['tracks']] == choice.track_titles)


def capture_music(event_id, choice):
    if not event_id:
        raise HTTPException(422, '请先关联具体演出，再选择这一场的音乐。')
    catalog = footprints.load_catalog()
    event = next((event for event in catalog['events'] if event['id'] == event_id), None)
    if event is None:
        raise HTTPException(422, '找不到这个场次，请重新选择。')
    available = {track['title']: track for track in event.get('songs', [])}
    if any(title not in available for title in choice.track_titles):
        raise HTTPException(422, '曲目不在当前演出资料中，请重新选择。')
    if choice.mode == 'playlist' and choice.track_titles != list(available):
        raise HTTPException(409, '这份音乐资料已变化，请重新打开音乐选择后确认整个歌单。')
    tracks = [{key: available[title][key] for key in
               ('title', 'artist', 'url', 'platform', 'link_kind', 'source_url', 'source_title', 'verified_on')
               if key in available[title]} for title in choice.track_titles]
    return {'event_id': event_id, 'mode': choice.mode, 'tracks': tracks,
            'setlist_kind': event.get('setlist_kind', 'artist_collection'),
            'note': event.get('setlist_note') or '本场实际演出歌单与顺序待核实；此处仅为歌手关联作品。'}


def primary_song(db, user, music):
    first = music['tracks'][0]
    song = db.scalar(select(Song).where(Song.title == first['title'], Song.artist == first['artist'],
        Song.is_demo.is_(False), or_(Song.owner_id.is_(None), Song.owner_id == user.id)).order_by(Song.id).limit(1))
    if song is None:
        song = Song(owner_id=user.id, title=first['title'], artist=first['artist'],
                    version='演出关联作品', source_label='曲目资料，无授权音频', is_demo=False, audio_available=False)
        db.add(song)
        db.flush()
    return song
