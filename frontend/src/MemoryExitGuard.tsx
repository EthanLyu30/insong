import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {useBlocker,type Blocker} from 'react-router';
import {lockPageScroll,trapDialogFocus} from './dialogScroll';

export function useMemoryExitGuard(dirty:boolean,safeReturn?:string){
  const permitted=useRef(false);
  const blocker=useBlocker(({currentLocation,nextLocation})=>
    dirty&&!permitted.current&&currentLocation.pathname+currentLocation.search!==nextLocation.pathname+nextLocation.search&&nextLocation.pathname+nextLocation.search!==safeReturn);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  return {blocker,permit:()=>{permitted.current=true;}};
}

export function MemoryExitDialog({blocker,save,busy,uploading,editing,error,onDiscard}:{blocker:Blocker;save?:()=>boolean;busy:boolean;uploading:boolean;editing:boolean;error:string;onDiscard?:()=>void}){
  const panel=useRef<HTMLDivElement>(null);
  const blocked=blocker.state==='blocked';
  useEffect(()=>{
    if(!blocked||!panel.current)return;
    const origin=document.activeElement as HTMLElement|null;
    const unlock=lockPageScroll();
    const shell=document.querySelector<HTMLElement>('.site-shell'),previous=shell?.inert;
    if(shell)shell.inert=true;
    const release=trapDialogFocus(panel.current,()=>blocker.reset?.(),origin);
    return()=>{if(shell)shell.inert=previous??false;release();unlock();};
  },[blocked]);
  if(!blocked)return null;
  return createPortal(<div className="memory-exit-backdrop"><div ref={panel} className="memory-exit-dialog" role="alertdialog" aria-modal="true" aria-label="未保存的内容" aria-describedby="memory-exit-description">
    <h2>{busy?'正在保存':uploading?'照片上传中':'内容还没保存'}</h2><p id="memory-exit-description">{busy?'请等待保存结果，内容会保留在这里。':uploading?'离开会取消正在上传的照片。':'离开后，未保存的内容会丢失。'}</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <button type="button" className="primary-button unsaved-continue" onClick={()=>blocker.reset()}>继续编辑</button>
    {save&&<button type="button" className="soft-button unsaved-save" disabled={busy||uploading} onClick={()=>{if(save())blocker.proceed();}}>{busy?'保存中…':uploading?'照片上传中…':'存草稿并离开'}</button>}
    <button type="button" className="text-button unsaved-discard" disabled={busy} onClick={()=>{onDiscard?.();blocker.proceed();}}>{editing?'放弃修改':'放弃并离开'}</button>
  </div></div>,document.body);
}
