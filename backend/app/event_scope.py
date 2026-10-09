"""Validate multi-night collection reads without changing stored event identities."""
from fastapi import HTTPException


def selected_event_ids(event_id, event_ids):
    if event_ids is None:
        return None
    if (event_id is not None or not 1 <= len(event_ids) <= 50
            or any(not value.strip() or len(value) > 100 for value in event_ids)):
        raise HTTPException(422, '演出范围无效，请重新打开当前演唱会。')
    return sorted(set(event_ids))
