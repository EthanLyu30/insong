import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl } from './api';
import { apiRequest, type Photo } from './memoryClient';

export function PhotoPicker({value,onChange,onBusyChange,disabled=false,compact=false}:{
  value:Photo|null;onChange:(photo:Photo|null)=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean;compact?:boolean;
}) {
  const input=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null);
  const busyListener=useRef(onBusyChange);busyListener.current=onBusyChange;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>()=>{request.current?.abort();busyListener.current?.(false);},[]);
  async function upload(file?:File) {
    if(!file||busy)return;
    setError('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('请选择 JPG、PNG 或 WebP 照片。');return;}
    if(file.size>5*1024*1024){setError('照片超过 5 MB，请换一张小一点的。');return;}
    const controller=new AbortController();request.current=controller;setBusy(true);onBusyChange?.(true);
    try {
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('照片没有读成功，请重选。'));reader.readAsDataURL(file);});
      if(controller.signal.aborted)return;
      const photo=await apiRequest<Photo>(apiBaseUrl,'/api/photos',{method:'POST',body:JSON.stringify({data}),signal:controller.signal});
      if(!controller.signal.aborted)onChange(photo);
    }catch(reason){if(!controller.signal.aborted)setError((reason as Error).message);}
    finally{if(!controller.signal.aborted){setBusy(false);onBusyChange?.(false);}if(input.current)input.current.value='';}
  }
  return <div className={`photo-picker${compact?' photo-picker-small':''}`}>
    {value&&<div className="photo-preview"><img src={apiBaseUrl+value.url} alt="这一刻的照片"/><button type="button" className="photo-remove" disabled={disabled||busy} onClick={()=>onChange(null)} aria-label="移除这张照片">×</button></div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="上传记忆照片" disabled={disabled||busy} onChange={e=>void upload(e.target.files?.[0])}/>
    <button type="button" className="photo-add" disabled={disabled||busy} onClick={()=>input.current?.click()}><span aria-hidden="true">{busy?'◌':'＋'}</span>{busy?'正在收好照片…':value?'换一张照片':compact?'加一张照片':'放一张当时的照片'}{!compact&&<small>作为记忆封面 · JPG / PNG / WebP，5 MB 内</small>}</button>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
