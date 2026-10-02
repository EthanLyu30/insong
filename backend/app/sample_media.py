"""Versioned product samples, deliberately isolated from user-owned memories."""

import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .demo_data import DEMO_SONGS, FANDOM_SONGS, FANDOM_STORIES
from .models import MemoryCard, MemoryReceipt, Photo, SeedMigration, Song

SAMPLE_DIR = Path(__file__).parent / 'sample_photos'
GALLERIES = [
    ['concert', 'arrival', 'journey'],
    ['concert', 'arrival'],
    ['journey', 'arrival', 'concert'],
    ['indoor', 'journey'],
    ['festival', 'journey'],
]
RETIRED_COVERS = {
    '/photos/live-lights.webp': '/photos/memory-concert-20261002.webp',
    '/photos/concert-flags.webp': '/photos/memory-concert-20261002.webp',
    '/photos/concert-phone.webp': '/photos/memory-concert-20261002.webp',
    '/photos/festival-day.webp': '/photos/memory-festival-20261002.webp',
    '/photos/journey-sunset.webp': '/photos/memory-journey-20261002.webp',
}


def refresh_generated_covers(db: Session) -> None:
    marker = 'showcase-generated-covers-v1'
    if db.get(SeedMigration, marker):
        return
    for sample in [*DEMO_SONGS, *FANDOM_SONGS]:
        for song in db.scalars(select(Song).where(
            Song.title == sample['title'], Song.artist == sample['artist'],
            Song.cover_url.in_(RETIRED_COVERS),
            Song.source_label.in_(['虚构演示曲目', '歌手作品资料 · 摄影配图', '歌手作品资料 · 场景配图']),
        )):
            song.cover_url = RETIRED_COVERS[song.cover_url]
            if not song.is_demo:
                song.source_label = '歌手作品资料 · 场景配图'
    db.add(SeedMigration(key=marker))


def seed_sample_galleries(db: Session) -> None:
    """Only enrich untouched, still-published system samples, exactly once.

    A receipt identifies the original sample even if IDs shifted. Modified text,
    private/withdrawn stories, photos and deleted records are all left alone.
    Bytes are bundled with the backend so deployed seeds do not need the frontend
    filesystem or a network download. Normal photo ownership rules still apply.
    """
    marker = 'showcase-gallery-v1'
    if db.get(SeedMigration, marker):
        return
    for index, sample in enumerate(FANDOM_STORIES):
        receipts = db.scalars(select(MemoryReceipt).where(
            MemoryReceipt.request_key == f'fandom-showcase-v1-{index}'))
        song_sample = next(song for song in FANDOM_SONGS if song['id'] == sample['song_id'])
        for receipt in receipts:
            card = db.get(MemoryCard, receipt.id)
            if not card or not card.is_demo_sample or not card.owner.is_demo or card.owner_id != receipt.owner_id:
                continue
            public = card.publication
            if (card.revision != 1 or card.story != sample['story'] or card.title != sample['title']
                    or card.song.title != song_sample['title'] or card.song.artist != song_sample['artist']
                    or card.photo_id or json.loads(card.photo_ids_json or '[]')
                    or not public or not public.published or public.version != 1
                    or public.excerpt != sample['story'] or public.title != sample['title']
                    or public.photo_id or json.loads(public.photo_ids_json or '[]')):
                continue
            photos = [Photo(id=str(uuid4()), owner_id=card.owner_id,
                            content=(SAMPLE_DIR / f'{name}.jpg').read_bytes())
                      for name in GALLERIES[index]]
            db.add_all(photos)
            db.flush()
            ids = json.dumps([photo.id for photo in photos])
            card.photo_id = public.photo_id = photos[0].id
            card.photo_ids_json = public.photo_ids_json = ids
    db.add(SeedMigration(key=marker))
