import {useState} from 'react';
import {MagnifyingGlass} from '@phosphor-icons/react';
import {useData} from './useData';
import {groupConcertRuns,matchesConcertSearch} from './concertSchedule';
import type {AtlasCatalog} from './footprintAtlas';
import type {EventSnapshot} from './memoryClient';
import type {ManualEvent} from './memoryDrafts';

export function ConcertPicker({selected,manual,pending,onDraft,onCancel,onSelect,onManual}:{selected:string|null;manual:ManualEvent|null;pending:ManualEvent|null;onDraft:(value:ManualEvent|null)=>void;onCancel:()=>void;onSelect:(event:EventSnapshot)=>void;onManual:(event:ManualEvent)=>void}){
  const [query,setQuery]=useState(''),[entering,setEntering]=useState(!!manual||!!pending),[fields,setFields]=useState<ManualEvent>(pending??manual??{title:'',artist:'',date:'',city:'',venue:''});
  const [retry,setRetry]=useState(0),[error,setError]=useState('');
  const {value:catalog,error:loadError}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const run=catalog&&selected?groupConcertRuns(catalog.events).find(run=>run.events.some(event=>event.id===selected)):undefined;
  const candidates=query.trim()?catalog?.events.filter(event=>matchesConcertSearch(event,query,catalog.artists.find(artist=>artist.id===event.artist_id))||`${event.city} ${event.venue}`.includes(query.trim())):run?.events??catalog?.events;
  const events=[...(candidates??[])].sort((a,b)=>b.date.localeCompare(a.date));
  if(entering)return <div className="concert-manual-fields"><button type="button" className="text-button" onClick={()=>setEntering(false)}>返回搜索</button>{(['artist','date','city','venue','title'] as const).map(name=><label key={name} htmlFor={`manual-event-${name}`}>{({artist:'歌手',date:'演出日期',city:'城市',venue:'场馆',title:'演出名称（选填）'})[name]}<input id={`manual-event-${name}`} type={name==='date'?'date':'text'} value={fields[name]} maxLength={name==='title'?240:name==='city'?80:160} onChange={event=>{const next={...fields,[name]:event.target.value};setFields(next);onDraft(next);}}/></label>)}{error&&<p role="alert">{error}</p>}<button type="button" className="primary-button concert-manual-save" disabled={!fields.artist.trim()||!fields.city.trim()||!fields.venue.trim()||!fields.date} onClick={()=>{
    const checked=new Date(fields.date+'T12:00:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)||Number.isNaN(checked.getTime())||checked.getFullYear()<1900||checked.getDate()!==Number(fields.date.slice(8))){setError('日期不正确，请重新填写。');return;}
    onManual({...fields,title:fields.title.trim()||`${fields.artist.trim()} · ${fields.city.trim()}`,artist:fields.artist.trim(),city:fields.city.trim(),venue:fields.venue.trim()});
  }}>关联这场演出</button><button type="button" className="text-button" onClick={onCancel}>取消填写</button></div>;
  return <div className="concert-picker"><label className="composer-location-search"><MagnifyingGlass size={18}/><input aria-label="搜索演出" value={query} onChange={event=>setQuery(event.target.value)} placeholder="歌手、城市或日期"/></label>{run&&run.events.length>1&&!query&&<h3>参加哪一晚？</h3>}{loadError?<p role="alert">{loadError}<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>:!catalog?<p role="status">正在读取演出…</p>:<div className="concert-picker-list">{events.map(event=><button type="button" key={event.id} data-event-id={event.id} aria-pressed={event.id===selected} onClick={()=>onSelect({id:event.id,title:event.title,artist:catalog.artists.find(artist=>artist.id===event.artist_id)?.name??'',date:event.date,city:event.city,venue:event.venue})}><time>{event.date}</time><span><strong>{catalog.artists.find(artist=>artist.id===event.artist_id)?.name??event.title} · {event.city}</strong><small>{event.venue}</small></span>{event.id===selected&&<span>✓</span>}</button>)}{!events.length&&<p>没有找到这场演出</p>}</div>}<button type="button" className="text-button concert-manual-entry" onClick={()=>{onDraft(fields);setEntering(true);}}>＋ 手动填写演出</button></div>;
}
