from pathlib import Path
from .content import song_lyrics

AUDIO_ROOT = Path(__file__).resolve().parents[1] / 'media'
DURATION_MS = 48000


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
    return {key: getattr(song, key) for key in (
        'id', 'title', 'artist', 'version', 'source_label', 'is_demo'
    )} | song_audio(song) | {'lyrics': song_lyrics(song),
        'lyrics_note': '原创示例词句 · 配合器乐演示逐句定位，无人声演唱'}
