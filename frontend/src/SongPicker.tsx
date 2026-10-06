import {useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {MagnifyingGlass,MusicNotes,CaretDown,ArrowLeft} from '@phosphor-icons/react';
import type {Song} from './api';
import {songCover} from './cardMedia';
import {useData} from './useData';
import {useSession} from './SessionContext';
import {selectDraftSong} from './revisionBehavior';
import {hasDraftContent,readMemoryDrafts,saveMemoryDraft,validPending,type ManualSong,type MemoryDraftData} from './memoryDrafts';
import {MemoryExitDialog,useMemoryExitGuard} from './MemoryExitGuard';
import {readComposerTransition,writeComposerTransition,clearComposerTransition,composerDiscarded} from './composerTransition';

type Transition=MemoryDraftData&{ownerId:number;returnPath:string;originKey?:string;unsaved?:boolean;ownedDraftId?:string|null;ownedLocalDraft?:string|null};
export function SongPicker({song,manual,pending,onOpen,disabled=false}:{song:Song|null;manual?:ManualSong|null;pending?:ManualSong|null;onOpen:()=>void;disabled?:boolean}){
  return <div className="composer-song-picker"><button type="button" className="composer-song-trigger" aria-label={pending?'继续填写配乐':song||manual?'更换配乐':'添加配乐'} disabled={disabled} onClick={onOpen}>
    {pending?<><MusicNotes size={20}/><span>继续填写配乐</span></>:song||manual?<>{song?<img src={songCover(song)} alt=""/>:<MusicNotes size={20}/>}<span><strong>{(song??manual)!.title}</strong><small>{(song??manual)!.artist}</small></span><small>更换</small></>:<><MusicNotes size={20} aria-hidden="true"/><span>添加配乐</span></>}<CaretDown size={16} aria-hidden="true"/>
  </button></div>;
}
export function SongSearchPage(){
  const [query,setQuery]=useState(''),[retry,setRetry]=useState(0),[saveError,setSaveError]=useState('');
  const {user}=useSession();const location=useLocation(),navigate=useNavigate();
  const requested=new URLSearchParams(location.search).get('return')??'';
  const returnPath=/^\/(create|songs\/\d+\/write)(\?[^#]*)?$/.test(requested)?requested:'/create';
  function readTransition():Transition|null{
    if(!user)return null;
    const routed=location.state?.composerTransition;
    const valid=(value:Transition|null)=>value?.ownerId===user.id&&value.returnPath===returnPath&&value.version===1&&typeof value.story==='string';
    if(!valid(routed))return null;
    if(routed.originKey&&composerDiscarded(user.id,returnPath,routed.originKey))return null;
    const stored=routed.originKey?readComposerTransition(user.id,returnPath,routed.originKey):null;
    if(stored&&valid(stored as Transition))return stored as Transition;
    return routed;
  }
  const [draft,setDraft]=useState<Transition|null>(readTransition);
  const initial=useRef(draft);
  const [manualOpen,setManualOpen]=useState(!!draft?.pendingSong);
  const {value:songs,error}=useData<Song[]>('/api/songs',retry);
  const normalized=query.trim().normalize('NFKC').toLocaleLowerCase();
  const visible=normalized?songs?.filter(song=>`${song.title} ${song.artist}`.normalize('NFKC').toLocaleLowerCase().includes(normalized)):songs;
  const manual=validPending(draft?.pendingSong,['title','artist'])?draft!.pendingSong!:{title:'',artist:''};
  const content=(value:Transition|null)=>JSON.stringify(['story','title','song','manualSong','manualEvent','pendingSong','pendingEvent','photos','lifeTime','locationName'].map(name=>value?.[name]??null));
  const dirty=!!draft&&hasDraftContent(draft)&&(!!initial.current?.unsaved||content(draft)!==content(initial.current));
  const exit=useMemoryExitGuard(dirty,returnPath);
  function persist(value:Transition){
    setDraft(value);
    if(user)writeComposerTransition(user.id,value);
  }
  function base():Transition{return draft??{version:1,story:'',ownerId:user?.id??-1,returnPath,originKey:location.key};}
  function returnToComposer(value:Transition|null){navigate(returnPath,{replace:true,state:value?{composerTransition:value}:undefined});}
  function discardTransition(){if(user&&draft?.originKey)clearComposerTransition(user.id,returnPath,draft.originKey,true);}
  function saveAndLeave(){
    if(!user||!draft||!hasDraftContent(draft))return false;
    try{
      const owned=readMemoryDrafts(user.id).find(item=>item.id===draft.ownedDraftId&&item.serialized===draft.ownedLocalDraft)??null;
      const saved=saveMemoryDraft(user.id,draft,owned);
      persist({...draft,ownedDraftId:saved.id,ownedLocalDraft:saved.serialized,unsaved:false});setSaveError('');return true;
    }catch{setSaveError('浏览器无法保存草稿，请返回填写页面保留内容。');return false;}
  }
  function choose(song:Song){
    const value={...selectDraftSong(base(),song),manualSong:null,pendingSong:null};persist(value);returnToComposer(value);
  }
  function chooseManual(){
    if(!manual.title.trim()||!manual.artist.trim())return;
    const value={...base(),song:null,pendingSong:null,manualSong:{title:manual.title.trim(),artist:manual.artist.trim()},position:null,timeText:'',endText:'',lyricId:null};
    persist(value);returnToComposer(value);
  }
  return <section className="journal-page song-search-page">
    <header><button type="button" className="song-search-back" onClick={()=>returnToComposer(draft)} aria-label="返回填写记忆"><ArrowLeft size={21}/></button><h1>搜索歌曲</h1></header>
    <label className="song-search-field"><MagnifyingGlass size={20} aria-hidden="true"/><input id="create-song-query" aria-label="找歌曲或歌手" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索歌名或歌手" autoComplete="off"/></label>
    {manualOpen?<div className="song-manual-fields"><label htmlFor="manual-song-title">歌名<input id="manual-song-title" value={manual.title} maxLength={160} onChange={event=>persist({...base(),pendingSong:{...manual,title:event.target.value}})}/></label><label htmlFor="manual-song-artist">歌手<input id="manual-song-artist" value={manual.artist} maxLength={160} onChange={event=>persist({...base(),pendingSong:{...manual,artist:event.target.value}})}/></label><div><button type="button" className="text-button" onClick={()=>{persist({...base(),pendingSong:null});setManualOpen(false);}}>取消填写</button><button type="button" className="primary-button song-manual-save" disabled={!manual.title.trim()||!manual.artist.trim()} onClick={chooseManual}>使用这首歌</button></div></div>:<div className="song-search-list" aria-label="搜索结果">{error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>:!songs?<p role="status">正在查找…</p>:visible?.length?visible.map(song=><button key={song.id} type="button" aria-label={`选用${song.title}`} onClick={()=>choose(song)}><img src={songCover(song)} alt="" loading="lazy"/><span><strong>{song.title}</strong><small>{song.artist}</small></span></button>):<p>未找到这首歌</p>}<button type="button" className="text-button song-manual-entry" onClick={()=>{persist({...base(),pendingSong:{title:query.trim(),artist:''}});setManualOpen(true);}}>＋ 手动填写歌曲</button></div>}
    <MemoryExitDialog blocker={exit.blocker} save={draft&&hasDraftContent(draft)?saveAndLeave:undefined} busy={false} uploading={false} editing={false} error={saveError} onDiscard={discardTransition}/>
  </section>;
}