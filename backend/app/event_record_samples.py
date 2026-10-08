"""Fictional concert walkthroughs, seeded only into existing demo identities."""
import json
from uuid import uuid4

from sqlalchemy import select

from .card_metadata import set_memory_tags
from .event_snapshots import capture_event, snapshot_json
from .models import MemoryCard, MemoryReceipt, Photo, PublicStory, SeedMigration, Song, User
from .sample_media import SAMPLE_DIR
from .footprints import load_catalog


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
                author_name=owner.display_name, anonymous=False, published=True)
    db.add(SeedMigration(key=MARKER))


# This is a separate additive release. Never edit the old sample list or consume
# its marker: owners may have changed, withdrawn or removed those walkthroughs.
EXPANDED_MARKER = 'event-records-expanded-v2'
EXPANDED_SAMPLES = [
    {'key': 'my-gem-first-night', 'owner': '小林', 'event': 'gem-shenzhen-20260911', 'song': ('光年之外', '邓紫棋'),
     'title': '第一次把手机收起来听完整个夜晚', 'tags': ['演唱会', '合唱'], 'photos': ['concert', 'arrival'],
     'story': '（虚构示例）九月的深圳还有些闷热。和朋友坐定以后，我把手机收进包里，想认真感受身边的人一起唱歌的声音。散场只拍了两张照片，回看时却一下子想起整晚的心情。', 'public': False},
    {'key': 'my-gem-reunion-night', 'owner': '小林', 'event': 'gem-shenzhen-20260926', 'song': ('泡沫', '邓紫棋'),
     'title': '在看台上，补上很久没聊的近况', 'tags': ['朋友', '重逢'], 'photos': ['arrival', 'concert', 'journey'],
     'story': '（虚构示例）很久没见的朋友约我在深圳看演出。入场前交换最近的烦恼，等灯亮起来，两个人又像回到一起听歌的学生时代。回程慢慢走了一段路，照片里留下的是我们重新靠近的一晚。', 'public': False},
    {'key': 'my-liu-guangzhou', 'owner': '小林', 'event': 'liu-yuxin-guangzhou-20251018', 'song': ('REALITY', '刘雨昕'),
     'title': '广州的这次赴约，终于见到同担', 'tags': ['跨城追星', '应援'], 'photos': ['indoor', 'journey'],
     'story': '（虚构示例）来广州之前，和同担在聊天窗口里约了很久。进场前碰面、交换应援物，再一起坐下来等开场，陌生感很快就消失了。那张有点模糊的合照，记下了第一次真正见面的快乐。', 'public': False},
    {'key': 'my-phoenix-shenzhen', 'owner': '小林', 'event': 'phoenix-shenzhen-20241116', 'song': ('奢香夫人', '凤凰传奇'),
     'title': '带妈妈赴约，回程还在哼旋律', 'tags': ['家人', '演唱会'], 'photos': ['concert', 'journey'],
     'story': '（虚构示例）第一次和妈妈一起在深圳看凤凰传奇。她起初说自己不会用应援灯，后来却比我举得更高。回程车上，我们还轻轻哼着喜欢的旋律，想把这次难得的共同出门记下来。', 'public': False},
    {'key': 'my-gem-xiamen', 'owner': '小林', 'event': 'gem-xiamen-20260502', 'song': ('光年之外', '邓紫棋'),
     'title': '厦门的海风，接住散场后的心情', 'tags': ['跨城追星', '散场'], 'photos': ['journey', 'arrival', 'concert'],
     'story': '（虚构示例）为了这次赴约，和朋友第一次来到厦门。进场前把沿途的风景拍下来，散场后又慢慢整理今天的照片。旅行和演出连在一起，留下了一段可以反复想起的小假期。', 'public': False},
    {'key': 'my-tnt-shanghai', 'owner': '小林', 'event': 'tnt-shanghai-20260803', 'song': ('相遇', '时代少年团'),
     'title': '把线上约定，变成上海的合照', 'tags': ['朋友', '应援'], 'photos': ['arrival', 'indoor'],
     'story': '（虚构示例）和朋友聊着时代少年团的歌，约定了一次上海之行。真正站在场馆外见到彼此时，比想象中还开心。应援物和合照一起收进相册，这一天有了很具体的形状。', 'public': False},
    {'key': 'fan-gem-first-night', 'owner': '阿远', 'event': 'gem-shenzhen-20260911', 'song': ('光年之外', '邓紫棋'),
     'title': '第一次独自进场，邻座递来一束灯', 'tags': ['演唱会', '应援'], 'photos': ['concert', 'arrival'],
     'story': '（虚构示例）一个人去深圳看演出，入场前还有些紧张。邻座听友帮我认座位，开场时又提醒我一起举灯。散场后互相说了再见，才发现这次独自赴约并没有想象中孤单。', 'public': True},
    {'key': 'fan-gem-weekend', 'owner': '阿远', 'event': 'gem-shenzhen-20260920', 'song': ('泡沫', '邓紫棋'),
     'title': '周末的小逃跑，从地铁站开始', 'tags': ['散场', '朋友'], 'photos': ['journey', 'concert'],
     'story': '（虚构示例）忙了一整周，终于和朋友在深圳的地铁站碰头。一路聊到进场，再一起等到最后。回家以后翻看照片，觉得这个普通周末突然有了值得留下的片段。', 'public': True},
    {'key': 'fan-gem-september', 'owner': '阿远', 'event': 'gem-shenzhen-20260926', 'song': ('光年之外', '邓紫棋'),
     'title': '灯海很远，旁边的人很近', 'tags': ['合唱', '演唱会'], 'photos': ['concert', 'arrival', 'journey'],
     'story': '（虚构示例）在深圳看台上，朋友和我一起举起灯。拍照时舞台只剩远处的一片亮色，身边人的笑脸却很清楚。我想留下的，正是大家在同一个晚上喜欢着同一种声音的感觉。', 'public': True},
    {'key': 'fan-liu-guangzhou', 'owner': '阿远', 'event': 'liu-yuxin-guangzhou-20251018', 'song': ('REALITY', '刘雨昕'),
     'title': '广州的雨停了，我们刚好进场', 'tags': ['应援', '跨城追星'], 'photos': ['indoor', 'arrival'],
     'story': '（虚构示例）到广州以后，和同担在场馆附近等了一会儿。大家交换贴纸、聊喜欢的作品，原本担心跨城太匆忙的心情慢慢松下来。想把第一次并肩应援的样子留在照片里。', 'public': True},
    {'key': 'fan-phoenix-shenzhen', 'owner': '阿远', 'event': 'phoenix-shenzhen-20241116', 'song': ('奢香夫人', '凤凰传奇'),
     'title': '几代人坐在一起，都会唱同一段旋律', 'tags': ['家人', '合唱'], 'photos': ['concert', 'arrival'],
     'story': '（虚构示例）和家人一起在深圳赴约，进场前还在比较各自最喜欢的歌。看台上的热闹让我们笑了整晚。回程把合照发进家庭相册，觉得一起听歌也是一种很好的团聚。', 'public': True},
    {'key': 'fan-xue-shenzhen', 'owner': '阿远', 'event': 'xue-zhiqian-shenzhen-20260828', 'song': ('演员', '薛之谦'),
     'title': '散场以后，终于把那句话说出口', 'tags': ['散场', '朋友'], 'photos': ['concert', 'journey'],
     'story': '（虚构示例）和朋友约在深圳看薛之谦，进场前聊起各自最近的心事。演出结束以后，我们没有急着回去，沿着场馆外的路把话说完。拍下回程的路灯，记住这次被认真听见的感觉。', 'public': True},
    {'key': 'fan-liu-beijing', 'owner': '阿远', 'event': 'liu-yuxin-beijing-20250920', 'song': ('REALITY', '刘雨昕'),
     'title': '第一次去北京，只为兑现约定', 'tags': ['跨城追星', '朋友'], 'photos': ['journey', 'indoor'],
     'story': '（虚构示例）带着和朋友的约定第一次到北京。白天慢慢认路，晚上一起进场，原本陌生的城市因此留下熟悉的声音。回程收好照片和应援物，觉得这趟出发已经有了答案。', 'public': True},
    {'key': 'fan-phoenix-jinan', 'owner': '阿远', 'event': 'phoenix-jinan-20261003', 'song': ('奢香夫人', '凤凰传奇'),
     'title': '济南的假期，有一晚留给一起听歌', 'tags': ['演唱会', '家人'], 'photos': ['concert', 'journey', 'arrival'],
     'story': '（虚构示例）假期和家人来到济南，特意留一晚一起看凤凰传奇。进场前拍下笑得很开心的合照，散场时还在回味看台上的热闹。相册里多了几张照片，也多了一个共同的话题。', 'public': True},
]


def seed_expanded_event_record_samples(db):
    """Consume each new night once, without adding records to real accounts."""
    if db.get(SeedMigration, EXPANDED_MARKER):
        return
    catalog = load_catalog()
    events = {event['id']: event for event in catalog['events']}
    owners = {}
    for owner in db.scalars(select(User).where(User.is_demo.is_(True),
            User.display_name.in_(['小林', '阿远'])).order_by(User.id)):
        owners.setdefault(owner.display_name, owner)
    for sample in EXPANDED_SAMPLES:
        request_key = f'{EXPANDED_MARKER}-{sample["key"]}'
        if db.scalar(select(MemoryReceipt.id).where(MemoryReceipt.request_key == request_key)) is not None:
            continue
        owner, catalog_event = owners.get(sample['owner']), events.get(sample['event'])
        if (owner is None or catalog_event is None or catalog_event.get('event_status') == 'cancelled'
                or catalog_event['date'] > catalog['today']
                or sample['song'] not in {(song['title'], song['artist']) for song in catalog_event['songs']}):
            continue
        receipt = MemoryReceipt(owner_id=owner.id, request_key=request_key)
        db.add(receipt)
        db.flush()
        # An existing user-created or old demo night takes precedence. Consume
        # the receipt even when skipped, so a lost marker cannot later fill it.
        if db.scalar(select(MemoryCard.id).where(
                MemoryCard.owner_id == owner.id, MemoryCard.event_id == sample['event'])) is not None:
            continue
        song = db.scalar(select(Song).where(Song.title == sample['song'][0],
            Song.artist == sample['song'][1], Song.owner_id.is_(None)).order_by(Song.id))
        if song is None:
            song = Song(title=sample['song'][0], artist=sample['song'][1],
                version='曲目资料（无音频）', source_label='歌手作品资料 · 虚构样例配图',
                is_demo=False, audio_available=False, cover_url='/photos/memory-concert-20261002.webp')
            db.add(song)
            db.flush()
        event = capture_event(sample['event'], catalog)
        photos = [Photo(id=str(uuid4()), owner_id=owner.id,
            content=(SAMPLE_DIR / f'{name}.jpg').read_bytes()) for name in sample['photos']]
        db.add_all(photos)
        db.flush()
        photo_ids = json.dumps([photo.id for photo in photos])
        snapshot = snapshot_json(event)
        card = MemoryCard(id=receipt.id, owner_id=owner.id, song_id=song.id,
            title=sample['title'], story=sample['story'], visibility='private', is_demo_sample=True,
            event_id=event['id'], event_snapshot_json=snapshot,
            life_time=event['date'], life_year=int(event['date'][:4]), life_precision='day',
            location_name=f'{event["city"]} · {event["venue"]}', photo_id=photos[0].id, photo_ids_json=photo_ids)
        db.add(card)
        set_memory_tags(db, card, sample['tags'])
        if sample['public']:
            card.publication = PublicStory(memory_id=card.id, excerpt=card.story, title=card.title,
                tags_json=json.dumps(sample['tags'], ensure_ascii=False), event_id=card.event_id,
                event_snapshot_json=snapshot, photo_id=card.photo_id, photo_ids_json=photo_ids,
                life_time=card.life_time, life_year=card.life_year, share_life_time=True,
                author_name=owner.display_name, anonymous=False, published=True)
    db.add(SeedMigration(key=EXPANDED_MARKER))
