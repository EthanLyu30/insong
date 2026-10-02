"""Canonical card metadata shared by writes, snapshots and discovery."""
import json

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert

from .models import MemoryCardTag, Tag


def normalize_tag(value):
    return value.strip().lstrip('#').strip()


def normalize_tags(values):
    names = list(dict.fromkeys(name for value in values if (name := normalize_tag(value))))
    if len(names) > 8 or any(len(name) > 24 for name in names):
        raise ValueError('最多添加8个标签，每个标签不超过24个字')
    return names


def memory_tags(card):
    if card.tags_json is not None:
        return json.loads(card.tags_json)
    return [link.tag.name for link in card.tag_links]


def set_memory_tags(db, card, names):
    with db.no_autoflush:
        for name in names:
            db.execute(insert(Tag).values(name=name).on_conflict_do_nothing(index_elements=['name']))
        by_name = {tag.name: tag for tag in db.scalars(select(Tag).where(Tag.name.in_(names)))}
        card.tag_links = [MemoryCardTag(tag=by_name[name]) for name in names]
        card.tags_json = json.dumps(names, ensure_ascii=False)


def gallery_ids(record):
    ids = json.loads(record.photo_ids_json or '[]')
    return ids or ([record.photo_id] if record.photo_id else [])


def serialize_photos(record):
    return [{'id': photo_id, 'url': f'/api/photos/{photo_id}'} for photo_id in gallery_ids(record)]
