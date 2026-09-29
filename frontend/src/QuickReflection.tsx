import { useRef, useState, type FormEvent } from 'react';
import { apiBaseUrl } from './api';
import { apiRequest, dayLabel, type Memory, type Photo } from './memoryClient';
import { PhotoPicker } from './PhotoPicker';
import { useLivePage } from './useLivePage';

const moods=[['happy','☀','开心'],['moved','✦','被打动'],['miss','☾','想念'],['peaceful','❀','平静'],['brave','↗','有勇气']] as const;
export function QuickReflection({card,onChange}:{card:Memory;onChange:()=>void}) {
  const [open,setOpen]=useState(false),[mood,setMood]=useState(''),[text,setText]=useState('');
  const [photo,setPhoto]=useState<Photo|null>(null),[uploading,setUploading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),live=useLivePage();
  async function save(event:FormEvent) {
    event.preventDefault();if(lock.current||uploading||(!text.trim()&&!mood&&!photo))return;lock.current=true;setBusy(true);setError('');
    try{await apiRequest(apiBaseUrl,`/api/memories/${card.id}/reflections`,{method:'POST',body:JSON.stringify({revision:card.revision,text:text.trim(),mood:mood||null,photo_id:photo?.id??null})});if(live.current)onChange();}
    catch(reason){if(live.current)setError((reason as Error).message);}finally{lock.current=false;if(live.current)setBusy(false);}
  }
  return <section className="quick-reflection"><div className="list-heading"><div><span className="journal-eyebrow">和过去的自己，碰个面</span><h2>此刻的回声</h2></div><button className="soft-button" aria-expanded={open} onClick={()=>setOpen(!open)}>＋ 留个心情</button></div>
    {!card.reflections.length&&!open&&<p className="page-intro">再听一遍时，留一枚心情，或一张今天的照片。</p>}
    {card.reflections.length>0&&<div className="echo-strip">{card.reflections.map(note=>{const feeling=moods.find(item=>item[0]===note.mood);return <article key={note.id} className="echo-note">{note.photo_url&&<img src={apiBaseUrl+note.photo_url} alt="补记的照片"/>}<small>{dayLabel(note.created_at)}</small>{feeling&&<span className={`mood-sticker mood-${feeling[0]}`}>{feeling[1]} {feeling[2]}</span>}{note.text&&<p>{note.text}</p>}</article>;})}</div>}
    {open&&<form onSubmit={save} className="echo-composer"><fieldset className="form-fields" disabled={busy}><div className="mood-options" role="group" aria-label="今天的心情">{moods.map(([id,icon,label])=><button type="button" key={id} aria-pressed={mood===id} onClick={()=>setMood(mood===id?'':id)}><span aria-hidden="true">{icon}</span>{label}</button>)}</div><PhotoPicker compact value={photo} onChange={setPhoto} onBusyChange={setUploading} disabled={busy}/><label className="echo-caption" htmlFor="echo-caption">一句话，也可以不写<input id="echo-caption" value={text} onChange={e=>setText(e.target.value)} maxLength={200} placeholder="又听到这里，今天的我……"/></label><div className="echo-actions"><small>仅自己可见</small><button className="soft-button" disabled={busy||uploading||(!mood&&!photo&&!text.trim())}>{busy?'正在留下…':'贴进这一页'}</button></div></fieldset>{error&&<p className="form-error" role="alert">{error}</p>}</form>}
  </section>;
}
