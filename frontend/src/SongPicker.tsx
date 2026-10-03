import {useRef,useState} from 'react';
import {MagnifyingGlass,MusicNotes,CaretDown,Check} from '@phosphor-icons/react';
import type {Song} from './api';
import {songCover} from './cardMedia';
import {useData} from './useData';

export function SongPicker({song,onChoose,disabled=false}:{song:Song|null;onChoose:(song:Song)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState('');
  const trigger=useRef<HTMLButtonElement>(null);
  function close(){setOpen(false);trigger.current?.focus();}
  const normalized=query.trim().normalize('NFKC').toLocaleLowerCase();
  return <div className="composer-song-picker">
    <button ref={trigger} type="button" className="composer-song-trigger" aria-label={song?'更换配乐':'添加配乐'} aria-expanded={open} disabled={disabled} onClick={()=>setOpen(value=>!value)}>
      {song?<><img src={songCover(song)} alt=""/><span><strong>{song.title}</strong><small>{song.artist}</small></span><small>更换</small></>:<><MusicNotes size={20} aria-hidden="true"/><span>添加配乐</span></>}<CaretDown size={16} aria-hidden="true"/>
    </button>
    {open&&<div className="composer-song-search" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
      <label className="creation-search" htmlFor="create-song-query"><MagnifyingGlass size={18} aria-hidden="true"/><input id="create-song-query" aria-label="找歌曲或歌手" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}} placeholder="搜索歌名或歌手" autoComplete="off" autoFocus disabled={disabled}/></label>
      {normalized&&<SongResults query={normalized} selected={song?.id} disabled={disabled} onChoose={value=>{onChoose(value);close();setQuery('');}}/>}
    </div>}
  </div>;
}

function SongResults({query,selected,onChoose,disabled}:{query:string;selected?:number;onChoose:(song:Song)=>void;disabled:boolean}){
  const [retry,setRetry]=useState(0);
  const {value:songs,error}=useData<Song[]>('/api/songs',retry);
  const visible=songs?.filter(song=>`${song.title} ${song.artist}`.normalize('NFKC').toLocaleLowerCase().includes(query));
  return error?<p className="form-error" role="alert">{error}<button className="text-button" type="button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>:!songs?<p className="composer-search-status" role="status">正在查找…</p>:visible?.length?<div className="composer-song-results">{visible.map(song=><button key={song.id} type="button" aria-label={`选用${song.title}`} disabled={disabled} onClick={()=>onChoose(song)}><img src={songCover(song)} alt="" loading="lazy"/><span><strong>{song.title}</strong><small>{song.artist}</small></span>{selected===song.id&&<Check size={17} aria-label="已选"/>}</button>)}</div>:<p className="composer-search-status" role="status">未找到，试试其他歌名或歌手。</p>;
}
