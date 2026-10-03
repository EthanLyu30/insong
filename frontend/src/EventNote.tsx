import { Link } from 'react-router';
import { useState } from 'react';
import { useData } from './useData';

export function EventNote({id,label='这张卡里的现场',linked=true}:{id:string;label?:string;linked?:boolean}) {
  const [retry,setRetry]=useState(0);
  const {value,error}=useData<{events:{id:string;title:string;city:string;venue:string;date:string}[]}>('/api/footprints/catalog',retry);
  const event=value?.events.find(item=>item.id===id);
  return <aside className="event-note"><span aria-hidden="true">♬</span><div><small>{label}</small><strong role={!event?(error||value?'alert':'status'):undefined}>{event?`${event.title} · ${event.city}`:error?'场次信息暂时无法加载':value?'找不到这场演出':'正在打开场次…'}</strong>{event&&<span>{event.date} · {event.venue}</span>}{error&&<button type="button" className="text-button" aria-label="重新加载场次信息" onClick={()=>setRetry(value=>value+1)}>重试</button>}</div>{linked&&<Link to={`/footprints?event=${encodeURIComponent(id)}`}>足迹 ↗</Link>}</aside>;
}
