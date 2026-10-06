import {useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {MagnifyingGlass,MusicNotes,CaretDown,ArrowLeft} from '@phosphor-icons/react';
import type {Song} from './api';
import {songCover} from './cardMedia';
import {useData} from './useData';
import {useSession} from './SessionContext';
import {selectDraftSong} from './revisionBehavior';

export function SongPicker({song,onOpen,disabled=false}:{song:Song|null;onOpen:()=>void;disabled?:boolean}){
  return <div className="composer-song-picker"><button type="button" className="composer-song-trigger" aria-label={song?'更换配乐':'添加配乐'} disabled={disabled} onClick={onOpen}>
    {song?<><img src={songCover(song)} alt=""/><span><strong>{song.title}</strong><small>{song.artist}</small></span><small>更换</small></>:<><MusicNotes size={20} aria-hidden="true"/><span>添加配乐</span></>}<CaretDown size={16} aria-hidden="true"/>
  </button></div>;
}

export function SongSearchPage(){
  const [query,setQuery]=useState(''),[retry,setRetry]=useState(0);
  const {user}=useSession();
  const location=useLocation(),navigate=useNavigate();
  const requested=new URLSearchParams(location.search).get('return')??'';
  const returnPath=/^\/(create|songs\/\d+\/write)(\?[^#]*)?$/.test(requested)?requested:'/create';
  const {value:songs,error}=useData<Song[]>('/api/songs',retry);
  const normalized=query.trim().normalize('NFKC').toLocaleLowerCase();
  const visible=normalized?songs?.filter(song=>`${song.title} ${song.artist}`.normalize('NFKC').toLocaleLowerCase().includes(normalized)):songs;
  function transitionDraft(){
    if(!user)return null;
    const routed=location.state?.composerTransition;
    if(routed?.ownerId===user.id&&routed?.returnPath===returnPath&&routed.version===1)return routed;
    try{const raw=window.sessionStorage.getItem(`composer-transition:${user.id}`);const stored=raw?JSON.parse(raw):null;return stored?.ownerId===user.id&&stored?.returnPath===returnPath&&stored.version===1?stored:null;}
    catch{return null;}
  }
  function returnToComposer(draft:object|null){navigate(returnPath,{replace:true,state:draft?{composerTransition:draft}:undefined});}
  function choose(song:Song){
    const draft=selectDraftSong(transitionDraft()??{version:1,ownerId:user?.id,returnPath},song);
    if(user)try{window.sessionStorage.setItem(`composer-transition:${user.id}`,JSON.stringify(draft));}catch{ /* Route state keeps the selection. */ }
    returnToComposer(draft);
  }
  return <section className="journal-page song-search-page">
    <header><button type="button" className="song-search-back" onClick={()=>returnToComposer(transitionDraft())} aria-label="返回填写记忆"><ArrowLeft size={21}/></button><h1>搜索歌曲</h1></header>
    <label className="song-search-field"><MagnifyingGlass size={20} aria-hidden="true"/><input id="create-song-query" aria-label="找歌曲或歌手" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索歌名或歌手" autoComplete="off"/></label>
    <div className="song-search-list" aria-label="搜索结果">{error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>:!songs?<p role="status">正在查找…</p>:visible?.length?visible.map(song=><button key={song.id} type="button" aria-label={`选用${song.title}`} onClick={()=>choose(song)}><img src={songCover(song)} alt="" loading="lazy"/><span><strong>{song.title}</strong><small>{song.artist}</small></span></button>):<p>未找到，试试其他歌名或歌手。</p>}</div>
  </section>;
}
