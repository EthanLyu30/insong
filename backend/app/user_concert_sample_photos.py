"""One-time photo refresh for untouched fictional G.E.M. and Liu Yuxin stories.

These are user-supplied artist concert illustrations, not evidence that a
fictional author attended the pictured performance or that dates match.
"""

import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .demo_data import FANDOM_SONGS, FANDOM_STORIES
from .event_record_samples import EXPANDED_MARKER, EXPANDED_SAMPLES, MARKER as EVENT_MARKER, SAMPLES
from .models import MemoryCard, MemoryReceipt, Photo, SeedMigration
from .sample_media import GALLERIES, SAMPLE_DIR


MIGRATION_MARKER = 'user-concert-sample-photos-v1'

# The key is the original seed receipt, never a mutable story ID. Reuse is
# intentional; a different cover is selected for neighboring story cards.
PHOTO_SEQUENCES = {
    'fandom-showcase-v1-1': ('user-gem-03', 'user-gem-01'),
    'fandom-showcase-v1-2': ('user-gem-04', 'user-gem-05', 'user-gem-01'),
    'fandom-showcase-v1-3': ('user-liu-01', 'user-liu-02'),
    f'{EVENT_MARKER}-gem-my-ticket': ('user-gem-04', 'user-gem-03'),
    f'{EVENT_MARKER}-gem-listener-chorus': ('user-gem-01', 'user-gem-03'),
    f'{EVENT_MARKER}-gem-listener-reunion': ('user-gem-05', 'user-gem-04', 'user-gem-03'),
    f'{EVENT_MARKER}-liu-listener-first': ('user-liu-02', 'user-liu-03'),
    f'{EXPANDED_MARKER}-fan-gem-first-night': ('user-gem-03', 'user-gem-02'),
    f'{EXPANDED_MARKER}-fan-gem-weekend': ('user-gem-04', 'user-gem-01'),
    f'{EXPANDED_MARKER}-fan-gem-september': ('user-gem-03', 'user-gem-05', 'user-gem-01'),
    f'{EXPANDED_MARKER}-fan-liu-guangzhou': ('user-liu-04', 'user-liu-01'),
    f'{EXPANDED_MARKER}-fan-liu-beijing': ('user-liu-05', 'user-liu-03'),
}


def _original_samples():
    sources = {}
    songs = {song['id']: song for song in FANDOM_SONGS}
    for index, sample in enumerate(FANDOM_STORIES):
        sources[f'fandom-showcase-v1-{index}'] = (
            sample, GALLERIES[index], songs[sample['song_id']]['title'], songs[sample['song_id']]['artist'])
    for marker, samples in ((EVENT_MARKER, SAMPLES), (EXPANDED_MARKER, EXPANDED_SAMPLES)):
        for sample in samples:
            sources[f'{marker}-{sample["key"]}'] = (
                sample, sample['photos'], sample['song'][0], sample['song'][1])
    return sources


def _photo_ids(raw):
    try:
        ids = json.loads(raw or '[]')
    except (TypeError, ValueError):
        return []
    return ids if isinstance(ids, list) else []


def refresh_user_concert_sample_photos(db: Session) -> None:
    """Replace generated galleries only while every original sample field remains intact."""
    if db.get(SeedMigration, MIGRATION_MARKER):
        return
    sources = _original_samples()
    original_bytes = {}
    replacement_bytes = {}
    for request_key, replacements in PHOTO_SEQUENCES.items():
        receipt = db.scalar(select(MemoryReceipt).where(MemoryReceipt.request_key == request_key))
        if receipt is None:
            continue
        card = db.get(MemoryCard, receipt.id)
        if (card is None or receipt.owner_id != card.owner_id or not card.owner.is_demo
                or not card.is_demo_sample or card.revision != 1):
            continue
        sample, original_names, song_title, artist = sources[request_key]
        public = card.publication
        ids = _photo_ids(card.photo_ids_json)
        if (public is None or not public.published or public.version not in (1, 2)
                or public.anonymous or public.author_name != card.owner.display_name
                or card.title != sample['title'] or card.story != sample['story']
                or card.song.title != song_title or card.song.artist != artist
                or public.title != sample['title'] or public.excerpt != sample['story']
                or len(ids) != len(original_names) or card.photo_id != ids[0]
                or public.photo_id != card.photo_id or public.photo_ids_json != card.photo_ids_json):
            continue
        originals = [db.get(Photo, photo_id) for photo_id in ids]
        if any(photo is None or photo.owner_id != card.owner_id
               or photo.content != original_bytes.setdefault(name, (SAMPLE_DIR / f'{name}.jpg').read_bytes())
               for photo, name in zip(originals, original_names)):
            continue
        photos = [Photo(id=str(uuid4()), owner_id=card.owner_id,
                        content=replacement_bytes.setdefault(name, (SAMPLE_DIR / f'{name}.jpg').read_bytes()))
                  for name in replacements]
        db.add_all(photos)
        db.flush()
        new_ids = json.dumps([photo.id for photo in photos])
        card.photo_id = public.photo_id = photos[0].id
        card.photo_ids_json = public.photo_ids_json = new_ids
    db.add(SeedMigration(key=MIGRATION_MARKER))
