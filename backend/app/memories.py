"""Owner-scoped memory writes, optimistic concurrency, and exact original text."""
import json
from uuid import uuid4

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from .media import serialize_song, song_audio
from .models import MemoryCard, MemoryCardTag, MemoryReceipt, Song, User, utc_now


class CreateMemory(BaseModel):
    model_config = ConfigDict(extra='forbid')
    song_id: int = Field(gt=0, lt=2**63, strict=True)
    story: str = Field(min_length=1, max_length=500)
    offset_ms: StrictInt | None = Field(default=None, ge=0)
    life_time: str | None = Field(default=None, max_length=80)
    life_precision: str = 'unknown'
    request_key: str = Field(min_length=10, max_length=80)

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


class EditMemory(BaseModel):
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
    text: str = Field(min_length=1, max_length=500)

    @field_validator('text')
    @classmethod
    def nonblank(cls, value):
        return CreateMemory.nonblank(value)


def serialize_memory(card):
    return {key: getattr(card, key) for key in (
        'id', 'owner_id', 'song_id', 'story', 'life_time', 'life_precision', 'scene',
        'visibility', 'is_demo_sample', 'offset_ms', 'revision',
    )} | {
        'owner_display_name': card.owner.display_name,
        'tags': [link.tag.name for link in card.tag_links],
        'created_at': card.created_at.isoformat(), 'updated_at': card.updated_at.isoformat(),
        'reflections': json.loads(card.reflections_json), 'song': serialize_song(card.song),
    }


def owner_card(db, memory_id, user):
    if not 0 < memory_id < 2**63:
        raise HTTPException(404, '这段音乐记忆已经不可见。')
    card = db.scalar(select(MemoryCard).where(MemoryCard.id == memory_id, MemoryCard.owner_id == user.id))
    if card is None:
        raise HTTPException(404, '这段音乐记忆已经不可见。')
    return card


def validate_anchor(song, offset):
    if offset is None:
        return
    info = song_audio(song)
    if not info['audio_available'] or offset >= info['duration_ms']:
        raise HTTPException(422, '这个版本的音乐位置不可用，请重新选择或仅保存歌曲。')


def update_card(db, card, revision, values):
    result = db.execute(update(MemoryCard).where(
        MemoryCard.id == card.id, MemoryCard.owner_id == card.owner_id, MemoryCard.revision == revision,
    ).values(**values, revision=revision + 1, updated_at=utc_now()), execution_options={'synchronize_session': False})
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, '这段记忆已在其他页面更新，请重新打开后再修改。')
    db.commit()
    db.refresh(card)
    return serialize_memory(card)


def install_memories(app, get_db, get_user):
    def retry_result(existing, data):
        fields = ('song_id', 'story', 'offset_ms', 'life_time', 'life_precision')
        if any(getattr(existing, key) != getattr(data, key) for key in fields):
            raise HTTPException(409, '先前提交的内容已经保存。请先到“我的记忆”确认，再在那张卡上继续修改；这里的文字仍保留着。')
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
    def list_memories(song_id: int | None = None, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        query = select(MemoryCard).where(MemoryCard.owner_id == user.id)
        if song_id is not None:
            if not 0 < song_id < 2**63:
                return []
            query = query.where(MemoryCard.song_id == song_id)
        return [serialize_memory(card) for card in db.scalars(query.order_by(MemoryCard.created_at.desc(), MemoryCard.id.desc()))]

    @app.post('/api/memories', status_code=201)
    def create_memory(data: CreateMemory, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        previous = prior_request(db, data, user)
        if previous is not None:
            return previous
        song = db.get(Song, data.song_id)
        if song is None:
            raise HTTPException(404, '找不到这首歌。')
        validate_anchor(song, data.offset_ms)
        try:
            receipt = MemoryReceipt(owner_id=user.id, request_key=data.request_key)
            db.add(receipt)
            db.flush()
            card = MemoryCard(id=receipt.id, **data.model_dump(), owner_id=user.id, visibility='private', is_demo_sample=user.is_demo)
            db.add(card)
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
        values = data.model_dump(exclude_unset=True, exclude={'revision'})
        if 'offset_ms' in values:
            validate_anchor(card.song, values['offset_ms'])
        return update_card(db, card, data.revision, values)

    @app.post('/api/memories/{memory_id}/reflections')
    def reflect(memory_id: int, data: ReflectionInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        notes = json.loads(card.reflections_json)
        if len(notes) >= 50:
            raise HTTPException(422, '这张卡已有50次补充，可以为今天新留一张卡。')
        notes.append({'id': str(uuid4()), 'text': data.text, 'created_at': utc_now().isoformat()})
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
