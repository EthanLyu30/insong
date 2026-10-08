import {useEffect,useRef,useState} from 'react';
import {MagnifyingGlass} from '@phosphor-icons/react';

export function CollectionSearch({query,onQuery,count}:{query:string;onQuery:(value:string)=>void;count:number}) {
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(query);
  const composing=useRef(false),pendingQuery=useRef<string|null>(null);
  useEffect(()=>{
    if(composing.current)pendingQuery.current=query;
    else setDraft(query);
  },[query]);
  function finish(){if(composing.current)return;onQuery(draft);setOpen(false);}
  return <div className={`collection-search-surface${open?' is-open':''}`}>
    {open?<><div className="collection-search-panel"><label><MagnifyingGlass size={18}/><input
      aria-label="搜索我的记忆" autoFocus autoComplete="off" value={draft}
      placeholder="搜索记忆、歌曲或歌手"
      onCompositionStart={()=>{composing.current=true;pendingQuery.current=null;}}
      onCompositionEnd={event=>{
        composing.current=false;
        const external=pendingQuery.current;pendingQuery.current=null;
        if(external!==null){setDraft(external);return;}
        const value=event.currentTarget.value;setDraft(value);onQuery(value);
      }}
      onChange={event=>{
        const value=event.currentTarget.value;setDraft(value);
        if(!composing.current&&!(event.nativeEvent as InputEvent).isComposing)onQuery(value);
      }}
      onKeyDown={event=>{
        if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return;
        if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();finish();}
      }}/></label><button type="button" onClick={finish}>完成</button></div><div className="collection-search-preview" role="status">{count} 条结果</div></>:<button type="button" className="collection-search-trigger" onClick={()=>setOpen(true)}><MagnifyingGlass size={18}/><span>{query||'搜索记忆、歌曲或歌手'}</span></button>}
  </div>;
}
