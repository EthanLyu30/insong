"""Bounded public-snapshot pages; collection reads never increment views."""
import base64
import binascii
import json
import hashlib
from datetime import datetime
from collections import OrderedDict
from secrets import token_urlsafe
from threading import RLock
from time import monotonic
from typing import Literal

from fastapi import Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session as OrmSession

from .models import MemoryCard, PublicStory, User
from .stories import public_query, serialize_story
from .event_scope import selected_event_ids


def encode_cursor(public, scope):
    value = {'v': 1, 'scope': scope, 'id': public.memory_id,
             'date': public.published_at.isoformat(), 'views': public.read_count}
    return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')


def decode_cursor(cursor, scope):
    try:
        value = json.loads(base64.b64decode(cursor + '=' * (-len(cursor) % 4), altchars=b'-_', validate=True))
        if (value['v'] != 1 or value['scope'] != scope
                or type(value['id']) is not int or not 0 < value['id'] < 2**63
                or type(value['views']) is not int or not 0 <= value['views'] < 2**63):
            raise ValueError('invalid cursor')
        date = datetime.fromisoformat(value['date'])
        # SQLite stores UTC as naive datetimes, matching the existing public order.
        return value['id'], date, value['views']
    except (ValueError, TypeError, KeyError, binascii.Error, UnicodeDecodeError):
        raise HTTPException(422, '这页内容的范围已改变，请重新打开当前内容。') from None


def install_public_feed(app, get_db, get_optional_user):
    # Only public IDs are retained, not text/photos. Each browsing session keeps
    # its initial popularity order; ordinary views cannot strand unread posts.
    rankings = OrderedDict()
    ranking_lock = RLock()

    def popular_page(db, query, scope, cursor, limit):
        now = monotonic()
        if cursor:
            try:
                value = json.loads(base64.b64decode(cursor + '=' * (-len(cursor) % 4), altchars=b'-_', validate=True))
                if (value['v'] != 2 or value['scope'] != scope or not isinstance(value['session'], str)
                        or len(value['session']) > 80 or type(value['index']) is not int or value['index'] < 0):
                    raise ValueError('invalid ranking')
                token, index = value['session'], value['index']
            except (ValueError, TypeError, KeyError, binascii.Error, UnicodeDecodeError):
                raise HTTPException(422, '这页内容的范围已改变，请重新打开当前内容。') from None
            with ranking_lock:
                stored = rankings.get(token)
                if stored is None or stored[2] < now:
                    raise HTTPException(410, '本次浏览已过期，请重新加载当前话题。')
                saved_scope, identities, _ = stored
                if saved_scope != scope or index > len(identities):
                    raise HTTPException(422, '这页内容的范围已改变，请重新打开当前内容。')
                rankings[token] = (saved_scope, identities, now + 1200)
                rankings.move_to_end(token)
        else:
            identities = tuple(db.scalars(query.with_only_columns(PublicStory.memory_id).order_by(
                PublicStory.read_count.desc(), PublicStory.published_at.desc(), PublicStory.memory_id.desc())))
            token, index = token_urlsafe(18), 0
            with ranking_lock:
                for expired in [key for key, record in rankings.items() if record[2] < now]:
                    del rankings[expired]
                while len(rankings) >= 64:
                    rankings.popitem(last=False)
                rankings[token] = (scope, identities, now + 1200)
        visible = []
        while index < len(identities) and len(visible) <= limit:
            group = identities[index:index + 31]
            # Recheck live publication/owner scope: a ranking never resurrects a
            # withdrawn or deleted story, even when its ID is still remembered.
            records = {record.memory_id: record for record in db.scalars(query.where(PublicStory.memory_id.in_(group)))}
            for identity in group:
                record = records.get(identity)
                if record is not None:
                    visible.append((index, record))
                index += 1
                if len(visible) > limit:
                    break
        continuation = None
        if len(visible) > limit:
            payload = {'v': 2, 'scope': scope, 'session': token, 'index': visible[limit][0]}
            continuation = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode()).decode().rstrip('=')
        return [record for _, record in visible[:limit]], continuation

    @app.get('/api/public-feed')
    def feed(event_id: str | None = Query(default=None, min_length=1, max_length=100),
             event_ids: list[str] | None = Query(default=None),
             theme_id: str | None = Query(default=None, min_length=1, max_length=40),
             sort: Literal['recent', 'popular'] = 'recent',
             exclude_mine: bool = False,
             limit: int = Query(default=12, ge=1, le=30),
             cursor: str | None = Query(default=None, min_length=1, max_length=2000),
             db: OrmSession = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
        activity_ids = selected_event_ids(event_id, event_ids)
        scope = {'event': event_id, 'theme': theme_id, 'sort': sort,
                 'exclude_mine': exclude_mine, 'viewer': viewer.id if exclude_mine and viewer else None}
        if activity_ids is not None:
            scope['events'] = hashlib.sha256(json.dumps(activity_ids, separators=(',', ':')).encode()).hexdigest()
        query = public_query(theme_id=theme_id, event_id=event_id).order_by(None)
        if activity_ids is not None:
            query = query.where(PublicStory.event_id.in_(activity_ids))
        if exclude_mine and viewer:
            query = query.where(MemoryCard.owner_id != viewer.id)
        if sort == 'popular':
            page, continuation = popular_page(db, query, scope, cursor, limit)
            return {'items': [serialize_story(public, viewer) for public in page], 'next_cursor': continuation}
        if cursor:
            identity, date, views = decode_cursor(cursor, scope)
            after_date = or_(PublicStory.published_at < date,
                             and_(PublicStory.published_at == date, PublicStory.memory_id < identity))
            query = query.where(after_date)
        query = query.order_by(PublicStory.published_at.desc(), PublicStory.memory_id.desc()).limit(limit + 1)
        rows = list(db.scalars(query))
        page = rows[:limit]
        return {'items': [serialize_story(public, viewer) for public in page],
                'next_cursor': encode_cursor(page[-1], scope) if len(rows) > limit else None}
