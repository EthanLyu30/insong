import {useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {MagnifyingGlass,ArrowRight} from '@phosphor-icons/react';
import type {Song} from './api';
import {songCover} from './cardMedia';
import {useData} from './useData';
import {BackLink} from './Navigation';
import {EventNote} from './EventNote';
import type {Memory} from './memoryClient';
import {useSession} from './SessionContext';
import './memoryExperience.css';

export function CreationPage(){
  const [params,setParams]=useSearchParams();
  const {user}=useSession();
  const query=params.get('q')??'';
  const normalized=query.trim().normalize('NFKC').toLocaleLowerCase();
  const capture=new URLSearchParams();for(const key of ['event','theme'])if(params.get(key))capture.set(key,params.get(key)!);
  function search(value:string){const next=new URLSearchParams(params);if(value)next.set('q',value);else next.delete('q');setParams(next,{replace:true});}
  return <section className="journal-page creation-page">
    <BackLink fallback="/memories"/>
    <header><span className="journal-eyebrow">记下一段音乐里的自己</span><h1>从一首歌开始。</h1></header>
    {params.get('event')&&<EventNote id={params.get('event')!}/>}
    <label className="creation-search" htmlFor="create-song-query"><MagnifyingGlass size={20} aria-hidden="true"/><input id="create-song-query" aria-label="找歌曲或歌手" value={query} onChange={event=>search(event.target.value)} placeholder="找一首歌，或一位歌手" autoComplete="off"/></label>
    {!normalized?user?<RecentChoices capture={capture}/>:<p className="creation-empty">想记住的那首歌，叫什么？</p>:<SearchChoices query={normalized} capture={capture}/>}
  </section>;
}

function SearchChoices({query,capture}:{query:string;capture:URLSearchParams}){
  const [retry,setRetry]=useState(0);
  const {value:songs,error}=useData<Song[]>('/api/songs',retry);
  const visible=songs?.filter(song=>`${song.title} ${song.artist}`.normalize('NFKC').toLocaleLowerCase().includes(query));
  return error?<div className="form-error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(value=>value+1)}>重新加载</button></div>:!songs?<p role="status">正在翻找歌曲…</p>:visible?.length?<SongChoices songs={visible} capture={capture}/>:<p className="creation-empty">还未收录这首歌，试试其他歌名或歌手。</p>;
}

function SongChoices({songs,capture}:{songs:Song[];capture:URLSearchParams}){
  return <div className="creation-song-list">{songs.map(song=><Link key={song.id} to={`/songs/${song.id}/write${capture.size?`?${capture}`:''}`}><img src={songCover(song)} alt="" loading="lazy"/><span><strong>{song.title}</strong><small>{song.artist}</small></span><ArrowRight size={18}/></Link>)}</div>;
}

function RecentChoices({capture}:{capture:URLSearchParams}){
  const {value:memories,error}=useData<Memory[]>('/api/memories');
  const songs=memories?[...new Map(memories.filter(card=>!card.is_demo_sample).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(card=>[card.song_id,card.song])).values()].slice(0,4):[];
  return songs.length?<section className="creation-recent"><h2>最近记录过</h2><SongChoices songs={songs} capture={capture}/></section>:<p className="creation-empty" role={!memories&&!error?'status':undefined}>{!memories&&!error?'正在找回最近的配乐…':'想记住的那首歌，叫什么？'}</p>;
}
