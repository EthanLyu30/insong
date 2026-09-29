import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl, type Song } from './api';
import { formatPosition } from './memoryClient';

export function AudioPlayer({ song, anchor = null, onMark }: { song: Song; anchor?: number | null; onMark?: (ms: number) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setCurrent(0); setReady(false); setError(''); }, [song.id]);
  if (!song.audio_url) return <p className="resource-note">这个录音暂时无法播放，仍可留下文字和歌曲。</p>;
  const replay = async () => {
    const player = audio.current;
    if (!player) return;
    setError('');
    player.currentTime = (anchor ?? 0) / 1000;
    try { await player.play(); } catch { setError('播放没有成功，请使用播放器重试。'); }
  };
  return <div className={`memory-player${playing ? ' is-playing' : ''}`}>
    <div className="player-caption"><span className="sound-bars" aria-hidden="true"><i/><i/><i/><i/></span><span>{song.recording_label}</span><span>{formatPosition(current)} / {formatPosition(song.duration_ms)}</span></div>
    <audio ref={audio} controls preload="metadata" src={apiBaseUrl + song.audio_url} aria-label={`试听《${song.title}》`}
      onLoadedMetadata={() => {setReady(true); if (audio.current && anchor !== null) audio.current.currentTime = anchor / 1000;}}
      onTimeUpdate={() => setCurrent(Math.round((audio.current?.currentTime ?? 0) * 1000))}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => {setReady(false);setPlaying(false);setError('音频暂时无法加载，请稍后重新打开。');}} />
    <div className="player-actions">
      {anchor !== null && <button type="button" className="soft-button" disabled={!ready} onClick={() => void replay()}>从 {formatPosition(anchor)} 重听这一段</button>}
      {onMark && <button type="button" className="soft-button" disabled={!ready} onClick={() => onMark(Math.min(Math.floor((audio.current?.currentTime ?? 0)) * 1000, (song.duration_ms ?? 1000) - 1000))}>留住当前 {formatPosition(current)}</button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="resource-note">为本项目创作的48秒器乐样例，可真实播放与定位。</p>
  </div>;
}
