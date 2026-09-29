"""Project-owned example prompts and lyric-position metadata, not a TME catalog."""
THEMES = [
    {'id': 'concert', 'title': '散场以后', 'prompt': '第一次听完现场，为什么舍不得回家？', 'description': '灯亮了，心里还有一首歌没有唱完。'},
    {'id': 'graduation', 'title': '毕业那年', 'prompt': '哪一句歌，留住了你和他们的毕业季？', 'description': '把那个夏天，留在一句旋律里。'},
    {'id': 'new-city', 'title': '第一次远行', 'prompt': '初到一座陌生城市，是哪首歌陪着你？', 'description': '远行的路上，也有熟悉的声音。'},
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
