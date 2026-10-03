import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {ArrowLeft,ArrowRight,BookmarkSimple,CaretDown,CaretRight,MapPinArea,MagnifyingGlass,X,MapPin,Triangle} from '@phosphor-icons/react';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import { useSession } from './SessionContext';
import { useData } from './useData';
import { PublicStoryList } from './PublicPages';
import {ChoicePicker} from './ChoicePicker';
import { AtlasMap } from './AtlasMap';
import { CinematicStage } from './CinematicStage';
import {venuePhotograph} from './photoSources';
import type {SceneController} from './sceneInteraction';
import { CollectConcert, SongList } from './ConcertPlaylist';
import {ConcertPlayer,useConcertPlayer} from './ConcertPlayer';
import {selectSchedule,scheduleMonths,eventChangeNote,groupConcertRuns,matchesConcertSearch,type ConcertRun,type SchedulePeriod} from './concertSchedule';
import { chinaToday, dateLabel, eventPhase, phaseLabel, filterArtists, groupVenues, type AtlasCatalog, type AtlasCity, type AtlasEvent, type AtlasSong, type AtlasVenue } from './footprintAtlas';
import './footprints.css';
import {BackLink,useBackNavigation} from './Navigation';

function Attendance({event,today,next}:{event:AtlasEvent;today:string;next:string}) {
  const {user}=useSession();const [saved,setSaved]=useState<string[]|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [retry,setRetry]=useState(0);
  const mutation=useRef<AbortController|null>(null);
  useEffect(()=>{
    setSaved(null);setError('');setBusy(false);if(!user)return;
    const control=new AbortController();apiRequest<string[]>(apiBaseUrl,'/api/footprints',{signal:control.signal}).then(value=>{if(!control.signal.aborted)setSaved(value);}).catch(reason=>{if(!control.signal.aborted)setError(reason instanceof Error?reason.message:'足迹没有读到，请重试。');});
    return()=>{control.abort();mutation.current?.abort();mutation.current=null;};
  },[user?.id,event.id,retry]);
  const needsLogin=!user||error.includes('请先登录');
  const mine=saved?.includes(event.id);const future=eventPhase(event,today)==='upcoming',cancelled=event.event_status==='cancelled';
  async function toggle(){
    if(!user || saved===null || mutation.current || ((future||cancelled)&&!mine))return;
    const control=new AbortController();mutation.current=control;setBusy(true);setError('');
    try{const value=await apiRequest<string[]>(apiBaseUrl,`/api/footprints/${encodeURIComponent(event.id)}`,{method:'PUT',signal:control.signal,body:JSON.stringify({attended:!mine})});if(!control.signal.aborted)setSaved(value);}
    catch(reason){if(!control.signal.aborted)setError(reason instanceof Error?reason.message:'没有保存成功，请重试。');}
    finally{if(!control.signal.aborted){mutation.current=null;setBusy(false);}}
  }
  return <div className="atlas-attendance">{!needsLogin?<button type="button" className={mine?'is-mine':''} disabled={((cancelled||future)&&!mine)||busy||saved===null} onClick={()=>void toggle()} aria-pressed={!!mine}>{busy?'保存中…':mine?'✓ 取消到场':cancelled?'演出已取消':future?'演出后可标记':saved===null?'读取中…':'✧ 我去过'}</button>:cancelled?<button type="button" disabled>演出已取消</button>:<Link to={`/account?next=${encodeURIComponent(next)}`}>{error?'重新登录留到场印记 ↗':'登录留到场印记 ↗'}</Link>}{error&&!needsLogin&&<span role="alert">{error}<button type="button" onClick={()=>setRetry(x=>x+1)}>重试</button></span>}</div>;
}

function ScheduleFacts({event,catalog}:{event:AtlasEvent;catalog:AtlasCatalog}){
  const note=eventChangeNote(event,catalog.change_history);
  return note?<div className="atlas-event-facts"><span className={event.event_status==='cancelled'?'is-cancelled':'is-change'}>{note}</span></div>:null;
}

export function FootprintsPage() {
  const navigation=useBackNavigation('/footprints');
  const {user}=useSession();const [params,setParams]=useSearchParams();const [retry,setRetry]=useState(0);const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const sceneController=useRef<SceneController|null>(null);const [listOpen,setListOpen]=useState(true);
  const storyTrigger=useRef<HTMLButtonElement>(null);const storyClose=useRef<HTMLButtonElement>(null);
  const nightPanel=useRef<HTMLElement>(null);
  const mapPanel=useRef<HTMLElement>(null);

  const [query,setQuery]=useState('');const [searchOpen,setSearchOpen]=useState(false);const [expanded,setExpanded]=useState(false);const [selectedSong,setSelectedSong]=useState<AtlasSong|null>(null);const [stories,setStories]=useState(false);
  const [venueSearch,setVenueSearch]=useState(false),[venueQuery,setVenueQuery]=useState('');
  useEffect(()=>{if(!stories)return;storyClose.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setStories(false);};window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);storyTrigger.current?.focus();};},[stories]);
  const linkedEvent=catalog?.events.find(event=>event.id===params.get('event'));
  const artist=catalog?.artists.find(item=>item.id===params.get('artist'));
  const events=useMemo(()=>catalog?.events.filter(event=>!artist || event.artist_id===artist.id)??[],[catalog,artist]);
  const today=catalog?.today??chinaToday();
  const period:SchedulePeriod=params.get('period')==='upcoming'?'upcoming':'past';
  const month=/^\d{4}-(?:0[1-9]|1[0-2])$/.test(params.get('month')??'')?params.get('month')!:'';
  const months=useMemo(()=>scheduleMonths(events,period,today),[events,period,today]);
  const recent=useMemo(()=>selectSchedule(events,period,month,today),[events,period,month,today]);
  const recentRuns=useMemo(()=>groupConcertRuns(recent).sort((a,b)=>period==='past'?b.events.at(-1)!.date.localeCompare(a.events.at(-1)!.date):a.events[0].date.localeCompare(b.events[0].date)),[recent,period]);
  // A direct saved-night link may be outside today's default period. Keep that
  // explicitly selected night without adding unrelated dates or venues.
  const visibleEvents=useMemo(()=>linkedEvent&&!recent.some(event=>event.id===linkedEvent.id)?[linkedEvent,...recent]:recent,[linkedEvent,recent]);
  const cities=catalog?.cities??[];const city=cities.find(item=>item.name===linkedEvent?.city)??cities.find(item=>item.id===params.get('city'));
  const venues=groupVenues(visibleEvents.filter(event=>event.city===city?.name));
  const venue=venues.find(item=>item.events.some(event=>event.id===linkedEvent?.id))??venues.find(item=>item.id===params.get('venue'));
  const scene=linkedEvent && !['venue','map'].includes(params.get('scene')??'')?'sky':venue && params.get('scene')==='venue'?'venue':'map';
  const player=useConcertPlayer(scene==='sky'?linkedEvent?.id??null:null);
  useLayoutEffect(()=>{
    const panel=nightPanel.current,page=panel?.closest<HTMLElement>('.atlas-page');if(scene!=='sky'||!panel||!page)return;
    const measure=()=>page.style.setProperty('--concert-sheet-height',`${panel.getBoundingClientRect().height}px`);
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(panel);return()=>observer.disconnect();
  },[scene,linkedEvent?.id,listOpen]);
  useLayoutEffect(()=>{
    const panel=mapPanel.current,page=panel?.closest<HTMLElement>('.atlas-page');if(scene==='sky'||!panel||!page)return;
    const measure=()=>page.style.setProperty('--atlas-sheet-height',`${panel.getBoundingClientRect().height}px`);
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(panel);return()=>observer.disconnect();
  },[scene,city?.id,searchOpen,venueSearch,expanded]);
  function playSong(song:AtlasSong){setSelectedSong(song);player.select(song);}
  const recentHeading=recent[0]?`${period==='past'?'最近一站':'下一站'} · ${recent[0].city}`:'最近的现场';
  function filters(extra:Record<string,string>={}){return Object.fromEntries(Object.entries({period,...(month?{month}:{}),...extra}).filter(([,value])=>value));}
  function filterLocation(){return {...(artist?{artist:artist.id}:{}),...(city?{city:city.id}:{})};}
  function changePeriod(value:SchedulePeriod){setParams(filters({...filterLocation(),period:value,month:''}),{replace:true});setExpanded(false);}
  function changeMonth(value:string){setParams(filters({...filterLocation(),month:value}),{replace:true});setExpanded(true);}
  useEffect(()=>{setSelectedSong(linkedEvent?.songs[0]??null);setStories(false);setListOpen(true);},[linkedEvent?.id]);
  function chooseArtist(id:string){setParams(filters({...(id?{artist:id}:{}),month:''}),{replace:true});setQuery('');setSearchOpen(false);setExpanded(false);}
  function chooseCity(value:AtlasCity){setParams(filters({...(artist?{artist:artist.id}:{}),city:value.id}));setSearchOpen(false);setQuery('');}
  function openVenue(value:AtlasVenue){const selected=value.events.find(event=>event.id===linkedEvent?.id)??value.events[0];setParams(filters({...(artist?{artist:artist.id}:{}),city:city!.id,venue:value.id,...(selected?{event:selected.id}:{}),scene:'venue'}));}
  function mapVenue(event:AtlasEvent){const c=cities.find(item=>item.name===event.city);if(c)setParams(filters({...(artist?{artist:artist.id}:{}),city:c.id,venue:`${event.city}:${event.venue}`,event:event.id,scene:'venue'}));}
  function openEvent(value:AtlasEvent){const matchingCity=cities.find(item=>item.name===value.city);setParams(filters({...(artist?{artist:value.artist_id}:{}),...(matchingCity?{city:matchingCity.id}:{}),venue:`${value.city}:${value.venue}`,event:value.id,scene:'sky'}));setExpanded(false);setSearchOpen(false);}
  function back(){
    setStories(false);
    setExpanded(false);
    if(navigation.previous){navigation.back();return;}
    if(scene==='sky'&&venue){setParams(filters({...(artist?{artist:artist.id}:{}),city:city!.id,venue:venue.id,...(linkedEvent?{event:linkedEvent.id}:{}),scene:'venue'}),{replace:true});}
    else if(scene==='venue'&&city){setParams(filters({...(artist?{artist:artist.id}:{}),city:city.id,...(venue?{venue:venue.id}:{}),...(linkedEvent?{event:linkedEvent.id}:{}),scene:'map'}),{replace:true});}
    else{setParams(filters(artist?{artist:artist.id}:{}),{replace:true});}
  }
  if(!catalog)return <section className="atlas-page atlas-loading"><span className="atlas-loading-orbit" aria-hidden="true">✧</span>{error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新展开地图</button></div>:<p role="status">正在展开山河与歌声…</p>}<BackLink/></section>;
  const loadedCatalog=catalog;
  const next=`/footprints?${params}`;
  const venueEvents=[...(venue?.events??[])].sort((a,b)=>period==='past'?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  const venueRuns=groupConcertRuns(venueEvents).sort((a,b)=>period==='past'?b.events.at(-1)!.date.localeCompare(a.events.at(-1)!.date):a.events[0].date.localeCompare(b.events[0].date));
  const stageEvent=linkedEvent??venueEvents[0];
  const venueSearchEvents=selectSchedule(catalog.events.filter(event=>event.city===city?.name&&event.venue===venue?.name),period,month,today);
  if(linkedEvent&&linkedEvent.city===city?.name&&linkedEvent.venue===venue?.name&&!venueSearchEvents.some(event=>event.id===linkedEvent.id))venueSearchEvents.push(linkedEvent);
  function matchesVenueEvent(event:AtlasEvent){
    return matchesConcertSearch(event,venueQuery,loadedCatalog.artists.find(item=>item.id===event.artist_id));
  }
  const searchedRuns=groupConcertRuns(venueSearchEvents).filter(run=>run.events.some(matchesVenueEvent)).sort((a,b)=>period==='past'?b.events.at(-1)!.date.localeCompare(a.events.at(-1)!.date):a.events[0].date.localeCompare(b.events[0].date));
  function runEvent(run:ConcertRun<AtlasEvent>,searching=false){
    const candidates=searching&&venueQuery.trim()?run.events.filter(matchesVenueEvent):run.events;
    return candidates.find(event=>event.id===linkedEvent?.id)??(period==='past'?[...candidates].reverse().find(event=>event.event_status!=='cancelled'):candidates.find(event=>event.event_status!=='cancelled'))??candidates[0]??run.events[0];
  }
  function runCard(run:ConcertRun<AtlasEvent>,inside=false){
    const event=runEvent(run,inside&&venueSearch),first=run.events[0],last=run.events.at(-1)!,multiple=run.events.length>1,cancelled=run.events.every(item=>item.event_status==='cancelled');
    return <article className={`atlas-schedule-item${multiple?' is-run':''}`} key={run.id}>
      <button className="atlas-schedule-row" type="button" disabled={inside&&cancelled} aria-label={`${dateLabel(event.date)} ${loadedCatalog.artists.find(item=>item.id===event.artist_id)?.name} ${event.title}`} onClick={()=>inside?openEvent(event):approach(event)}>
        <time data-old-year={!first.date.startsWith(today.slice(0,4))}><span>{first.date.slice(5).replace('-','.')}{multiple&&<>—{last.date.slice(5).replace('-','.')}</>}</span>{(inside||multiple||!first.date.startsWith(today.slice(0,4)))&&<small>{first.date.slice(0,4)}{multiple?` · ${run.events.length} 晚`:event.time?` · ${event.time}`:''}</small>}</time>
        <span><strong>{!inside&&expanded?event.city+' · ':''}{loadedCatalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{inside?event.title:event.venue}</small></span>{(!inside||cancelled||event.date>=today)&&<em className={cancelled?'cancelled':eventPhase(event,today)}>{cancelled?'已取消':phaseLabel(event,today)}</em>}
      </button>
      <div className="atlas-schedule-details"><ScheduleFacts event={event} catalog={loadedCatalog}/>{multiple&&run.events.some(night=>night.event_status==='cancelled')&&!cancelled&&<small className="atlas-run-warning">部分日期已取消</small>}</div>
    </article>;
  }
  function approach(event:AtlasEvent){const c=cities.find(item=>item.name===event.city);if(c){setParams(filters({...(artist?{artist:artist.id}:{}),city:c.id,venue:`${event.city}:${event.venue}`,event:event.id,scene:'map'}));setExpanded(false);}}
  const matchingArtists=filterArtists(catalog.artists,query);
  const matchingCities=query.trim()?cities.filter(item=>item.name.includes(query.trim())).slice(0,6):[];
  const invalidEvent=params.get('event')&&!linkedEvent;
  function scheduleFilters(){return <div className="atlas-schedule-filters"><div aria-label="日程时期" role="group"><button type="button" aria-pressed={period==='past'} onClick={()=>changePeriod('past')}>往期</button><button type="button" aria-pressed={period==='upcoming'} onClick={()=>changePeriod('upcoming')}>接下来</button></div>{period==='past'?<div className="atlas-month-filter"><ChoicePicker label="筛选演出月份" value={month} onChange={changeMonth} options={[{value:'',label:'全部月份'},...[...new Set([...(month?[month]:[]),...months])].map(value=>({value,label:`${value.replace('-','年')}月`}))]}/></div>:<span className="atlas-week-window">未来 7 天</span>}</div>;}
  return <section className={`atlas-page atlas-${scene} ${city&&scene==='map'?'is-venue-map':''}`} data-scene={scene}>
    <div className="atlas-scene">
      <AtlasMap cities={cities} events={visibleEvents} today={today} selectedCity={city} artistSelected={!!artist} onCity={chooseCity} onVenue={mapVenue} onNation={()=>{setParams(filters(artist?{artist:artist.id}:{}));setExpanded(false);}} scene={scene} venueEvent={stageEvent} controller={sceneController}/>
      <CinematicStage scene={scene} controller={sceneController} event={stageEvent} venueName={venue?.name} city={city?.name} artistName={catalog.artists.find(item=>item.id===stageEvent?.artist_id)?.name} selected={selectedSong} playing={player.state.phase==='playing'?player.state.song?.title:undefined} onSong={playSong} onEnter={()=>{if(stageEvent)openEvent(stageEvent);}}/>
    </div>
    {scene==='map'?<header className="atlas-searchbar">
      <div className="atlas-wordmark"><div><span>足迹</span><small>跟着歌声，去远方。</small></div><Link to="/playlists" aria-label="我的现场歌单"><BookmarkSimple size={23} weight="light"/></Link></div>
      <div className="atlas-search-input"><MagnifyingGlass size={23} weight="light"/><input aria-label="搜索歌手或城市" placeholder="搜索喜欢的歌手或城市" value={query} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setSearchOpen(true);}} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);if(event.key==='Enter'&&matchingArtists.length===1)chooseArtist(matchingArtists[0].id);}}/>{(query||searchOpen)&&<button type="button" aria-label="收起搜索" onClick={()=>{setSearchOpen(false);setQuery('');}}><X size={20}/></button>}</div>
      {searchOpen?<div className="atlas-search-results"><span>{query?'搜索结果':'从一位喜欢的歌手开始'}</span>{matchingArtists.map(item=><button key={item.id} type="button" onClick={()=>chooseArtist(item.id)}>{item.name}<small>查看行程 <CaretRight size={16}/></small></button>)}{matchingCities.map(item=><button key={item.id} type="button" onClick={()=>chooseCity(item)}>{item.name}<small>看看这里的现场 <CaretRight size={16}/></small></button>)}{!matchingArtists.length&&!matchingCities.length&&<p>暂未收录这位歌手，试试邓紫棋或刘雨昕。</p>}</div>:<div className="atlas-artist-pills"><button type="button" aria-pressed={!artist} onClick={()=>chooseArtist('')}>全部</button>{(artist?[artist,...catalog.artists.filter(item=>item.id!==artist.id).slice(0,1)]:catalog.artists.slice(0,2)).map(item=><button key={item.id} type="button" aria-pressed={artist?.id===item.id} onClick={()=>chooseArtist(item.id)}>{item.name}</button>)}</div>}
    </header>:<header className="atlas-scene-toolbar"><button type="button" onClick={back} aria-label="返回上一页"><ArrowLeft size={25} weight="light"/></button><span>{scene==='venue'?city?.name:''}</span><button type="button" onClick={()=>{setParams(filters(artist?{artist:artist.id}:{}));setStories(false);setExpanded(false);}} aria-label="返回全国地图"><MapPinArea size={24} weight="light"/></button></header>}
    {scene==='map'&&<div className="atlas-legend" aria-label="行程图例"><span><i className="past"/>往期</span><span><i className="future"/>今日 / 待演</span></div>}
    {invalidEvent&&<div className="atlas-invalid" role="status">这个场次暂未收录，请从地图重新选择。</div>}
    {scene==='map'&&city?<section ref={mapPanel} className="atlas-panel atlas-city-sheet">
      <header><div><small>点亮场馆，靠近这一晚</small><h2>{city.name}</h2></div><button type="button" onClick={back} aria-label="返回上一页">×</button></header>
      {scheduleFilters()}
      {venues.length?venues.map(item=><button className="atlas-venue-row" type="button" key={item.id} aria-label={`进入${item.name}`} onClick={()=>openVenue(item)}>
        {venuePhotograph(item.name,artist?.id)?<img className="atlas-venue-photo" src={venuePhotograph(item.name,artist?.id)!.url} alt={`${venuePhotograph(item.name,artist?.id)!.description} · 2026.09.26 实拍参考`}/>:<MapPin className="atlas-venue-icon" size={25} weight="light" aria-hidden="true"/>}<span><strong>{item.name}</strong><small>{groupConcertRuns(item.events).length} 组现场 · {item.events.length} 晚{item.events.every(event=>event.event_status==='cancelled')?' · 已取消':''}</small></span><CaretRight size={20} aria-hidden="true"/>
      </button>):<div className="atlas-empty-city"><p>{artist?`当前筛选下，${artist.name}在这里暂无已核实场次。`:'当前筛选下，这里暂无已核实场次。'}</p><a href="https://zwfw.mct.gov.cn/wycx/qgswyyxychd/" target="_blank" rel="noopener noreferrer">前往官方演出查询 ↗</a>{artist&&<button type="button" onClick={()=>setParams({city:city.id},{replace:true})}>看看这座城的其他现场</button>}</div>}
    </section>:scene==='map'&&!searchOpen?<section ref={mapPanel} className={`atlas-panel atlas-itinerary ${expanded?'is-expanded':''}`} aria-label="近期行程">
      <header><h2>{recentHeading}</h2><button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'更多'} <CaretDown size={16}/></button></header>
      {scheduleFilters()}
      <div className="atlas-schedule-list">{(expanded?recentRuns:recentRuns.slice(0,1)).map(run=>runCard(run))}</div>
      {!recent.length&&<div className="atlas-schedule-empty"><p>{period==='upcoming'?'未来 7 天暂无待演场次。':'当前筛选暂无往期场次。'}</p>{period==='upcoming'&&selectSchedule(events,'past','',today).length>0&&<button type="button" onClick={()=>changePeriod('past')}>看看往期现场 <ArrowRight size={14}/></button>}{month&&<button type="button" onClick={()=>setParams(filters({...((artist)?{artist:artist.id}:{}),month:''}),{replace:true})}>清除筛选</button>}</div>}{!expanded&&recentRuns[0]&&recentRuns[0].events.some(event=>event.event_status!=='cancelled')&&<button className="atlas-primary-action map-primary-action" type="button" onClick={()=>approach(runEvent(recentRuns[0]))}>靠近这场现场 <ArrowRight size={20}/></button>}
      {expanded&&<p className="atlas-catalog-coverage">{recentRuns.length} 组现场 · {recent.length} 晚</p>}
    </section>:null}
    {scene==='venue'&&venue&&stageEvent&&<section ref={mapPanel} className="atlas-panel atlas-show-sheet">
      <header><h2>这里的现场</h2><button type="button" className="atlas-venue-search-toggle" aria-label={venueSearch?'收起场次搜索':'搜索场次'} aria-expanded={venueSearch} onClick={()=>{setVenueSearch(!venueSearch);setVenueQuery('');}}>{venueSearch?<X size={19}/>:<MagnifyingGlass size={20}/>}</button></header>
      {venueSearch&&<div className="atlas-venue-search"><MagnifyingGlass size={17}/><input autoFocus aria-label="搜索这座场馆的现场" placeholder="歌手或日期" value={venueQuery} onChange={event=>setVenueQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){setVenueSearch(false);setVenueQuery('');}}}/></div>}
      <div className="atlas-schedule-list">{(venueSearch?searchedRuns:venueRuns).map(run=>runCard(run,true))}</div>
      {venueSearch&&!searchedRuns.length&&<p className="atlas-schedule-empty">没有找到这场现场。</p>}
    </section>}
    {scene==='sky'&&linkedEvent&&<section ref={nightPanel} className={`atlas-panel atlas-night-panel${!listOpen?' is-collapsed':''}`}>
      <button type="button" className="atlas-night-handle" aria-label={listOpen?'收起歌单':'展开歌单'} aria-expanded={listOpen} aria-controls="concert-night-content" onClick={()=>setListOpen(!listOpen)}><Triangle size={17} weight="fill"/></button>
      <div id="concert-night-content" className="atlas-night-content" hidden={!listOpen}>
      <header className="atlas-night-event"><h2>{linkedEvent.setlist_kind==='confirmed'?'这一晚的歌单':linkedEvent.setlist_kind==='partial'?'已收录的曲目':'这一晚 · 相关作品'}</h2></header>
      {linkedEvent.setlist_kind==='artist_collection'&&<p className="atlas-setlist-note">现场歌单尚未确认</p>}
      <ConcertPlayer player={player}/>
      <SongList songs={linkedEvent.songs} selected={selectedSong?.title} playing={player.state.phase==='playing'?player.state.song?.title:undefined} onSong={index=>playSong(linkedEvent.songs[index])}/>
      {!linkedEvent.songs.length&&<p className="atlas-no-songs">曲目尚未收录。</p>}
      <CollectConcert key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} next={next}/>
      <div className="atlas-night-personal"><ScheduleFacts event={linkedEvent} catalog={catalog}/></div>
      <div className="atlas-night-actions"><Link to={`/?event=${encodeURIComponent(linkedEvent.id)}`}>记下这一晚</Link><details><summary>同场记录</summary><div className="atlas-extra-actions"><Attendance key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} today={today} next={next}/><button ref={storyTrigger} type="button" onClick={()=>setStories(true)}>同场故事</button></div></details></div>
      </div>
    </section>}
    {stories&&linkedEvent&&<section className="atlas-story-drawer" role="region" aria-label="这场的公开故事"><header><h2>同一晚，我们都在歌里</h2><button ref={storyClose} type="button" onClick={()=>setStories(false)} aria-label="收起同场故事">×</button></header><PublicStoryList path={`/api/stories?event_id=${encodeURIComponent(linkedEvent.id)}`} heading="愿意分享的回声"/></section>}
  </section>;
}
