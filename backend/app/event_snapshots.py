"""Concert metadata frozen with a record, independent of later catalog edits."""
import json

from fastapi import HTTPException

from . import footprints


def capture_event(event_id, catalog=None, *, required=True):
    if event_id is None:
        return None
    catalog = catalog if catalog is not None else footprints.load_catalog()
    event = next((item for item in catalog['events'] if item['id'] == event_id), None)
    if event is None:
        if required:
            raise HTTPException(422, '找不到这个场次，请重新选择。')
        return None
    artist = next((item['name'] for item in catalog['artists']
                   if item['id'] == event.get('artist_id')), '')
    return {key: event.get(key, '') for key in ('id', 'title', 'date', 'city', 'venue')} | {'artist': artist}


def event_snapshot(record):
    try:
        value = json.loads(record.event_snapshot_json or 'null')
        if isinstance(value, dict) and all(isinstance(value.get(key), str)
                for key in ('id', 'title', 'artist', 'date', 'city', 'venue')):
            return value
    except (TypeError, ValueError):
        pass
    return None


def snapshot_json(value):
    return json.dumps(value, ensure_ascii=False) if value is not None else None
