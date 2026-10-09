import {useEffect,useState,type ReactNode} from 'react';
import {Link} from 'react-router';
import {PencilSimple} from '@phosphor-icons/react';
import {useSession} from './SessionContext';
import {useData} from './useData';
import {StoryCard} from './StoryCard';
import {StoryEntry,StoryGrid} from './PublicPages';
import {cardPhotos} from './cardMedia';
import {PublicFeed} from './PublicFeed';
import type {Memory} from './memoryClient';
import './memoryExperience.css';

type RecordsProps={eventId:string;eventIds?:string[];next:string;children?:ReactNode};
export function EventRecords({eventId,eventIds,next,children}:RecordsProps){
  const {user,loading,error}=useSession();
  const identities=JSON.stringify([...new Set(eventIds??[eventId])].sort());
  return <EventRecordsBody key={`${loading?'loading':error?'unknown':user?.id??'guest'}:${identities}`} eventId={eventId} eventIds={eventIds} next={next}>{children}</EventRecordsBody>;
}

function EventRecordsBody({eventId,eventIds,children}:RecordsProps){
  const {user,loading,error}=useSession();
  const [ownCount,setOwnCount]=useState<number|null>(user?null:0);
  return <div className="concert-memories">
    {children&&<div className="concert-supplement">{children}</div>}
    {loading?<p className="concert-resource-note" role="status">正在确认账号…</p>:user&&<PersonalRecords eventId={eventId} eventIds={eventIds} author={user.display_name} onCount={setOwnCount}/>}
    {!loading&&!error&&ownCount===0&&<Link className="primary-button concert-write-link" to={`/create?event=${encodeURIComponent(eventId)}`}>记下这一晚</Link>}
    <PublicRecords key={`${user?.id??'guest'}:${eventId}`} eventId={eventId} eventIds={eventIds}/>
  </div>;
}

function MemoryDocument({memory,author}:{memory:Memory;author:string}){
  author=memory.owner_display_name??author;
  return <div className="concert-memory-document"><StoryCard author={author} sample={memory.is_demo_sample} title={memory.title} year={memory.life_year} time={memory.life_time} song={memory.song} photos={cardPhotos(memory)} text={memory.story} tags={memory.tags} scope="mine" anchor={memory.offset_ms} end={memory.end_ms} lyric={memory.lyric} musicSelection={memory.music_selection} headingLevel="h2"/><div className="concert-memory-actions memory-toolbar-actions"><Link className="memory-edit-link concert-memory-edit" to={`/memories/${memory.id}/edit`}><PencilSimple size={17}/>编辑</Link></div></div>;
}

function PersonalRecords({eventId,eventIds,author,onCount}:{eventId:string;eventIds?:string[];author:string;onCount:(count:number)=>void}){
  const [retry,setRetry]=useState(0);
  const query=new URLSearchParams();
  const ids=[...new Set(eventIds??[])].sort();
  if(ids.length>1)ids.forEach(id=>query.append('event_ids',id));else query.set('event_id',eventId);
  const {value,error}=useData<Memory[]>(`/api/memories?${query}`,retry);
  useEffect(()=>{if(value)onCount(value.length);},[value,onCount]);
  if(error)return <p className="concert-resource-error" role="alert">{error}<button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>;
  if(!value)return <p className="concert-resource-note" role="status">正在翻开我的记忆…</p>;
  if(!value.length)return <section className="concert-my-memories" aria-labelledby="concert-my-heading"><header className="concert-section-heading"><h2 id="concert-my-heading">我的记忆</h2></header><p className="concert-resource-note">还没有这场演出的个人记忆。</p></section>;
  return <section className="concert-my-memories" aria-labelledby="concert-my-heading"><header className="concert-section-heading"><h2 id="concert-my-heading">我的记忆{value.length>1&&` · ${value.length} 条`}</h2></header>{value.length===1?<MemoryDocument memory={value[0]} author={author}/>:<div className="story-masonry concert-memory-collection">{value.map(memory=><StoryEntry key={memory.id} memory={memory} author={author}/>)}</div>}</section>;
}

function PublicRecords({eventId,eventIds}:{eventId:string;eventIds?:string[]}){
  return <section className="concert-public-memories" aria-labelledby="concert-public-heading">
    <header className="concert-section-heading"><h2 id="concert-public-heading">其他瞬间</h2></header>
    <PublicFeed eventId={eventId} eventIds={eventIds} excludeMine emptyText="还没有听友公开分享这场演出。" renderStories={stories=><StoryGrid stories={stories}/>}/>
  </section>;
}
