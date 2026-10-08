"""One accessible image per catalog concert, selected from current records."""
import io
import json
import warnings

from fastapi import Depends
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .footprints import load_catalog
from .models import MemoryCard, Photo, PublicStory, User
from .photos import MAX_PHOTO_BYTES, MAX_PIXELS, photo_url


def candidate_ids(record):
    """A selected cover cannot widen an explicit, approved gallery."""
    try:
        ids = json.loads(record.photo_ids_json or '[]')
    except (TypeError, ValueError):
        return []
    if not isinstance(ids, list) or any(not isinstance(value, str) or not 1 <= len(value) <= 36 for value in ids):
        return []
    if not ids:
        ids = [record.photo_id] if record.photo_id else []
    if record.photo_id in ids:
        ids = [record.photo_id, *[value for value in ids if value != record.photo_id]]
    return list(dict.fromkeys(ids))


def valid_photo(photo):
    # Uploads are sanitized already, but legacy/damaged metadata must not produce
    # a broken map tile. The photo endpoint serves JPEG, so require JPEG pixels.
    if not photo or not photo.content or len(photo.content) > MAX_PHOTO_BYTES:
        return False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(photo.content)) as image:
                if image.format != 'JPEG' or image.width * image.height > MAX_PIXELS:
                    return False
                image.load()
        return True
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        return False


def first_photo(db, record, owner_id, checked):
    for photo_id in candidate_ids(record):
        photo = db.get(Photo, photo_id)
        if photo is None or photo.owner_id != owner_id:
            continue
        if photo_id not in checked:
            checked[photo_id] = valid_photo(photo)
        if checked[photo_id]:
            return photo
    return None


def install_map_photos(app, get_db, get_optional_user):
    @app.get('/api/footprints/photos')
    def map_photos(db: OrmSession = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
        event_ids = {event['id'] for event in load_catalog()['events']}
        chosen, checked = {}, {}
        if viewer is not None:
            records = db.scalars(select(MemoryCard).where(
                MemoryCard.owner_id == viewer.id, MemoryCard.event_id.in_(event_ids)
            ).order_by(MemoryCard.updated_at.desc(), MemoryCard.id.desc()))
            for card in records:
                if card.event_id in chosen:
                    continue
                photo = first_photo(db, card, viewer.id, checked)
                if photo is not None:
                    chosen[card.event_id] = {
                        'event_id': card.event_id, 'url': photo_url(photo.id), 'source': 'mine',
                        'memory_id': card.id,
                        'author_name': f'{viewer.display_name} · 虚构样例' if card.is_demo_sample else viewer.display_name,
                        'is_demo_sample': card.is_demo_sample,
                        'views': card.publication.read_count if card.publication else 0,
                    }
        query = select(PublicStory).join(MemoryCard).where(
            PublicStory.published.is_(True), PublicStory.event_id.in_(event_ids)
        )
        if viewer is not None:
            query = query.where(MemoryCard.owner_id != viewer.id)
        query = query.order_by(PublicStory.read_count.desc(), PublicStory.published_at.desc(), PublicStory.memory_id.desc())
        for public in db.scalars(query):
            if public.event_id in chosen:
                continue
            photo = first_photo(db, public, public.memory.owner_id, checked)
            if photo is not None:
                chosen[public.event_id] = {
                    'event_id': public.event_id, 'url': photo_url(photo.id), 'source': 'public',
                    'memory_id': public.memory_id, 'author_name': public.author_name,
                    'is_demo_sample': public.memory.is_demo_sample, 'views': public.read_count,
                }
        return {'photos': list(chosen.values()), 'ranking': 'views_then_recent'}
