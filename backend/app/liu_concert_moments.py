"""Additional fictional perspectives for a single Liu Yuxin concert event.

User-supplied photos illustrate demo stories; they do not establish that the
fictional authors attended or took the photographs.
"""

import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .card_metadata import set_memory_tags
from .event_snapshots import capture_event, snapshot_json
from .models import MemoryCard, MemoryReceipt, Photo, PublicStory, SeedMigration, Song, User
from .sample_media import SAMPLE_DIR


MARKER = 'liu-shenzhen-other-moments-v1'
EVENT_ID = 'liu-yuxin-shenzhen-20260801'
SAMPLES = (
    {
        'key': 'purple-lights', 'author': '阿禾',
        'title': '第一次走进刘雨昕演唱会，灯海替我说了话',
        'story': '（虚构示例）入场前，我还担心一个人坐在看台会有些局促。舞台亮起时，紫色灯海从身边一排排铺开，我也举起应援棒。那一刻，独自来看演唱会的紧张忽然散了。',
        'tags': ('演唱会', '应援'),
        'photos': ('user-liu-moment-01', 'user-liu-moment-03'),
    },
    {
        'key': 'quiet-song', 'author': '小满',
        'title': '演唱会安静下来的那一段，我却哭了',
        'story': '（虚构示例）刚才还跟着节奏挥灯，舞台慢下来时，周围也渐渐安静。我看着大屏幕里的刘雨昕，想起自己也有过不敢继续往前的日子。没拍完整段演出，只留下一张照片，记住那晚被音乐接住的感觉。',
        'tags': ('演唱会', '感动'),
        'photos': ('user-liu-moment-04', 'user-liu-moment-02'),
    },
    {
        'key': 'stage-lights', 'author': '南枝',
        'title': '灯光扫过舞台，我们在看台一起欢呼',
        'story': '（虚构示例）灯光扫到中间舞台，整片看台跟着节奏站了起来。原本不认识的人挥着同样颜色的灯，唱到熟悉的地方还笑着看了彼此一眼。这场演唱会最想留下的，就是这一分钟的热闹。',
        'tags': ('演唱会', '合唱'),
        'photos': ('user-liu-moment-03', 'user-liu-moment-01'),
    },
    {
        'key': 'after-show', 'author': '晚星',
        'title': '演唱会散场了，我还握着应援棒',
        'story': '（虚构示例）走出场馆时，耳边还像有舞台的回声。我在出口慢慢翻看照片，把应援棒握在手里，不想太快回到平常的夜晚。第二天再看这些画面，会想起自己怎样带着一点勇气回家。',
        'tags': ('演唱会', '散场'),
        'photos': ('user-liu-05', 'user-liu-moment-02'),
    },
)


def seed_liu_concert_moments(db: Session) -> None:
    """Seed once into separate demo owners; receipts protect deletions."""
    if db.get(SeedMigration, MARKER):
        return
    base_receipt = db.scalar(select(MemoryReceipt).where(
        MemoryReceipt.request_key == 'event-records-showcase-v1-liu-listener-first'))
    base_card = db.get(MemoryCard, base_receipt.id) if base_receipt else None
    if not base_card or not base_card.is_demo_sample or not base_card.owner.is_demo:
        return
    event = capture_event(EVENT_ID, required=False)
    song = db.scalar(select(Song).where(Song.title == 'REALITY', Song.artist == '刘雨昕',
        Song.owner_id.is_(None)).order_by(Song.id))
    if event is None or song is None:
        return
    snapshot = snapshot_json(event)
    for sample in SAMPLES:
        request_key = f'{MARKER}-{sample["key"]}'
        if db.scalar(select(MemoryReceipt.id).where(MemoryReceipt.request_key == request_key)) is not None:
            continue
        owner = db.scalar(select(User).where(User.is_demo.is_(True),
            User.display_name == sample['author']).order_by(User.id))
        if owner is None:
            owner = User(display_name=sample['author'], is_demo=True)
            db.add(owner)
            db.flush()
        receipt = MemoryReceipt(owner_id=owner.id, request_key=request_key)
        photos = [Photo(id=str(uuid4()), owner_id=owner.id,
            content=(SAMPLE_DIR / f'{name}.jpg').read_bytes()) for name in sample['photos']]
        db.add_all([receipt, *photos])
        db.flush()
        photo_ids = json.dumps([photo.id for photo in photos])
        card = MemoryCard(id=receipt.id, owner_id=owner.id, song_id=song.id,
            title=sample['title'], story=sample['story'], visibility='private', is_demo_sample=True,
            event_id=EVENT_ID, event_snapshot_json=snapshot,
            life_time=event['date'], life_year=int(event['date'][:4]), life_precision='day',
            location_name=f'{event["city"]} · {event["venue"]}',
            photo_id=photos[0].id, photo_ids_json=photo_ids)
        db.add(card)
        set_memory_tags(db, card, sample['tags'])
        card.publication = PublicStory(memory_id=card.id, excerpt=card.story,
            title=card.title, tags_json=json.dumps(sample['tags'], ensure_ascii=False),
            event_id=EVENT_ID, event_snapshot_json=snapshot,
            photo_id=card.photo_id, photo_ids_json=photo_ids,
            life_time=card.life_time, life_year=card.life_year, share_life_time=True,
            author_name=owner.display_name, anonymous=False, published=True)
    db.add(SeedMigration(key=MARKER))
