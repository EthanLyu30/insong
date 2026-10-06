import {useState} from 'react';
import {Trash} from '@phosphor-icons/react';
import {photoSource} from './cardMedia';
import type {MemoryDraft} from './memoryDrafts';

export function DraftBox({items,onResume,onDelete,error}:{items:MemoryDraft[];onResume:(draft:MemoryDraft)=>void;onDelete:(draft:MemoryDraft)=>boolean;error:string}){
  const [removing,setRemoving]=useState<MemoryDraft|null>(null);
  if(removing)return <div className="composer-draft-confirm"><p>删除这份草稿？</p>{error&&<p role="alert">{error}</p>}<div><button type="button" className="soft-button" onClick={()=>setRemoving(null)}>取消</button><button type="button" className="soft-button draft-confirm-delete" onClick={()=>{if(onDelete(removing))setRemoving(null);}}>删除草稿</button></div></div>;
  return <>{error&&<p className="form-error" role="alert">{error}</p>}{items.length?<div className="draft-box-items">{items.map(item=>{
    const photos=item.data.photos??[],cover=photos.find(photo=>photo.id===item.data.cover)??photos[0];
    const title=item.data.title?.trim()||item.data.song?.title||item.data.manualSong?.title||'未命名草稿';
    return <article className="composer-draft-preview" key={item.storageKey}>
      {cover&&<img src={photoSource(cover.url)} alt="草稿照片"/>}
      <div><h3>{title}</h3>{item.data.story.trim()&&<p>{item.data.story}</p>}{photos.length>0&&<small>{photos.length} 张照片</small>}{item.updatedAt&&<small>{new Date(item.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small>}</div>
      <div className="draft-item-actions"><button type="button" className="composer-draft-resume" aria-label={`继续编辑${title}`} onClick={()=>onResume(item)}>继续编辑</button><button type="button" className="draft-delete" aria-label={`删除草稿${title}`} onClick={()=>setRemoving(item)}><Trash size={17}/></button></div>
    </article>;
  })}</div>:<p className="composer-draft-empty">暂无草稿</p>}</>;
}
