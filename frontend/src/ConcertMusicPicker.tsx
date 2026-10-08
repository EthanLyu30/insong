import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {MusicNotes,CaretDown,X} from '@phosphor-icons/react';
import type {AtlasCatalog} from './footprintAtlas';
import type {ConcertMusicSelection} from './memoryClient';
import {useData} from './useData';
import {lockPageScroll,trapDialogFocus} from './dialogScroll';
import './concertMusic.css';

export function MusicSelectionDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const origin=document.activeElement as HTMLElement|null,unlock=lockPageScroll();const release=panel.current?trapDialogFocus(panel.current,()=>close.current(),origin):()=>{};return()=>{release();unlock();};},[]);
  return createPortal(<div className="composer-modal concert-music-modal" role="dialog" aria-modal="true" aria-label={title}><button type="button" className="composer-modal-scrim" aria-label="关闭音乐选择" onClick={onClose}/><div ref={panel} className="composer-sheet"><div className="composer-sheet-handle"/><header><button type="button" aria-label="关闭音乐选择" onClick={onClose}><X size={20}/></button><h2>{title}</h2></header>{children}</div></div>,document.body);
}

export function ConcertMusicPicker({eventId,value,onChange,onOtherMusic,disabled=false,fallbackTitle,fallbackArtist}:{eventId:string;value:ConcertMusicSelection|null;onChange:(value:ConcertMusicSelection|null)=>void;onOtherMusic?:()=>void;disabled?:boolean;fallbackTitle?:string;fallbackArtist?:string}){
  const [open,setOpen]=useState(false),[retry,setRetry]=useState(0),[mode,setMode]=useState<'tracks'|'playlist'>('tracks'),[titles,setTitles]=useState<string[]>([]);
  const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const event=catalog?.events.find(event=>event.id===eventId),tracks=event?.songs??[];
  useEffect(()=>{setOpen(false);},[eventId]);
  const collection=event?.setlist_kind==='artist_collection'||!event?.setlist_kind;
  const wholeLabel=collection?'整份关联作品':'整个歌单';
  const summary=value?value.mode==='playlist'?`${value.setlist_kind==='artist_collection'?'整份关联作品':'整个歌单'} · ${value.tracks.length} 首`:value.tracks.map(track=>track.title).join('、'):null;
  return <div className="composer-song-picker"><button type="button" className="composer-song-trigger composer-concert-music-trigger" aria-label="选择演出音乐" disabled={disabled} onClick={()=>{setMode(value?.mode??'tracks');setTitles(value?.tracks.map(track=>track.title)??[]);setOpen(true);}}><MusicNotes size={20}/><span>{summary??fallbackTitle??'添加配乐'}{value?<small>{value.mode==='tracks'?`${value.tracks.length} 首 · `:''}{value.tracks[0]?.artist}</small>:fallbackArtist&&<small>{fallbackArtist}</small>}</span><CaretDown size={16}/></button>
    {open&&<MusicSelectionDialog title="选择分享的音乐" onClose={()=>setOpen(false)}>
      {error?<p className="form-error" role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新加载音乐资料</button></p>:!catalog?<p role="status">正在读取演出音乐…</p>:!event?<p role="alert">该场演出资料暂不可用，已选音乐仍保留。</p>:<>
      <p className="concert-music-note">{event.setlist_note||'本场实际歌单待核实，以下为歌手关联作品。'}</p>
      {!!tracks.length&&<><div className="concert-music-modes"><button type="button" aria-pressed={mode==='tracks'} onClick={()=>{setMode('tracks');if(mode==='playlist')setTitles([]);}}>勾选歌曲</button><button type="button" aria-pressed={mode==='playlist'} onClick={()=>{setMode('playlist');setTitles(tracks.map(track=>track.title));}}>{wholeLabel}</button></div><div className="concert-music-options">{tracks.map(track=><label key={track.title}><input type="checkbox" aria-label={`选择${track.title}`} checked={titles.includes(track.title)} disabled={mode==='playlist'} onChange={event=>setTitles(previous=>event.target.checked?[...previous,track.title]:previous.filter(title=>title!==track.title))}/><span><strong>{track.title}</strong><small>{track.artist}</small></span></label>)}</div><button type="button" className="primary-button concert-music-confirm" disabled={!titles.length||titles.some(title=>!tracks.some(track=>track.title===title))} onClick={()=>{onChange({event_id:eventId,mode,tracks:titles.map(title=>tracks.find(track=>track.title===title)!),setlist_kind:event.setlist_kind??'artist_collection',note:event.setlist_note??'本场实际歌单待核实，以下为歌手关联作品。'});setOpen(false);}}>完成音乐选择</button></>}
      {!tracks.length&&<p className="concert-music-note">这场暂未收录音乐资料，可以自行选择歌曲。</p>}
      </>}
      {onOtherMusic&&<button type="button" className="text-button concert-other-music" onClick={()=>{setOpen(false);onOtherMusic();}}>选择其他歌曲</button>}
      {value&&<button type="button" className="text-button concert-other-music" onClick={()=>{onChange(null);setOpen(false);}}>取消这份音乐关联</button>}
    </MusicSelectionDialog>}
  </div>;
}
