"""Owner-scoped memory writes, optimistic concurrency, and exact original text."""
import json
from uuid import uuid4
from datetime import datetime
from typing import Literal

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator, model_validator
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from .media import serialize_song, song_audio, can_read_song
from .models import MemoryCard, MemoryCardTag, MemoryReceipt, PublicStory, Song, User, utc_now
from .content import selected_lyric, THEME_IDS
from .photos import photo_url, validate_owned_photo
from .event_snapshots import capture_event, event_snapshot, snapshot_json
from .card_metadata import gallery_ids, memory_tags, normalize_tags, serialize_photos, set_memory_tags
from .manual_recording import ManualSong, ManualEvent
from .music_selection import MusicSelection, selected_music, capture_music, selection_matches, primary_song


class Coordinates(BaseModel):
    music_selection: MusicSelection | None = None
    title: str | None = Field(default=None, max_length=80)
    tags: list[StrictStr] = Field(default_factory=list)
    photo_ids: list[StrictStr] = Field(default_factory=list, max_length=9)
    lyric_id: str | None = Field(default=None, max_length=40)
    life_year: int | None = Field(default=None, ge=1900, strict=True)
    theme_id: str | None = Field(default=None, max_length=40)
    end_ms: StrictInt | None = Field(default=None, ge=0)
    photo_id: str | None = Field(default=None, min_length=1, max_length=36)
    event_id: str | None = Field(default=None, min_length=1, max_length=100)
    location_name: str | None = Field(default=None, max_length=160)
    event_input: ManualEvent | None = None

    @model_validator(mode='after')
    def exclusive_event(self):
        if self.event_id is not None and self.event_input is not None:
            raise ValueError('请选择已收录场次或手动填写演出，不能同时关联两种资料')
        return self

    @field_validator('title', mode='before')
    @classmethod
    def trimmed_title(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    @field_validator('location_name', mode='before')
    @classmethod
    def trimmed_location(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    @field_validator('tags')
    @classmethod
    def canonical_tags(cls, value):
        return normalize_tags(value)

    @field_validator('photo_ids')
    @classmethod
    def valid_photo_ids(cls, value):
        if any(not 1 <= len(photo_id) <= 36 for photo_id in value):
            raise ValueError('照片标识无效')
        return list(dict.fromkeys(value))

    @field_validator('life_year')
    @classmethod
    def past_year(cls, value):
        if value is not None and value > datetime.now().year:
            raise ValueError('请选择已经发生的年份')
        return value

    @field_validator('theme_id')
    @classmethod
    def known_theme(cls, value):
        if value is not None and value not in THEME_IDS:
            raise ValueError('找不到这个主题')
        return value


class PublicationConsent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    share_life_time: StrictBool = False
    anonymous: StrictBool = True
    confirmed: StrictBool

    @field_validator('confirmed')
    @classmethod
    def explicit_consent(cls, value):
        if not value:
            raise ValueError('请先确认公开内容')
        return value


class CreateMemory(Coordinates):
    model_config = ConfigDict(extra='forbid')
    song_id: int | None = Field(default=None, gt=0, lt=2**63, strict=True)
    song_input: ManualSong | None = None
    story: str = Field(min_length=1, max_length=500)
    offset_ms: StrictInt | None = Field(default=None, ge=0)
    life_time: str | None = Field(default=None, max_length=80)
    life_precision: str = 'unknown'
    request_key: str = Field(min_length=10, max_length=80)
    publication: PublicationConsent | None = None

    @model_validator(mode='after')
    def one_song(self):
        if sum(value is not None for value in (self.song_id, self.song_input, self.music_selection)) != 1:
            raise ValueError('请选择歌曲或填写歌名与歌手')
        if self.music_selection and (self.offset_ms is not None or self.end_ms is not None or self.lyric_id is not None):
            raise ValueError('演出音乐集合不支持单曲片段或歌词位置')
        return self

    @field_validator('story')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('写一句想留住的线索吧')
        return value.strip()

    @field_validator('life_precision')
    @classmethod
    def precision(cls, value):
        if value not in ('unknown', 'day', 'month', 'year', 'range'):
            raise ValueError('不支持的时间精度')
        return value


class EditMemory(Coordinates):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=1, strict=True)
    story: str | None = Field(default=None, min_length=1, max_length=500)
    offset_ms: StrictInt | None = Field(default=None, ge=0)
    life_time: str | None = Field(default=None, max_length=80)
    life_precision: str | None = None

    @field_validator('story')
    @classmethod
    def nonblank(cls, value):
        if value is None or not value.strip():
            raise ValueError('原文不能为空')
        return value.strip()

    @field_validator('life_precision')
    @classmethod
    def precision(cls, value):
        return CreateMemory.precision(value)


class ReflectionInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=1, strict=True)
    text: str = Field(default='', max_length=500)
    mood: Literal['happy', 'moved', 'miss', 'peaceful', 'brave'] | None = None
    photo_id: str | None = Field(default=None, min_length=1, max_length=36)

    @field_validator('text')
    @classmethod
    def trimmed(cls, value):
        return value.strip()

    @model_validator(mode='after')
    def has_content(self):
        if not (self.text or self.mood or self.photo_id):
            raise ValueError('留下一句、一个心情或一张照片吧')
        return self


def serialize_reflection(note):
    return {'text': '', 'mood': None, 'photo_id': None, **note,
            'photo_url': photo_url(note.get('photo_id'))}


def serialize_memory(card):
    return {key: getattr(card, key) for key in (
        'id', 'owner_id', 'song_id', 'story', 'life_time', 'life_precision', 'scene',
        'visibility', 'is_demo_sample', 'offset_ms', 'end_ms', 'photo_id', 'event_id',
        'revision', 'lyric_id', 'life_year', 'theme_id', 'title', 'location_name',
    )} | {
        'owner_display_name': card.owner.display_name,
        'music_selection': selected_music(card),
        'event_snapshot': event_snapshot(card),
        'tags': memory_tags(card), 'photos': serialize_photos(card),
        'created_at': card.created_at.isoformat(), 'updated_at': card.updated_at.isoformat(),
        'photo_url': photo_url(card.photo_id),
        'reflections': [serialize_reflection(note) for note in json.loads(card.reflections_json)],
        'song': serialize_song(card.song),
        'lyric': selected_lyric(card.song, card.lyric_id),
        'publication': None if card.publication is None else {
            'published': card.publication.published, 'excerpt': card.publication.excerpt,
            'share_life_time': card.publication.share_life_time, 'anonymous': card.publication.anonymous,
            'photo_id': card.publication.photo_id, 'photo_url': photo_url(card.publication.photo_id),
            'offset_ms': card.publication.offset_ms, 'end_ms': card.publication.end_ms,
            'event_id': card.publication.event_id,
            'event_snapshot': event_snapshot(card.publication),
            'music_selection': selected_music(card.publication),
            'title': card.publication.title, 'tags': json.loads(card.publication.tags_json),
            'photos': serialize_photos(card.publication),
        },
    }


def owner_card(db, memory_id, user):
    if not 0 < memory_id < 2**63:
        raise HTTPException(404, '这段音乐记忆已经不可见。')
    card = db.scalar(select(MemoryCard).where(MemoryCard.id == memory_id, MemoryCard.owner_id == user.id))
    if card is None:
        raise HTTPException(404, '这段音乐记忆已经不可见。')
    return card


def validate_anchor(song, offset, end=None):
    if offset is None and end is None:
        return
    info = song_audio(song)
    if offset is None or not info['audio_available'] or offset >= info['duration_ms']:
        raise HTTPException(422, '这个版本的音乐位置不可用，请重新选择或仅保存歌曲。')
    if end is not None and not offset < end <= info['duration_ms']:
        raise HTTPException(422, '结束位置须晚于起点，且不能超过歌曲时长。')


def validate_lyric(song, lyric_id, offset):
    if lyric_id is not None:
        line = selected_lyric(song, lyric_id)
        if line is None or line['start_ms'] != offset:
            raise HTTPException(422, '词句与音乐位置不一致，请重新选择。')


def resolve_gallery(data, card=None):
    """An explicit gallery bounds its cover; legacy single-cover edits stay valid."""
    if 'photo_ids' in data.model_fields_set:
        ids = data.photo_ids
        cover = data.photo_id if 'photo_id' in data.model_fields_set else (card.photo_id if card and card.photo_id in ids else (ids[0] if ids else None))
        if cover is not None and cover not in ids:
            raise HTTPException(422, '封面必须选自这张卡的照片。')
        if ids and cover is None:
            cover = ids[0]
        return ids, cover
    if 'photo_id' in data.model_fields_set:
        cover = data.photo_id
        previous = gallery_ids(card) if card else []
        if cover and cover in previous:
            return previous, cover
        return ([cover] if cover else []), cover
    return (gallery_ids(card), card.photo_id) if card else ([], None)


def validate_gallery(db, ids, user):
    for photo_id in ids:
        validate_owned_photo(db, photo_id, user)


def update_card(db, card, revision, values, withdraw=False):
    # Claim the revision before flushing a new publication. Two first publishers
    # must conflict here rather than collide on the public_stories primary key.
    with db.no_autoflush:
        result = db.execute(update(MemoryCard).where(
            MemoryCard.id == card.id, MemoryCard.owner_id == card.owner_id, MemoryCard.revision == revision,
        ).values(**values, revision=revision + 1, updated_at=utc_now()), execution_options={'synchronize_session': False})
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, '这段记忆已在其他页面更新，请重新打开后再修改。')
    if withdraw:
        db.execute(update(PublicStory).where(PublicStory.memory_id == card.id).values(
            published=False, version=PublicStory.version + 1), execution_options={'synchronize_session': False})
    db.commit()
    db.expire_all()
    db.refresh(card)
    return serialize_memory(card)


def set_publication_snapshot(card, excerpt, consent, user):
    """Creation and later sharing use the same explicitly consented snapshot."""
    public = card.publication
    if public is None:
        public = PublicStory(memory_id=card.id, version=0)
        card.publication = public
    public.excerpt, public.title = excerpt, card.title
    public.tags_json = json.dumps(memory_tags(card), ensure_ascii=False)
    public.photo_ids_json = json.dumps(gallery_ids(card))
    public.share_life_time = consent.share_life_time
    public.life_time = card.life_time if consent.share_life_time else None
    public.life_year = card.life_year if consent.share_life_time else None
    public.anonymous = consent.anonymous
    public.author_name = '匿名听友' if consent.anonymous else user.display_name
    public.offset_ms, public.lyric_id, public.theme_id = card.offset_ms, card.lyric_id, card.theme_id
    public.photo_id, public.end_ms, public.event_id = card.photo_id, card.end_ms, card.event_id
    public.event_snapshot_json = card.event_snapshot_json
    public.music_selection_json = card.music_selection_json
    public.published, public.published_at = True, utc_now()
    public.version += 1


def install_memories(app, get_db, get_user):
    def retry_result(existing, data):
        fields = ('story', 'offset_ms', 'end_ms', 'event_id', 'title',
                  'life_time', 'life_precision', 'lyric_id', 'life_year', 'theme_id', 'location_name')
        ids, cover = resolve_gallery(data)
        song_matches = (selection_matches(selected_music(existing), data.music_selection) if data.music_selection else
                        existing.song_id == data.song_id if data.song_input is None else
                        existing.song.owner_id == existing.owner_id and existing.song.title == data.song_input.title and existing.song.artist == data.song_input.artist)
        if not data.music_selection and selected_music(existing):
            song_matches = False
        saved_event = event_snapshot(existing)
        manual_matches = (saved_event == data.event_input.snapshot() if data.event_input else not saved_event or not saved_event.get('manual'))
        if (not song_matches or not manual_matches or any(getattr(existing, key) != getattr(data, key) for key in fields)
                or existing.photo_id != cover or gallery_ids(existing) != ids or memory_tags(existing) != data.tags):
            raise HTTPException(409, '先前提交的内容已经保存。请先到“我的记忆”确认，再在那张卡上继续修改；这里的文字仍保留着。')
        public = existing.publication
        # Replaying creation never publishes, revokes, or changes an existing snapshot.
        if data.publication:
            if (not public or not public.published or public.excerpt != data.story
                    or public.anonymous != data.publication.anonymous
                    or public.share_life_time != data.publication.share_life_time):
                raise HTTPException(409, '这段记忆的可见范围已经变化，请到“我的记忆”确认后再调整。')
        elif public and public.published:
            raise HTTPException(409, '这段记忆已公开，请到“我的记忆”调整可见范围。')
        return serialize_memory(existing)

    def prior_request(db, data, user):
        receipt = db.scalar(select(MemoryReceipt).where(MemoryReceipt.owner_id == user.id, MemoryReceipt.request_key == data.request_key))
        if receipt is None:
            return None
        card = db.get(MemoryCard, receipt.id)
        if card is None:
            raise HTTPException(409, '这次提交的记忆已被删除，不能通过重试恢复。若要重新记录，请新开一张卡。')
        return retry_result(card, data)

    @app.get('/api/memories')
    def list_memories(song_id: int | None = None, event_id: str | None = None,
                      db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        query = select(MemoryCard).where(MemoryCard.owner_id == user.id)
        if song_id is not None:
            if not 0 < song_id < 2**63:
                return []
            query = query.where(MemoryCard.song_id == song_id)
        if event_id is not None:
            query = query.where(MemoryCard.event_id == event_id)
        return [serialize_memory(card) for card in db.scalars(query.order_by(MemoryCard.created_at.desc(), MemoryCard.id.desc()))]

    @app.post('/api/memories', status_code=201)
    def create_memory(data: CreateMemory, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        previous = prior_request(db, data, user)
        if previous is not None:
            return previous
        music = capture_music(data.event_id, data.music_selection) if data.music_selection else None
        song = (None if music else db.get(Song, data.song_id) if data.song_id is not None else db.scalar(select(Song).where(
            Song.owner_id == user.id, Song.title == data.song_input.title, Song.artist == data.song_input.artist)))
        if data.song_id is not None and not can_read_song(db, song, user):
            raise HTTPException(404, '找不到这首歌。')
        if song is not None:
            validate_anchor(song, data.offset_ms, data.end_ms)
            validate_lyric(song, data.lyric_id, data.offset_ms)
        elif data.offset_ms is not None or data.end_ms is not None or data.lyric_id is not None:
            raise HTTPException(422, '手动填写的歌曲没有可用音源或歌词位置。')
        ids, cover = resolve_gallery(data)
        validate_gallery(db, ids, user)
        captured_event = data.event_input.snapshot() if data.event_input else capture_event(data.event_id)
        try:
            receipt = MemoryReceipt(owner_id=user.id, request_key=data.request_key)
            db.add(receipt)
            db.flush()
            if music:
                song = primary_song(db, user, music)
            elif song is None:
                song = Song(title=data.song_input.title, artist=data.song_input.artist, owner_id=user.id,
                            version='手动填写', source_label='', is_demo=False, audio_available=False)
                db.add(song)
                db.flush()
            values = data.model_dump(exclude={'tags', 'photo_ids', 'photo_id', 'publication', 'song_input', 'event_input', 'music_selection'})
            values['song_id'] = song.id
            card = MemoryCard(id=receipt.id, **values, photo_id=cover, photo_ids_json=json.dumps(ids),
                              event_snapshot_json=snapshot_json(captured_event),
                              music_selection_json=snapshot_json(music),
                              owner_id=user.id, visibility='private', is_demo_sample=user.is_demo)
            db.add(card)
            set_memory_tags(db, card, data.tags)
            if data.publication:
                set_publication_snapshot(card, data.story, data.publication, user)
            db.commit()
        except IntegrityError:
            db.rollback()
            previous = prior_request(db, data, user)
            if previous is not None:
                return previous
            raise
        return serialize_memory(card)

    @app.patch('/api/memories/{memory_id}')
    def edit_memory(memory_id: int, data: EditMemory, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        values = data.model_dump(exclude_unset=True, exclude={'revision', 'tags', 'photo_ids', 'event_input', 'music_selection'})
        music = selected_music(card)
        if data.music_selection:
            target_event = values.get('event_id', card.event_id)
            if not (selection_matches(music, data.music_selection) and music['event_id'] == target_event):
                music = capture_music(target_event, data.music_selection)
            if data.event_input or any(values.get(key) is not None for key in ('offset_ms', 'end_ms', 'lyric_id')):
                raise HTTPException(422, '演出音乐集合不支持手动场次或单曲片段。')
            values.update(music_selection_json=snapshot_json(music), song_id=primary_song(db, user, music).id,
                          offset_ms=None, end_ms=None, lyric_id=None)
        elif 'music_selection' in data.model_fields_set:
            music = None
            values['music_selection_json'] = None
        if music and (data.event_input or values.get('event_id', card.event_id) != music['event_id']):
            raise HTTPException(422, '请为新场次重新选择音乐，或先取消原场次音乐关联。')
        if 'offset_ms' in values:
            if 'lyric_id' not in values and values['offset_ms'] != card.offset_ms:
                values['lyric_id'] = None
        validate_anchor(card.song, values.get('offset_ms', card.offset_ms), values.get('end_ms', card.end_ms))
        validate_lyric(card.song, values.get('lyric_id', card.lyric_id), values.get('offset_ms', card.offset_ms))
        if {'photo_id', 'photo_ids'} & data.model_fields_set:
            ids, cover = resolve_gallery(data, card)
            validate_gallery(db, ids, user)
            values.update(photo_id=cover, photo_ids_json=json.dumps(ids))
        if data.event_input is not None:
            values.update(event_id=None, event_snapshot_json=snapshot_json(data.event_input.snapshot()))
        elif ('event_id' in values and values['event_id'] != card.event_id
              or 'event_input' in data.model_fields_set and event_snapshot(card) and event_snapshot(card).get('manual')):
            values['event_snapshot_json'] = snapshot_json(capture_event(values.get('event_id')))
        changed = any(getattr(card, key) != value for key, value in values.items())
        if 'tags' in data.model_fields_set:
            changed = changed or memory_tags(card) != data.tags
            # Claim the revision before pending links flush in update_card.
            with db.no_autoflush:
                set_memory_tags(db, card, data.tags)
        return update_card(db, card, data.revision, values, withdraw=changed)

    @app.post('/api/memories/{memory_id}/reflections')
    def reflect(memory_id: int, data: ReflectionInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        validate_owned_photo(db, data.photo_id, user)
        notes = json.loads(card.reflections_json)
        if len(notes) >= 50:
            raise HTTPException(422, '这张卡已有50次补充，可以为今天新留一张卡。')
        notes.append({'id': str(uuid4()), 'text': data.text, 'mood': data.mood,
                      'photo_id': data.photo_id, 'created_at': utc_now().isoformat()})
        return update_card(db, card, data.revision, {'reflections_json': json.dumps(notes, ensure_ascii=False)})

    @app.delete('/api/memories/{memory_id}', status_code=204)
    def remove(memory_id: int, revision: int = Query(ge=1), db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        if card.revision != revision:
            raise HTTPException(409, '这段记忆已经更新，请重新打开后再删除。')
        db.execute(delete(MemoryCardTag).where(MemoryCardTag.memory_card_id == card.id))
        result = db.execute(delete(MemoryCard).where(MemoryCard.id == card.id, MemoryCard.owner_id == user.id, MemoryCard.revision == revision))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, '这段记忆已经更新，请重新打开后再删除。')
        db.commit()
