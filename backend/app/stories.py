"""Consented public excerpts, separate from owner-only originals."""
import json

from fastapi import Depends, HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session as OrmSession

from .content import THEMES, selected_lyric
from .media import serialize_song
from .memories import CreateMemory, PublicationConsent, owner_card, set_publication_snapshot, update_card, validate_gallery
from .models import MemoryCard, PublicStory, User
from .recall import SearchInput, keyword_score
from .photos import photo_url
from .card_metadata import gallery_ids, normalize_tag, serialize_photos
from .footprints import load_catalog


class PublishInput(PublicationConsent):
    revision: int = Field(ge=1, strict=True)
    excerpt: str = Field(min_length=1, max_length=500)
    @field_validator('excerpt')
    @classmethod
    def nonblank(cls, value):
        return CreateMemory.nonblank(value)


class PublicSearch(SearchInput):
    theme_id: str | None = Field(default=None, max_length=40)
    lyric_id: str | None = Field(default=None, max_length=40)
    event_id: str | None = Field(default=None, max_length=100)
    tag: str | None = Field(default=None, max_length=25)


def serialize_story(public):
    card = public.memory
    return {
        'id': public.memory_id, 'excerpt': public.excerpt, 'title': public.title,
        'tags': json.loads(public.tags_json or '[]'), 'photos': serialize_photos(public),
        'song_id': card.song_id, 'song': serialize_song(card.song),
        'author_name': public.author_name, 'life_time': public.life_time,
        'life_year': public.life_year, 'offset_ms': public.offset_ms,
        'end_ms': public.end_ms, 'photo_id': public.photo_id, 'photo_url': photo_url(public.photo_id),
        'event_id': public.event_id,
        'lyric': selected_lyric(card.song, public.lyric_id), 'lyric_id': public.lyric_id,
        'theme_id': public.theme_id, 'is_demo_sample': card.is_demo_sample,
        'published_at': public.published_at.isoformat(),
    }


def public_query(song_id=None, theme_id=None, lyric_id=None, event_id=None, tag=None):
    query = select(PublicStory).join(MemoryCard).where(PublicStory.published.is_(True))
    if song_id is not None:
        query = query.where(MemoryCard.song_id == song_id)
    if theme_id is not None:
        query = query.where(PublicStory.theme_id == theme_id)
    if lyric_id is not None:
        query = query.where(PublicStory.lyric_id == lyric_id)
    if event_id is not None:
        query = query.where(PublicStory.event_id == event_id)
    if tag is not None:
        tags = func.json_each(PublicStory.tags_json).table_valued('value')
        query = query.where(exists(select(1).select_from(tags).where(tags.c.value == normalize_tag(tag))).correlate(PublicStory))
    return query.order_by(PublicStory.published_at.desc(), PublicStory.memory_id.desc())


def public_search_text(public, catalog):
    """Use approved snapshots plus publicly available catalog metadata only."""
    song = public.memory.song
    aliases = [alias for artist in catalog['artists']
               if artist['name'] == song.artist or song.artist in artist.get('aliases', [])
               for alias in artist.get('aliases', [])]
    event = next((item for item in catalog['events'] if item['id'] == public.event_id), {})
    fields = [public.excerpt, public.title or '', public.life_time or '', song.title, song.artist,
              *json.loads(public.tags_json or '[]'), *aliases,
              *(str(event.get(key) or '') for key in ('title', 'city', 'venue', 'date'))]
    # The GEM spelling is a documented alias even when an imported catalog omits it.
    if song.artist == '邓紫棋':
        fields.extend(['G.E.M.', 'GEM', '鄧紫棋'])
    return ' '.join(fields)


def install_stories(app, get_db, get_user):
    @app.get('/api/themes')
    def themes():
        return THEMES

    @app.post('/api/memories/{memory_id}/publication')
    def publish(memory_id: int, data: PublishInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        if data.excerpt not in card.story:
            raise HTTPException(422, '请选择原文中连续的一段，公开前不会替你改写故事。')
        validate_gallery(db, gallery_ids(card), user)
        set_publication_snapshot(card, data.excerpt, data, user)
        # Snapshot and revision claim commit atomically; a stale request rolls both back.
        return update_card(db, card, data.revision, {})

    @app.delete('/api/memories/{memory_id}/publication')
    def revoke(memory_id: int, revision: int = Query(ge=1), db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        card = owner_card(db, memory_id, user)
        return update_card(db, card, revision, {}, withdraw=True)

    @app.get('/api/stories')
    def list_stories(song_id: int | None = Query(default=None, gt=0, lt=2**63),
                     theme_id: str | None = None, lyric_id: str | None = None, event_id: str | None = None,
                     tag: str | None = Query(default=None, max_length=25),
                     db: OrmSession = Depends(get_db)):
        return [serialize_story(public) for public in db.scalars(public_query(song_id, theme_id, lyric_id, event_id, tag))]

    @app.post('/api/stories/search')
    def search(data: PublicSearch, db: OrmSession = Depends(get_db)):
        exact_tag = normalize_tag(data.query) if data.query.startswith('#') else None
        candidates = list(db.scalars(public_query(data.song_id, data.theme_id, data.lyric_id, data.event_id, exact_tag or data.tag)))
        versions = {public.memory_id: public.version for public in candidates}
        # Never pass private originals, reflections, or unshared life metadata to inference.
        catalog = load_catalog()
        texts = [public_search_text(public, catalog) for public in candidates]
        lexical = [keyword_score(data.query, text) for text in texts]
        mode, notice, scores = ('keyword' if exact_tag else data.mode), '', lexical
        if exact_tag:
            scores = [1.] * len(candidates)
        if candidates and mode == 'semantic':
            try:
                scores = app.state.recall.scores(data.query, texts)
            except Exception:
                mode, notice = 'keyword', '经历匹配暂时不可用，已按关键词查找公开原文。'
        threshold = .865 if mode == 'semantic' else .14
        ranked = sorted(zip(candidates, scores, lexical), key=lambda row: (row[1], row[2]), reverse=True)
        ids = [public.memory_id for public, score, exact in ranked if score >= threshold or exact == 1.]
        if mode == 'semantic':
            ids = ids[:3]
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
