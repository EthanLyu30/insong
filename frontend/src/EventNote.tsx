import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useData } from './useData';
import type {EventSnapshot} from './memoryClient';

type Props={id:string;label?:string;linked?:boolean;snapshot?:EventSnapshot|null;onResolved?:(event:EventSnapshot)=>void};
export function EventNote(props:Props) {
  return props.snapshot?<Note {...props} event={props.snapshot}/>:<LiveEventNote {...props}/>;
}
function Note({id,label='这张卡里的现场',linked=true,event,error='',loaded=false,onRetry}:{id:string;label?:string;linked?:boolean;event?:EventSnapshot;error?:string;loaded?:boolean;onRetry?:()=>void}){
  return <aside className="event-note"><span aria-hidden="true">♬</span><div><small>{label}</small><strong role={!event?(error||loaded?'alert':'status'):undefined}>{event?`${event.title} · ${event.city}`:error?'场次信息暂时无法加载':loaded?'找不到这场演出':'正在打开场次…'}</strong>{event&&<span>{event.date} · {event.venue}</span>}{error&&<button type="button" className="text-button" aria-label="重新加载场次信息" onClick={onRetry}>重试</button>}</div>{linked&&<Link to={`/footprints?event=${encodeURIComponent(id)}`}>足迹 ↗</Link>}</aside>;
}
function LiveEventNote({id,onResolved,...props}:Props) {
  const [retry,setRetry]=useState(0);
  const {value,error}=useData<{artists:{id:string;name:string}[];events:{id:string;artist_id:string;title:string;city:string;venue:string;date:string}[]}>('/api/footprints/catalog',retry);
  const event=value?.events.find(item=>item.id===id);
  const callback=useRef(onResolved);callback.current=onResolved;
  const snapshot=event?{id:event.id,title:event.title,date:event.date,city:event.city,venue:event.venue,artist:value?.artists?.find(artist=>artist.id===event.artist_id)?.name??''}:undefined;
  useEffect(()=>{if(event&&snapshot)callback.current?.(snapshot);},[event]);
  return <Note {...props} id={id} event={snapshot} error={error} loaded={!!value} onRetry={()=>setRetry(value=>value+1)}/>;
}
