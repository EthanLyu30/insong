import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {BookmarkSimple,Check} from '@phosphor-icons/react';
import {useSession} from './SessionContext';
import {apiBaseUrl} from './api';
import {apiRequest} from './memoryClient';
import type {AtlasEvent,AtlasSong} from './footprintAtlas';

export type SavedPlaylist={id:number;event_id:string;name:string;artist:string;city:string;venue:string;date:string;songs:Pick<AtlasSong,'title'|'artist'>[]};
export function CollectConcert({event,next}:{event:AtlasEvent;next:string}){
  const {user}=useSession();const [saved,setSaved]=useState<SavedPlaylist|null>(null),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{
    setSaved(null);setError('');setBusy(false);setChecking(!!user);if(!user)return;
    const controller=new AbortController();
    apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal:controller.signal}).then(items=>{if(!controller.signal.aborted)setSaved(items.find(item=>item.event_id===event.id)??null);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'没有读到歌单。');}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});
    return()=>{controller.abort();request.current?.abort();request.current=null;};
  },[user?.id,event.id]);
  async function collect(){
    if(!user||saved||request.current||!event.songs.length)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    try{const value=await apiRequest<SavedPlaylist>(apiBaseUrl,`/api/playlists/concerts/${encodeURIComponent(event.id)}`,{method:'PUT',signal:controller.signal});if(!controller.signal.aborted)setSaved(value);}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'歌单没有收藏成功。');}
    finally{if(!controller.signal.aborted){request.current=null;setBusy(false);}}
  }
  const needsLogin=!user||error.includes('请先登录');
  return <div className="concert-collect">{needsLogin?<Link className="collect-button" to={`/account?next=${encodeURIComponent(next)}`}><BookmarkSimple size={19} weight="light"/>登录收藏歌单</Link>:saved?<Link className="collect-button is-saved" to={`/playlists?list=${saved.id}`}><Check size={19}/>已收藏 · 查看歌单</Link>:<button className="collect-button" type="button" disabled={busy||checking||!event.songs.length} onClick={()=>void collect()}>{!busy&&!checking&&event.songs.length>0&&<BookmarkSimple size={19} weight="light"/>}{busy?'正在收藏…':checking?'读取歌单…':event.songs.length?'收藏为歌单':'曲目尚未收录'}</button>}{error&&!needsLogin&&<p role="alert">{error}</p>}</div>;
}
export function SongList({songs,selected,onSong}:{songs:Pick<AtlasSong,'title'|'artist'>[];selected?:string;onSong?:(index:number)=>void}){
  const list=useRef<HTMLOListElement>(null);
  useEffect(()=>{const index=songs.findIndex(song=>song.title===selected),element=list.current,row=element?.children[index] as HTMLElement|undefined;if(!onSong||!element||!row)return;const top=row.getBoundingClientRect().top-element.getBoundingClientRect().top+element.scrollTop;const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; element.scrollTo?.({top:Math.max(0,top-8),behavior:reduced?'instant':'smooth'});},[selected,songs]);
  return <ol ref={list} className="concert-song-list">{songs.map((song,index)=><li key={index}><button type="button" className={selected===song.title?'is-selected':''} onClick={()=>onSong?.(index)} disabled={!onSong}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{song.title}</strong><small>{song.artist}</small></div><i aria-hidden="true">{selected===song.title?'✦':'·'}</i></button></li>)}</ol>;
}
export function PlaylistsPage(){
  const {user}=useSession();const [params]=useSearchParams();const [items,setItems]=useState<SavedPlaylist[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{setItems(null);setError('');if(!user)return;const controller=new AbortController();apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setItems(value);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'歌单没有读到。');});return()=>controller.abort();},[user?.id,retry]);
  if(!user||error.includes('请先登录'))return <section className="journal-page empty-journal"><h1>把这一晚，<br/>收进歌单。</h1><Link className="primary-button" to={`/account?next=${encodeURIComponent('/playlists'+(params.size?'?'+params:''))}`}>登录查看我的歌单</Link></section>;
  const selected=items?.find(item=>String(item.id)===params.get('list'));
  return <section className="journal-page saved-playlists"><Link className="back-link" to="/footprints">← 回到现场地图</Link><div className="journal-title-row"><div><span className="journal-eyebrow">那些不想结束的夜晚</span><h1>我的现场歌单</h1></div><span>{items?.length??0} 张</span></div>{error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(x=>x+1)}>重试</button></p>:!items?<p role="status">正在翻开歌单…</p>:!items.length?<div className="empty-playlists"><p>还没有收藏歌单。去一场演唱会的星空，收下喜欢的曲目。</p><Link className="primary-button" to="/footprints">去现场地图</Link></div>:selected?<article className="saved-playlist-detail"><Link to="/playlists" className="text-button">全部歌单</Link><header><span className="playlist-record" aria-hidden="true">◉</span><h2>{selected.artist} · {selected.city}</h2><p>{selected.date} / {selected.venue}</p><span>{selected.songs.length} 首歌</span></header><SongList songs={selected.songs}/><Link className="soft-button" to={`/footprints?event=${encodeURIComponent(selected.event_id)}`}>回到这片星空 ↗</Link></article>:<div className="saved-playlist-grid">{items.map(item=><Link className="saved-playlist-card" key={item.id} to={`/playlists?list=${item.id}`}><span className="playlist-record" aria-hidden="true">◉</span><div><h2>{item.artist} · {item.city}</h2><p>{item.date} · {item.songs.length} 首</p><small>{item.venue}</small></div><b>↗</b></Link>)}</div>}</section>;
}
