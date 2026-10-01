"""Original demo audio and fictional story samples; real songs are metadata only."""

DEMO_SONGS = [
    {"id": 1, "title": "散场以后", "artist": "Demo Artist", "version": "演示录音室版", "source_label": "虚构演示曲目", "is_demo": True, "audio_available": False},
    {"id": 2, "title": "凌晨三点的耳机", "artist": "Demo Artist", "version": "演示录音室版", "source_label": "虚构演示曲目", "is_demo": True, "audio_available": False},
    {"id": 3, "title": "夏天最后一首歌", "artist": "Demo Artist", "version": "演示录音室版", "source_label": "虚构演示曲目", "is_demo": True, "audio_available": False},
    {"id": 4, "title": "下一站再见", "artist": "Demo Artist", "version": "演示录音室版", "source_label": "虚构演示曲目", "is_demo": True, "audio_available": False},
    {"id": 5, "title": "回声", "artist": "Demo Artist", "version": "演示录音室版", "source_label": "虚构演示曲目", "is_demo": True, "audio_available": False},
]

# Song credits verified from the existing footprint catalog and primary sources:
# 稻香: https://www.jvrmusic.com/artist/gallery/detail/1151772159916511232?lang=zh_CN&type=album
# 倔强: https://bin-music.com/artist/MAYDAY
# 邓紫棋/刘雨昕: source-backed song entries in footprint_catalog.json.
# Real stock photography is illustrative, never an official album cover or
# evidence of attendance at any named artist's concert. Sources live in photos/README.md.
FANDOM_SONGS = [
    {'id': 101, 'title': '稻香', 'artist': '周杰伦', 'cover_url': '/photos/live-lights.webp'},
    {'id': 102, 'title': '光年之外', 'artist': '邓紫棋', 'cover_url': '/photos/concert-flags.webp'},
    {'id': 103, 'title': '泡沫', 'artist': '邓紫棋', 'cover_url': '/photos/journey-sunset.webp'},
    {'id': 104, 'title': 'REALITY', 'artist': '刘雨昕', 'cover_url': '/photos/concert-phone.webp'},
    {'id': 105, 'title': '倔强', 'artist': '五月天', 'cover_url': '/photos/festival-day.webp'},
]

LEGACY_FANDOM_COVERS = {
    101: '/scenes/venues/shanghai-stadium-interior.webp',
    102: '/scenes/venues/sanya-egret-interior.webp',
    103: '/scenes/venues/shanghai-stadium-exterior.webp',
    104: '/scenes/venues/shanghai-oriental-arena-interior.webp',
    105: '/scenes/venues/xiamen-egret-interior.webp',
}
DEMO_PHOTO_COVERS = {
    1: '/photos/live-lights.webp', 2: '/photos/journey-sunset.webp',
    3: '/photos/festival-day.webp', 4: '/photos/journey-sunset.webp',
    5: '/photos/concert-phone.webp',
}

# Explicitly fictional walkthrough samples, unrelated to real attendance records.
FANDOM_STORIES = [
    {'song_id': 101, 'title': '全场合唱时，想起了第一次听歌的自己', 'tags': ['演唱会', '合唱'], 'theme_id': 'concert',
     'story': '（虚构示例）第一次站在演唱会看台，旁边的陌生人和我一起跟着稻香哼唱。手机放回口袋，想把那一刻的声音留在记忆里。'},
    {'song_id': 102, 'title': '安可结束后，我们又走了一站', 'tags': ['散场', '演唱会'], 'theme_id': 'concert',
     'story': '（虚构示例）灯亮起来后，我们没有立刻回去，沿着场馆外的路慢慢走。光年之外还在耳边，舍不得结束今晚的约定。'},
    {'song_id': 103, 'title': '跨城去见你的那张车票', 'tags': ['跨城追星', '散场'], 'theme_id': 'new-city',
     'story': '（虚构示例）出发前在高铁上循环泡沫，回程时把车票和应援手环收在一起。为了喜欢的歌手去一座新城市，这一天值得被记住。'},
    {'song_id': 104, 'title': '第一次和同担站在同一片灯海里', 'tags': ['演唱会', '应援'], 'theme_id': 'concert',
     'story': '（虚构示例）网上聊了很久的同担终于见面。我们一起等开场，举起应援灯，聊到刘雨昕的REALITY时，又约好了下一次见面的城市。'},
    {'song_id': 105, 'title': '音乐节的晚风，把陌生人唱成朋友', 'tags': ['音乐节', '合唱'], 'theme_id': 'graduation',
     'story': '（虚构示例）音乐节结束后的草地上，朋友聊起五月天的倔强，我们围成小圈轻声哼唱。鞋上沾着泥，心里装着一个亮晶晶的夏天。'},
]

# Original fictional stories for the hackathon walkthrough, not user feedback.
DEMO_MEMORY_CARDS = [
    {
        "id": 1,
        "owner_id": 1,
        "song_id": 1,
        "story": "毕业晚会散场后，我一个人走过空荡荡的操场。耳机里恰好放到这首歌，那一刻才真正意识到要和熟悉的日子告别了。",
        "life_time": "毕业那年",
        "scene": "夜晚的操场",
        "tags": ["毕业", "告别"],
    },
    {
        "id": 2,
        "owner_id": 2,
        "song_id": 2,
        "story": "第一次离家住校的夜里，我把耳机音量调得很小，怕吵醒室友。这首歌陪我把想家的话写进日记，也让我慢慢安心。",
        "life_time": "大学第一年",
        "scene": "宿舍熄灯后",
        "tags": ["独处", "成长"],
    },
    {
        "id": 3,
        "owner_id": 1,
        "song_id": 3,
        "story": "那年暑假结束前，我们在公交站等最后一班车。谁都没有说再见，只是轮流哼着这段旋律，后来每次听见都想起那阵热风。",
        "life_time": "夏末",
        "scene": "公交站台",
        "tags": ["夏天", "朋友"],
    },
    {
        "id": 4,
        "owner_id": 2,
        "song_id": 4,
        "story": "搬去新城市的高铁上，我望着窗外一站站变换的灯光。原本有点害怕未知，听完这首歌却想先认真看看下一站的风景。",
        "life_time": "初次工作",
        "scene": "驶向新城市的列车",
        "tags": ["城市", "勇气"],
    },
    {
        "id": 5,
        "owner_id": 1,
        "song_id": 5,
        "story": "整理旧书时翻出朋友留下的便签，我重新播放了这首歌。曾经以为忘记的笑声又变得清晰，像空房间里一声温柔的回响。",
        "life_time": "重逢之前",
        "scene": "整理旧书的房间",
        "tags": ["朋友", "回忆"],
    },
]
