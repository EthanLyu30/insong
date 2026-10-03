import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CaretLeft, CaretRight, X} from '@phosphor-icons/react';
import type {Photo} from './memoryClient';
import {photoSource} from './cardMedia';
import {PhotoPicker} from './PhotoPicker';

export function PhotoGallery({photos,fallback}:{photos:Photo[];fallback?:string}) {
  const [selected,setSelected]=useState<number|null>(null);
  const lightbox=useRef<HTMLDivElement>(null);
  const open=selected!==null;
  useEffect(()=>{
    if(!open)return;
    const opener=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    lightbox.current?.querySelector('button')?.focus();
    function key(event:KeyboardEvent){
      if(event.key==='Escape')setSelected(null);
      if(event.key==='ArrowRight'){event.preventDefault();setSelected(index=>index===null?null:(index+1)%photos.length);}
      if(event.key==='ArrowLeft'){event.preventDefault();setSelected(index=>index===null?null:(index+photos.length-1)%photos.length);}
      if(event.key==='Tab'){
        const buttons=lightbox.current?.querySelectorAll('button');if(!buttons?.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);document.body.style.overflow=previousOverflow;opener?.focus();};
  },[open,photos.length]);
  if(!photos.length)return fallback?<img className="story-fallback-image" src={fallback} alt="这首歌的配图"/>:null;
  return <><div className={`moment-gallery moment-gallery-${photos.length}`} aria-label="这一刻的照片">{photos.map((photo,index)=><button key={photo.id} type="button" onClick={()=>setSelected(index)} aria-label={`查看第${index+1}张照片`}><img src={photoSource(photo.url)} alt={`这一刻的照片 ${index+1}`} loading="lazy"/></button>)}</div>{selected!==null&&photos[selected]&&createPortal(<div ref={lightbox} className="photo-lightbox" role="dialog" aria-modal="true" aria-label="照片大图" onClick={event=>{if(event.target===event.currentTarget)setSelected(null);}}><button type="button" aria-label="关闭照片大图" onClick={()=>setSelected(null)}><X size={25}/></button><img src={photoSource(photos[selected].url)} alt={`第${selected+1}张照片大图`}/>{photos.length>1&&<div className="lightbox-controls"><button type="button" aria-label="上一张照片" onClick={()=>setSelected((selected+photos.length-1)%photos.length)}><CaretLeft/></button><span aria-live="polite">{selected+1} / {photos.length}</span><button type="button" aria-label="下一张照片" onClick={()=>setSelected((selected+1)%photos.length)}><CaretRight/></button></div>}</div>,document.body)}</>;
}

export function GalleryPicker({photos,cover,onChange,onCover,onBusyChange,disabled,compact=false}:{photos:Photo[];cover:string|null;onChange:(photos:Photo[])=>void;onCover:(id:string|null)=>void;onBusyChange:(busy:boolean)=>void;disabled:boolean;compact?:boolean}) {
  function remove(id:string){const remaining=photos.filter(photo=>photo.id!==id);onChange(remaining);if(cover===id)onCover(remaining[0]?.id??null);}
  return <section className={`gallery-picker${compact?' is-compact':''}`} aria-label="照片与封面">{(!compact||photos.length>0)&&<div className="gallery-label"><strong>{compact?'照片':'这一晚的照片'}</strong><span>{photos.length} / 9{compact?' · 点图设封面':''}</span></div>}{!compact&&<p>点一张设为封面，其他照片会一起留在这一页。</p>}<div className="gallery-edit-grid">{photos.map((photo,index)=><div key={photo.id} className={cover===photo.id?'selected-cover':''}><button type="button" disabled={disabled} aria-label={`将第${index+1}张照片设为封面`} aria-pressed={cover===photo.id} onClick={()=>onCover(photo.id)}><img src={photoSource(photo.url)} alt={`第${index+1}张记忆照片`}/>{cover===photo.id&&<span>封面</span>}</button><button className="gallery-remove" type="button" disabled={disabled} aria-label={`移除第${index+1}张照片`} onClick={()=>remove(photo.id)}><X size={14}/></button></div>)}</div>{photos.length<9&&<PhotoPicker value={null} disabled={disabled} compact onBusyChange={onBusyChange} onChange={photo=>{if(photo){onChange([...photos,photo]);if(!cover)onCover(photo.id);}}}/>}</section>;
}
