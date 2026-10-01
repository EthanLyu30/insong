import {useLayoutEffect,useRef,useState} from 'react';
import {Pause,Play,SpinnerGap} from '@phosphor-icons/react';
import {apiBaseUrl} from './api';
import {ConcertPlayback,EMPTY_PLAYBACK,type ConcertPlaybackState} from './concertPlayback';
import type {AtlasSong} from './footprintAtlas';

export function useConcertPlayer(eventKey:string|null){
  const audio=useRef<HTMLAudioElement>(null),engine=useRef<ConcertPlayback|null>(null);
  const [state,setState]=useState<ConcertPlaybackState>({...EMPTY_PLAYBACK});
  useLayoutEffect(()=>{
    setState({...EMPTY_PLAYBACK});if(!eventKey||!audio.current)return;
    const media=audio.current;
    const player=new ConcertPlayback(media,setState,apiBaseUrl||window.location.origin);engine.current=player;
    const pauseOthers=(event:Event)=>{if(event.target!==media)player.pause();};
    document.addEventListener('play',pauseOthers,true);
    return()=>{document.removeEventListener('play',pauseOthers,true);player.destroy();engine.current=null;};
  },[eventKey]);
  return {audio,state,select:(song:AtlasSong)=>engine.current?.select(song),seek:(seconds:number)=>engine.current?.seek(seconds)};
}
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function ConcertPlayer({player}:{player:ReturnType<typeof useConcertPlayer>}){
  const {song,phase,currentTime,duration,message}=player.state;
  return <>
    <audio ref={player.audio} preload="metadata" aria-label="现场歌单播放器"/>
    {song&&<div className={'concert-player is-'+phase}>
      <div className="concert-player-line"><button type="button" disabled={!song.audio_url} onClick={()=>player.select(song)} aria-label={phase==='playing'||phase==='loading'?`暂停${song.title}`:`播放${song.title}`}>
        {phase==='loading'?<SpinnerGap size={18} className="concert-loading"/>:phase==='playing'?<Pause size={17} weight="fill"/>:<Play size={17} weight="fill"/>}
      </button><div><strong>{song.title}</strong><span role="status">{message|| (phase==='loading'?'正在加载…':phase==='playing'?'正在播放':phase==='ended'?'播放结束':'已暂停')}{song.audio_label&&` · ${song.audio_label}`}</span></div>{duration>0&&<small>{time(currentTime)} / {time(duration)}</small>}</div>
      {duration>0&&<input type="range" min="0" max={duration} step=".1" value={currentTime} onChange={event=>player.seek(Number(event.target.value))} aria-label={`《${song.title}》播放进度`}/>}
    </div>}
  </>;
}
