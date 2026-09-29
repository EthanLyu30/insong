"""Consented public excerpts, separate from owner-only originals."""
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .content import THEMES, selected_lyric
from .media import serialize_song
from .memories import CreateMemory, owner_card, update_card
from .models import MemoryCard, PublicStory, User, utc_now
from .recall import SearchInput, keyword_score
from .photos import photo_url


class PublishInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=1, strict=True)
    excerpt: str = Field(min_length=1, max_length=500)
    share_life_time: StrictBool = False
    anonymous: StrictBool = True
    confirmed: StrictBool

    @field_validator('confirmed')
    @classmethod
    def explicit_consent(cls, value):
        if not value:
            raise ValueError('请先确认公开预览')
        return value

    @field_validator('excerpt')
    @classmethod
    def nonblank(cls, value):
        return CreateMemory.nonblank(value)


class PublicSearch(SearchInput):
    theme_id: str | None = Field(default=None, max_length=40)
    lyric_id: str | None = Field(default=None, max_length=40)
    event_id: str | None = Field(default=None, max_length=100)


def serialize_story(public):
    card = public.memory
    return {
        'id': public.memory_id, 'excerpt': public.excerpt,
        'song_id': card.song_id, 'song': serialize_song(card.song),
        'author_name': public.author_name, 'life_time': public.life_time,
        'life_year': public.life_year, 'offset_ms': public.offset_ms,
        'end_ms': public.end_ms, 'photo_id': public.photo_id, 'photo_url': photo_url(public.photo_id),
        'event_id': public.event_id,
        'lyric': selected_lyric(card.song, public.lyric_id), 'lyric_id': public.lyric_id,
        'theme_id': public.theme_id, 'is_demo_sample': card.is_demo_sample,
        'published_at': public.published_at.isoformat(),
    }


def public_query(song_id=None, theme_id=None, lyric_id=None, event_id=None):
    query = select(PublicStory).join(MemoryCard).where(PublicStory.published.is_(True))
    if song_id is not None:
        query = query.where(MemoryCard.song_id == song_id)
    if theme_id is not None:
        query = query.where(PublicStory.theme_id == theme_id)
    if lyric_id is not None:
        query = query.where(PublicStory.lyric_id == lyric_id)
    if event_id is not None:
        query = query.where(PublicStory.event_id == event_id)
    return query.order_by(PublicStory.published_at.desc(), PublicStory.memory_id.desc())


def install_stories(app, get_db, get_user):
    @app.get('/api/themes')
    def themes():
        return THEMES

    @app.post('/api/memories/{memory_id}/publication')
    def publish(memory_id: int, data: PublishInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        if data.excerpt not in card.story:
            raise HTTPException(422, '请选择原文中连续的一段，公开前不会替你改写故事。')
        public = card.publication
        if public is None:
            public = PublicStory(memory_id=card.id, version=0)
            db.add(public)
        public.excerpt = data.excerpt
        public.share_life_time = data.share_life_time
        public.life_time = card.life_time if data.share_life_time else None
        public.life_year = card.life_year if data.share_life_time else None
        public.anonymous = data.anonymous
        public.author_name = '匿名听友' if data.anonymous else user.display_name
        public.offset_ms, public.lyric_id, public.theme_id = card.offset_ms, card.lyric_id, card.theme_id
        public.photo_id, public.end_ms, public.event_id = card.photo_id, card.end_ms, card.event_id
        public.published, public.published_at = True, utc_now()
        public.version += 1
        # Snapshot and revision claim commit atomically; a stale request rolls both back.
        return update_card(db, card, data.revision, {})

    @app.delete('/api/memories/{memory_id}/publication')
    def revoke(memory_id: int, revision: int = Query(ge=1), db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        return update_card(db, card, revision, {}, withdraw=True)

    @app.get('/api/stories')
    def list_stories(song_id: int | None = Query(default=None, gt=0, lt=2**63),
                     theme_id: str | None = None, lyric_id: str | None = None, event_id: str | None = None,
                     db: OrmSession = Depends(get_db)):
        return [serialize_story(public) for public in db.scalars(public_query(song_id, theme_id, lyric_id, event_id))]

    @app.post('/api/stories/search')
    def search(data: PublicSearch, db: OrmSession = Depends(get_db)):
        candidates = list(db.scalars(public_query(data.song_id, data.theme_id, data.lyric_id, data.event_id)))
        versions = {public.memory_id: public.version for public in candidates}
        # Never pass private originals, reflections, or unshared life metadata to inference.
        texts = [public.excerpt + ' ' + (public.life_time or '') + ' ' + public.memory.song.title for public in candidates]
        lexical = [keyword_score(data.query, text) for text in texts]
        mode, notice, scores = data.mode, '', lexical
        if candidates and mode == 'semantic':
            try:
                scores = app.state.recall.scores(data.query, texts)
            except Exception:
                mode, notice = 'keyword', '经历匹配暂时不可用，已按关键词查找公开原文。'
        threshold = .865 if mode == 'semantic' else .14
        ranked = sorted(zip(candidates, scores, lexical), key=lambda row: (row[1], row[2]), reverse=True)
        ids = [public.memory_id for public, score, exact in ranked if score >= threshold or exact == 1.][:3]
        db.rollback()
        db.expire_all()
        items = []
        for memory_id in ids:
            fresh = db.get(PublicStory, memory_id)
            if fresh is None or not fresh.published or fresh.version != versions[memory_id]:
                continue
            items.append({'story': serialize_story(fresh), 'evidence': fresh.excerpt,
                          'match_label': '经历语义相近 · 请结合原文判断' if mode == 'semantic' else '公开原文或分享信息包含相近关键词'})
        return {'items': items, 'mode': mode, 'notice': notice}

    @app.get('/api/stories/{story_id}')
    def get_story(story_id: int, db: OrmSession = Depends(get_db)):
        public = db.get(PublicStory, story_id) if 0 < story_id < 2**63 else None
        if public is None or not public.published:
            raise HTTPException(404, '这段故事尚未公开，或已被作者收回。')
        return serialize_story(public)
