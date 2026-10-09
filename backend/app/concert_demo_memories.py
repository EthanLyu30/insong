"""Additive, fictional memories using supplied artist-grouped illustrations.

Photos illustrate an artist's performances, not the seeded night or author.
Artists without catalog events get undated personal examples, not invented dates.
"""
import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .card_metadata import set_memory_tags
from .event_snapshots import capture_event, snapshot_json
from .footprints import load_catalog
from .models import MemoryCard, MemoryReceipt, Photo, PublicStory, SeedMigration, Song, User
from .sample_media import SAMPLE_DIR


MARKER = 'concert-demo-memories-v1'
SHANGHAI = 'liu-yuxin-shanghai-20250705'
PERSONAL = (
    {'key': 'my-liu-shanghai', 'event': SHANGHAI, 'song': ('REALITY', '刘雨昕'),
     'title': '上海这一晚，终于和屏幕那头的同担并肩',
     'story': '（虚构示例）到东方体育中心时，我还在聊天窗口里问朋友到了没有。见面以后交换了应援物，两个人边认座位边笑，线上聊了那么久，真正坐在一起却还是有点不好意思。开场的灯光一亮，我们同时举起了灯。原本准备拍完整段舞台，后来只留了几张照片，剩下的时间都在跟着唱。散场走到出口，朋友问我下次还来不来，我还没想好行程，就先说了好。',
     'photos': ('user-liu-01', 'user-liu-moment-03', 'user-liu-moment-04'),
     'tags': ('演唱会', '朋友', '应援')},
    {'key': 'my-xue', 'event': 'xue-zhiqian-shenzhen-20260828', 'song': ('演员', '薛之谦'),
     'title': '薛之谦开唱前，我们先笑到忘了紧张',
     'story': '（虚构示例）进场前和朋友确认了三遍座位，还笑自己像第一次出远门。舞台造型一亮相，周围的尖叫盖过了我们刚才的聊天。慢歌的时候却又突然安静下来，我举着手机拍了一会儿，发现朋友已经在旁边擦眼角。散场后翻相册，清楚的照片不多，倒是很记得我们一起把熟悉的旋律唱得跑调的样子。',
     'photos': tuple(f'user-xue-{i:02d}' for i in range(1, 8)),
     'tags': ('演唱会', '朋友', '合唱')},
    {'key': 'my-mao', 'event': None, 'song': ('消愁', '毛不易'),
     'title': '听毛不易的现场，终于允许自己慢一点',
     'story': '（虚构示例）那天忙完工作才匆匆赶到现场，坐下来时还在想着没回复的消息。灯光暗下去，周围的人慢慢安静，我也把手机调成了静音。听着熟悉的声音，突然发现自己已经很久没有这样认真坐着听完一首歌。回家路上没有急着发朋友圈，只把几张照片收进相册，想在下次觉得累的时候再翻出来。',
     'photos': tuple(f'user-mao-{i:02d}' for i in range(1, 5)),
     'tags': ('现场', '治愈')},
    {'key': 'my-hua', 'event': None, 'song': ('好想爱这个世界啊', '华晨宇'),
     'title': '华晨宇的现场，把普通周末唱得很亮',
     'story': '（虚构示例）出门时朋友还问我，会不会站到腿酸。真的到了现场，音乐一响，两个人就跟着人群举起了手。想拍一张清楚的照片，却总是在最喜欢的地方忘了按快门。结束后嗓子有点哑，我们坐在路边喝水，聊刚才哪一段最舍不得结束。回到家已经很晚，还是把照片一张张看完才睡。',
     'photos': ('user-hua-01', 'user-hua-02'),
     'tags': ('现场', '朋友')},
)

# Twelve original perspectives, not copies of the private note or a real fan's text.
PUBLIC = (
    {'key': 'light-sea', 'author': '阿禾', 'song': 'REALITY',
     'title': '第一次看刘雨昕上海场，开场灯海让我忘了紧张',
     'story': '入场前一直低头确认票和座位，担心自己一个人会不自在。开场时整片看台一起亮起来，邻座朝我笑了一下，我也举起了灯。那一分钟忽然觉得，原来独自出发也能被很多人接住。',
     'photos': ('user-liu-01', 'user-liu-moment-01'), 'tags': ('演唱会', '应援')},
    {'key': 'train', 'author': '小满', 'song': 'REALITY',
     'title': '赶来上海听演唱会，这趟车没有白坐',
     'story': '在车上还担心下班以后赶来会不会太累。坐进场馆、听到周围一起欢呼的时候，脑袋里只剩下终于来了。回程靠着车窗翻照片，拍糊的那几张也没舍得删，因为每张都能想起当时的声音。',
     'photos': ('user-liu-moment-03', 'user-liu-02'), 'tags': ('跨城追星', '演唱会')},
    {'key': 'moon', 'author': '南枝', 'song': '看着月亮想你',
     'title': '刘雨昕唱起慢歌时，我终于放下了手机',
     'story': '本来想着把喜欢的舞台都录下来，听到慢下来的旋律时，却把手机放低了。前排的人轻轻挥灯，朋友也不再说话。没留下完整录像，但直到回家，还记得那一小段安静是怎样让心情松下来的。',
     'photos': ('user-liu-moment-04', 'user-liu-03'), 'tags': ('演唱会', '感动')},
    {'key': 'reunion', 'author': '晚星', 'song': '原来那个人',
     'title': '和同担在上海演唱会见面，聊天框终于有了声音',
     'story': '约好在入口碰面，认出对方的应援物时都笑了。原来线上很健谈的人，第一次见面也会不好意思。开场以后并肩挥灯，再没有刻意找话题，散场却能一路聊到地铁口。',
     'photos': ('user-liu-04', 'user-liu-moment-02'), 'tags': ('朋友', '应援')},
    {'key': 'beat', 'author': '橙子', 'song': 'REALITY',
     'title': '上海场的节拍一响，整个看台一起动了起来',
     'story': '刚坐定时大家还在整理包和外套，音乐一响，整排人不约而同地站起来。舞台的灯扫过来，我连照片都来不及拍，只顾着跟节拍挥手。结束后发现手臂有点酸，却还是觉得这一晚很值得。',
     'photos': ('user-liu-moment-03', 'user-liu-01'), 'tags': ('演唱会', '舞台')},
    {'key': 'neighbors', 'author': '小屿', 'song': 'REALITY',
     'title': '看刘雨昕演唱会，邻座成了今晚的合唱搭子',
     'story': '进场时互相让了一下座位，谁也没想到后来会一起唱到嗓子哑。熟悉的旋律响起，我们举着灯对视了一眼，笑得特别大声。散场互相说了再见，没交换很多信息，却留下了很温暖的一晚。',
     'photos': ('user-liu-moment-01', 'user-liu-05'), 'tags': ('合唱', '演唱会')},
    {'key': 'workday', 'author': '木木', 'song': '看着月亮想你',
     'title': '把忙碌暂停一晚，在上海听刘雨昕唱歌',
     'story': '出门前还在回复工作消息，朋友提醒我别忘了带票。真正听见现场的声音，才觉得自己终于从一整周的忙乱里走出来。那晚没有想什么很远的事，只认真听歌，认真看了一会儿身边的灯。',
     'photos': ('user-liu-moment-02', 'user-liu-03'), 'tags': ('演唱会', '治愈')},
    {'key': 'encore', 'author': '初夏', 'song': '原来那个人',
     'title': '演唱会最后一次挥灯，我们都舍不得先放下',
     'story': '知道快结束了，却还是一遍遍朝舞台挥手。朋友拍了拍我的肩，说下次还能再见，我点着头却没忍住红了眼睛。照片里的灯光有点晃，刚好像那一刻舍不得散场的心情。',
     'photos': ('user-liu-05', 'user-liu-moment-04'), 'tags': ('演唱会', '散场')},
    {'key': 'souvenir', 'author': '青禾', 'song': 'REALITY',
     'title': '刘雨昕上海场，口袋里多了一份同担的小礼物',
     'story': '进场前收到旁边听友递来的应援贴纸，没想到随口聊几句就找到了共同喜欢的舞台。结束后把贴纸和灯一起收进包里，回家才发现，今天最想保留的还有这份陌生人的善意。',
     'photos': ('user-liu-02', 'user-liu-moment-01'), 'tags': ('应援', '朋友')},
    {'key': 'first-trip', 'author': '阿宁', 'song': '原来那个人',
     'title': '第一次独自来上海，把勇气留在刘雨昕的现场',
     'story': '出发时反复检查路线，连换乘都提前截图。到了场馆还是有点紧张，但听到开场的欢呼，就不再觉得自己和这座城市很陌生。回程找对了地铁，也带回了一点下次还敢独自出发的勇气。',
     'photos': ('user-liu-04', 'user-liu-01'), 'tags': ('跨城追星', '演唱会')},
    {'key': 'camera', 'author': '可可', 'song': 'REALITY',
     'title': '上海演唱会拍糊的照片，反而最像当时的快乐',
     'story': '每次想拍清楚舞台，旁边的朋友就会拉我一起挥灯。相册里好多照片都晃了，可回看时又能想起大家笑着唱歌的样子。最后留下几张没有那么完美的画面，觉得记忆也不一定非要高清。',
     'photos': ('user-liu-moment-03', 'user-liu-moment-02'), 'tags': ('演唱会', '朋友')},
    {'key': 'subway', 'author': '小舟', 'song': '看着月亮想你',
     'title': '刘雨昕演唱会散场后，地铁里还舍不得收起应援棒',
     'story': '跟着人群走到地铁站，看见有人还把灯握在手里，我也没有急着收起来。朋友问今晚最喜欢什么，我说好像哪一段都不想错过。直到到家换了鞋，耳边还像留着看台合唱的回声。',
     'photos': ('user-liu-05', 'user-liu-moment-04'), 'tags': ('散场', '合唱')},
)


def seed_concert_demo_memories(db: Session) -> None:
    """Never overwrite originals, republish withdrawals or resurrect deleted cards."""
    if db.get(SeedMigration, MARKER):
        return
    receipt = db.scalar(select(MemoryReceipt).where(
        MemoryReceipt.request_key == 'event-records-showcase-v1-liu-my-meeting'))
    mine = db.get(User, receipt.owner_id) if receipt else None
    if mine is None or not mine.is_demo or mine.display_name != '小林':
        return
    catalog = load_catalog()
    events = {event['id']: event for event in catalog['events']}
    samples = [*PERSONAL, *(dict(sample, event=SHANGHAI,
        song=(sample['song'], '刘雨昕'), story='（虚构示例）' + sample['story']) for sample in PUBLIC)]
    for sample in samples:
        request_key = f'{MARKER}-{sample["key"]}'
        if db.scalar(select(MemoryReceipt.id).where(MemoryReceipt.request_key == request_key)) is not None:
            continue
        catalog_event = events.get(sample['event']) if sample['event'] else None
        if sample['event'] and (catalog_event is None
                or catalog_event.get('event_status') == 'cancelled'
                or catalog_event['date'] > catalog['today']
                or sample['song'] not in {(song['title'], song['artist']) for song in catalog_event['songs']}):
            continue
        public = 'author' in sample
        owner = mine
        if public:
            owner = db.scalar(select(User).where(User.is_demo.is_(True),
                User.display_name == sample['author']).order_by(User.id))
            if owner is None:
                owner = User(display_name=sample['author'], is_demo=True)
                db.add(owner)
                db.flush()
        receipt = MemoryReceipt(owner_id=owner.id, request_key=request_key)
        db.add(receipt)
        db.flush()
        # A preexisting personal note takes precedence; consume the receipt even
        # when skipped so a lost marker cannot later backfill a deleted note.
        if not public and sample['event'] and db.scalar(select(MemoryCard.id).where(
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
        event = capture_event(sample['event'], catalog, required=False)
        snapshot = snapshot_json(event)
        photos = [Photo(id=str(uuid4()), owner_id=owner.id,
            content=(SAMPLE_DIR / f'{name}.jpg').read_bytes()) for name in sample['photos']]
        db.add_all(photos)
        db.flush()
        photo_ids = json.dumps([photo.id for photo in photos])
        card = MemoryCard(id=receipt.id, owner_id=owner.id, song_id=song.id,
            title=sample['title'], story=sample['story'], visibility='private', is_demo_sample=True,
            event_id=sample['event'], event_snapshot_json=snapshot,
            life_time=event['date'] if event else None,
            life_year=int(event['date'][:4]) if event else None,
            life_precision='day' if event else 'unknown',
            location_name=f'{event["city"]} · {event["venue"]}' if event else None,
            photo_id=photos[0].id, photo_ids_json=photo_ids)
        db.add(card)
        set_memory_tags(db, card, sample['tags'])
        if public:
            card.publication = PublicStory(memory_id=card.id, excerpt=card.story,
                title=card.title, tags_json=json.dumps(sample['tags'], ensure_ascii=False),
                event_id=card.event_id, event_snapshot_json=snapshot,
                photo_id=card.photo_id, photo_ids_json=photo_ids,
                life_time=card.life_time, life_year=card.life_year, share_life_time=True,
                author_name=owner.display_name, anonymous=False, published=True)
    db.add(SeedMigration(key=MARKER))
