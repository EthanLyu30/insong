"""Fictional concert walkthroughs, seeded only into existing demo identities."""
import json
from uuid import uuid4

from sqlalchemy import select

from .card_metadata import set_memory_tags
from .event_snapshots import capture_event, snapshot_json
from .models import MemoryCard, MemoryReceipt, Photo, PublicStory, SeedMigration, Song, User
from .sample_media import SAMPLE_DIR


MARKER = 'event-records-showcase-v1'
SAMPLES = [
    {'key': 'gem-my-walk', 'owner': '小林', 'event': 'gem-shenzhen-20261005', 'song': ('光年之外', '邓紫棋'),
     'title': '灯亮后，和朋友慢慢走回去', 'tags': ['散场', '朋友'], 'photos': ['concert', 'arrival', 'journey'],
     'story': '安可结束后，看台的灯一排排亮起来。我们没有急着挤进地铁，沿着大运中心外的路慢慢走，聊起第一次听《光年之外》的时候。想留住的不是一段完整录像，而是今晚身边一直跟我合唱的人。', 'public': False},
    {'key': 'gem-my-ticket', 'owner': '小林', 'event': 'gem-shenzhen-20261005', 'song': ('泡沫', '邓紫棋'),
     'title': '一张车票，换来这一晚', 'tags': ['跨城追星', '演唱会'], 'photos': ['journey', 'arrival'],
     'story': '下午坐高铁来深圳，车窗外的城市还很陌生。进场以后，隔壁座位的听友帮我拍了第一张照片，我们跟着喜欢的歌一起合唱。回程把车票和应援手环放在一起，才觉得今天真的来过。', 'public': True},
    {'key': 'gem-listener-chorus', 'owner': '阿远', 'event': 'gem-shenzhen-20261005', 'song': ('光年之外', '邓紫棋'),
     'title': '听完演唱会，还舍不得回家', 'tags': ['演唱会', '合唱', '散场'], 'photos': ['concert', 'arrival'],
     'story': '第一次听邓紫棋的现场，开场前还担心一个人来看会很孤单。旁边的听友在合唱时举起灯，我也跟着举起来。演唱会散场以后舍不得回家，坐在场馆外又聊了很久，才发现今晚已经认识了新朋友。', 'public': True},
    {'key': 'gem-listener-reunion', 'owner': '阿远', 'event': 'gem-shenzhen-20261005', 'song': ('泡沫', '邓紫棋'),
     'title': '和旧同学约在看台见面', 'tags': ['重逢', '朋友'], 'photos': ['arrival', 'concert', 'journey'],
     'story': '很久没见的大学同学，约我在深圳看同一场演出。开场前拍了合照，聊近况时都有点拘谨，音乐响起来以后却像又回到宿舍里。那张有点晃的看台照片，反而成了我最喜欢的一张。', 'public': True},
    {'key': 'liu-my-meeting', 'owner': '小林', 'event': 'liu-yuxin-shenzhen-20260801', 'song': ('REALITY', '刘雨昕'),
     'title': '终于和同担坐在同一排', 'tags': ['应援', '朋友'], 'photos': ['indoor', 'journey'],
     'story': '网上聊了很久的同担，今天终于在大运中心见面。一起排队、交换应援物，再坐到同一排，原本紧张的心情一下子松了。看见灯海亮起来的时候，我想把见面的合照和这一晚一起留下。', 'public': False},
    {'key': 'liu-listener-first', 'owner': '阿远', 'event': 'liu-yuxin-shenzhen-20260801', 'song': ('REALITY', '刘雨昕'),
     'title': '一个人赴约，也有人一起应援', 'tags': ['演唱会', '应援'], 'photos': ['indoor', 'arrival'],
     'story': '第一次一个人看刘雨昕的演唱会，出发时有点担心找不到场馆。到了深圳大运中心，排队的听友帮我认路，还送了一张应援贴纸。开场后整片灯海亮起来，忽然觉得这趟独自出发很值得。', 'public': True},
]


def seed_event_record_samples(db):
    """Add distinct nights once; never alter, republish or resurrect old records.

    Per-record receipts also protect deletions if the migration marker is lost.
    Bundled generated photos follow the normal owner/public access rules.
    """
    if db.get(SeedMigration, MARKER):
        return
    owners = {}
    for owner in db.scalars(select(User).where(User.is_demo.is_(True),
            User.display_name.in_(['小林', '阿远'])).order_by(User.id)):
        owners.setdefault(owner.display_name, owner)
    for sample in SAMPLES:
        request_key = f'{MARKER}-{sample["key"]}'
        if db.scalar(select(MemoryReceipt.id).where(MemoryReceipt.request_key == request_key)) is not None:
            continue
        owner = owners.get(sample['owner'])
        song = db.scalar(select(Song).where(Song.title == sample['song'][0],
            Song.artist == sample['song'][1], Song.owner_id.is_(None)).order_by(Song.id))
        event = capture_event(sample['event'], required=False)
        if owner is None or song is None or event is None:
            continue
        receipt = MemoryReceipt(owner_id=owner.id, request_key=request_key)
        photos = [Photo(id=str(uuid4()), owner_id=owner.id,
                        content=(SAMPLE_DIR / f'{name}.jpg').read_bytes()) for name in sample['photos']]
        db.add_all([receipt, *photos])
        db.flush()
        photo_ids = json.dumps([photo.id for photo in photos])
        snapshot = snapshot_json(event)
        card = MemoryCard(id=receipt.id, owner_id=owner.id, song_id=song.id,
            title=sample['title'], story=sample['story'], visibility='private', is_demo_sample=True,
            event_id=event['id'], event_snapshot_json=snapshot,
            life_time=event['date'], life_year=int(event['date'][:4]), life_precision='day',
            location_name=f'{event["city"]} · {event["venue"]}',
            photo_id=photos[0].id, photo_ids_json=photo_ids)
        db.add(card)
        set_memory_tags(db, card, sample['tags'])
        if sample['public']:
            card.publication = PublicStory(memory_id=card.id, excerpt=card.story, title=card.title,
                tags_json=json.dumps(sample['tags'], ensure_ascii=False),
                event_id=card.event_id, event_snapshot_json=snapshot,
                photo_id=card.photo_id, photo_ids_json=photo_ids, life_time=card.life_time,
                life_year=card.life_year, share_life_time=True,
                author_name=f'{owner.display_name} · 虚构样例', anonymous=False, published=True)
    db.add(SeedMigration(key=MARKER))
