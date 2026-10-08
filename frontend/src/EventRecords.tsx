import {useEffect,useState,type ReactNode} from 'react';
import {Link} from 'react-router';
import {PencilSimple} from '@phosphor-icons/react';
import {useSession} from './SessionContext';
import {useData} from './useData';
import {StoryCard} from './StoryCard';
import {StoryGrid} from './PublicPages';
import {cardPhotos} from './cardMedia';
import {PublicFeed} from './PublicFeed';
import type {Memory,PublicStory} from './memoryClient';
import './memoryExperience.css';

export function EventRecords({eventId,next,children}:{eventId:string;next:string;children?:ReactNode}){
  const {user,loading,error}=useSession();
  return <EventRecordsBody key={`${loading?'loading':error?'unknown':user?.id??'guest'}:${eventId}`} eventId={eventId} next={next}>{children}</EventRecordsBody>;
}

function EventRecordsBody({eventId,children}:{eventId:string;next:string;children?:ReactNode}){
  const {user,loading,error}=useSession();
  const [ownCount,setOwnCount]=useState<number|null>(user?null:0);
  return <div className="concert-memories">
    {children&&<div className="concert-supplement">{children}</div>}
    {loading?<p className="concert-resource-note" role="status">正在确认账号…</p>:user&&<PersonalRecords eventId={eventId} author={user.display_name} onCount={setOwnCount}/>}
    {!loading&&!error&&ownCount===0&&<Link className="primary-button concert-write-link" to={`/create?event=${encodeURIComponent(eventId)}`}>记下这一晚</Link>}
    <PublicRecords key={`${user?.id??'guest'}:${eventId}`} eventId={eventId} featured={ownCount===0}/>
  </div>;
}

function MemoryDocument({memory,author}:{memory:Memory;author:string}){
  author=memory.owner_display_name??author;
  return <div className="concert-memory-document"><StoryCard author={author} sample={memory.is_demo_sample} title={memory.title} year={memory.life_year} time={memory.life_time} song={memory.song} photos={cardPhotos(memory)} text={memory.story} tags={memory.tags} scope="mine" anchor={memory.offset_ms} end={memory.end_ms} lyric={memory.lyric} musicSelection={memory.music_selection} headingLevel="h2"/><div className="concert-memory-actions memory-toolbar-actions"><Link className="memory-edit-link concert-memory-edit" to={`/memories/${memory.id}/edit`}><PencilSimple size={17}/>编辑</Link></div></div>;
}

function PersonalRecords({eventId,author,onCount}:{eventId:string;author:string;onCount:(count:number)=>void}){
  const [retry,setRetry]=useState(0);
  const {value,error}=useData<Memory[]>(`/api/memories?event_id=${encodeURIComponent(eventId)}`,retry);
  useEffect(()=>{if(value)onCount(value.length);},[value,onCount]);
  if(error)return <p className="concert-resource-error" role="alert">{error}<button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>;
  if(!value)return <p className="concert-resource-note" role="status">正在翻开我的记忆…</p>;
  if(!value.length)return null;
  return <section className="concert-my-memories" aria-labelledby="concert-my-heading"><header className="concert-section-heading"><h2 id="concert-my-heading">我的记忆</h2></header><MemoryDocument memory={value[0]} author={author}/>{value.length>1&&<details className="concert-older-memories"><summary>这场还留下了 {value.length-1} 段记忆</summary>{value.slice(1).map(memory=><MemoryDocument key={memory.id} memory={memory} author={author}/>)}</details>}</section>;
}

function PublicRecords({eventId,featured}:{eventId:string;featured:boolean}){
  return <section className="concert-public-memories" aria-labelledby="concert-public-heading">
    <header className="concert-section-heading"><h2 id="concert-public-heading">这一场的瞬间</h2></header>
    <PublicFeed eventId={eventId} excludeMine emptyText="还没有听友公开分享这场演出。" renderStories={stories=>{
      const first:PublicStory|undefined=featured?stories[0]:undefined;
      const rest=first?stories.slice(1):stories;
      return <>{first&&<StoryCard author={first.author_name} sample={first.is_demo_sample} title={first.title} year={first.life_year} time={first.life_time} song={first.song} photos={cardPhotos(first)} text={first.excerpt} tags={first.tags} anchor={first.offset_ms} end={first.end_ms} lyric={first.lyric} musicSelection={first.music_selection} headingLevel="h2"/>}{rest.length>0&&<StoryGrid stories={rest}/>}</>;
    }}/>
  </section>;
}
