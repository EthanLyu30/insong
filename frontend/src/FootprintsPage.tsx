import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {ArrowLeft,ArrowRight,BookmarkSimple,CaretDown,CaretRight,MapPinArea,MagnifyingGlass,X} from '@phosphor-icons/react';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import { useSession } from './SessionContext';
import { useData } from './useData';
import { PublicStoryList } from './PublicPages';
import { AtlasMap } from './AtlasMap';
import { CinematicStage } from './CinematicStage';
import type {SceneController} from './sceneInteraction';
import { CollectConcert, SongList } from './ConcertPlaylist';
import { chinaToday, dateLabel, eventPhase, filterArtists, groupVenues, type AtlasCatalog, type AtlasCity, type AtlasEvent, type AtlasSong, type AtlasVenue } from './footprintAtlas';
import './footprints.css';

function Attendance({event,today,next}:{event:AtlasEvent;today:string;next:string}) {
  const {user}=useSession();const [saved,setSaved]=useState<string[]|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [retry,setRetry]=useState(0);
  const mutation=useRef<AbortController|null>(null);
  useEffect(()=>{
    setSaved(null);setError('');setBusy(false);if(!user)return;
    const control=new AbortController();apiRequest<string[]>(apiBaseUrl,'/api/footprints',{signal:control.signal}).then(value=>{if(!control.signal.aborted)setSaved(value);}).catch(reason=>{if(!control.signal.aborted)setError(reason instanceof Error?reason.message:'足迹没有读到，请重试。');});
    return()=>{control.abort();mutation.current?.abort();mutation.current=null;};
  },[user?.id,event.id,retry]);
  const needsLogin=!user||error.includes('请先登录');
  const mine=saved?.includes(event.id);const future=eventPhase(event,today)==='upcoming';
  async function toggle(){
    if(!user || saved===null || mutation.current || future)return;
    const control=new AbortController();mutation.current=control;setBusy(true);setError('');
    try{const value=await apiRequest<string[]>(apiBaseUrl,`/api/footprints/${encodeURIComponent(event.id)}`,{method:'PUT',signal:control.signal,body:JSON.stringify({attended:!mine})});if(!control.signal.aborted)setSaved(value);}
    catch(reason){if(!control.signal.aborted)setError(reason instanceof Error?reason.message:'没有保存成功，请重试。');}
    finally{if(!control.signal.aborted){mutation.current=null;setBusy(false);}}
  }
  return <div className="atlas-attendance">{!needsLogin?<button type="button" className={mine?'is-mine':''} disabled={future||busy||saved===null} onClick={()=>void toggle()} aria-pressed={!!mine}>{busy?'保存中…':future?'演出后可标记':saved===null?'读取中…':mine?'✓ 取消到场':'✧ 我去过'}</button>:<Link to={`/account?next=${encodeURIComponent(next)}`}>{error?'重新登录留到场印记 ↗':'登录留到场印记 ↗'}</Link>}{error&&!needsLogin&&<span role="alert">{error}<button type="button" onClick={()=>setRetry(x=>x+1)}>重试</button></span>}</div>;
}

export function FootprintsPage() {
  const {user}=useSession();const [params,setParams]=useSearchParams();const [retry,setRetry]=useState(0);const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const sceneController=useRef<SceneController|null>(null);const [listOpen,setListOpen]=useState(true);
  const storyTrigger=useRef<HTMLButtonElement>(null);const storyClose=useRef<HTMLButtonElement>(null);

  const [query,setQuery]=useState('');const [searchOpen,setSearchOpen]=useState(false);const [expanded,setExpanded]=useState(false);const [selectedSong,setSelectedSong]=useState<AtlasSong|null>(null);const [stories,setStories]=useState(false);
  useEffect(()=>{if(!stories)return;storyClose.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setStories(false);};window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);storyTrigger.current?.focus();};},[stories]);
  const linkedEvent=catalog?.events.find(event=>event.id===params.get('event'));
  const artist=catalog?.artists.find(item=>item.id===(linkedEvent?.artist_id??params.get('artist')));
  const events=useMemo(()=>catalog?.events.filter(event=>!artist || event.artist_id===artist.id)??[],[catalog,artist]);
  const cities=catalog?.cities??[];const city=cities.find(item=>item.name===linkedEvent?.city)??cities.find(item=>item.id===params.get('city'));
  const venues=groupVenues(events.filter(event=>event.city===city?.name));
  const venue=venues.find(item=>item.events.some(event=>event.id===linkedEvent?.id))??venues.find(item=>item.id===params.get('venue'));
  const scene=linkedEvent && params.get('scene')!=='venue'?'sky':venue && params.get('scene')==='venue'?'venue':'map';
  const today=catalog?.today??chinaToday();
  const recent=[...events].sort((a,b)=>{
    const ap=eventPhase(a,today)!=='past',bp=eventPhase(b,today)!=='past';return ap!==bp?ap?-1:1:ap?a.date.localeCompare(b.date):b.date.localeCompare(a.date);
  });
  const recentHeading=recent[0]?`${eventPhase(recent[0],today)==='past'?'最近一站':'下一站'} · ${recent[0].city}`:'最近的现场';
  useEffect(()=>{setSelectedSong(linkedEvent?.songs[0]??null);setStories(false);},[linkedEvent?.id]);
  function chooseArtist(id:string){setParams(id?{artist:id}:{},{replace:true});setQuery('');setSearchOpen(false);setExpanded(false);}
  function chooseCity(value:AtlasCity){setParams({...(artist?{artist:artist.id}:{}),city:value.id},{replace:true});setSearchOpen(false);setQuery('');}
  function openVenue(value:AtlasVenue){setParams({...(artist?{artist:artist.id}:{}),city:city!.id,venue:value.id,scene:'venue'});}
  function openEvent(value:AtlasEvent){const matchingCity=cities.find(item=>item.name===value.city);setParams({...(artist?{artist:artist.id}:{}),...(matchingCity?{city:matchingCity.id}:{}),venue:`${value.city}:${value.venue}`,event:value.id,scene:'sky'});setExpanded(false);setSearchOpen(false);}
  function back(){
    setStories(false);
    if(scene==='sky'&&venue){setParams({...(artist?{artist:artist.id}:{}),city:city!.id,venue:venue.id,...(linkedEvent?{event:linkedEvent.id}:{}),scene:'venue'});}
    else{setParams(artist?{artist:artist.id}:{});setExpanded(false);}
  }
  if(!catalog)return <section className="atlas-page atlas-loading"><span className="atlas-loading-orbit" aria-hidden="true">✧</span>{error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新展开地图</button></div>:<p role="status">正在展开山河与歌声…</p>}<Link to="/">返回听见</Link></section>;
  const next=`/footprints?${params}`;
  const venueEvents=[...(venue?.events??[])].sort((a,b)=>{const af=eventPhase(a,today)!=='past',bf=eventPhase(b,today)!=='past';return af!==bf?af?-1:1:af?a.date.localeCompare(b.date):b.date.localeCompare(a.date);});
  const stageEvent=linkedEvent??venueEvents[0];
  function approach(event:AtlasEvent){const c=cities.find(item=>item.name===event.city);if(c){setParams({...(artist?{artist:artist.id}:{}),city:c.id,venue:`${event.city}:${event.venue}`,scene:'venue'});setExpanded(false);}}
  const matchingArtists=filterArtists(catalog.artists,query);
  const matchingCities=query.trim()?cities.filter(item=>item.name.includes(query.trim())).slice(0,6):[];
  const invalidEvent=params.get('event')&&!linkedEvent;
  return <section className={`atlas-page atlas-${scene}`} data-scene={scene}>
    <div className="atlas-scene">
      <AtlasMap cities={cities} events={events} today={today} selectedCity={city} artistSelected={!!artist} onCity={chooseCity} scene={scene} venueEvent={stageEvent} controller={sceneController}/>
      <CinematicStage scene={scene} controller={sceneController} event={stageEvent} venueName={venue?.name} city={city?.name} artistName={catalog.artists.find(item=>item.id===stageEvent?.artist_id)?.name} selected={selectedSong} onSong={setSelectedSong} onEnter={()=>{if(stageEvent)openEvent(stageEvent);}}/>
    </div>
    {scene==='map'?<header className="atlas-searchbar">
      <div className="atlas-wordmark"><div><span>足迹</span><small>跟着歌声，去远方。</small></div><Link to="/playlists" aria-label="我的现场歌单"><BookmarkSimple size={23} weight="light"/></Link></div>
      <div className="atlas-search-input"><MagnifyingGlass size={23} weight="light"/><input aria-label="搜索歌手或城市" placeholder="搜索喜欢的歌手或城市" value={query} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setSearchOpen(true);}} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);if(event.key==='Enter'&&matchingArtists.length===1)chooseArtist(matchingArtists[0].id);}}/>{(query||searchOpen)&&<button type="button" aria-label="收起搜索" onClick={()=>{setSearchOpen(false);setQuery('');}}><X size={20}/></button>}</div>
      {searchOpen?<div className="atlas-search-results"><span>{query?'搜索结果':'从一位喜欢的歌手开始'}</span>{matchingArtists.map(item=><button key={item.id} type="button" onClick={()=>chooseArtist(item.id)}>{item.name}<small>查看行程 <CaretRight size={16}/></small></button>)}{matchingCities.map(item=><button key={item.id} type="button" onClick={()=>chooseCity(item)}>{item.name}<small>看看这里的现场 <CaretRight size={16}/></small></button>)}{!matchingArtists.length&&!matchingCities.length&&<p>暂未收录这位歌手，试试邓紫棋或刘雨昕。</p>}</div>:<div className="atlas-artist-pills"><button type="button" aria-pressed={!artist} onClick={()=>chooseArtist('')}>全部现场</button>{(artist?[artist,...catalog.artists.filter(item=>item.id!==artist.id).slice(0,2)]:catalog.artists.slice(0,3)).map(item=><button key={item.id} type="button" aria-pressed={artist?.id===item.id} onClick={()=>chooseArtist(item.id)}>{item.name}</button>)}</div>}
    </header>:<header className="atlas-scene-toolbar"><button type="button" onClick={back} aria-label={scene==='sky'?'返回场馆':'返回全国'}><ArrowLeft size={25} weight="light"/></button><span>{scene==='venue'?city?.name:''}</span><button type="button" onClick={()=>{setParams(artist?{artist:artist.id}:{});setStories(false);}} aria-label="返回全国地图"><MapPinArea size={24} weight="light"/></button></header>}
    {scene==='map'&&<div className="atlas-legend" aria-label="行程图例"><span><i className="past"/>往期</span><span><i className="future"/>今日 / 待演</span></div>}
    {invalidEvent&&<div className="atlas-invalid" role="status">这个场次暂未收录，请从地图重新选择。</div>}
    {scene==='map'&&city?<section className="atlas-panel atlas-city-sheet"><header><div><small>歌声停靠的城市</small><h2>{city.name}</h2></div><button type="button" onClick={back} aria-label="返回全国">×</button></header>{venues.length?venues.map(item=><button className="atlas-venue-row" type="button" key={item.id} aria-label={`进入${item.name}`} onClick={()=>openVenue(item)}><span className="atlas-venue-icon" aria-hidden="true">⌑</span><span><strong>{item.name}</strong><small>{item.events.length} 场已收录 · {item.events.some(event=>eventPhase(event,today)!=='past')?'有今日 / 待演场次':'往期现场'}</small></span><b aria-hidden="true">↗</b></button>):<div className="atlas-empty-city"><p>{artist?`${artist.name}在这里暂无已核实场次。`:'这里暂无已核实的近期场次。'}</p><a href="https://zwfw.mct.gov.cn/wycx/qgswyyxychd/" target="_blank" rel="noopener noreferrer">前往官方演出查询 ↗</a>{artist&&<button type="button" onClick={()=>setParams({city:city.id},{replace:true})}>看看这座城的其他现场</button>}</div>}</section>:scene==='map'&&!searchOpen?<section className={`atlas-panel atlas-itinerary ${expanded?'is-expanded':''}`} aria-label="近期行程"><header><div><small>{artist?`${artist.name}的巡演足迹`:'跟着歌声，去现场'}</small><h2>{recentHeading}</h2></div><button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'更多'} <CaretDown size={16}/></button></header><div className="atlas-schedule-list">{(expanded?recent:recent.slice(0,1)).map(event=><button type="button" key={event.id} onClick={()=>approach(event)}><time data-old-year={!event.date.startsWith(today.slice(0,4))}>{event.date.startsWith(today.slice(0,4))?event.date.slice(5).replace('-','.'):dateLabel(event.date)}</time><span><strong>{event.city} · {catalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.venue}</small></span><em className={eventPhase(event,today)}>{eventPhase(event,today)==='upcoming'?'待演':eventPhase(event,today)==='today'?'今天':'往期'}</em></button>)}</div>{!recent.length&&<p>暂未收录这位歌手的演出日程。</p>}{!expanded&&recent[0]&&<button className="atlas-primary-action map-primary-action" type="button" onClick={()=>approach(recent[0])}>靠近这场现场 <ArrowRight size={20}/></button>}<footer><span>{artist?`${new Set(events.map(event=>event.city)).size} 座城市`:'47 座城市'}</span><Link to="/playlists">我的歌单</Link></footer></section>:null}
    {scene==='venue'&&venue&&stageEvent&&<section className="atlas-panel atlas-show-sheet">
      <header><h2>最近的现场</h2>{venueEvents.length>1&&<button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'全部场次'} <CaretDown size={16}/></button>}</header>
      <div className="atlas-schedule-list">{(expanded?venueEvents:[stageEvent]).map(event=><button type="button" key={event.id} aria-label={`${dateLabel(event.date)} ${catalog.artists.find(item=>item.id===event.artist_id)?.name} ${event.title}`} onClick={()=>openEvent(event)}><time><span>{event.date.slice(5).replace('-','.')}</span><small>{event.date.slice(0,4)}{event.time&&` · ${event.time}`}</small></time><span><strong>{catalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.title}</small></span><em className={eventPhase(event,today)}>{eventPhase(event,today)==='upcoming'?'待演':eventPhase(event,today)==='today'?'今天':'往期'}</em></button>)}</div>
      <button className="atlas-primary-action" type="button" onClick={()=>openEvent(stageEvent)}>走进这一晚 <ArrowRight size={20}/></button>
    </section>}
    {scene==='sky'&&linkedEvent&&<section className="atlas-panel atlas-night-panel">
      <header className="atlas-night-event"><h2>这一晚的歌单</h2><button type="button" className="song-list-toggle" aria-expanded={listOpen} onClick={()=>setListOpen(!listOpen)}>{linkedEvent.songs.length} 首 <CaretDown size={18}/></button></header>
      {listOpen&&<SongList songs={linkedEvent.songs} selected={selectedSong?.title} onSong={index=>setSelectedSong(linkedEvent.songs[index])}/>}
      {!linkedEvent.songs.length&&<p className="atlas-no-songs">曲目尚未收录。</p>}
      <CollectConcert key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} next={next}/>
      <div className="atlas-night-actions"><Link to={`/?event=${encodeURIComponent(linkedEvent.id)}`}>记下这一晚</Link><details><summary>同场记录</summary><div className="atlas-extra-actions"><Attendance key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} today={today} next={next}/><button ref={storyTrigger} type="button" onClick={()=>setStories(true)}>同场故事</button></div></details></div>
    </section>}
    {stories&&linkedEvent&&<section className="atlas-story-drawer" role="region" aria-label="这场的公开故事"><header><h2>同一晚，我们都在歌里</h2><button ref={storyClose} type="button" onClick={()=>setStories(false)} aria-label="收起同场故事">×</button></header><PublicStoryList path={`/api/stories?event_id=${encodeURIComponent(linkedEvent.id)}`} heading="愿意分享的回声"/></section>}
  </section>;
}
