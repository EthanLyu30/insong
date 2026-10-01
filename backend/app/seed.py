"""One-time fictional data for a fresh demo database."""

import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from .demo_data import DEMO_MEMORY_CARDS, DEMO_SONGS, FANDOM_SONGS, FANDOM_STORIES
from .models import MemoryCard, MemoryCardTag, MemoryReceipt, PublicStory, SeedMigration, Song, Tag, User
from .card_metadata import set_memory_tags


def seed_demo_data(db: OrmSession) -> None:
    """Add demo records in the caller's transaction, never overwriting existing data."""
    if db.get(Song, 1) is not None or any(
        db.scalar(select(model.id).limit(1)) is not None for model in (User, Song, Tag)
    ):
        return

    db.add_all(
        [
            User(id=1, display_name="小林", is_demo=True),
            User(id=2, display_name="阿远", is_demo=True),
        ]
    )
    db.add_all(Song(**song) for song in DEMO_SONGS)

    tag_names = list(dict.fromkeys(
        tag_name for card in DEMO_MEMORY_CARDS for tag_name in card["tags"]
    ))
    tags_by_name = {name: Tag(id=index, name=name) for index, name in enumerate(tag_names, 1)}
    db.add_all(tags_by_name.values())

    for sample in DEMO_MEMORY_CARDS:
        card = MemoryCard(
            id=sample["id"],
            owner_id=sample["owner_id"],
            song_id=sample["song_id"],
            story=sample["story"],
            life_time=sample["life_time"],
            scene=sample["scene"],
            visibility="public",
            is_demo_sample=True,
        )
        card.tag_links = [
            MemoryCardTag(tag=tags_by_name[name]) for name in sample["tags"]
        ]
        db.add(card)


def seed_fandom_showcase(db: OrmSession) -> None:
    """Add samples exactly once; durable marker and receipts survive user deletion."""
    marker = 'fandom-showcase-v1'
    if db.get(SeedMigration, marker) is not None:
        return
    songs = {}
    for sample in FANDOM_SONGS:
        song = db.scalar(select(Song).where(Song.title == sample['title'], Song.artist == sample['artist']))
        if song is None:
            song_id = sample['id']
            if db.get(Song, song_id) is not None:
                song_id = max(101, (db.scalar(select(func.max(Song.id))) or 100) + 1)
            song = Song(**(sample | {'id': song_id}), version='曲目资料（无音频）',
                        source_label='歌手作品资料 · 场景插画', is_demo=False, audio_available=False)
            db.add(song)
            db.flush()
        songs[sample['id']] = song
    owners = list(db.scalars(select(User).where(User.is_demo.is_(True), User.display_name.in_(['小林', '阿远'])).order_by(User.id)))
    if not owners:
        owner = User(display_name='演示歌迷', is_demo=True)
        db.add(owner)
        db.flush()
        owners = [owner]
    for index, sample in enumerate(FANDOM_STORIES):
        owner = owners[index % len(owners)]
        receipt = MemoryReceipt(owner_id=owner.id, request_key=f'{marker}-{index}')
        db.add(receipt)
        db.flush()
        card = MemoryCard(id=receipt.id, owner_id=owner.id, song_id=songs[sample['song_id']].id,
                          story=sample['story'], title=sample['title'], theme_id=sample['theme_id'],
                          visibility='private', is_demo_sample=True)
        db.add(card)
        set_memory_tags(db, card, sample['tags'])
        card.publication = PublicStory(memory_id=card.id, excerpt=sample['story'], title=sample['title'],
                                       tags_json=json.dumps(sample['tags'], ensure_ascii=False),
                                       photo_ids_json='[]', author_name='虚构歌迷 · 演示故事',
                                       anonymous=True, theme_id=sample['theme_id'], published=True)
    db.add(SeedMigration(key=marker))
