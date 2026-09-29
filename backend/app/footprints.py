"""Verified event catalog and owner-scoped attendance."""
import json
from datetime import date
from pathlib import Path

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session as OrmSession

from .models import Footprint, User

CATALOG_PATH = Path(__file__).with_name('footprint_catalog.json')


def load_catalog():
    if not CATALOG_PATH.is_file():
        return {'artists': [], 'events': []}
    return json.loads(CATALOG_PATH.read_text(encoding='utf-8'))


def validate_event(event_id, *, past=False):
    if event_id is None:
        return
    event = next((item for item in load_catalog()['events'] if item['id'] == event_id), None)
    if event is None:
        raise HTTPException(422, '找不到这个场次，请重新选择。')
    if past and date.fromisoformat(event['date']) > date.today():
        raise HTTPException(422, '演出发生后才能标记到场。')


class AttendanceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    attended: StrictBool


def owner_footprints(db, user):
    return list(db.scalars(select(Footprint.event_id).where(Footprint.owner_id == user.id).order_by(Footprint.event_id)))


def install_footprints(app, get_db, get_user):
    @app.get('/api/footprints/catalog')
    def catalog():
        return load_catalog()

    @app.get('/api/footprints')
    def list_footprints(db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        return owner_footprints(db, user)

    @app.put('/api/footprints/{event_id}')
    def set_attendance(event_id: str, data: AttendanceInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        validate_event(event_id, past=True)
        if data.attended:
            db.execute(insert(Footprint).values(owner_id=user.id, event_id=event_id).on_conflict_do_nothing())
        else:
            db.execute(delete(Footprint).where(Footprint.owner_id == user.id, Footprint.event_id == event_id))
        db.commit()
        return owner_footprints(db, user)
