"""Refresh untouched private demo memories with user-supplied concert imagery.

The photos illustrate fictional stories; they do not document the seeded dates,
venues, authors or songs. Existing edits and deleted cards always win.
"""

import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .event_record_samples import EXPANDED_MARKER, EXPANDED_SAMPLES, MARKER as EVENT_MARKER, SAMPLES
from .models import MemoryCard, MemoryReceipt, Photo, SeedMigration
from .sample_media import SAMPLE_DIR


MARKER = 'personal-concert-sample-refresh-v1'
REFRESHES = {
    f'{EVENT_MARKER}-gem-my-walk': {
        'photos': ('user-gem-personal-04', 'user-gem-personal-05'),
        'title': '演唱会散场后，还想多站一会儿',
        'story': '（虚构示例）场馆的灯一排排亮起来，我却还站在原地。朋友说最后一段合唱时我们的嗓子都哑了。走出场馆后，我们边找地铁边回味刚才的舞台，直到人群慢慢散开，才舍得把应援棒收起来。',
    },
    f'{EXPANDED_MARKER}-my-gem-first-night': {
        'photos': ('user-gem-personal-02', 'user-gem-personal-01'),
        'title': '邓紫棋一开唱，我把手机收进包里',
        'story': '（虚构示例）进场前还想着要拍多少照片，真正听到现场的第一句歌，反而把手机放下了。旁边的人跟着节奏轻轻挥灯，我也唱到声音有点沙哑。回家路上才发现，相册不满，却记得那片灯海的颜色。',
    },
    f'{EXPANDED_MARKER}-my-gem-reunion-night': {
        'photos': ('user-gem-personal-03', 'user-gem-personal-02'),
        'title': '和老朋友在演唱会看台合唱',
        'story': '（虚构示例）入场前我们还在聊各自最近的忙碌，开场后却默契地一起站起来。唱到熟悉的段落，她碰了碰我的手臂，我们笑着把声音放得更大。散场时没说什么大道理，只约好下次还一起听现场。',
    },
    f'{EXPANDED_MARKER}-my-gem-xiamen': {
        'photos': ('user-gem-personal-01', 'user-gem-personal-05'),
        'title': '厦门演唱会散场，海风把心情吹慢了',
        'story': '（虚构示例）为了这场演唱会，和朋友提前一天来到厦门。等到舞台灯光暗下去，耳边还像留着大家合唱的声音。回程没有急着赶路，我们沿街走了一小段，才把这次短短的旅行和今晚的心情慢慢分开。',
    },
    f'{EXPANDED_MARKER}-my-tnt-shanghai': {
        'photos': ('user-tnt-02', 'user-tnt-03', 'user-tnt-01'),
        'title': '时代少年团谢幕时，我们还在挥灯',
        'story': '（虚构示例）开场前我和朋友反复确认座位，担心隔得太远看不清舞台。音乐一响，整片看台都跟着亮了起来。谢幕时我们还舍不得放下灯，回程一路说着刚才最喜欢的瞬间，连坐错一站地铁都没发现。',
    },
    f'{EXPANDED_MARKER}-my-phoenix-shenzhen': {
        'photos': ('user-phoenix-03', 'user-phoenix-04', 'user-phoenix-02', 'user-phoenix-01'),
        'title': '凤凰传奇开唱后，妈妈比我先站起来',
        'story': '（虚构示例）入场时妈妈还问应援棒怎么亮，开唱没多久，她已经跟着周围的人站起来挥灯了。我转头看她，发现她唱得比我还投入。散场后我们一边走一边聊舞台，原来一起看演唱会也能成为家里的新话题。',
    },
}


def refresh_personal_concert_samples(db: Session) -> None:
    """Update only exact, unedited private seed cards once; preserve old photos."""
    if db.get(SeedMigration, MARKER):
        return
    originals = {
        f'{marker}-{sample["key"]}': sample
        for marker, samples in ((EVENT_MARKER, SAMPLES), (EXPANDED_MARKER, EXPANDED_SAMPLES))
        for sample in samples
    }
    original_bytes = {}
    replacement_bytes = {}
    for request_key, replacement in REFRESHES.items():
        receipt = db.scalar(select(MemoryReceipt).where(MemoryReceipt.request_key == request_key))
        card = db.get(MemoryCard, receipt.id) if receipt else None
        original = originals[request_key]
        if (card is None or receipt.owner_id != card.owner_id or not card.owner.is_demo
                or card.owner.display_name != '小林' or not card.is_demo_sample
                or card.revision != 1 or card.publication is not None
                or card.visibility != 'private' or card.event_id != original['event']
                or card.title != original['title'] or card.story != original['story']
                or (card.song.title, card.song.artist) != original['song']):
            continue
        try:
            ids = json.loads(card.photo_ids_json or '[]')
        except (TypeError, ValueError):
            continue
        if not isinstance(ids, list) or len(ids) != len(original['photos']) or card.photo_id != ids[0]:
            continue
        photos = [db.get(Photo, photo_id) for photo_id in ids]
        if any(photo is None or photo.owner_id != card.owner_id
               or photo.content != original_bytes.setdefault(name, (SAMPLE_DIR / f'{name}.jpg').read_bytes())
               for photo, name in zip(photos, original['photos'])):
            continue
        new_photos = [Photo(id=str(uuid4()), owner_id=card.owner_id,
            content=replacement_bytes.setdefault(name, (SAMPLE_DIR / f'{name}.jpg').read_bytes()))
            for name in replacement['photos']]
        db.add_all(new_photos)
        db.flush()
        card.photo_id = new_photos[0].id
        card.photo_ids_json = json.dumps([photo.id for photo in new_photos])
        card.title = replacement['title']
        card.story = replacement['story']
        card.revision += 1
    db.add(SeedMigration(key=MARKER))
