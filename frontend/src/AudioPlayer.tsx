import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiBaseUrl, type Song } from './api';
import { formatPosition } from './memoryClient';
import {Play, Pause, Rewind, FastForward} from '@phosphor-icons/react';

export function AudioPlayer({song,anchor=null,end=null,onMark,autoPlay=false,compact=false,full=false}: {
  song:Song;anchor?:number|null;end?:number|null;onMark?:(ms:number)=>void;autoPlay?:boolean;compact?:boolean;full?:boolean;
}) {
  const audio=useRef<HTMLAudioElement>(null);
  const [current,setCurrent]=useState(0),[ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[error,setError]=useState('');
  const validAnchor=anchor!=null&&Number.isFinite(anchor)&&anchor>=0&&anchor<(song.duration_ms??0)?anchor:null;
  const clipped=end!=null && Number.isFinite(end) && validAnchor!=null && end>validAnchor && end<=(song.duration_ms??0);
  const start=clipped?validAnchor!:(full?validAnchor??0:0);
  const limit=clipped?end:null;
  useEffect(()=>{setReady(false);setPlaying(false);setError('');},[song.id,song.audio_url]);
  useEffect(()=>{
    setCurrent(start);
    // Selecting a new lyric changes the position, not the loaded audio source.
    if(audio.current&&ready)audio.current.currentTime=start/1000;
  },[start,limit,ready]);
  useLayoutEffect(()=>{
    const player=audio.current;if(!player)return;
    const pauseOthers=(event:Event)=>{if(event.target!==player)player.pause();};
    document.addEventListener('play',pauseOthers,true);
    if(autoPlay)void player.play().catch(()=>setError('轻点播放，继续听这一刻。'));
    return ()=>{document.removeEventListener('play',pauseOthers,true);player.pause();};
  },[song.audio_url,autoPlay]);
  useEffect(()=>{
    if(!playing||limit==null)return;
    // Native timeupdate is sparse; also bound the last fraction of a selected clip.
    const timer=window.setInterval(()=>{
      const player=audio.current;if(player && player.currentTime>=limit/1000){player.pause();player.currentTime=limit/1000;setCurrent(limit);}
    },40);
    return ()=>window.clearInterval(timer);
  },[playing,limit]);
  async function replay(from:number) {
    const player=audio.current;if(!player)return;setError('');player.currentTime=from/1000;
    try{await player.play();}catch{setError('播放没有成功，请点播放器重试。');}
  }
  function seek(to:number){const player=audio.current;if(!player)return;const ms=Math.max(clipped?start:0,Math.min(limit??song.duration_ms??0,to));player.currentTime=ms/1000;setCurrent(ms);}
  async function toggle(){if(!audio.current)return;if(playing)audio.current.pause();else await replay(limit!==null&&current>=limit?start:current);}
  function update() {
    const player=audio.current;if(!player)return;
    if(limit!=null && player.currentTime>=limit/1000){player.pause();player.currentTime=limit/1000;}
    setCurrent(Math.round(player.currentTime*1000));
  }
  if(!song.audio_url)return full?<div className="full-player unavailable-player"><div className="full-progress"><input type="range" aria-label="播放进度" min={0} max={1} value={0} disabled/><div><span>--:--</span><span>--:--</span></div></div><div className="full-controls"><button type="button" disabled aria-label="后退15秒"><Rewind size={26} weight="fill"/></button><button type="button" className="full-play" disabled aria-label={`播放${song.title}`}><Play size={30} weight="fill"/></button><button type="button" disabled aria-label="快进15秒"><FastForward size={26} weight="fill"/></button></div><p className="missing-audio">暂未接入这首歌的音源</p></div>:<div className="resource-note audio-unavailable"><Play size={15}/> 暂未接入这首歌的音源</div>;
  return <div className={`memory-player${playing?' is-playing':''}${compact?' compact-player':''}${full?' full-player':''}`}>
    {!full&&<div className="player-caption"><span className="sound-bars" aria-hidden="true"><i/><i/><i/><i/></span><span>{clipped?`喜欢的片段 · ${formatPosition(start)} — ${formatPosition(limit)}`:'整首播放'}</span><span>{formatPosition(current)}</span></div>}
    <audio ref={audio} controls={!full} preload="metadata" src={apiBaseUrl+song.audio_url} aria-label={`试听《${song.title}》`}
      onLoadedMetadata={()=>{setReady(true);if(audio.current)audio.current.currentTime=start/1000;}}
      onTimeUpdate={update}
      onSeeking={()=>{const player=audio.current;if(player&&clipped&&(player.currentTime<start/1000||player.currentTime>limit!/1000))player.currentTime=Math.min(limit!/1000,Math.max(start/1000,player.currentTime));}}
      onPlay={()=>{const player=audio.current;if(player&&limit!=null&&player.currentTime>=limit/1000)player.currentTime=start/1000;setPlaying(true);setError('');}}
      onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}
      onError={()=>{setReady(false);setPlaying(false);setError('音频暂时无法加载，请稍后重试。');}}/>
    {full&&<><div className="full-progress"><input type="range" aria-label="播放进度" min={clipped?start:0} max={limit??song.duration_ms??0} step={100} value={current} disabled={!ready} onChange={event=>seek(Number(event.target.value))}/><div><span>{formatPosition(current)}</span><span>{formatPosition(limit??song.duration_ms)}</span></div></div><div className="full-controls"><button type="button" disabled={!ready} aria-label="后退15秒" onClick={()=>seek(current-15000)}><Rewind size={28} weight="fill"/></button><button type="button" className="full-play" disabled={!ready} aria-label={`${playing?'暂停':'播放'}${song.title}`} onClick={()=>void toggle()}>{playing?<Pause size={32} weight="fill"/>:<Play size={32} weight="fill"/>}</button><button type="button" disabled={!ready} aria-label="快进15秒" onClick={()=>seek(current+15000)}><FastForward size={28} weight="fill"/></button></div></>}
    {(validAnchor!==null||onMark)&&<div className="player-actions">
      {validAnchor!==null&&<button type="button" className="soft-button" disabled={!ready} onClick={()=>void replay(validAnchor)}>{clipped?'重听这一段':`从 ${formatPosition(validAnchor)} 重听`}</button>}
      {onMark&&<button type="button" className="soft-button" disabled={!ready} onClick={()=>onMark(Math.min(Math.floor(audio.current?.currentTime??0)*1000,(song.duration_ms??1000)-1000))}>留住当前 {formatPosition(current)}</button>}
    </div>}
    {error&&<p className="form-error" role="status">{error}</p>}
  </div>;
}
