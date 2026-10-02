import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {ArrowLeft,ArrowRight,BookmarkSimple,CaretDown,CaretRight,MapPinArea,MagnifyingGlass,X,MapPin,Heart} from '@phosphor-icons/react';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import { useSession } from './SessionContext';
import { useData } from './useData';
import { PublicStoryList } from './PublicPages';
import { AtlasMap } from './AtlasMap';
import { CinematicStage } from './CinematicStage';
import {venuePhotograph} from './photoSources';
import {PhotoCredit} from './PhotoCredit';
import type {SceneController} from './sceneInteraction';
import { CollectConcert, SongList } from './ConcertPlaylist';
import {ConcertPlayer,useConcertPlayer} from './ConcertPlayer';
import {useFootprintInterests,FollowArtist,WishEvent,InterestsError} from './FootprintInterests';
import {selectSchedule,scheduleMonths,eventChangeNote,eventCheckedOn,type SchedulePeriod} from './concertSchedule';
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
  const checked=eventCheckedOn(event),note=eventChangeNote(event,catalog.change_history);
  return <div className="atlas-event-facts">{checked&&<span>核验 {dateLabel(checked)}</span>}{note&&<span className={event.event_status==='cancelled'?'is-cancelled':'is-change'}>{note}</span>}</div>;
}

export function FootprintsPage() {
  const navigation=useBackNavigation('/footprints');
  const {user}=useSession();const [params,setParams]=useSearchParams();const [retry,setRetry]=useState(0);const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
  const sceneController=useRef<SceneController|null>(null);const [listOpen,setListOpen]=useState(true);
  const interests=useFootprintInterests();
  const storyTrigger=useRef<HTMLButtonElement>(null);const storyClose=useRef<HTMLButtonElement>(null);
  const nightPanel=useRef<HTMLElement>(null);
  const mapPanel=useRef<HTMLElement>(null);

  const [query,setQuery]=useState('');const [searchOpen,setSearchOpen]=useState(false);const [expanded,setExpanded]=useState(false);const [selectedSong,setSelectedSong]=useState<AtlasSong|null>(null);const [stories,setStories]=useState(false);
  useEffect(()=>{if(!stories)return;storyClose.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setStories(false);};window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);storyTrigger.current?.focus();};},[stories]);
  const linkedEvent=catalog?.events.find(event=>event.id===params.get('event'));
  const artist=catalog?.artists.find(item=>item.id===params.get('artist'));
  const events=useMemo(()=>catalog?.events.filter(event=>!artist || event.artist_id===artist.id)??[],[catalog,artist]);
  const today=catalog?.today??chinaToday();
  const period:SchedulePeriod=params.get('period')==='past'||(!params.has('period')&&linkedEvent&&linkedEvent.date<today)?'past':'upcoming';
  const month=/^\d{4}-(?:0[1-9]|1[0-2])$/.test(params.get('month')??'')?params.get('month')!:'',mine=params.get('scope')==='mine';
  const interestedEvents=useMemo(()=>mine?events.filter(event=>interests.value?.artist_ids.includes(event.artist_id)||interests.value?.wish_event_ids.includes(event.id)):events,[mine,events,interests.value]);
  const months=useMemo(()=>scheduleMonths(interestedEvents,period,today),[interestedEvents,period,today]);
  const recent=useMemo(()=>selectSchedule(interestedEvents,period,month,today),[interestedEvents,period,month,today]);
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
  },[scene,linkedEvent?.id]);
  useLayoutEffect(()=>{
    const panel=mapPanel.current,page=panel?.closest<HTMLElement>('.atlas-page');if(scene==='sky'||!panel||!page)return;
    const measure=()=>page.style.setProperty('--atlas-sheet-height',`${panel.getBoundingClientRect().height}px`);
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(panel);return()=>observer.disconnect();
  },[scene,city?.id,searchOpen]);
  function playSong(song:AtlasSong){setSelectedSong(song);player.select(song);}
  const recentHeading=recent[0]?`${period==='past'?'最近一站':'下一站'} · ${recent[0].city}`:'最近的现场';
  function filters(extra:Record<string,string>={}){return Object.fromEntries(Object.entries({...(period==='past'?{period:'past'}:{}),...(month?{month}:{}),...(mine?{scope:'mine'}:{}),...extra}).filter(([,value])=>value));}
  function filterLocation(){return {...(artist?{artist:artist.id}:{}),...(city?{city:city.id}:{})};}
  function changePeriod(value:SchedulePeriod){setParams(filters({...filterLocation(),period:value,month:''}),{replace:true});setExpanded(false);}
  function changeMonth(value:string){setParams(filters({...filterLocation(),month:value}),{replace:true});setExpanded(true);}
  function changeScope(){setParams(filters({...filterLocation(),scope:mine?'':'mine',month:''}),{replace:true});setExpanded(false);}
  useEffect(()=>{setSelectedSong(linkedEvent?.songs[0]??null);setStories(false);},[linkedEvent?.id]);
  function chooseArtist(id:string){setParams(filters({...(id?{artist:id}:{}),month:'',scope:''}),{replace:true});setQuery('');setSearchOpen(false);setExpanded(false);}
  function chooseCity(value:AtlasCity){setParams(filters({...(artist?{artist:artist.id}:{}),city:value.id}));setSearchOpen(false);setQuery('');}
  function openVenue(value:AtlasVenue){const selected=value.events.find(event=>event.id===linkedEvent?.id)??value.events[0];setParams(filters({...(artist?{artist:artist.id}:{}),city:city!.id,venue:value.id,...(selected?{event:selected.id}:{}),scene:'venue'}));}
  function mapVenue(event:AtlasEvent){const c=cities.find(item=>item.name===event.city);if(c)setParams(filters({...(artist?{artist:artist.id}:{}),city:c.id,venue:`${event.city}:${event.venue}`,event:event.id,scene:'venue'}));}
  function openEvent(value:AtlasEvent){const matchingCity=cities.find(item=>item.name===value.city);setParams(filters({...(artist?{artist:artist.id}:{}),...(matchingCity?{city:matchingCity.id}:{}),venue:`${value.city}:${value.venue}`,event:value.id,scene:'sky'}));setExpanded(false);setSearchOpen(false);}
  function back(){
    setStories(false);
    setExpanded(false);
    if(navigation.previous){navigation.back();return;}
    if(scene==='sky'&&venue){setParams(filters({...(artist?{artist:artist.id}:{}),city:city!.id,venue:venue.id,...(linkedEvent?{event:linkedEvent.id}:{}),scene:'venue'}),{replace:true});}
    else if(scene==='venue'&&city){setParams(filters({...(artist?{artist:artist.id}:{}),city:city.id,...(venue?{venue:venue.id}:{}),...(linkedEvent?{event:linkedEvent.id}:{}),scene:'map'}),{replace:true});}
    else{setParams(filters(artist?{artist:artist.id}:{}),{replace:true});}
  }
  if(!catalog)return <section className="atlas-page atlas-loading"><span className="atlas-loading-orbit" aria-hidden="true">✧</span>{error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新展开地图</button></div>:<p role="status">正在展开山河与歌声…</p>}<BackLink/></section>;
  const next=`/footprints?${params}`;
  const venueEvents=[...(venue?.events??[])].sort((a,b)=>{const ac=a.event_status==='cancelled',bc=b.event_status==='cancelled';if(ac!==bc)return ac?1:-1;const af=eventPhase(a,today)!=='past',bf=eventPhase(b,today)!=='past';return af!==bf?af?-1:1:af?a.date.localeCompare(b.date):b.date.localeCompare(a.date);});
  const stageEvent=linkedEvent??venueEvents[0];
  function approach(event:AtlasEvent){const c=cities.find(item=>item.name===event.city);if(c){setParams(filters({...(artist?{artist:artist.id}:{}),city:c.id,venue:`${event.city}:${event.venue}`,event:event.id,scene:'map'}));setExpanded(false);}}
  const matchingArtists=filterArtists(catalog.artists,query);
  const matchingCities=query.trim()?cities.filter(item=>item.name.includes(query.trim())).slice(0,6):[];
  const invalidEvent=params.get('event')&&!linkedEvent;
  function scheduleFilters(){return <div className="atlas-schedule-filters"><div aria-label="日程时期" role="group"><button type="button" aria-pressed={period==='upcoming'} onClick={()=>changePeriod('upcoming')}>接下来</button><button type="button" aria-pressed={period==='past'} onClick={()=>changePeriod('past')}>往期</button></div><label className="atlas-month-filter"><span className="sr-only">筛选演出月份</span><select aria-label="筛选演出月份" value={month} onChange={e=>changeMonth(e.target.value)}><option value="">全部月份</option>{month&&!months.includes(month)&&<option value={month}>{month.replace('-','年')}月</option>}{months.map(value=><option key={value} value={value}>{value.replace('-','年')}月</option>)}</select></label>{user&&!interests.needsLogin?<button type="button" className="atlas-interest-filter" aria-pressed={mine} onClick={changeScope}><Heart size={14} weight={mine?'fill':'regular'}/>我关心</button>:<Link className="atlas-interest-filter" to={`/account?next=${encodeURIComponent('/footprints?'+new URLSearchParams(filters({...(artist?{artist:artist.id}:{}),scope:'mine'})))}`}><Heart size={14}/>我关心</Link>}</div>;}
  return <section className={`atlas-page atlas-${scene} ${city&&scene==='map'?'is-venue-map':''}`} data-scene={scene}>
    <div className="atlas-scene">
      <AtlasMap cities={cities} events={visibleEvents} today={today} selectedCity={city} artistSelected={!!artist} wantedEventIds={interests.value?.wish_event_ids??[]} onCity={chooseCity} onVenue={mapVenue} onNation={()=>{setParams(filters(artist?{artist:artist.id}:{}));setExpanded(false);}} scene={scene} venueEvent={stageEvent} controller={sceneController}/>
      <CinematicStage scene={scene} controller={sceneController} event={stageEvent} venueName={venue?.name} city={city?.name} artistName={catalog.artists.find(item=>item.id===stageEvent?.artist_id)?.name} selected={selectedSong} playing={player.state.phase==='playing'?player.state.song?.title:undefined} onSong={playSong} onEnter={()=>{if(stageEvent)openEvent(stageEvent);}}/>
    </div>
    {scene==='map'?<header className="atlas-searchbar">
      <div className="atlas-wordmark"><div><span>足迹</span><small>跟着歌声，去远方。</small></div><Link to="/playlists" aria-label="我的现场歌单"><BookmarkSimple size={23} weight="light"/></Link></div>
      <div className="atlas-search-input"><MagnifyingGlass size={23} weight="light"/><input aria-label="搜索歌手或城市" placeholder="搜索喜欢的歌手或城市" value={query} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setSearchOpen(true);}} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);if(event.key==='Enter'&&matchingArtists.length===1)chooseArtist(matchingArtists[0].id);}}/>{(query||searchOpen)&&<button type="button" aria-label="收起搜索" onClick={()=>{setSearchOpen(false);setQuery('');}}><X size={20}/></button>}</div>
      {searchOpen?<div className="atlas-search-results"><span>{query?'搜索结果':'从一位喜欢的歌手开始'}</span>{matchingArtists.map(item=><button key={item.id} type="button" onClick={()=>chooseArtist(item.id)}>{item.name}<small>查看行程 <CaretRight size={16}/></small></button>)}{matchingCities.map(item=><button key={item.id} type="button" onClick={()=>chooseCity(item)}>{item.name}<small>看看这里的现场 <CaretRight size={16}/></small></button>)}{!matchingArtists.length&&!matchingCities.length&&<p>暂未收录这位歌手，试试邓紫棋或刘雨昕。</p>}</div>:<div className="atlas-artist-pills"><button type="button" aria-pressed={!artist} onClick={()=>chooseArtist('')}>全部</button>{(artist?[artist,...catalog.artists.filter(item=>item.id!==artist.id).slice(0,1)]:catalog.artists.slice(0,2)).map(item=><button key={item.id} type="button" aria-pressed={artist?.id===item.id} onClick={()=>chooseArtist(item.id)}>{item.name}</button>)}{artist&&<FollowArtist artist={artist} next={next} data={interests}/>}</div>}
      <InterestsError data={interests}/>
    </header>:<header className="atlas-scene-toolbar"><button type="button" onClick={back} aria-label="返回上一页"><ArrowLeft size={25} weight="light"/></button><span>{scene==='venue'?city?.name:''}</span><button type="button" onClick={()=>{setParams(filters(artist?{artist:artist.id}:{}));setStories(false);setExpanded(false);}} aria-label="返回全国地图"><MapPinArea size={24} weight="light"/></button></header>}
    {scene==='map'&&<div className="atlas-legend" aria-label="行程图例"><span><i className="past"/>往期</span><span><i className="future"/>今日 / 待演</span></div>}
    {invalidEvent&&<div className="atlas-invalid" role="status">这个场次暂未收录，请从地图重新选择。</div>}
    {scene==='map'&&city?<section ref={mapPanel} className="atlas-panel atlas-city-sheet">
      <header><div><small>点亮场馆，靠近这一晚</small><h2>{city.name}</h2></div><button type="button" onClick={back} aria-label="返回上一页">×</button></header>
      {scheduleFilters()}
      {venues.length?venues.map(item=><button className="atlas-venue-row" type="button" key={item.id} aria-label={`进入${item.name}`} onClick={()=>openVenue(item)}>
        {venuePhotograph(item.name,artist?.id)?<img className="atlas-venue-photo" src={venuePhotograph(item.name,artist?.id)!.url} alt={`${venuePhotograph(item.name,artist?.id)!.description} · 2026.09.26 实拍参考`}/>:<MapPin className="atlas-venue-icon" size={25} weight="light" aria-hidden="true"/>}<span><strong>{item.name}</strong><small>{item.events.length} 场已收录 · {item.events.some(event=>['upcoming','today'].includes(eventPhase(event,today)))?'有今日 / 待演场次':item.events.every(event=>event.event_status==='cancelled')?'场次已取消':'往期现场'}</small></span><CaretRight size={20} aria-hidden="true"/>
      </button>):<div className="atlas-empty-city"><p>{artist?`当前筛选下，${artist.name}在这里暂无已核实场次。`:'当前筛选下，这里暂无已核实场次。'}</p><a href="https://zwfw.mct.gov.cn/wycx/qgswyyxychd/" target="_blank" rel="noopener noreferrer">前往官方演出查询 ↗</a>{artist&&<button type="button" onClick={()=>setParams({city:city.id},{replace:true})}>看看这座城的其他现场</button>}</div>}
      <PhotoCredit url={venues.map(item=>venuePhotograph(item.name,artist?.id)).find(Boolean)?.url}/>
    </section>:scene==='map'&&!searchOpen?<section ref={mapPanel} className={`atlas-panel atlas-itinerary ${expanded?'is-expanded':''}`} aria-label="近期行程">
      <header><h2>{recentHeading}</h2><button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'更多'} <CaretDown size={16}/></button></header>
      {scheduleFilters()}
      <div className="atlas-schedule-list">{(expanded?recent:recent.slice(0,1)).map(event=><article className="atlas-schedule-item" key={event.id}><button className="atlas-schedule-row" type="button" onClick={()=>approach(event)}><time data-old-year={!event.date.startsWith(today.slice(0,4))}>{event.date.startsWith(today.slice(0,4))?event.date.slice(5).replace('-','.'):dateLabel(event.date)}</time><span><strong>{expanded?event.city+' · ':''}{catalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.venue}</small></span><em className={eventPhase(event,today)}>{phaseLabel(event,today)}</em></button><div className="atlas-schedule-details"><ScheduleFacts event={event} catalog={catalog}/><WishEvent event={event} today={today} next={next} data={interests}/></div></article>)}</div>
      {!recent.length&&<div className="atlas-schedule-empty"><p>{mine&&interests.error?'暂时没有读到你关心的现场，请重试。':mine&&!interests.value?'正在读取你关心的现场…':mine&&!interests.value?.artist_ids.length&&!interests.value?.wish_event_ids.length?'关注一位歌手，或标记一场想去的演出。':period==='upcoming'?'当前筛选暂无待演场次。':'当前筛选暂无往期场次。'}</p>{period==='upcoming'&&selectSchedule(interestedEvents,'past','',today).length>0&&<button type="button" onClick={()=>changePeriod('past')}>看看往期现场 <ArrowRight size={14}/></button>}{(month||mine)&&<button type="button" onClick={()=>setParams(filters({...((artist)?{artist:artist.id}:{}),month:'',scope:''}),{replace:true})}>清除筛选</button>}</div>}{!expanded&&recent[0]&&recent[0].event_status!=='cancelled'&&<button className="atlas-primary-action map-primary-action" type="button" onClick={()=>approach(recent[0])}>靠近这场现场 <ArrowRight size={20}/></button>}
      {expanded&&<p className="atlas-catalog-coverage">当前筛选 {recent.length} 场 · 部分场次目录</p>}
    </section>:null}
    {scene==='venue'&&venue&&stageEvent&&<section ref={mapPanel} className="atlas-panel atlas-show-sheet">
      <header><h2>最近的现场</h2>{venueEvents.length>1&&<button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'全部场次'} <CaretDown size={16}/></button>}</header>
      <div className="atlas-schedule-list">{(expanded?venueEvents:[stageEvent]).map(event=><article className="atlas-schedule-item" key={event.id}><button className="atlas-schedule-row" type="button" disabled={event.event_status==='cancelled'} aria-label={`${dateLabel(event.date)} ${catalog.artists.find(item=>item.id===event.artist_id)?.name} ${event.title}`} onClick={()=>openEvent(event)}><time><span>{event.date.slice(5).replace('-','.')}</span><small>{event.date.slice(0,4)}{event.time&&` · ${event.time}`}</small></time><span><strong>{catalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.title}</small></span><em className={eventPhase(event,today)}>{phaseLabel(event,today)}</em></button><div className="atlas-schedule-details"><ScheduleFacts event={event} catalog={catalog}/><WishEvent event={event} today={today} next={next} data={interests}/></div></article>)}</div>
      <InterestsError data={interests}/>
      {stageEvent.event_status==='cancelled'?<p className="atlas-cancelled-note">{stageEvent.event_status_note??'这场演出已取消，请留意后续官方公告。'}</p>:<button className="atlas-primary-action" type="button" onClick={()=>openEvent(stageEvent)}>走进这一晚 <ArrowRight size={20}/></button>}
    </section>}
    {scene==='sky'&&linkedEvent&&<section ref={nightPanel} className="atlas-panel atlas-night-panel">
      <header className="atlas-night-event"><h2>{linkedEvent.setlist_kind==='confirmed'?'这一晚的歌单':linkedEvent.setlist_kind==='partial'?'已收录的曲目':'这一晚 · 相关作品'}</h2><button type="button" className="song-list-toggle" aria-expanded={listOpen} onClick={()=>setListOpen(!listOpen)}>{linkedEvent.songs.length} 首 <CaretDown size={18}/></button></header>
      {linkedEvent.setlist_kind==='artist_collection'&&<p className="atlas-setlist-note">现场歌单尚未确认</p>}
      <ConcertPlayer player={player}/>
      {listOpen&&<SongList songs={linkedEvent.songs} selected={selectedSong?.title} playing={player.state.phase==='playing'?player.state.song?.title:undefined} onSong={index=>playSong(linkedEvent.songs[index])}/>}
      {!linkedEvent.songs.length&&<p className="atlas-no-songs">曲目尚未收录。</p>}
      <CollectConcert key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} next={next}/>
      <div className="atlas-night-personal"><WishEvent event={linkedEvent} today={today} next={next} data={interests}/><ScheduleFacts event={linkedEvent} catalog={catalog}/></div><InterestsError data={interests}/>
      <div className="atlas-night-actions"><Link to={`/?event=${encodeURIComponent(linkedEvent.id)}`}>记下这一晚</Link><details><summary>同场记录</summary><div className="atlas-extra-actions"><Attendance key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} today={today} next={next}/><button ref={storyTrigger} type="button" onClick={()=>setStories(true)}>同场故事</button></div></details></div>
    </section>}
    {stories&&linkedEvent&&<section className="atlas-story-drawer" role="region" aria-label="这场的公开故事"><header><h2>同一晚，我们都在歌里</h2><button ref={storyClose} type="button" onClick={()=>setStories(false)} aria-label="收起同场故事">×</button></header><PublicStoryList path={`/api/stories?event_id=${encodeURIComponent(linkedEvent.id)}`} heading="愿意分享的回声"/></section>}
  </section>;
}
