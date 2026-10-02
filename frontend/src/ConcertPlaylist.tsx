import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router';
import {BookmarkSimple,Check,Play,Pause} from '@phosphor-icons/react';
import {useSession} from './SessionContext';
import {apiBaseUrl} from './api';
import {ApiError,apiRequest,dayLabel} from './memoryClient';
import type {AtlasEvent,AtlasSong} from './footprintAtlas';
import './playlistVersions.css';
import {BackLink} from './Navigation';

type SetlistKind='confirmed'|'partial'|'artist_collection';
export type SavedPlaylist={
  id:number;event_id:string;name:string;artist:string;city:string;venue:string;date:string;songs:Pick<AtlasSong,'title'|'artist'>[];
  created_at:string;snapshot_version:string;current_version:string|null;update_available:boolean;legacy_snapshot:boolean;
  setlist_kind?:SetlistKind;setlist_note:string;setlist_verified_on:string|null;catalog_checked_on:string|null;
  current_setlist_kind:SetlistKind|null;current_setlist_verified_on:string|null;event_status:string;
};

class PlaylistConflict extends Error {}

async function refreshSnapshot(playlist:SavedPlaylist,signal:AbortSignal):Promise<SavedPlaylist>{
  try{
    return await apiRequest<SavedPlaylist>(apiBaseUrl,`/api/playlists/${playlist.id}/refresh`,{
      method:'POST',signal,
      body:JSON.stringify({expected_snapshot_version:playlist.snapshot_version,expected_current_version:playlist.current_version}),
    });
  }catch(reason){
    if(reason instanceof ApiError&&reason.status===409)throw new PlaylistConflict('收藏版本已变化，请核对后再更新。');
    throw reason;
  }
}

function usePlaylistRefresh(scope:string){
  const request=useRef<AbortController|null>(null);
  const [refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    request.current?.abort();request.current=null;setRefreshing(false);setError('');
    return()=>{request.current?.abort();request.current=null;};
  },[scope]);
  async function refresh(playlist:SavedPlaylist,accept:(value:SavedPlaylist)=>void,reload:(signal:AbortSignal)=>Promise<void>){
    if(request.current||!playlist.update_available||!playlist.snapshot_version||!playlist.current_version)return;
    const controller=new AbortController();request.current=controller;setRefreshing(true);setError('');
    const active=()=>!controller.signal.aborted&&request.current===controller;
    try{const value=await refreshSnapshot(playlist,controller.signal);if(active())accept(value);}
    catch(reason){
      if(!active())return;
      setError(reason instanceof Error?reason.message:'歌单暂时没有更新成功，请重试。');
      if(reason instanceof PlaylistConflict){
        try{await reload(controller.signal);}
        catch{if(active())setError('收藏版本已变化，暂时没有读到最新状态。请稍后再试。');}
      }
    }finally{if(active()){request.current=null;setRefreshing(false);}}
  }
  return {refresh,refreshing,error};
}

function playlistKind(playlist:SavedPlaylist){
  if(playlist.legacy_snapshot)return '旧版收藏 · 曲目类型待核实';
  return {confirmed:'已核实现场歌单',partial:'部分现场曲目',artist_collection:'关联作品'}[playlist.setlist_kind??'artist_collection'];
}

function SnapshotSummary({playlist,compact=false}:{playlist:SavedPlaylist;compact?:boolean}){
  return <div className="playlist-version-summary">
    <span className="playlist-snapshot-kind">{playlistKind(playlist)}</span>
    <p className="playlist-snapshot-dates">
      {playlist.created_at&&<span>收藏于 {dayLabel(playlist.created_at)}</span>}
      {playlist.catalog_checked_on&&<span>版本核对 {playlist.catalog_checked_on.replaceAll('-','.')}</span>}
      {!playlist.legacy_snapshot&&playlist.setlist_verified_on&&<span>曲目核实 {playlist.setlist_verified_on.replaceAll('-','.')}</span>}
    </p>
    {!compact&&(playlist.legacy_snapshot?<p className="playlist-snapshot-note">保留的是旧版收藏，曲目类型尚未核实。</p>:playlist.setlist_note&&<p className="playlist-snapshot-note">{playlist.setlist_note}</p>)}
  </div>;
}

function PlaylistUpdate({playlist,refreshing,onUpdate}:{playlist:SavedPlaylist;refreshing:boolean;onUpdate:()=>void}){
  if(!playlist.update_available||!playlist.current_version)return null;
  return <div className="playlist-update-notice">
    <p>这场的歌单资料已有更新。<span>当前保留收藏时的版本。</span></p>
    <button type="button" className="playlist-update-button" disabled={refreshing} onClick={onUpdate}>{refreshing?'更新中…':'更新这张歌单'}</button>
  </div>;
}

export function CollectConcert({event,next}:{event:AtlasEvent;next:string}){
  const {user}=useSession();const location=useLocation();const [saved,setSaved]=useState<SavedPlaylist|null>(null),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState('');
  const update=usePlaylistRefresh(`${user?.id??''}/${event.id}/${location.key}`);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{
    setSaved(null);setError('');setBusy(false);setChecking(!!user);if(!user)return;
    const controller=new AbortController();
    apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal:controller.signal}).then(items=>{if(!controller.signal.aborted)setSaved(items.find(item=>item.event_id===event.id)??null);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'没有读到歌单。');}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});
    return()=>{controller.abort();request.current?.abort();request.current=null;};
  },[user?.id,event.id,location.key]);
  async function collect(){
    if(!user||saved||request.current||!event.songs.length)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    try{const value=await apiRequest<SavedPlaylist>(apiBaseUrl,`/api/playlists/concerts/${encodeURIComponent(event.id)}`,{method:'PUT',signal:controller.signal});if(!controller.signal.aborted)setSaved(value);}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'歌单没有收藏成功。');}
    finally{if(!controller.signal.aborted){request.current=null;setBusy(false);}}
  }
  const message=error||update.error,needsLogin=!user||message.includes('请先登录');
  async function reload(signal:AbortSignal){const values=await apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal});if(!signal.aborted)setSaved(values.find(value=>value.event_id===event.id)??null);}
  return <div className="concert-collect">{needsLogin?<Link className="collect-button" to={`/account?next=${encodeURIComponent(next)}`}><BookmarkSimple size={19} weight="light"/>登录收藏歌单</Link>:saved?<><Link className="collect-button is-saved" to={`/playlists?list=${saved.id}`}><Check size={19}/>已收藏 · 查看歌单</Link><SnapshotSummary playlist={saved} compact/><PlaylistUpdate playlist={saved} refreshing={update.refreshing} onUpdate={()=>void update.refresh(saved,setSaved,reload)}/></>:<button className="collect-button" type="button" disabled={busy||checking||!event.songs.length} onClick={()=>void collect()}>{!busy&&!checking&&event.songs.length>0&&<BookmarkSimple size={19} weight="light"/>}{busy?'正在收藏…':checking?'读取歌单…':event.songs.length?'收藏为歌单':'曲目尚未收录'}</button>}{message&&!needsLogin&&<p role="alert">{message}</p>}</div>;
}
export function SongList({songs,selected,playing,onSong}:{songs:Pick<AtlasSong,'title'|'artist'>[];selected?:string;playing?:string;onSong?:(index:number)=>void}){
  const list=useRef<HTMLOListElement>(null);
  useEffect(()=>{const index=songs.findIndex(song=>song.title===selected),element=list.current,row=element?.children[index] as HTMLElement|undefined;if(!onSong||!element||!row)return;const top=row.getBoundingClientRect().top-element.getBoundingClientRect().top+element.scrollTop;const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; element.scrollTo?.({top:Math.max(0,top-8),behavior:reduced?'instant':'smooth'});},[selected,songs]);
  return <ol ref={list} className="concert-song-list">{songs.map((song,index)=><li key={index}><button type="button" className={selected===song.title?'is-selected':''} aria-label={`${playing===song.title?'暂停':'播放'}${song.title}`} onClick={()=>onSong?.(index)} disabled={!onSong}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{song.title}</strong><small>{song.artist}</small></div>{onSong&&(playing===song.title?<Pause size={14} weight="fill" aria-hidden="true"/>:<Play size={14} weight="fill" aria-hidden="true"/>)}</button></li>)}</ol>;
}
export function PlaylistsPage(){
  const {user}=useSession();const [params]=useSearchParams();const location=useLocation();const [items,setItems]=useState<SavedPlaylist[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const update=usePlaylistRefresh(`${user?.id??''}/${location.key}`);
  useEffect(()=>{setItems(null);setError('');if(!user)return;const controller=new AbortController();apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setItems(value);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'歌单没有读到。');});return()=>controller.abort();},[user?.id,retry,location.key]);
  if(!user||error.includes('请先登录')||update.error.includes('请先登录'))return <section className="journal-page empty-journal"><h1>把这一晚，<br/>收进歌单。</h1><Link className="primary-button" to={`/account?next=${encodeURIComponent('/playlists'+(params.size?'?'+params:''))}`}>登录查看我的歌单</Link></section>;
  const selected=items?.find(item=>String(item.id)===params.get('list'));
  async function reload(signal:AbortSignal){const values=await apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal});if(!signal.aborted)setItems(values);}
  const accept=(value:SavedPlaylist)=>setItems(current=>current?.map(item=>item.id===value.id?value:item)??null);
  return <section className="journal-page saved-playlists"><BackLink fallback={params.has('list')?'/playlists':'/memories'}/><div className="journal-title-row"><div><span className="journal-eyebrow">那些不想结束的夜晚</span><h1>我的现场歌单</h1></div><span>{items?.length??0} 张</span></div>{error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(x=>x+1)}>重试</button></p>:!items?<p role="status">正在翻开歌单…</p>:!items.length?<div className="empty-playlists"><p>还没有收藏歌单。去一场演唱会的星空，收下喜欢的曲目。</p><Link className="primary-button" to="/footprints">去现场地图</Link></div>:selected?<article className="saved-playlist-detail"><Link to="/playlists" className="text-button">全部歌单</Link><header><span className="playlist-record" aria-hidden="true">◉</span><h2>{selected.artist} · {selected.city}</h2><p>{selected.date} / {selected.venue}</p><span>{selected.songs.length} 首歌</span></header><SnapshotSummary playlist={selected}/><PlaylistUpdate playlist={selected} refreshing={update.refreshing} onUpdate={()=>void update.refresh(selected,accept,reload)}/>{update.error&&<p className="playlist-update-error" role="alert">{update.error}</p>}<SongList songs={selected.songs}/><Link className="soft-button" to={`/footprints?event=${encodeURIComponent(selected.event_id)}&scene=sky`}>回到这片星空 ↗</Link></article>:<div className="saved-playlist-grid">{items.map(item=><Link className="saved-playlist-card" key={item.id} to={`/playlists?list=${item.id}`}><span className="playlist-record" aria-hidden="true">◉</span><div><h2>{item.artist} · {item.city}</h2><p>{item.date} · {item.songs.length} 首</p><small>{item.venue} · {playlistKind(item)}</small>{item.update_available&&<span className="playlist-card-update">歌单资料已有更新</span>}</div><b>↗</b></Link>)}</div>}</section>;
}
