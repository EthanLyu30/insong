import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {ArrowLeft,ArrowRight,BookmarkSimple,CaretRight,MapPinArea,MagnifyingGlass,X,Heart} from '@phosphor-icons/react';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import { useSession } from './SessionContext';
import { useData } from './useData';
import {EventRecords} from './EventRecords';
import {MonthFilter} from './MonthFilter';
import { AtlasMap } from './AtlasMap';
import {loadAtlasMapEngine} from './atlasMapEngine';
import type {SceneController} from './sceneInteraction';
import { CollectConcert, SongList, usePlaylistRefresh, type SavedPlaylist } from './ConcertPlaylist';
import {ConcertPlayer,useConcertPlayer} from './ConcertPlayer';
import {selectSchedule,eventChangeNote,groupConcertRuns,matchesConcertSearch,futureRangeLabels,type FutureRange,type ConcertRun,type SchedulePeriod} from './concertSchedule';
import { chinaToday, dateLabel, filterArtists, type AtlasCatalog, type AtlasCity, type AtlasEvent, type AtlasSong } from './footprintAtlas';
import './footprints.css';
import './concertJournal.css';
import {BackLink,useBackNavigation} from './Navigation';
import {FollowArtist,InterestsError,useFootprintInterests} from './FootprintInterests';
import {usePersonalConcerts} from './usePersonalConcerts';
import {useMapPhotos} from './useMapPhotos';
import {scheduleOverview} from './personalMap';
import {nearbyConcertOverview,recentConcertOverview} from './concertMapFocus';
import {useMapLocation} from './useMapLocation';
import {ChoicePicker} from './ChoicePicker';
import './personalMap.css';

function ScheduleFacts({event,catalog}:{event:AtlasEvent;catalog:AtlasCatalog}){
  const note=eventChangeNote(event,catalog.change_history);
  return note?<div className="atlas-event-facts"><span className={event.event_status==='cancelled'?'is-cancelled':'is-change'}>{note}</span></div>:null;
}

export function FootprintsPage() {
  useEffect(()=>{if(typeof window.WebGL2RenderingContext!=='undefined')void loadAtlasMapEngine().catch(()=>{});},[]);
  const navigation=useBackNavigation('/footprints');
  const navigate=useNavigate();
  const location=useLocation();
  const {user,loading:sessionLoading}=useSession();const [params,setParams]=useSearchParams();const [retry,setRetry]=useState(0);const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const requestedReturn=params.get('return')??'';
  const returnToMine=params.get('from')==='mine'&&/^\/memories(?:\?[^#]*)?$/.test(requestedReturn)?requestedReturn:null;
  const mapLocation=useMapLocation();const [locationMode,setLocationMode]=useState(false);
  const [holdCamera,setHoldCamera]=useState(false),[focusRequest,setFocusRequest]=useState(0);
  const [savedPlaylists,setSavedPlaylists]=useState<SavedPlaylist[]|null>(null);
  const [playlistRetry,setPlaylistRetry]=useState(0),[playlistLoading,setPlaylistLoading]=useState(false);
  const [savingEvent,setSavingEvent]=useState('');
  const [saveError,setSaveError]=useState('');
  const collectionRequest=useRef<AbortController|null>(null);
  const playlistUpdate=usePlaylistRefresh(String(user?.id??''));
  const interests=useFootprintInterests();
  const mapPhotos=useMapPhotos();
  const sceneController=useRef<SceneController|null>(null);
  const mapPanel=useRef<HTMLElement>(null);
  const scheduleList=useRef<HTMLDivElement>(null),scheduleScroll=useRef(new Map<string,number>());
  useEffect(()=>mapLocation.cancel,[location.key,mapLocation.cancel]);
  useEffect(()=>{setSavedPlaylists(null);setSavingEvent('');setSaveError('');setPlaylistLoading(!!user);if(!user)return;const controller=new AbortController();apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setSavedPlaylists(value);}).catch(reason=>{if(!controller.signal.aborted)setSaveError(reason instanceof Error?reason.message:'收藏状态暂时未读到。');}).finally(()=>{if(!controller.signal.aborted)setPlaylistLoading(false);});return()=>{controller.abort();collectionRequest.current?.abort();collectionRequest.current=null;};},[user?.id,playlistRetry]);

  const [query,setQuery]=useState('');const [searchOpen,setSearchOpen]=useState(false);const [expanded,setExpanded]=useState(false);const [selectedSong,setSelectedSong]=useState<AtlasSong|null>(null);
  const [venueSearch,setVenueSearch]=useState(false),[venueQuery,setVenueQuery]=useState('');
  const linkedEvent=catalog?.events.find(event=>event.id===params.get('event'));
  const artist=catalog?.artists.find(item=>item.id===params.get('artist'));
  const requestedScope=params.get('scope');
  const scope=['mine','all','saved','followed'].includes(requestedScope??'')?requestedScope!:'all';
  const personal=usePersonalConcerts(user?.id??null,!linkedEvent||params.get('scene')==='map');
  const personalIds=useMemo(()=>new Set([...(personal.value?.attendedIds??[]),...(personal.value?.memories.flatMap(memory=>memory.event_id?[memory.event_id]:[])??[])]),[personal.value]);
  const events=useMemo(()=>catalog?.events.filter(event=>(!artist||event.artist_id===artist.id)&&(scope!=='mine'||personalIds.has(event.id))&&(scope!=='saved'||savedPlaylists?.some(playlist=>playlist.event_id===event.id))&&(scope!=='followed'||interests.value?.artist_ids.includes(event.artist_id)))??[],[catalog,artist,scope,personalIds,savedPlaylists,interests.value]);
  const today=catalog?.today??chinaToday();
  const period:SchedulePeriod=params.get('period')==='upcoming'?'upcoming':'past';
  const futureRange:FutureRange=params.get('range')==='month'?'month':params.get('range')==='two-months'?'two-months':'week';
  const month=period==='upcoming'||params.get('month')==='all'?'':/^\d{4}-(?:0[1-9]|1[0-2])$/.test(params.get('month')??'')?params.get('month')!:scope==='mine'?'':chinaToday().slice(0,7);
  const recent=useMemo(()=>selectSchedule(events,period,month,today,futureRange),[events,period,month,today,futureRange]);
  // A direct saved-night link may be outside today's default period. Keep that
  // explicitly selected night without adding unrelated dates or venues.
  // An explicit night still overrides a stale artist link, never personal membership.
  const scopedLinkedEvent=linkedEvent&&(scope!=='mine'||personalIds.has(linkedEvent.id))&&(scope!=='saved'||savedPlaylists?.some(playlist=>playlist.event_id===linkedEvent.id))&&(scope!=='followed'||interests.value?.artist_ids.includes(linkedEvent.artist_id))?linkedEvent:undefined;
  const visibleEvents=useMemo(()=>scopedLinkedEvent&&!recent.some(event=>event.id===scopedLinkedEvent.id)?[scopedLinkedEvent,...recent]:recent,[scopedLinkedEvent,recent]);
  const mapSchedule=useMemo(()=>selectSchedule(events,period,'',today,futureRange),[events,period,today,futureRange]);
  const mapEvents=useMemo(()=>scopedLinkedEvent&&!mapSchedule.some(event=>event.id===scopedLinkedEvent.id)?[scopedLinkedEvent,...mapSchedule]:mapSchedule,[scopedLinkedEvent,mapSchedule]);
  const cities=catalog?.cities??[];const city=cities.find(item=>item.name===linkedEvent?.city)??cities.find(item=>item.id===params.get('city'));
  const nearbyRegion=useMemo(()=>mapLocation.position?nearbyConcertOverview(mapEvents,cities,mapLocation.position):null,[mapEvents,cities,mapLocation.position]);
  const recentRegion=useMemo(()=>recentConcertOverview(mapEvents,cities,today),[mapEvents,cities,today]);
  const overviewRegion=useMemo(()=>locationMode?(nearbyRegion??recentRegion):scheduleOverview(scope,period,mapEvents,cities)??(scope==='all'?recentRegion:null),[locationMode,nearbyRegion,recentRegion,scope,period,mapEvents,cities]);
  const focusedRecent=locationMode&&overviewRegion?recent.filter(event=>overviewRegion.eventIds.includes(event.id)):recent;
  const displayRuns=groupConcertRuns(focusedRecent).sort((a,b)=>period==='past'?b.events.at(-1)!.date.localeCompare(a.events.at(-1)!.date):a.events[0].date.localeCompare(b.events[0].date));
  // Legacy exterior links with an event now go straight to that concert.
  const scene=linkedEvent&&params.get('scene')!=='map'?'sky':'map';
  const player=useConcertPlayer(scene==='sky'?linkedEvent?.id??null:null);
  const scheduleData=scope==='mine'?personal.value:scope==='saved'?savedPlaylists:scope==='followed'?interests.value:catalog;
  useLayoutEffect(()=>{
    // A returning personal list may still be loading. Restoring an empty
    // scroll container would clamp the remembered position to zero.
    if(scene==='map'&&scheduleData&&scheduleList.current)scheduleList.current.scrollTop=scheduleScroll.current.get(location.key)??0;
  },[scene,location.key,scheduleData]);
  useLayoutEffect(()=>{
    const panel=mapPanel.current,page=panel?.closest<HTMLElement>('.atlas-page');if(scene==='sky'||!panel||!page)return;
    const measure=()=>{page.style.setProperty('--atlas-sheet-height',`${panel.getBoundingClientRect().height}px`);page.style.setProperty('--atlas-header-height',`${page.querySelector('.atlas-searchbar')?.getBoundingClientRect().height??185}px`);};
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(panel);return()=>observer.disconnect();
  },[!!catalog,scene,city?.id,searchOpen,venueSearch,expanded]);
  function playSong(song:AtlasSong){setSelectedSong(song);player.select(song);}
  const recentHeading=scope==='mine'?'我的现场经历':locationMode&&nearbyRegion?'附近的现场':locationMode&&recentRegion?'近期演出较多的区域':'最近的现场';
  async function collectEvent(event:AtlasEvent,run:ConcertRun<AtlasEvent>){
    if(!user){navigate(`/account?next=${encodeURIComponent('/footprints'+(params.size?`?${params}`:''))}`);return;}
    const saved=(savedPlaylists??[]).filter(item=>run.events.some(night=>night.id===item.event_id));
    if(collectionRequest.current||playlistUpdate.inFlight()||savedPlaylists===null||!saved.length&&!event.songs.length)return;
    const controller=new AbortController();collectionRequest.current=controller;setSavingEvent(run.id);setSaveError('');
    try{
      if(saved.length){
        for(const item of saved){await apiRequest(apiBaseUrl,`/api/playlists/concerts/${encodeURIComponent(item.event_id)}`,{method:'DELETE',signal:controller.signal});if(!controller.signal.aborted)setSavedPlaylists(items=>items?.filter(value=>value.event_id!==item.event_id)??null);}
      }else{
        const value=await apiRequest<SavedPlaylist>(apiBaseUrl,`/api/playlists/concerts/${encodeURIComponent(event.id)}`,{method:'PUT',signal:controller.signal});if(!controller.signal.aborted)setSavedPlaylists(items=>[...(items??[]).filter(item=>item.event_id!==event.id),value]);
      }
    }
    catch(reason){if(!controller.signal.aborted)setSaveError(reason instanceof Error?reason.message:'收藏状态没有更新成功，请重试。');}
    finally{if(!controller.signal.aborted){collectionRequest.current=null;setSavingEvent('');}}
  }
  async function reloadPlaylists(signal:AbortSignal){const values=await apiRequest<SavedPlaylist[]>(apiBaseUrl,'/api/playlists',{signal});if(!signal.aborted)setSavedPlaylists(values);}
  function refreshPlaylist(playlist:SavedPlaylist){
    if(collectionRequest.current)return;
    void playlistUpdate.refresh(playlist,value=>setSavedPlaylists(items=>items?.map(item=>item.event_id===value.event_id?value:item)??null),reloadPlaylists);
  }
  function retryPlaylists(){if(!collectionRequest.current&&!playlistUpdate.inFlight())setPlaylistRetry(value=>value+1);}
  function filters(extra:Record<string,string>={}){return Object.fromEntries(Object.entries({...(returnToMine?{from:'mine',return:returnToMine}:{}),...(scope?{scope}:{}),period,...(params.has('range')?{range:futureRange}:{}),...(params.get('month')==='all'?{month:'all'}:month?{month}:{}),...extra}).filter(([,value])=>value));}
  function chooseScope(value:'mine'|'all'|'saved'|'followed'){mapLocation.cancel();setLocationMode(false);setHoldCamera(value!=='mine');if(value==='mine')setFocusRequest(value=>value+1);setParams(filters({scope:value,...(value==='mine'?{month:'all',period:'past'}:{})}),{replace:true});setQuery('');setSearchOpen(false);setExpanded(false);}
  function locate(){
    setSearchOpen(false);setQuery('');
    mapLocation.request(()=>{setLocationMode(true);setHoldCamera(false);setFocusRequest(value=>value+1);setParams(filters({scope:'all',month:'all'}),{replace:true});setExpanded(false);});
  }
  function filterLocation(){return {...(artist?{artist:artist.id}:{}),...(city?{city:city.id}:{})};}
  function changePeriod(value:SchedulePeriod){mapLocation.cancel();setLocationMode(false);setParams(filters({...filterLocation(),period:value}),{replace:true});setExpanded(false);}
  function changeMonth(value:string){mapLocation.cancel();setLocationMode(false);setParams(filters({...filterLocation(),month:value}),{replace:true});setExpanded(true);}
  function changeRange(value:string){mapLocation.cancel();setLocationMode(false);setParams(filters({...filterLocation(),range:value}),{replace:true});}
  useEffect(()=>{setSelectedSong(linkedEvent?.songs[0]??null);},[linkedEvent?.id]);
  function chooseArtist(id:string){mapLocation.cancel();setLocationMode(false);setHoldCamera(true);setParams(filters({scope:'all',...(id?{artist:id,month:'all'}:{})}),{replace:true});setQuery('');setSearchOpen(false);setExpanded(false);setVenueSearch(false);setVenueQuery('');}
  function chooseCity(value:AtlasCity,artistId?:string){
    mapLocation.cancel();setLocationMode(false);
    setHoldCamera(false);
    const pinned:Record<string,string>=artistId&&scopedLinkedEvent?.artist_id===artistId&&scopedLinkedEvent.city===value.name?{event:scopedLinkedEvent.id,venue:`${scopedLinkedEvent.city}:${scopedLinkedEvent.venue}`,scene:'map'}:{};
    setParams(filters({...(searchOpen?{scope:'all'}:{}),...(artistId?{artist:artistId,month:'all'}:artist?{artist:artist.id}:{}),city:value.id,...pinned}));setSearchOpen(false);setQuery('');setVenueSearch(false);setVenueQuery('');
  }
  function openEvent(value:AtlasEvent){const matchingCity=cities.find(item=>item.name===value.city);setParams(filters({...(artist?{artist:value.artist_id}:{}),...(matchingCity?{city:matchingCity.id}:{}),event:value.id,scene:'sky'}));setExpanded(false);setSearchOpen(false);}
  function back(){
    setHoldCamera(false);
    setExpanded(false);
    // A city close stays inside the map even when a deep link came from My.
    if(navigation.previous&&(scene==='sky'||navigation.previous.url.split('?')[0]==='/footprints')){navigation.back();return;}
    if(scene==='sky'&&city&&linkedEvent){setParams(filters({artist:linkedEvent.artist_id,city:city.id,event:linkedEvent.id,scene:'map'}),{replace:true});}
    else{setParams(filters(artist?{artist:artist.id}:{}),{replace:true});}
  }
  if(!catalog)return <section className="atlas-page atlas-loading"><span className="atlas-loading-orbit" aria-hidden="true">✧</span>{error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新展开地图</button></div>:<p role="status">正在展开山河与歌声…</p>}<BackLink fallback={returnToMine??'/memories'}>{returnToMine?'返回我的':'返回'}</BackLink></section>;
  const loadedCatalog=catalog;
  const next=`/footprints?${params}`;
  const stageEvent=linkedEvent;
  const localEvents=visibleEvents.filter(event=>event.city===city?.name);
  function matchesLocalEvent(event:AtlasEvent){
    return matchesConcertSearch(event,venueQuery,loadedCatalog.artists.find(item=>item.id===event.artist_id));
  }
  const localRuns=groupConcertRuns(localEvents).filter(run=>!venueSearch||run.events.some(matchesLocalEvent)).sort((a,b)=>period==='past'?b.events.at(-1)!.date.localeCompare(a.events.at(-1)!.date):a.events[0].date.localeCompare(b.events[0].date));
  function runEvent(run:ConcertRun<AtlasEvent>,searching=false){
    const candidates=searching&&venueQuery.trim()?run.events.filter(matchesLocalEvent):run.events;
    return candidates.find(event=>event.id===linkedEvent?.id)??(period==='past'?[...candidates].reverse().find(event=>event.event_status!=='cancelled'):candidates.find(event=>event.event_status!=='cancelled'))??candidates[0]??run.events[0];
  }
  function runCard(run:ConcertRun<AtlasEvent>,inside=false){
    const event=runEvent(run,inside&&venueSearch),first=run.events[0],last=run.events.at(-1)!,multiple=run.events.length>1,cancelled=run.events.every(item=>item.event_status==='cancelled');
    const saved=run.events.some(item=>savedPlaylists?.some(playlist=>playlist.event_id===item.id));
    const memoryCount=personal.value?.memories.filter(memory=>run.events.some(night=>night.id===memory.event_id)).length??0;
    return <article className={`atlas-schedule-item${multiple?' is-run':''}`} key={run.id}>
      <button className="atlas-schedule-row" type="button" disabled={cancelled} aria-label={`${dateLabel(event.date)} ${loadedCatalog.artists.find(item=>item.id===event.artist_id)?.name} ${event.title}`} onClick={()=>openEvent(event)}>
        <time data-old-year={!first.date.startsWith(today.slice(0,4))}><span>{first.date.slice(5).replace('-','.')}{multiple&&<>—{last.date.slice(5).replace('-','.')}</>}</span><small>{first.date.slice(0,4)}</small></time>
        <span><strong>{event.city} · {loadedCatalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.venue}</small></span>
      </button>
      <button type="button" className={`atlas-schedule-heart${saved?' is-saved':''}`} aria-label={`${saved?'取消收藏':'收藏'} ${event.city} ${loadedCatalog.artists.find(item=>item.id===event.artist_id)?.name}`} aria-pressed={saved} disabled={!!savingEvent||playlistUpdate.refreshing||!!user&&savedPlaylists===null||!saved&&!event.songs.length} onClick={()=>void collectEvent(event,run)}><Heart size={21} weight={saved?'fill':'regular'}/></button>
      <div className="atlas-schedule-details">{scope==='mine'&&<small className="atlas-personal-evidence">{[memoryCount?`${memoryCount} 张记忆`:'',run.events.some(night=>personal.value?.attendedIds.includes(night.id))?'已标记到场':''].filter(Boolean).join(' · ')}</small>}<ScheduleFacts event={event} catalog={loadedCatalog}/>{multiple&&run.events.some(night=>night.event_status==='cancelled')&&!cancelled&&<small className="atlas-run-warning">部分日期已取消</small>}</div>
    </article>;
  }
  const matchingArtists=filterArtists(catalog.artists,query);
  const matchingCities=query.trim()?cities.filter(item=>item.name.includes(query.trim())).slice(0,6):[];
  const invalidEvent=params.get('event')&&!linkedEvent;
  function scheduleFilters(){return <div className="atlas-schedule-filters"><div aria-label="日程时期" role="group"><button type="button" aria-pressed={period==='past'} onClick={()=>changePeriod('past')}>往期</button><button type="button" aria-pressed={period==='upcoming'} onClick={()=>changePeriod('upcoming')}>未来</button></div><div className="atlas-time-slot">{period==='past'?<div className="atlas-month-filter"><MonthFilter value={month} onChange={changeMonth}/></div>:<ChoicePicker label="选择未来时间范围" value={futureRange} options={Object.entries(futureRangeLabels).map(([value,label])=>({value,label}))} onChange={changeRange}/>}</div></div>;}
  const personalLoading=!!user&&(scope==='mine'?personal.value===null&&!personal.error:scope==='saved'?savedPlaylists===null&&!saveError:scope==='followed'?!interests.value&&!interests.error:false);
  const personalEmpty=scope==='mine'?personal.value!==null&&personalIds.size===0:scope==='saved'?savedPlaylists?.length===0:scope==='followed'?interests.value?.artist_ids.length===0:false;
  const emptyText=scope!=='all'&&!user?'登录后可查看你的经历、收藏和歌手行程。':personalLoading?'正在读取你的行程…':scope==='mine'&&personal.error?'个人经历暂未读到，请重试。':scope==='mine'&&personalEmpty?'还没有关联演出的记忆或到场标记。':scope==='saved'&&personalEmpty?'还没有收藏演出。':scope==='followed'&&personalEmpty?'还没有关注歌手。':scope==='saved'&&saveError?'收藏暂未读到，可重试或查看全部行程。':scope==='followed'&&interests.error?'关注暂未读到，可重试或查看全部行程。':period==='upcoming'?`${futureRangeLabels[futureRange]}暂无待演场次。`:'当前筛选暂无往期场次。';
  if(scene==='sky'&&linkedEvent)return <section className="concert-journal journal-page" data-scene="sky">
    <nav className="concert-journal-toolbar" aria-label="演出详情导航"><button type="button" onClick={back} aria-label="返回上一页"><ArrowLeft size={18}/>返回</button><button type="button" onClick={()=>{setParams(filters(artist?{artist:artist.id}:{}));setExpanded(false);}} aria-label="返回全国地图"><MapPinArea size={22} weight="light"/></button></nav>
    <header className="concert-summary"><h1>{catalog.artists.find(item=>item.id===linkedEvent.artist_id)?.name??linkedEvent.title}</h1><p className="concert-tour" title={linkedEvent.title}>{linkedEvent.title.replace(catalog.artists.find(item=>item.id===linkedEvent.artist_id)?.name??'','').trim()}</p><p className="concert-dateline"><time dateTime={linkedEvent.date}>{dateLabel(linkedEvent.date)}</time>{linkedEvent.time?` · ${linkedEvent.time}`:''} · {linkedEvent.venue}</p><ScheduleFacts event={linkedEvent} catalog={catalog}/></header>
    <EventRecords key={`${user?.id??'guest'}:${linkedEvent.id}`} eventId={linkedEvent.id} next={next}>
      <details className="concert-info"><summary>演出资料与相关作品</summary><div className="concert-info-content">
        {linkedEvent.source_url&&<a className="text-button" href={linkedEvent.source_url} target="_blank" rel="noreferrer">{linkedEvent.source_title||'查看场次来源'} ↗</a>}
        <h3>{linkedEvent.setlist_kind==='confirmed'?'已核实现场歌单':linkedEvent.setlist_kind==='partial'?'部分现场曲目':'相关作品'}</h3>
        {linkedEvent.setlist_kind==='artist_collection'&&<p>现场歌单尚未确认，以下为歌手关联作品。</p>}
        <ConcertPlayer player={player}/><SongList songs={linkedEvent.songs} selected={selectedSong?.title} playing={player.state.phase==='playing'?player.state.song?.title:undefined} onSong={index=>playSong(linkedEvent.songs[index])}/>
        {!linkedEvent.songs.length&&<p>曲目尚未收录。</p>}
        <CollectConcert event={linkedEvent} next={next} collection={{saved:savedPlaylists?.find(item=>item.event_id===linkedEvent.id)??null,checking:playlistLoading,unavailable:!!user&&savedPlaylists===null&&!playlistLoading,busy:!!savingEvent,refreshing:playlistUpdate.refreshing,error:saveError||playlistUpdate.error,onCollect:()=>void collectEvent(linkedEvent,{id:linkedEvent.id,events:[linkedEvent]}),onRemove:()=>void collectEvent(linkedEvent,{id:linkedEvent.id,events:[linkedEvent]}),onUpdate:()=>{const saved=savedPlaylists?.find(item=>item.event_id===linkedEvent.id);if(saved)refreshPlaylist(saved);},onRetry:retryPlaylists}}/>
      </div></details>
    </EventRecords>
  </section>;
  return <section className={`atlas-page atlas-${scene} ${city&&scene==='map'?'is-venue-map':''}`} data-scene={scene}>
    <div className="atlas-scene">
      <AtlasMap cities={cities} events={mapEvents} artists={catalog.artists} today={today} overviewRegion={overviewRegion} photos={mapPhotos.photos} initialReady={!sessionLoading&&!personalLoading&&!mapPhotos.loading} holdCamera={holdCamera} focusRequest={focusRequest} selectedCity={city} artistSelected={!!artist} onCity={chooseCity} onVenue={openEvent} onNation={()=>{setHoldCamera(false);setParams(filters(artist?{artist:artist.id}:{}));setExpanded(false);}} onLocate={locate} locating={mapLocation.phase==='locating'} onInteraction={mapLocation.cancel} scene={scene} venueEvent={stageEvent} controller={sceneController}/>
    </div>
    {scene==='map'?<header className="atlas-searchbar has-mine-return">
      <div className="atlas-topline">{city?<button type="button" className="atlas-return-map" onClick={back}><ArrowLeft size={14} aria-hidden="true"/>返回地图</button>:<Link className="atlas-return-mine" to={returnToMine??'/memories'}><ArrowLeft size={14} aria-hidden="true"/>返回我的</Link>}<small>听见城市，走过山海。</small></div>
      <div className="atlas-wordmark"><div><span>音乐足迹</span></div><Link to="/playlists" state={{footprintReturn:next}} aria-label="我的现场歌单"><BookmarkSimple size={23} weight="light"/></Link></div>
      <div className="atlas-search-input"><MagnifyingGlass size={23} weight="light"/><input aria-label="搜索歌手或城市" placeholder="搜索喜欢的歌手或城市" autoComplete="off" value={query} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setSearchOpen(true);}} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='Escape')setSearchOpen(false);if(event.key==='Enter'&&matchingArtists.length===1)chooseArtist(matchingArtists[0].id);}}/><button type="button" className={!query&&!searchOpen?'is-inactive':''} tabIndex={query||searchOpen?0:-1} aria-hidden={!query&&!searchOpen} aria-label="收起搜索" onClick={()=>{setSearchOpen(false);setQuery('');}}><X size={20}/></button></div>
      {searchOpen?<div className="atlas-search-results"><span>{query?'搜索结果':'从一位喜欢的歌手开始'}</span>{matchingArtists.map(item=><button key={item.id} type="button" onClick={()=>chooseArtist(item.id)}>{item.name}<small>查看行程 <CaretRight size={16}/></small></button>)}{matchingCities.map(item=><button key={item.id} type="button" onClick={()=>chooseCity(item)}>{item.name}<small>看看这里的现场 <CaretRight size={16}/></small></button>)}{!matchingArtists.length&&!matchingCities.length&&<p>暂未收录这位歌手，试试邓紫棋或刘雨昕。</p>}</div>:<div className="atlas-artist-pills"><button type="button" aria-pressed={scope==='all'} onClick={()=>chooseScope('all')}>全部</button><button type="button" aria-pressed={scope==='mine'} onClick={()=>chooseScope('mine')}>我的经历</button><button type="button" aria-pressed={scope==='saved'} onClick={()=>chooseScope('saved')}>我的收藏</button><button type="button" aria-pressed={scope==='followed'} onClick={()=>chooseScope('followed')}>我的歌手</button></div>}
      {!searchOpen&&mapLocation.phase==='locating'&&<p className="atlas-location-status" role="status">正在请求位置授权…</p>}
      {!searchOpen&&locationMode&&mapLocation.phase==='settled'&&<p className="atlas-location-status" role="status">{nearbyRegion?'已展示附近已收录的演出。':`${mapLocation.reason==='denied'?'未允许定位':mapLocation.reason==='unavailable'?'定位暂不可用':'附近暂未收录演出'}，${recentRegion?'已展示近期演出较多的区域。':'当前范围暂无近期已收录演出。'}`}</p>}
      {(artist||scope==='followed')&&<InterestsError data={interests}/>}
    </header>:null}
    {scene==='map'&&<div className="atlas-legend" aria-label="行程图例"><span><i className="past"/>往期</span><span><i className="future"/>今日 / 待演</span></div>}
    {invalidEvent&&<div className="atlas-invalid" role="status">这个场次暂未收录，请从地图重新选择。</div>}
    {scene==='map'&&city?<section ref={mapPanel} className="atlas-panel atlas-city-sheet atlas-local-itinerary" aria-label={`${city.name}当地场次`}>
      <header><div><small>{artist?`${artist.name}的演出`:'当地演出'}</small><h2>{city.name}</h2></div><div className="atlas-selected-actions">{artist&&<FollowArtist artist={artist} next={next} data={interests}/>}<button type="button" className="atlas-venue-search-toggle" aria-label={venueSearch?'收起场次搜索':'搜索场次'} aria-expanded={venueSearch} onClick={()=>{setVenueSearch(!venueSearch);setVenueQuery('');}}>{venueSearch?<X size={19}/>:<MagnifyingGlass size={20}/>}</button><button type="button" onClick={back} aria-label="返回上一页">×</button></div></header>
      {scheduleFilters()}
      {venueSearch&&<div className="atlas-venue-search"><MagnifyingGlass size={17}/><input autoFocus aria-label="搜索当地场次" placeholder="歌手或日期" value={venueQuery} onChange={event=>setVenueQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){setVenueSearch(false);setVenueQuery('');}}}/></div>}
      <div ref={scheduleList} className="atlas-schedule-list" onScroll={event=>scheduleScroll.current.set(location.key,event.currentTarget.scrollTop)}>{localRuns.map(run=>runCard(run,true))}</div>
      {(saveError||playlistUpdate.error)&&<p className="atlas-save-error" role="alert">{saveError||playlistUpdate.error}<button type="button" disabled={!!savingEvent||playlistLoading||playlistUpdate.refreshing} onClick={retryPlaylists}>重试读取收藏</button></p>}
      {!localRuns.length&&<div className="atlas-empty-city"><p role={personalLoading?'status':scope==='mine'&&personal.error?'alert':undefined}>{scope!=='all'&&(!user||personalLoading||personalEmpty||scope==='mine'&&personal.error||scope==='saved'&&saveError||scope==='followed'&&interests.error)?emptyText:venueSearch?'没有找到符合条件的场次。':artist?`当前筛选下，${artist.name}在这里暂无已核实场次。`:'当前筛选下，这里暂无已核实场次。'}</p>{scope==='mine'&&personal.error&&<button type="button" onClick={personal.reload}>重试读取经历</button>}{scope!=='all'&&<button type="button" onClick={()=>chooseScope('all')}>查看全部行程</button>}{!venueSearch&&artist&&<button type="button" onClick={()=>setParams(filters({city:city.id}),{replace:true})}>看看这座城的其他现场</button>}{!venueSearch&&month&&<button type="button" onClick={()=>changeMonth('all')}>清除月份筛选</button>}</div>}
    </section>:scene==='map'&&!searchOpen?<section ref={mapPanel} className={`atlas-panel atlas-itinerary ${expanded?'is-expanded':''}`} aria-label="近期行程">
      <header><h2>{artist?`${artist.name}的行程`:recentHeading}</h2>{artist&&<FollowArtist artist={artist} next={next} data={interests}/>}</header>
      {scheduleFilters()}
      <div ref={scheduleList} className="atlas-schedule-list" onScroll={event=>scheduleScroll.current.set(location.key,event.currentTarget.scrollTop)}>{displayRuns.map(run=>runCard(run))}</div>
      {(saveError||playlistUpdate.error)&&<p className="atlas-save-error" role="alert">{saveError||playlistUpdate.error}<button type="button" disabled={!!savingEvent||playlistLoading||playlistUpdate.refreshing} onClick={retryPlaylists}>重试读取收藏</button></p>}
      {!displayRuns.length&&<div className="atlas-schedule-empty"><p role={personalLoading?'status':undefined}>{emptyText}</p>{scope==='mine'&&personal.error&&<button type="button" onClick={personal.reload}>重试读取经历</button>}{scope!=='all'&&<button type="button" onClick={()=>chooseScope('all')}>查看全部行程</button>}{!personalEmpty&&!personalLoading&&period==='upcoming'&&selectSchedule(events,'past','',today).length>0&&<button type="button" onClick={()=>changePeriod('past')}>看看往期现场 <ArrowRight size={14}/></button>}{!personalEmpty&&!personalLoading&&month&&<button type="button" onClick={()=>changeMonth('all')}>清除月份筛选</button>}</div>}
      {!!displayRuns.length&&<p className="atlas-scroll-hint">下滑查看更多</p>}
    </section>:null}
  </section>;
}
