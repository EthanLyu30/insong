"""Project-owned example prompts and lyric-position metadata, not a TME catalog."""
THEMES = [
    {'id': 'concert', 'title': '散场以后', 'prompt': '演唱会散场后，哪首歌还在心里回响？', 'description': '灯亮了，心里还有一首歌没有唱完。', 'image_url': '/photos/gem-shenzhen-20260926-bowl.webp'},
    {'id': 'graduation', 'title': '音乐节的夏天', 'prompt': '草地、晚风和同行的人，你想留住哪一刻？', 'description': '把音乐节的热烈，留在一张记忆卡里。', 'image_url': '/photos/festival-day.webp'},
    {'id': 'new-city', 'title': '跨城去见你', 'prompt': '为了喜欢的歌手出发，那次奔赴发生了什么？', 'description': '从车票到应援，收藏每一次赴约。', 'image_url': '/photos/journey-sunset.webp'},
]
THEME_IDS = {theme['id'] for theme in THEMES}
LINES = {
    1: ['灯亮以后，歌声还在', '把没说完的话，留在晚风里', '散场的路，我们慢慢走'],
    2: ['车窗外，是陌生的早晨', '把勇气装进口袋，再向前一点', '远方也会有一盏灯为我亮'],
    3: ['夏天经过教室的窗', '那句再见，我们唱得很长', '后来每次听见，都想起你们'],
    4: ['雨落下来，城市慢了一拍', '一个人的路，也有旋律陪伴', '等天晴，再对自己说声早安'],
    5: ['海风翻过未写完的一页', '把今天收好，明天再出发', '有些温柔，会一直留在这里'],
}


def song_lyrics(song):
    if not song.is_demo or song.version != '演示录音室版':
        return []
    return [{'id': f'{song.id}-v1-{i}', 'text': line, 'start_ms': i * 16000}
            for i, line in enumerate(LINES.get(song.id, []))]


def selected_lyric(song, lyric_id):
    return next((line for line in song_lyrics(song) if line['id'] == lyric_id), None)
