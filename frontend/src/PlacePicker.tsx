import {useState} from 'react';
import {CheckCircle,MapPin,MagnifyingGlass} from '@phosphor-icons/react';
import type {AtlasCatalog} from './footprintAtlas';
import {useData} from './useData';
import {locationSuggestions} from './locationSuggestions';

export function PlacePicker({query,onQuery,selected,eventId,onSelect}:{query:string;onQuery:(value:string)=>void;selected:string;eventId:string|null;onSelect:(value:string)=>void}){
  const [retry,setRetry]=useState(0);
  const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const contextCity=catalog?.events.find(event=>event.id===eventId)?.city??catalog?.events.find(event=>event.venue===selected)?.city??'';
  const suggestions=locationSuggestions(catalog,query,contextCity);
  return <>
    <label className="composer-location-search"><MagnifyingGlass size={18}/><input id="composer-location-query" autoFocus value={query} onChange={event=>onQuery(event.target.value)} placeholder="搜索城市或演出地点" aria-label="搜索城市或演出地点"/></label>
    <div className="composer-sheet-options">{error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新加载地点</button></p>:!catalog?<p role="status">正在查找地点…</p>:!suggestions.length?<p role="status">没有匹配的城市或演出地点，请试试其他关键词。</p>:suggestions.map(option=><button key={option.city+':'+option.value} type="button" aria-pressed={selected===option.value} onClick={()=>onSelect(option.value)}><MapPin size={18}/><span className="place-option-name">{option.value}{option.kind==='venue'&&<small>{option.city}</small>}</span><span aria-hidden="true">{selected===option.value?<CheckCircle size={18}/>:<span className="place-option-circle"/>}</span></button>)}</div>
  </>;
}
