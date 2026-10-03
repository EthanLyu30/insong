import {useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {MagnifyingGlass,ArrowRight} from '@phosphor-icons/react';
import type {Song} from './api';
import {songCover} from './cardMedia';
import {useData} from './useData';
import {BackLink} from './Navigation';
import {EventNote} from './EventNote';
import './memoryExperience.css';

export function CreationPage(){
  const [params,setParams]=useSearchParams(),[retry,setRetry]=useState(0);
  const {value:songs,error}=useData<Song[]>('/api/songs',retry);
  const query=params.get('q')??'';
  const normalized=query.trim().normalize('NFKC').toLocaleLowerCase();
  const visible=songs?.filter(song=>`${song.title} ${song.artist}`.normalize('NFKC').toLocaleLowerCase().includes(normalized));
  const capture=new URLSearchParams();for(const key of ['event','theme'])if(params.get(key))capture.set(key,params.get(key)!);
  function search(value:string){const next=new URLSearchParams(params);if(value)next.set('q',value);else next.delete('q');setParams(next,{replace:true});}
  return <section className="journal-page creation-page">
    <BackLink fallback="/memories"/>
    <header><span className="journal-eyebrow">记下一段音乐里的自己</span><h1>从一首歌开始。</h1></header>
    {params.get('event')&&<EventNote id={params.get('event')!}/>}
    <label className="creation-search" htmlFor="create-song-query"><MagnifyingGlass size={20} aria-hidden="true"/><input id="create-song-query" aria-label="找歌曲或歌手" value={query} onChange={event=>search(event.target.value)} placeholder="找一首歌，或一位歌手" autoComplete="off"/></label>
    {error?<div className="form-error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(value=>value+1)}>重新加载</button></div>:!songs?<p role="status">正在翻找歌曲…</p>:visible?.length?<div className="creation-song-list">{visible.map(song=><Link key={song.id} to={`/songs/${song.id}/write${capture.size?`?${capture}`:''}`}><img src={songCover(song)} alt="" loading="lazy"/><span><strong>{song.title}</strong><small>{song.artist}</small></span><ArrowRight size={18}/></Link>)}</div>:<p className="creation-empty">没有找到这首歌，换个歌名或歌手试试。</p>}
  </section>;
}
