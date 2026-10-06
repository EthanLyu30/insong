import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {Plus,BookmarkSimple,Check} from '@phosphor-icons/react';
import {useSession} from './SessionContext';
import {apiBaseUrl} from './api';
import {apiRequest} from './memoryClient';
import type {AtlasArtist,AtlasEvent} from './footprintAtlas';

export type FootprintInterests={artist_ids:string[];wish_event_ids:string[]};
export function useFootprintInterests(){
  const {user}=useSession(),owner=user?.id??null;
  const activeOwner=useRef(owner);activeOwner.current=owner;
  const [state,setState]=useState<{owner:number|null;value:FootprintInterests|null;error:string}>({owner,value:null,error:''});
  const [busy,setBusy]=useState(''),[retry,setRetry]=useState(0);
  const mutation=useRef<AbortController|null>(null);
  useEffect(()=>{
    const control=new AbortController();setState({owner,value:null,error:''});setBusy('');
    if(owner!==null)apiRequest<FootprintInterests>(apiBaseUrl,'/api/footprints/interests',{signal:control.signal})
      .then(value=>{if(!control.signal.aborted&&activeOwner.current===owner)setState({owner,value,error:''});})
      .catch(reason=>{if(!control.signal.aborted&&activeOwner.current===owner)setState({owner,value:null,error:reason instanceof Error?reason.message:'关注与想去没有读到，请重试。'});});
    return()=>{control.abort();mutation.current?.abort();mutation.current=null;};
  },[owner,retry]);
  const value=state.owner===owner?state.value:null,error=state.owner===owner?state.error:'';
  async function change(kind:'artist'|'wish',id:string){
    if(owner===null||!value||mutation.current)return;
    const control=new AbortController();mutation.current=control;setBusy(kind+':'+id);setState(old=>({...old,error:''}));
    const url=kind==='artist'?`/api/footprints/follows/${encodeURIComponent(id)}`:`/api/footprints/wishes/${encodeURIComponent(id)}`;
    const body=kind==='artist'?{followed:!value.artist_ids.includes(id)}:{wanted:!value.wish_event_ids.includes(id)};
    try{const next=await apiRequest<FootprintInterests>(apiBaseUrl,url,{method:'PUT',body:JSON.stringify(body),signal:control.signal});if(!control.signal.aborted&&activeOwner.current===owner)setState({owner,value:next,error:''});}
    catch(reason){if(!control.signal.aborted&&activeOwner.current===owner)setState(old=>({...old,error:reason instanceof Error?reason.message:'没有保存成功，请重试。'}));}
    finally{if(!control.signal.aborted&&activeOwner.current===owner){mutation.current=null;setBusy('');}}
  }
  return {value,error,busy,needsLogin:owner===null||error.includes('请先登录'),reload:()=>setRetry(x=>x+1),toggleArtist:(id:string)=>change('artist',id),toggleWish:(id:string)=>change('wish',id)};
}
export type InterestsState=ReturnType<typeof useFootprintInterests>;
export function InterestsError({data}:{data:InterestsState}){
  return data.error&&!data.needsLogin?<p className="atlas-interests-error" role="alert">{data.error}<button type="button" onClick={data.reload}>重试</button></p>:null;
}
export function FollowArtist({artist,next,data}:{artist:AtlasArtist;next:string;data:InterestsState}){
  const followed=!!data.value?.artist_ids.includes(artist.id),label=followed?'已关注':'关注';
  if(data.needsLogin)return <Link className="atlas-follow-button" aria-label={`登录关注${artist.name}`} to={`/account?next=${encodeURIComponent(next)}`}><Plus size={14}/><span>关注歌手</span></Link>;
  return <button type="button" className="atlas-follow-button" aria-label={`${label}${artist.name}`} aria-pressed={followed} disabled={!!data.busy||!data.value} onClick={()=>void data.toggleArtist(artist.id)}>{followed?<Check size={14}/>:<Plus size={14}/>}<span>{data.busy==='artist:'+artist.id?'保存中…':followed?'已关注':'关注歌手'}</span></button>;
}
export function WishEvent({event,today,next,data}:{event:AtlasEvent;today:string;next:string;data:InterestsState}){
  const wanted=!!data.value?.wish_event_ids.includes(event.id),eligible=event.date>=today&&event.event_status!=='cancelled';
  if(!eligible&&!wanted)return null;
  if(data.needsLogin)return <Link className="atlas-wish-button" to={`/account?next=${encodeURIComponent(next)}`}><BookmarkSimple size={16}/>登录标记想去</Link>;
  return <button className={'atlas-wish-button '+(wanted?'is-wanted':'')} type="button" disabled={!!data.busy||!data.value} aria-pressed={wanted} aria-label={`${wanted?'取消想去':'我想去'} · ${event.date} · ${event.city}`} onClick={()=>void data.toggleWish(event.id)}>{wanted?<Check size={16}/>:<BookmarkSimple size={16}/>}<span>{data.busy==='wish:'+event.id?'保存中…':wanted?'已想去':'我想去'}</span></button>;
}
