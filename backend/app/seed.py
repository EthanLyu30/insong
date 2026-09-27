"""One-time fictional data for a fresh demo database."""

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .demo_data import DEMO_MEMORY_CARDS, DEMO_SONGS
from .models import MemoryCard, MemoryCardTag, Song, Tag, User


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
