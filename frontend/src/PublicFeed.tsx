import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {apiBaseUrl} from './api';
import {apiRequest,ApiError,type PublicStory} from './memoryClient';
import {useSession} from './SessionContext';
import './publicFeed.css';

type Scope={eventId?:string;themeId?:string;sort?:'recent'|'popular';excludeMine?:boolean};
type Page={items:PublicStory[];next_cursor:string|null};
type FeedState={key:string;items:PublicStory[];cursor:string|null;loaded:boolean;busy:boolean;error:string};

export function usePublicFeed({eventId,themeId,sort='recent',excludeMine=false}:Scope){
  const {user,loading,error:sessionError,refresh}=useSession();
  const enabled=!loading&&!sessionError;
  const key=JSON.stringify([eventId,themeId,sort,excludeMine,user?.id??null,enabled]);
  const [state,setState]=useState<FeedState>({key,items:[],cursor:null,loaded:false,busy:enabled,error:''});
  const loader=useRef<()=>void>(()=>{});
  const loadMore=useCallback(()=>loader.current(),[]);
  useEffect(()=>{
    const control=new AbortController();
    let cursor:string|null=null,loaded=false,busy=false;
    setState({key,items:[],cursor:null,loaded:false,busy:enabled,error:''});
    async function load(){
      if(!enabled||busy||control.signal.aborted||(loaded&&cursor===null))return;
      busy=true;
      setState(previous=>({...previous,busy:true,error:''}));
      const query=new URLSearchParams({limit:'12',sort,exclude_mine:String(excludeMine)});
      if(eventId)query.set('event_id',eventId);
      if(themeId)query.set('theme_id',themeId);
      if(cursor)query.set('cursor',cursor);
      try{
        const page=await apiRequest<Page>(apiBaseUrl,`/api/public-feed?${query}`,{signal:control.signal});
        if(control.signal.aborted)return;
        if(!Array.isArray(page.items)||(page.next_cursor!==null&&typeof page.next_cursor!=='string')||(cursor&&page.next_cursor===cursor))throw new Error('这页内容暂时无法继续加载，请重试。');
        // Scope is enforced by the server; these checks also protect rendering
        // against an accidentally mismatched response. Originals are never read.
        const items=page.items.filter(story=>(!eventId||story.event_id===eventId)&&(!themeId||story.theme_id===themeId)&&(!excludeMine||!story.is_mine));
        cursor=page.next_cursor;loaded=true;
        setState(previous=>{
          if(previous.key!==key)return previous;
          const seen=new Set(previous.items.map(story=>story.id));
          const additions=items.filter(story=>{if(seen.has(story.id))return false;seen.add(story.id);return true;});
          return {...previous,items:[...previous.items,...additions],cursor,loaded:true,busy:false,error:''};
        });
      }catch(reason){
        if(!control.signal.aborted){
          const expired=reason instanceof ApiError&&reason.status===410;
          if(expired){cursor=null;loaded=false;}
          setState(previous=>previous.key===key?{...previous,...(expired?{items:[],cursor:null,loaded:false}:{}),busy:false,error:reason instanceof Error?reason.message:'加载失败，请重试。'}:previous);
        }
      }finally{busy=false;}
    }
    loader.current=()=>{void load();};
    void load();
    return()=>{control.abort();loader.current=()=>{};};
  },[key,eventId,themeId,sort,excludeMine,enabled]);
  const current=state.key===key?state:{key,items:[],cursor:null,loaded:false,busy:enabled,error:''};
  return {...current,error:sessionError||current.error,hasMore:current.loaded&&current.cursor!==null,loadMore,retry:sessionError?refresh:loadMore};
}

export function PublicFeed({renderStories,emptyText='这里还没有愿意公开分享的故事。',...scope}:Scope&{renderStories:(stories:PublicStory[])=>ReactNode;emptyText?:string}){
  const feed=usePublicFeed(scope),sentinel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!feed.hasMore||feed.busy||feed.error||!sentinel.current||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))feed.loadMore();},{rootMargin:'400px 0px'});
    observer.observe(sentinel.current);
    return()=>observer.disconnect();
  },[feed.hasMore,feed.busy,feed.error,feed.cursor,feed.loadMore]);
  return <div className="public-feed">
    {feed.items.length>0&&renderStories(feed.items)}
    {feed.busy&&<p className="public-feed-status" role="status">{feed.items.length?'正在翻开下一页…':'正在翻开公开记忆…'}</p>}
    {feed.error&&<div className="public-feed-error" role="alert">{feed.error}<button type="button" className="text-button" onClick={()=>{void feed.retry();}}>重试</button></div>}
    {!feed.busy&&!feed.error&&feed.loaded&&!feed.items.length&&<p className="public-feed-status">{emptyText}</p>}
    {!feed.busy&&!feed.error&&feed.loaded&&feed.items.length>0&&!feed.hasMore&&<p className="public-feed-status" role="status">已经看完目前分享的瞬间。</p>}
    {feed.hasMore&&!feed.error&&<div ref={sentinel} className="public-feed-sentinel" aria-hidden="true"/>}
    {feed.hasMore&&!feed.busy&&!feed.error&&<button type="button" className="text-button public-feed-load" onClick={feed.loadMore}>继续看下一页</button>}
  </div>;
}
