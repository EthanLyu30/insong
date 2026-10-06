import {useState} from 'react';
import {Link} from 'react-router';
import {useSession} from './SessionContext';
import {useData} from './useData';
import {cardCover} from './cardMedia';
import type {Memory,PublicStory} from './memoryClient';

export function EventRecords({eventId}:{eventId:string}){
  const {user}=useSession();const [tab,setTab]=useState(user?'mine':'public');
  return <div className="event-records"><div className="segmented-control" aria-label="现场记录分类"><button type="button" data-record-tab="mine" aria-pressed={tab==='mine'} onClick={()=>setTab('mine')}>我的记录</button><button type="button" data-record-tab="public" aria-pressed={tab==='public'} onClick={()=>setTab('public')}>听友公开记录</button></div>{tab==='mine'?user?<RecordList key="mine" eventId={eventId} mine/>:<div className="event-record-empty"><p>登录后查看自己的现场记录</p><Link to={`/account?next=${encodeURIComponent('/footprints?event='+eventId+'&scene=sky')}`}>登录</Link></div>:<RecordList key="public" eventId={eventId} mine={false}/>}</div>;
}
function RecordList({eventId,mine}:{eventId:string;mine:boolean}){
  const [retry,setRetry]=useState(0);
  const {value,error}=useData<(Memory&PublicStory)[]>(`/api/${mine?'memories':'stories'}?event_id=${encodeURIComponent(eventId)}`,retry);
  const records=value?.filter(item=>mine||!item.is_mine);
  return <div className="event-record-list">{error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>:!records?<p role="status">正在读取记录…</p>:records.length?records.map(item=><Link className="event-record-card" key={item.id} to={`/${mine?'memories':'stories'}/${item.id}`}><img src={cardCover(item)} alt=""/><div><strong>{item.title||item.song.title}</strong><p>{mine?item.story:item.excerpt}</p><small>{item.is_demo_sample?'样例 · ':''}{item.song.title} · {mine?item.publication?.published?'公开':'私密':item.author_name}</small></div></Link>):<div className="event-record-empty"><p>{mine?'还没有记录这场演出':'还没有听友公开分享这场演出'}</p>{mine&&<Link className="text-button" to={`/create?event=${encodeURIComponent(eventId)}`}>记录这一晚</Link>}</div>}</div>;
}
