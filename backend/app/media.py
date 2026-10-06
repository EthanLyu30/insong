from pathlib import Path
from .content import song_lyrics
from sqlalchemy import select
from .models import MemoryCard, PublicStory

AUDIO_ROOT = Path(__file__).resolve().parents[1] / 'media'
DURATION_MS = 48000

# Exact original recordings checked against QQ Music's official search on
# 2026-10-04. Demo Artist tracks deliberately have no commercial counterpart.
QQ_TRACKS = {
    ('稻香', '周杰伦'): '003aAYrm3GE0Ac',
    ('光年之外', '邓紫棋'): '002E3MtF0IAMMY',
    ('泡沫', '邓紫棋'): '001X0PDf0W4lBq',
    ('reality', '刘雨昕'): '000h6xTe1LRGfl',
    ('倔强', '五月天'): '004HyLC74RYiBC',
}

def can_read_song(db, song, user):
    if song is None:
        return False
    if song.owner_id is None or user is not None and song.owner_id == user.id:
        return True
    if user is not None and db.scalar(select(MemoryCard.id).where(
            MemoryCard.song_id == song.id, MemoryCard.owner_id == user.id).limit(1)):
        return True
    return bool(db.scalar(select(MemoryCard.id).join(PublicStory).where(
        MemoryCard.song_id == song.id, PublicStory.published.is_(True)).limit(1)))


def song_audio(song):
    path = AUDIO_ROOT / f'song-{song.id}-v1.wav'
    available = song.is_demo and song.version == '演示录音室版' and path.is_file()
    return {
        'audio_available': bool(available),
        'audio_url': f'/api/audio/song-{song.id}-v1.wav' if available else None,
        'duration_ms': DURATION_MS if available else None,
        'recording_label': '原创器乐样例 v1' if available else song.version,
    }


def serialize_song(song):
    qq_mid = None if song.is_demo or song.owner_id is not None else QQ_TRACKS.get((song.title.lower(), song.artist))
    return {key: getattr(song, key) for key in (
        'id', 'title', 'artist', 'version', 'source_label', 'is_demo', 'cover_url'
    )} | song_audio(song) | {'lyrics': song_lyrics(song),
        'qq_music_url': f'https://y.qq.com/n/ryqq/songDetail/{qq_mid}' if qq_mid else None,
        'lyrics_note': '原创示例词句 · 配合器乐演示逐句定位，无人声演唱' if song.is_demo else '曲目资料 · 暂无授权音频与歌词'}
