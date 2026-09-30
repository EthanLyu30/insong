import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import { useSession } from './SessionContext';
import { useData } from './useData';
import { PublicStoryList } from './PublicPages';
import { AtlasMap } from './AtlasMap';
import { StadiumArt, SongSky } from './AtlasScenes';
import { chinaToday, dateLabel, eventPhase, filterArtists, groupVenues, qqMusicUrl, songLink, type AtlasCatalog, type AtlasCity, type AtlasEvent, type AtlasSong, type AtlasVenue } from './footprintAtlas';
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

function VenueScene({venue}:{venue:AtlasVenue}) {
  return <div className="atlas-venue-landscape"><div className="atlas-venue-heading"><span>{venue.city} · 场馆近景</span><h1>{venue.name}</h1></div><div className="atlas-day-cloud cloud-one" aria-hidden="true"/><div className="atlas-day-cloud cloud-two" aria-hidden="true"/><StadiumArt/></div>;
}

export function FootprintsPage() {
  const {user}=useSession();const [params,setParams]=useSearchParams();const [retry,setRetry]=useState(0);const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog',retry);
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
  const today=chinaToday();
  const recent=[...events].sort((a,b)=>{
    const ap=eventPhase(a,today)!=='past',bp=eventPhase(b,today)!=='past';return ap!==bp?ap?-1:1:ap?a.date.localeCompare(b.date):b.date.localeCompare(a.date);
  });
  const upcoming=events.filter(event=>eventPhase(event,today)!=='past');
  useEffect(()=>{setSelectedSong(null);setStories(false);},[linkedEvent?.id]);
  function chooseArtist(id:string){setParams(id?{artist:id}:{},{replace:true});setQuery('');setSearchOpen(false);setExpanded(false);}
  function chooseCity(value:AtlasCity){setParams({...(artist?{artist:artist.id}:{}),city:value.id},{replace:true});setSearchOpen(false);setQuery('');}
  function openVenue(value:AtlasVenue){setParams({...(artist?{artist:artist.id}:{}),city:city!.id,venue:value.id,scene:'venue'});}
  function openEvent(value:AtlasEvent){const matchingCity=cities.find(item=>item.name===value.city);setParams({...(artist?{artist:artist.id}:{}),...(matchingCity?{city:matchingCity.id}:{}),venue:`${value.city}:${value.venue}`,event:value.id,scene:'sky'});setExpanded(false);setSearchOpen(false);}
  function back(){
    setStories(false);
    if(scene==='sky'&&venue){setParams({...(artist?{artist:artist.id}:{}),city:city!.id,venue:venue.id,scene:'venue'});}
    else{setParams(artist?{artist:artist.id}:{});setExpanded(false);}
  }
  if(!catalog)return <section className="atlas-page atlas-loading"><span className="atlas-loading-orbit" aria-hidden="true">✧</span>{error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(value=>value+1)}>重新展开地图</button></div>:<p role="status">正在展开山河与歌声…</p>}<Link to="/">返回听见</Link></section>;
  const next=`/footprints?${params}`;
  const matchingArtists=filterArtists(catalog.artists,query);
  const matchingCities=query.trim()?cities.filter(item=>item.name.includes(query.trim())).slice(0,6):[];
  const invalidEvent=params.get('event')&&!linkedEvent;
  return <section className={`atlas-page atlas-${scene}`} data-scene={scene}>
    <div className="atlas-scene" key={scene}>
      {scene==='map'?<><div className="atlas-sea-grain" aria-hidden="true"/><AtlasMap cities={cities} events={events} today={today} selectedCity={city} artistSelected={!!artist} onCity={chooseCity}/><div className="atlas-cloud atlas-cloud-one" aria-hidden="true"/><div className="atlas-cloud atlas-cloud-two" aria-hidden="true"/></>:scene==='venue'&&venue?<VenueScene venue={venue}/>:linkedEvent?<SongSky event={linkedEvent} selected={selectedSong} onSong={setSelectedSong}/>:null}
    </div>
    {scene==='map'?<header className="atlas-searchbar"><div className="atlas-wordmark"><span>足迹</span><small>让歌声，落在山河里。</small><Link to="/memories" aria-label="我的记忆">♧</Link></div><div className="atlas-search-input"><span aria-hidden="true">⌕</span><input aria-label="搜索歌手或城市" placeholder="想跟着谁的歌声出发？" value={query} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setSearchOpen(true);}} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);if(event.key==='Enter'&&matchingArtists.length===1)chooseArtist(matchingArtists[0].id);}}/>{(query||searchOpen)&&<button type="button" aria-label="收起搜索" onClick={()=>{setSearchOpen(false);setQuery('');}}>×</button>}</div>{searchOpen?<div className="atlas-search-results"><span>{query?'搜索结果':'从一位喜欢的歌手开始'}</span>{matchingArtists.map(item=><button key={item.id} type="button" onClick={()=>chooseArtist(item.id)}><i style={{background:item.color}}/>{item.name}<small>查看行程 ↗</small></button>)}{matchingCities.map(item=><button key={item.id} type="button" onClick={()=>chooseCity(item)}>⌖ {item.name}<small>看看这里的现场 ↗</small></button>)}{!matchingArtists.length&&!matchingCities.length&&<p>暂未收录这位歌手，试试邓紫棋或刘雨昕。</p>}</div>:<div className="atlas-artist-pills"><button type="button" aria-pressed={!artist} onClick={()=>chooseArtist('')}>全部现场</button>{(artist?[artist,...catalog.artists.filter(item=>item.id!==artist.id).slice(0,2)]:catalog.artists.slice(0,3)).map(item=><button key={item.id} type="button" aria-pressed={artist?.id===item.id} onClick={()=>chooseArtist(item.id)}>{item.name}</button>)}</div>}</header>:<header className="atlas-scene-toolbar"><button type="button" onClick={back} aria-label={scene==='sky'?'返回场馆':'返回全国'}>← <span>{scene==='sky'?'返回场馆':'返回全国'}</span></button><span>{scene==='sky'?'星空歌单':city?.name}</span><button type="button" onClick={()=>{setParams(artist?{artist:artist.id}:{});setStories(false);}} aria-label="返回全国地图">⌖</button></header>}
    {scene==='map'&&!city&&!searchOpen&&<div className="atlas-map-caption"><h1>{artist?`${artist.name}的巡演足迹`:'下一次奔赴，在哪里？'}</h1><p>{artist?`${new Set(events.map(event=>event.city)).size} 座城市 · ${upcoming.length} 场今日或待演`:'拖动山河，点亮一座有歌声的城'}</p></div>}
    {scene==='map'&&<div className="atlas-legend" aria-label="行程图例"><span><i className="past"/>往期</span><span><i className="future"/>今日 / 待演</span><span>双指缩放</span></div>}
    {invalidEvent&&<div className="atlas-invalid" role="status">这个场次暂未收录，请从地图重新选择。</div>}
    {scene==='map'&&city?<section className="atlas-panel atlas-city-sheet"><header><div><small>歌声停靠的城市</small><h2>{city.name}</h2></div><button type="button" onClick={back} aria-label="返回全国">×</button></header>{venues.length?venues.map(item=><button className="atlas-venue-row" type="button" key={item.id} aria-label={`进入${item.name}`} onClick={()=>openVenue(item)}><span className="atlas-venue-icon" aria-hidden="true">⌑</span><span><strong>{item.name}</strong><small>{item.events.length} 场已收录 · {item.events.some(event=>eventPhase(event,today)!=='past')?'有今日 / 待演场次':'往期现场'}</small></span><b aria-hidden="true">↗</b></button>):<div className="atlas-empty-city"><p>{artist?`${artist.name}在这里暂无已核实场次。`:'这里暂无已核实的近期场次。'}</p><a href="https://zwfw.mct.gov.cn/wycx/qgswyyxychd/" target="_blank" rel="noopener noreferrer">前往官方演出查询 ↗</a>{artist&&<button type="button" onClick={()=>setParams({city:city.id},{replace:true})}>看看这座城的其他现场</button>}</div>}</section>:scene==='map'&&!searchOpen?<section className={`atlas-panel atlas-itinerary ${expanded?'is-expanded':''}`} aria-label="近期行程"><header><div><small>{artist?'跟着TA去现场':'最近有歌声的地方'}</small><h2>{artist?.name??'演出日程'}</h2></div><button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'更多'} ↗</button></header><div className="atlas-schedule-list">{(expanded?recent:recent.slice(0,1)).map(event=><button type="button" key={event.id} onClick={()=>{const value=cities.find(item=>item.name===event.city);if(value){setParams({...(artist?{artist:artist.id}:{}),city:value.id,venue:`${event.city}:${event.venue}`,scene:'venue'});setExpanded(false);}}}><time data-old-year={!event.date.startsWith(today.slice(0,4))}>{event.date.startsWith(today.slice(0,4))?event.date.slice(5).replace('-','.'):dateLabel(event.date)}</time><span><strong>{event.city} · {catalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.venue}</small></span><em className={eventPhase(event,today)}>{eventPhase(event,today)==='upcoming'?'待演':eventPhase(event,today)==='today'?'今天':'往期'}</em></button>)}</div>{!recent.length&&<p>暂未收录这位歌手的演出日程。</p>}<footer><span>核对 {catalog.verified_on} · 部分场次</span><a href="https://geo.datav.aliyun.com/" target="_blank" rel="noopener noreferrer">地图 DataV</a></footer></section>:null}
    {scene==='venue'&&venue&&<section className="atlas-panel atlas-show-sheet"><header><div><small>从一个场馆，走进一片星空</small><h2>选一晚，抬头看看。</h2></div><span>{venue.events.length} 场</span></header><div className="atlas-schedule-list">{[...venue.events].sort((a,b)=>{const af=eventPhase(a,today)!=='past',bf=eventPhase(b,today)!=='past';return af!==bf?af?-1:1:af?a.date.localeCompare(b.date):b.date.localeCompare(a.date);}).map(event=><button type="button" key={event.id} onClick={()=>openEvent(event)}><time>{dateLabel(event.date)}{event.time&&<small>{event.time}</small>}</time><span><strong>{catalog.artists.find(item=>item.id===event.artist_id)?.name}</strong><small>{event.title}</small></span><em className={eventPhase(event,today)}>{eventPhase(event,today)==='upcoming'?'待演':eventPhase(event,today)==='today'?'今天':'往期'} ✦</em></button>)}</div></section>}
    {scene==='sky'&&linkedEvent&&<section className="atlas-panel atlas-night-panel"><div className="atlas-night-song">{selectedSong?<><span aria-hidden="true">✦</span><div><h2>{selectedSong.title}</h2><small>{selectedSong.artist}</small></div><a data-qq-song href={songLink(selectedSong)} target="_blank" rel="noopener noreferrer">QQ 音乐{selectedSong.link_kind==='song'?'试听':'搜索'} ↗</a></>:<><span aria-hidden="true">✧</span><p>点一颗星，听一首歌。</p><a href={qqMusicUrl('演唱会 歌单',catalog.artists.find(item=>item.id===linkedEvent.artist_id)?.name??'')} target="_blank" rel="noopener noreferrer">QQ 音乐找歌单 ↗</a></>}</div><div className="atlas-night-event"><strong>{linkedEvent.title}</strong><small>{linkedEvent.venue}{linkedEvent.time&&` · ${linkedEvent.time}`}</small></div><div className="atlas-night-actions"><Attendance key={`${user?.id??'guest'}:${linkedEvent.id}`} event={linkedEvent} today={today} next={next}/><Link to={`/?event=${encodeURIComponent(linkedEvent.id)}`}>✎ 记下这一晚</Link><button ref={storyTrigger} type="button" onClick={()=>setStories(true)}>同场故事</button></div><details className="atlas-event-source"><summary>场次与曲目资料</summary><a href={linkedEvent.source_url} target="_blank" rel="noopener noreferrer">{linkedEvent.source_title} ↗</a><p>{linkedEvent.source_kind==='report'?'演后记录。':'公告日程，以主办方最新安排为准。'} {linkedEvent.setlist_note??'本场歌单待核实。'}</p><span>核对：{catalog.verified_on}</span></details></section>}
    {stories&&linkedEvent&&<section className="atlas-story-drawer" role="region" aria-label="这场的公开故事"><header><h2>同一晚，我们都在歌里</h2><button ref={storyClose} type="button" onClick={()=>setStories(false)} aria-label="收起同场故事">×</button></header><PublicStoryList path={`/api/stories?event_id=${encodeURIComponent(linkedEvent.id)}`} heading="愿意分享的回声"/></section>}
  </section>;
}
