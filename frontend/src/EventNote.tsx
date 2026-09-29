import { Link } from 'react-router';
import { useData } from './useData';

export function EventNote({id}:{id:string}) {
  const {value,error}=useData<{events:{id:string;title:string;city:string;venue:string;date:string}[]}>('/api/footprints/catalog');
  const event=value?.events.find(item=>item.id===id);
  return <aside className="event-note"><span aria-hidden="true">♬</span><div><small>这张卡里的现场</small><strong>{event?`${event.title} · ${event.city}`:error?'场次信息暂时无法加载':'正在打开场次…'}</strong>{event&&<span>{event.date} · {event.venue}</span>}</div><Link to={`/footprints?event=${encodeURIComponent(id)}`}>足迹 ↗</Link></aside>;
}
