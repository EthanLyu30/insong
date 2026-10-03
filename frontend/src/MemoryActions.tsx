import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link,useNavigate} from 'react-router';
import {PencilSimple,Trash} from '@phosphor-icons/react';
import {apiBaseUrl} from './api';
import {apiRequest,type Memory} from './memoryClient';
import {useLivePage} from './useLivePage';
import './memoryExperience.css';

export function MemoryActions({card,onReload}:{card:Memory;onReload:()=>void}){
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const removeButton=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),lock=useRef(false);
  const navigate=useNavigate(),live=useLivePage();
  useEffect(()=>{
    if(!confirm)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const shell=document.querySelector<HTMLElement>('.site-shell'),wasInert=shell?.inert;
    if(shell)shell.inert=true;
    dialog.current?.querySelector('button')?.focus();
    function key(event:KeyboardEvent){
      if(event.key==='Escape'&&!lock.current){event.preventDefault();setConfirm(false);}
      if(event.key==='Tab'){
        const controls=dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!controls?.length){event.preventDefault();return;}
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(shell)shell.inert=wasInert??false;removeButton.current?.focus();};
  },[confirm]);
  async function remove(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await apiRequest(apiBaseUrl,`/api/memories/${card.id}?revision=${card.revision}`,{method:'DELETE'});if(live.current)navigate('/memories',{replace:true});}
    catch(reason){if(live.current)setError(reason instanceof Error?reason.message:'删除没有成功，请重试。');}
    finally{lock.current=false;if(live.current)setBusy(false);}
  }
  return <div className="memory-toolbar-actions">
    <Link className="memory-edit-link" to={`/memories/${card.id}/edit`}><PencilSimple size={17} aria-hidden="true"/>编辑</Link>
    <button ref={removeButton} className="memory-delete-link" type="button" aria-label="删除这段记忆" onClick={()=>{setError('');setConfirm(true);}}><Trash size={17} aria-hidden="true"/>删除记忆</button>
    {confirm&&createPortal(<div className="memory-delete-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)setConfirm(false);}}><div ref={dialog} className="memory-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="memory-delete-title" aria-describedby="memory-delete-description" tabIndex={-1}><h2 id="memory-delete-title">删除这段记忆？</h2><p id="memory-delete-description">原文、照片关联和补记会移除，无法恢复。</p>{error&&<p role="alert" className="form-error">{error}<button type="button" className="text-button reload-memory" disabled={busy} onClick={()=>{setConfirm(false);onReload();}}>重新加载</button></p>}<div><button type="button" className="soft-button" disabled={busy} onClick={()=>setConfirm(false)}>取消</button><button type="button" className="danger-button" disabled={busy} onClick={()=>void remove()}>{busy?'正在删除…':'确认删除'}</button></div></div></div>,document.body)}
  </div>;
}
