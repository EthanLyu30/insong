import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useData } from './useData';
import type {EventSnapshot} from './memoryClient';

type Props={id:string;label?:string;linked?:boolean;snapshot?:EventSnapshot|null;onResolved?:(event:EventSnapshot)=>void};
function composerConcert(event:EventSnapshot){
  const artist=event.artist.trim(),city=event.city.trim();
  let title=event.title.trim();
  // Only strip the saved artist when it is an exact prefix with a name boundary.
  if(artist&&title.startsWith(artist)){
    const remainder=title.slice(artist.length);
    if(!remainder||/^[\s·•:：\-—「“"'（(\dA-Za-z]/.test(remainder))title=remainder.replace(/^[\s·•:：\-—]+/,'');
  }else if(artist){
    const year=title.match(/^(?:19|20)\d{2}\s*/)?.[0];
    if(year&&title.slice(year.length).startsWith(artist)){
      const remainder=title.slice(year.length+artist.length);
      if(/演唱会|巡演|音乐节/.test(remainder))title=year+remainder.replace(/^[\s·•:：\-—]+/,'');
    }
  }
  if(!city)return {title,station:''};
  const escapedCity=city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const stationSuffix=new RegExp(`\\s*(?:[·•|｜—-]\\s*)?${escapedCity}站(?:\\s*[·•|｜]\\s*${escapedCity})?$`);
  title=title.replace(stationSuffix,'').trim();
  if(title===city)title='';
  return {title,station:`${city}站`};
}
export function EventNote(props:Props) {
  return props.snapshot?<Note {...props} event={props.snapshot}/>:<LiveEventNote {...props}/>;
}
function Note({id,label='现场足迹',linked=true,event,error='',loaded=false,onRetry}:{id:string;label?:string;linked?:boolean;event?:EventSnapshot;error?:string;loaded?:boolean;onRetry?:()=>void}){
  if(event){
    const {title,station}=composerConcert(event);
    const content=<><span aria-hidden="true">♬</span><div><small>{label}</small>{event.artist&&<span className="event-note-artist">{event.artist}</span>}<strong className="event-note-concert">{title}{station&&<span className="event-note-station">{title?' · ':''}{station}</span>}</strong><span className="event-note-date-venue">{event.date} {event.venue}</span></div></>;
    return linked&&id?<Link className="event-note event-note-linked" to={`/footprints?event=${encodeURIComponent(id)}`}>{content}</Link>:<aside className="event-note">{content}</aside>;
  }
  return <aside className="event-note">{linked&&id?<Link className="event-note-pending-link" to={`/footprints?event=${encodeURIComponent(id)}`} aria-label="查看现场足迹"><span aria-hidden="true">♬</span></Link>:<span aria-hidden="true">♬</span>}<div><small>{label}</small><strong role={error||loaded?'alert':'status'}>{error?'场次信息暂时无法加载':loaded?'找不到这场演出':'正在打开场次…'}</strong>{error&&<button type="button" className="text-button" aria-label="重新加载场次信息" onClick={onRetry}>重试</button>}</div></aside>;
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
