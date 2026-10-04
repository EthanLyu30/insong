import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiBaseUrl, type Song } from './api';
import { AudioPlayer } from './AudioPlayer';
import { apiRequest, dayLabel, formatPosition, parsePosition, timelineGroups, type Memory, type Photo } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';
import { useData } from './useData';
import { LyricPicker } from './LyricPicker';
import { PublicStoryList, TagLinks } from './PublicPages';
import { PublicationPanel } from './PublicationPanel';
import { PhotoGallery, GalleryPicker } from './PhotoGallery';
import { cardCover, cardPhotos, parseTags, songCover } from './cardMedia';
import { Plus, X, MagnifyingGlass, MapPin, CalendarBlank, LockSimple, CaretRight, Hash, At } from '@phosphor-icons/react';
import { QuickReflection } from './QuickReflection';
import { EventNote } from './EventNote';
import {BackLink,useBackNavigation} from './Navigation';
import {MemoryActions} from './MemoryActions';
import {ChoicePicker} from './ChoicePicker';
import {SongPicker} from './SongPicker';
import './composer.css';
import {filterMemories,memoryCategory,memoryCity} from './memoryPresentation';

export function LoginGate() {
  const location = useLocation();
  return <section className="journal-page empty-journal"><span className="journal-eyebrow">我的音乐记忆</span><h1>留给自己的，<br/>慢慢听。</h1><p>登录后，一句心事、一段旋律，都会好好留在你的空间里。</p><Link className="primary-button" to={`/account?next=${encodeURIComponent(location.pathname + location.search)}`}>打开我的私人空间</Link><Link className="text-button" to="/?choose=1">先选一首歌</Link></section>;
}

function SampleNotice({compact=false}:{compact?:boolean}) {
  const { user } = useSession();
  return user?.is_demo ? <aside className={`sample-notice${compact?' is-compact':''}`}>{compact?'共享样例 · 请只填写虚构内容':'你正在使用共享样例账号，请只填写虚构内容。'}<Link to="/account">创建个人账号 →</Link></aside> : null;
}

function LoadingError({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <div className="status-card error-card" role="alert">{error}{retry && <button onClick={retry}>重新加载</button>}<BackLink fallback="/memories"/></div> : <div className="status-card" role="status">正在翻开这一页…</div>;
}

function SongHeading({ song }: { song: Song }) {
  return <div className="record-heading"><img src={songCover(song)} alt=""/><div><span className="journal-eyebrow">这一刻的配乐</span><h2>{song.title}</h2><small>{song.artist}</small></div></div>;
}

export function SongPage() {
  const { songId } = useParams();
  const location = useLocation();
  const [params,setParams] = useSearchParams();
  const view=params.get('view')==='mine'?'mine':'stories';
  function selectView(value:'stories'|'mine') {
    const next=new URLSearchParams(params);
    if(value==='mine')next.set('view',value);else next.delete('view');
    setParams(next,{replace:true});
  }
  const [retry, setRetry] = useState(0);
  const { value: song, error } = useData<Song>(`/api/songs/${songId}`, retry);
  const requestedPosition=Number(params.get('at'));
  const position=params.has('at')&&Number.isFinite(requestedPosition)&&requestedPosition>=0?requestedPosition:null;
  const lyricId=params.get('lyric');
  function mark(ms:number,id:string|null=null){const next=new URLSearchParams(params);next.set('at',String(ms));if(id)next.set('lyric',id);else next.delete('lyric');if(next.has('end')&&Number(next.get('end'))<=ms)next.delete('end');setParams(next,{replace:true});}
  const { user } = useSession();
  if (!song) return <LoadingError error={error} retry={() => setRetry(x => x + 1)} />;
  const safePosition=position!==null&&position<(song.duration_ms??0)?position:null;
  const requestedEnd=Number(params.get('end'));
  const safeEnd=params.has('end')&&Number.isFinite(requestedEnd)&&safePosition!==null&&requestedEnd>safePosition&&requestedEnd<=(song.duration_ms??0)?requestedEnd:null;
  const capture = new URLSearchParams(); for(const key of ['theme','event'])if(params.get(key))capture.set(key,params.get(key)!);if(safePosition!==null)capture.set('at',String(safePosition));if(safeEnd!==null)capture.set('end',String(safeEnd));if(lyricId)capture.set('lyric',lyricId);
  return <section className="journal-page song-journal listening-page">
    <BackLink/>
    {params.get('event')&&<EventNote id={params.get('event')!}/>}
    <div className="song-artwork"><img src={songCover(song)} alt={`《${song.title}》配图`}/></div>
    <div className="song-journal-title"><h1>{song.title}</h1><p>{song.artist}</p></div>
    <AudioPlayer song={song} full anchor={safePosition} end={safeEnd} onMark={ms=>mark(ms)}/>
    {safePosition !== null && <p className="anchor-notice" role="status">已选中 {formatPosition(safePosition)}，这段音乐会和文字一起保存。</p>}
    <LyricPicker song={song} selected={lyricId} onSelect={(id,ms)=>mark(ms,id)}/>
    <div className="song-reading-header">
      <div className="song-reading-tabs" role="tablist" aria-label="歌曲里的故事" onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const next=event.key==='Home'?'stories':event.key==='End'?'mine':view==='mine'?'stories':'mine';
        selectView(next);document.getElementById(`song-tab-${next}`)?.focus();
      }}>
        <button id="song-tab-stories" type="button" role="tab" data-view="stories" aria-controls="song-reading-panel" aria-selected={view==='stories'} tabIndex={view==='stories'?0:-1} onClick={()=>selectView('stories')}>听友故事</button>
        <button id="song-tab-mine" type="button" role="tab" data-view="mine" aria-controls="song-reading-panel" aria-selected={view==='mine'} tabIndex={view==='mine'?0:-1} onClick={()=>selectView('mine')}>我的记忆</button>
      </div>
      <Link className="song-write-entry" to={`/songs/${song.id}/write${capture.size?`?${capture}`:''}`}><Plus size={17} aria-hidden="true"/>写记忆</Link>
    </div>
    <div id="song-reading-panel" className="song-reading-panel" role="tabpanel" aria-labelledby={`song-tab-${view}`}>
      {view==='stories'?<PublicStoryList path={`/api/stories?song_id=${song.id}${lyricId?`&lyric_id=${encodeURIComponent(lyricId)}`:''}`} heading={null}/>:user?<SongMemories songId={song.id}/>:<div className="empty-paper"><h3>登录，查看我的记忆</h3><Link className="soft-button" to={`/account?next=${encodeURIComponent(location.pathname+location.search)}`}>登录</Link></div>}
    </div>
  </section>;
}

function SongMemories({ songId }: { songId: number }) {
  const { value, error } = useData<Memory[]>(`/api/memories?song_id=${songId}`);
  return <section className="song-memory-section">{error ? <p role="alert">{error}</p> : !value ? <p role="status">正在翻找…</p> : value.length ? <>{value.map(card => <MemoryEntry key={card.id} memory={card}/>)}</> : <p className="page-intro">还没有为这首歌留下记忆。</p>}</section>;
}

function MemoryEntry({ memory, evidence, matchLabel, collection=false }: { memory: Memory; evidence?: string; matchLabel?: string; collection?:boolean }) {
  const date=[memory.life_year,memory.life_time].filter(Boolean).join(' · ');
  return <Link className={`memory-entry memory-snapshot${collection?' collection-card':''}`} to={`/memories/${memory.id}`}>
    {(date||!collection)&&<span className="snapshot-date">{date||`记录于 ${dayLabel(memory.created_at)}`}</span>}
    <div className="snapshot-image"><img src={cardCover(memory)} alt={memory.photo_url?'记忆里的照片':'歌曲配图'} loading="lazy"/>{cardPhotos(memory).length>1&&<span className="photo-count">{cardPhotos(memory).length} 张</span>}</div>
    <div className="snapshot-copy">{matchLabel&&<span className="match-label">{matchLabel}</span>}{memory.title&&<h3>{memory.title}</h3>}{!collection&&<p>{evidence||memory.story}</p>}<strong>{memory.song.title}</strong><small>{memory.song.artist}</small><span className="snapshot-status">{collection?[memoryCategory(memory),memoryCity(memory)].filter(Boolean).join(' · '):`${memory.is_demo_sample?'虚构样例 · ':''}${memory.publication?.published?'已公开':'仅自己'}`}</span></div>
  </Link>;
}

export function MemoryCollection() {
  const { user } = useSession();
  return user ? <CollectionContent/> : <LoginGate/>;
}

function CollectionContent() {
  const [retry,setRetry]=useState(0);
  const {value:memories,error}=useData<Memory[]>('/api/memories',retry);
  const [params,setParams]=useSearchParams();
  const [searchOpen,setSearchOpen]=useState(false);
  const [query,setQuery]=useState('');
  const songId=params.get('song')??'',tag=params.get('tag')??'',untagged=!tag&&params.get('withoutTags')==='1';
  const category=params.get('category')??'',city=params.get('city')??'';
  const view=params.get('view')==='cards'?'cards':'timeline';
  const experience=tag?`tag:${tag}`:untagged?'untagged':'';
  function setExperience(value:string){
    const next=new URLSearchParams(params);
    next.delete('song');next.delete('tag');next.delete('withoutTags');
    if(value.startsWith('tag:'))next.set('tag',value.slice(4));
    else if(value==='untagged')next.set('withoutTags','1');
    setParams(next,{replace:true});
  }
  function clearSong(){const next=new URLSearchParams(params);next.delete('song');setParams(next,{replace:true});}
  function clearAll(){const next=new URLSearchParams(params);for(const key of ['song','tag','withoutTags','category','city'])next.delete(key);setParams(next,{replace:true});setQuery('');}
  function setView(value:string){const next=new URLSearchParams(params);if(value==='cards')next.set('view',value);else next.delete('view');setParams(next,{replace:true});}
  function setFilter(key:'category'|'city',value:string){const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);if(key==='category')next.delete('city');setParams(next,{replace:true});}
  // The user's explicit tags organize experiences; never infer a category from prose or music.
  const tags=[...new Set((memories??[]).flatMap(card=>card.tags))];
  if(tag&&!tags.includes(tag))tags.push(tag);
  const options=[{value:'',label:'全部经历'},...tags.map(tag=>({value:`tag:${tag}`,label:tag})),
    ...(untagged||memories?.some(card=>!card.tags.length)?[{value:'untagged',label:'未加标签'}]:[])];
  const base=memories?.filter(card=>(!songId||card.song_id===Number(songId))&&(!tag||card.tags.includes(tag))&&(!untagged||!card.tags.length))??[];
  const visible=filterMemories(base,{category,city,query});
  const cityOptions=[...new Set(filterMemories(base,{category}).map(memoryCity).filter(Boolean))];
  const filtered=Boolean(songId||experience||category||city||query);
  const songTitle=memories?.find(card=>card.song_id===Number(songId))?.song.title??'指定歌曲';
  return <section className="journal-page collection-page">
    <div className="journal-title-row collection-title"><div><h1>我的记忆</h1></div><Link className="collection-new" to="/create"><Plus size={16}/>新建记忆</Link></div>
    <button type="button" className="collection-search-trigger" onClick={()=>setSearchOpen(true)}><MagnifyingGlass size={18}/><span>{query||'搜索记忆、歌曲或歌手'}</span></button>
    <SampleNotice compact/>
    <div className="collection-categories" role="group" aria-label="记忆分类">{['全部记忆','音乐现场','旅行','日常'].map(label=><button key={label} type="button" aria-pressed={category===(label==='全部记忆'?'':label)} onClick={()=>setFilter('category',label==='全部记忆'?'':label)}>{label}</button>)}</div>
    <div className="collection-tools"><Link className="memory-playlist-link" to="/playlists">我的现场歌单 ↗</Link><div className="memory-filter"><ChoicePicker label="按城市筛选" value={city} onChange={value=>setFilter('city',value)} options={[{value:'',label:'全部城市'},...cityOptions.map(value=>({value,label:value}))]} disabled={!memories}/></div></div>
    <details className="collection-tag-filter"><summary>按标签筛选</summary><ChoicePicker label="按经历标签筛选" value={experience} onChange={setExperience} options={options} disabled={!memories}/></details>
    {songId&&<button type="button" className="collection-song-context" aria-label="清除歌曲筛选" onClick={clearSong}><span>配乐：{songTitle}</span><X size={14} aria-hidden="true"/></button>}
    {!memories?<LoadingError error={error} retry={()=>setRetry(value=>value+1)}/>:<section><div className="segmented-control timeline-toggle"><button aria-pressed={view==='timeline'} onClick={()=>setView('timeline')}>时间轴</button><button aria-pressed={view==='cards'} onClick={()=>setView('cards')}>所有卡片</button></div>{visible.length?view==='timeline'?<div className="memory-timeline">{timelineGroups(visible).map(group=><section className="timeline-year" key={group.year??'unknown'}><h3>{group.year??'未标年份'}<span>{group.cards.length} 个时刻</span></h3><div>{group.cards.map(card=><MemoryEntry key={card.id} memory={card} collection/>)}</div></section>)}</div>:<div className="collection-card-grid">{visible.map(card=><MemoryEntry key={card.id} memory={card} collection/>)}</div>:<div className="empty-paper">{filtered?<><h3>没有符合筛选的记忆</h3><button type="button" className="soft-button" onClick={clearAll}>查看全部记忆</button></>:<><h3>你的第一页，留给哪个瞬间？</h3><Link className="soft-button" to="/create">记录第一刻</Link></>}</div>}</section>}
    {searchOpen&&<div className="collection-search-overlay" role="dialog" aria-modal="true" aria-label="搜索我的记忆"><div className="collection-search-panel"><label><MagnifyingGlass size={19}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索记忆、歌曲或歌手"/></label><button type="button" onClick={()=>setSearchOpen(false)}>完成</button></div><div className="collection-search-preview">{visible.length} 条结果 · 点“完成”后在当前页面查看</div><button type="button" className="collection-search-backdrop" aria-label="关闭搜索" onClick={()=>setSearchOpen(false)}/></div>}
  </section>;
}
export function CreateMemoryPage() {
  const { user } = useSession();
  return user ? <CreateContent/> : <LoginGate/>;
}

function CreateContent() {
  const { songId } = useParams();const [params] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const { value: song, error } = useData<Song>(`/api/songs/${songId}`, retry);
  if (!song) return <LoadingError error={error} retry={() => setRetry(x => x + 1)}/>;
  const at = params.has('at') ? Number(params.get('at')) : null;
  return <MemoryForm key={song.id} song={song} initialEvent={params.get('event')} initialLyric={params.get('lyric')} initialTheme={params.get('theme')} initialEnd={params.get('end')} initialPosition={at !== null && Number.isFinite(at) && at >= 0 && at < (song.duration_ms ?? 0) ? at : null}/>;
}

export function MemoryForm({ song:initialSong=null, existing, initialPosition = null, initialLyric = null, initialTheme = null, initialEvent = null, initialEnd = null }: { song?: Song|null; existing?: Memory; initialPosition?: number | null; initialLyric?:string|null;initialTheme?:string|null;initialEvent?:string|null;initialEnd?:string|null }) {
  const [song,setSong]=useState<Song|null>(initialSong);
  const {user}=useSession();
  const navigate = useNavigate();
  const location=useLocation();
  const fallback=existing?`/memories/${existing.id}`:initialSong?`/songs/${initialSong.id}${location.search}`:initialEvent?`/footprints?event=${encodeURIComponent(initialEvent)}&scene=sky`:'/memories';
  const {previous,back}=useBackNavigation(fallback);
  const musicOptions=useRef<HTMLDetailsElement>(null),extraOptions=useRef<HTMLDetailsElement>(null);
  const live = useLivePage();
  const [story, setStory] = useState(existing?.story ?? '');
  const [title,setTitle]=useState(existing?.title??'');
  const [tagText,setTagText]=useState(existing?.tags.join('，')??'');
  const [lifeTime, setLifeTime] = useState(existing?.life_time ?? '');
  const [lifeYear,setLifeYear] = useState(existing?.life_year?.toString() ?? '');
  const [locationName,setLocationName]=useState(existing?.location_name??'');
  const [locationQuery,setLocationQuery]=useState('');
  const [sheet,setSheet]=useState<'place'|'time'|'visibility'|null>(null);
  const [showTagEntry,setShowTagEntry]=useState(false);
  const [draftSaved,setDraftSaved]=useState(false);
  const storyInput=useRef<HTMLTextAreaElement>(null);
  const [markedDate,setMarkedDate]=useState(/^\d{4}-\d{2}-\d{2}/.exec(existing?.life_time??'')?.[0]??'');
  const [markedClock,setMarkedClock]=useState(/\b\d{2}:\d{2}\b/.exec(existing?.life_time??'')?.[0]??'');
  const initialLine = initialSong?.lyrics?.find(line=>line.id===(existing?existing.lyric_id:initialLyric));
  const [lyricId,setLyricId] = useState<string|null>(initialLine?.id ?? null);
  const themeId = existing ? existing.theme_id ?? null : initialTheme;
  const [position, setPosition] = useState<number | null>(initialLine?.start_ms ?? (existing ? existing.offset_ms : initialPosition));
  const [timeText, setTimeText] = useState(position === null ? '' : formatPosition(position));
  const [endText,setEndText] = useState(existing?.end_ms!=null?formatPosition(existing.end_ms):initialEnd&&Number.isFinite(Number(initialEnd))?formatPosition(Number(initialEnd)):'');
  const [photos,setPhotos]=useState<Photo[]>(existing?cardPhotos(existing):[]);
  const [cover,setCover]=useState<string|null>(existing?.photo_id??null);
  const [uploading,setUploading]=useState(false);
  const [eventId,setEventId]=useState(existing?existing.event_id??null:initialEvent);
  const [visibility,setVisibility]=useState('private');
  const [anonymous,setAnonymous]=useState(true),[shareLife,setShareLife]=useState(false);
  const [error, setError] = useState('');const [busy, setBusy] = useState(false);
  const lock = useRef(false);const requestKey = useRef(crypto.randomUUID());
  useEffect(()=>{if(!sheet)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setSheet(null);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[sheet]);
  useEffect(()=>{
    if(existing||initialSong||initialEvent||initialTheme||location.pathname!=='/create'||!user)return;
    try {
      const raw=window.localStorage.getItem(`memory-draft:${user.id}`);
      if(!raw)return;
      const draft=JSON.parse(raw);
      if(draft.version!==1)return;
      if(typeof draft.story==='string')setStory(draft.story);
      if(typeof draft.title==='string')setTitle(draft.title);
      if(typeof draft.tagText==='string')setTagText(draft.tagText);
      if(typeof draft.lifeTime==='string')setLifeTime(draft.lifeTime);
      if(typeof draft.lifeYear==='string')setLifeYear(draft.lifeYear);
      if(typeof draft.locationName==='string')setLocationName(draft.locationName);
      if(typeof draft.markedDate==='string')setMarkedDate(draft.markedDate);
      if(typeof draft.markedClock==='string')setMarkedClock(draft.markedClock);
      if(draft.song&&Number.isInteger(draft.song.id))setSong(draft.song);
      if(Array.isArray(draft.photos))setPhotos(draft.photos);
      if(typeof draft.cover==='string'||draft.cover===null)setCover(draft.cover);
      if(typeof draft.position==='number'||draft.position===null)setPosition(draft.position);
      if(typeof draft.timeText==='string')setTimeText(draft.timeText);
      if(typeof draft.endText==='string')setEndText(draft.endText);
      if(typeof draft.lyricId==='string'||draft.lyricId===null)setLyricId(draft.lyricId);
      if(draft.visibility==='public'||draft.visibility==='private')setVisibility(draft.visibility);
      setDraftSaved(true);
    } catch { /* A corrupt local draft must never prevent a new memory. */ }
  },[]);
  function addTag(value:string){const current=parseTags(tagText);if(!current.includes(value)&&current.length<8)setTagText([...current,value].join('，'));}
  function saveDraft(){if(!user)return;window.localStorage.setItem(`memory-draft:${user.id}`,JSON.stringify({version:1,story,title,tagText,lifeTime,lifeYear,locationName,markedDate,markedClock,song,photos,cover,position,timeText,endText,lyricId,visibility}));setDraftSaved(true);}
  function chooseSong(value:Song){
    if(song?.id!==value.id){setSong(value);setPosition(null);setTimeText('');setEndText('');setLyricId(null);}
  }
  async function save(event: FormEvent) {
    event.preventDefault();if (lock.current||uploading) return;
    setError('');
    if(!song){setError('请选择这一刻的配乐。');return;}
    let offset: number | null, end:number|null;
    try {offset = parsePosition(timeText, song.duration_ms ?? 0);end=parsePosition(endText,song.duration_ms??0,true);if(end!==null&&(offset===null||end<=offset))throw new Error('播放区间需要起点，结束时间要晚于起点。');} catch (reason) {if(musicOptions.current)musicOptions.current.open=true;setError((reason as Error).message);return;}
    if (!story.trim()) {setError('写一句想留住的线索吧。');return;}
    const tags=parseTags(tagText);if(tags.length>8||tags.some(tag=>tag.length>24)){if(extraOptions.current)extraOptions.current.open=true;setError('最多添加8个标签，每个不超过24字。');return;}
    lock.current = true;setBusy(true);
    try {
      const body = {story:story.trim(),title:title.trim()||null,tags,photo_ids:photos.map(photo=>photo.id),photo_id:cover,end_ms:end,event_id:eventId,location_name:locationName.trim()||null,life_time:lifeTime.trim() || null,life_year:lifeYear?Number(lifeYear):null,lyric_id:lyricId,theme_id:themeId,life_precision: markedDate?'day':existing && lifeTime === (existing.life_time ?? '') ? existing.life_precision : 'unknown',offset_ms:offset,...(existing ? {revision:existing.revision} : {song_id:song.id,request_key:requestKey.current,...(visibility==='public'?{publication:{confirmed:true,anonymous,share_life_time:shareLife}}:{})})};
      const saved = await apiRequest<Memory>(apiBaseUrl, existing ? `/api/memories/${existing.id}` : '/api/memories', {method:existing ? 'PATCH' : 'POST',body:JSON.stringify(body)});
      if (!live.current) return;
      if(user&&!existing)window.localStorage.removeItem(`memory-draft:${user.id}`);
      if(existing&&previous?.url.split('?')[0]===`/memories/${saved.id}`)back();
      else navigate(`/memories/${saved.id}`, {replace:true,state:{saved:true}});
    } catch (reason) {setError(reason instanceof Error ? reason.message : '没有保存成功，请重试。');}
    finally {lock.current = false;setBusy(false);}
  }
  return <section className={`journal-page memory-composer ${existing?'is-edit':'is-new'}`}>
    <header className="composer-heading"><BackLink fallback={fallback}/><h1>{existing?'编辑记忆':'新建记忆'}</h1>{existing?<span>{existing.publication?.published?'修改后需重新公开':'私密'}</span>:<button type="button" className="composer-draft" onClick={saveDraft}>{draftSaved?'已存草稿':'存草稿'}</button>}</header>
    <SampleNotice compact/>
    <form className="memory-form composer-paper" onSubmit={save} onInvalidCapture={event=>{const details=(event.target as HTMLElement).closest('details');if(details)details.open=true;}}>
      <fieldset className="memory-form form-fields" disabled={busy}>
      {eventId&&<div className="composer-event-context"><EventNote key={eventId} id={eventId} label="关联现场" linked={false}/><button className="composer-event-remove" type="button" aria-label="取消关联这场演出" title="取消关联这场演出" disabled={busy||uploading} onClick={()=>setEventId(null)}><X size={16} aria-hidden="true"/></button></div>}
      <GalleryPicker photos={photos} cover={cover} onChange={setPhotos} onCover={setCover} onBusyChange={setUploading} disabled={busy||uploading} compact/>
      {!existing&&<SongPicker song={song} onChoose={chooseSong} disabled={busy||uploading}/>}
      <label className="composer-title" htmlFor="memory-title"><span className="sr-only">标题（选填）</span><input id="memory-title" value={title} maxLength={80} onChange={event=>setTitle(event.target.value)} placeholder="标题（选填）"/></label>
      <label className="composer-story" htmlFor="memory-story"><span className="sr-only">写下这一刻</span><textarea ref={storyInput} id="memory-story" value={story} onChange={e => setStory(e.target.value)} maxLength={500} rows={5} required placeholder="写下这一刻的故事…"/></label><span className="character-count">{story.length} / 500</span>
      <div className="composer-recommendations" aria-label="推荐标签">{['散场以后','演出现场','邓紫棋','深圳站','听见此刻'].map(value=><button key={value} type="button" onClick={()=>addTag(value)}>#{value}</button>)}</div>
      <div className="composer-mentions"><button type="button" onClick={()=>setShowTagEntry(value=>!value)}><Hash size={16}/>话题</button><button type="button" onClick={()=>{setStory(value=>value+' @');storyInput.current?.focus();}}><At size={16}/>用户</button></div>
      {showTagEntry&&<label className="composer-tag-entry" htmlFor="memory-tags-inline">添加话题<input id="memory-tags-inline" value={tagText} onChange={event=>setTagText(event.target.value)} placeholder="多个话题用逗号分开"/></label>}
      <div className="composer-setting-rows"><button type="button" onClick={()=>setSheet('place')}><MapPin size={20}/>标记地点 <span>{locationName||'未标记'} <CaretRight size={17}/></span></button><div className="composer-place-suggestions">{['深圳湾体育中心','演出现场 · 深圳','旅途路上'].map(value=><button type="button" key={value} onClick={()=>setLocationName(value)}>{value}</button>)}</div><button type="button" onClick={()=>setSheet('time')}><CalendarBlank size={20}/>标记时间 <span>{lifeTime||'未标记'} <CaretRight size={17}/></span></button><button type="button" onClick={()=>setSheet('visibility')}><LockSimple size={20}/>可见范围 <span>{visibility==='public'?'公开可见':'仅自己可见'} <CaretRight size={17}/></span></button></div>
      {song&&<details ref={musicOptions} className="composer-options composer-music"><summary>{existing&&<img src={songCover(song)} alt=""/>}<span><strong>{existing?song.title:'词句与片段'}</strong><small>{timeText?`${lyricId?'所选词句 · ':''}${timeText}${endText?`—${endText}`:' 起'}`:'整首歌'}</small></span><span className="composer-disclosure">调整</span></summary><div className="composer-options-body">
      <AudioPlayer song={song} anchor={position} onMark={busy ? undefined : ms => {setPosition(ms);setTimeText(formatPosition(ms));setLyricId(null);}}/><LyricPicker song={song} selected={lyricId} disabled={busy} onSelect={(id,ms)=>{setLyricId(id);setPosition(ms);setTimeText(formatPosition(ms));}}/>
      {existing&&<div className="music-range"><div className="range-title"><strong>音乐片段</strong><button className="text-button" type="button" onClick={()=>{setPosition(null);setTimeText('');setEndText('');setLyricId(null);}}>用整首歌</button></div><div className="range-inputs"><label>起点<input aria-label="音乐里的位置" value={timeText} onChange={e=>{setTimeText(e.target.value);setLyricId(null);}} placeholder="00:00" disabled={!song.audio_available}/></label><span aria-hidden="true">—</span><label>终点<input aria-label="播放区间终点" value={endText} onChange={e=>setEndText(e.target.value)} placeholder={formatPosition(song.duration_ms)} disabled={!song.audio_available}/></label></div><small>填写起止时间，查看记忆时播放这一段。</small></div>}
      </div></details>}
      <details ref={extraOptions} className="composer-options composer-extra"><summary><span><strong>补充细节</strong><small>{[lifeYear,lifeTime,tagText?'已添加标签':''].filter(Boolean).join(' · ')||'时间、标签 · 选填'}</small></span><span className="composer-disclosure">展开</span></summary><div className="composer-options-body">
      <div className="composer-date"><label>年份<input aria-label="年份" type="number" min="1900" max={new Date().getFullYear()} step="1" value={lifeYear} onChange={e=>setLifeYear(e.target.value)} placeholder="比如 2022"/></label>
      <label>时间备注<input value={lifeTime} onChange={e => setLifeTime(e.target.value)} maxLength={80} placeholder="比如：去年夏天"/></label>
      </div><label htmlFor="memory-tags">标签 <small>用逗号分开，最多8个</small><input id="memory-tags" value={tagText} onChange={event=>setTagText(event.target.value)} maxLength={220} placeholder="#演唱会，#散场，#跨城追星"/></label>
      {!existing&&visibility==='public'&&<div className="composer-sharing" role="group" aria-label="公开设置"><label><input type="checkbox" aria-label="匿名发布" checked={anonymous} onChange={event=>setAnonymous(event.target.checked)}/>匿名发布</label><label><input type="checkbox" aria-label="公开年份和时间" checked={shareLife} onChange={event=>setShareLife(event.target.checked)}/>公开年份和时间</label></div>}
      </div></details>
      {existing?.publication?.published&&<p className="sample-notice">修改原文或坐标后，会先撤回旧的公开片段。保存后可重新预览并分享。</p>}
      {error && <p className="form-error" role="alert">{error}<Link to={existing ? `/memories/${existing.id}` : '/memories'}>{existing ? '重新打开这段记忆' : '去我的记忆确认'}</Link></p>}
      <div className="composer-save"><button type="button" className="privacy-line" onClick={()=>setSheet('visibility')}>{!existing&&visibility==='public'?'公开可见':'仅自己可见'} <CaretRight size={14}/></button><button type="submit" className="primary-button" disabled={busy || uploading || !story.trim() || !song}>{busy ? '保存中…' : uploading?'上传中…':existing ? '保存修改' : visibility==='public'?'发布记忆':'保存记忆'}</button></div>
      </fieldset>
    </form>
    {sheet&&<div className="composer-modal" role="dialog" aria-modal="true" aria-label={sheet==='place'?'标记地点':sheet==='time'?'标记时间':'可见范围'}><button className="composer-modal-scrim" type="button" aria-label="关闭弹层" onClick={()=>setSheet(null)}/><div className="composer-sheet"><div className="composer-sheet-handle"/><header><button type="button" onClick={()=>setSheet(null)} aria-label="关闭弹层"><X size={20}/></button><h2>{sheet==='place'?'标记地点':sheet==='time'?'标记时间':'谁可以看到这段记忆'}</h2></header>{sheet==='place'?<><label className="composer-location-search"><MagnifyingGlass size={18}/><input value={locationQuery} onChange={event=>setLocationQuery(event.target.value)} placeholder="搜索城市或演出地点"/></label><div className="composer-sheet-options">{[...new Set([...(locationQuery.trim()?[locationQuery.trim()]:[]),locationName,'深圳湾体育中心','演出现场 · 深圳','旅途路上','不标记地点'].filter(Boolean))].map(value=><button key={value} type="button" onClick={()=>{setLocationName(value==='不标记地点'?'':value);setSheet(null);}}><MapPin size={18}/>{value}<span>{locationName===value?'✓':'○'}</span></button>)}</div></>:sheet==='time'?<div className="composer-time-sheet"><p>选择这段记忆发生的时间</p><input aria-label="日期" type="date" max={new Date().toISOString().slice(0,10)} value={markedDate} onChange={event=>setMarkedDate(event.target.value)}/><label>具体时间 <input aria-label="具体时间" type="time" value={markedClock} onChange={event=>setMarkedClock(event.target.value)}/></label><small>也可以只标记日期，不填写具体时刻</small><button type="button" className="primary-button" disabled={!markedDate} onClick={()=>{setLifeYear(markedDate.slice(0,4));setLifeTime(markedDate+(markedClock?` ${markedClock}`:''));setSheet(null);}}>完成</button></div>:<div className="composer-sheet-options"><button type="button" onClick={()=>{setVisibility('public');setSheet(null);}}><LockSimple size={18}/>公开可见<span>{visibility==='public'?'✓':'○'}</span></button><button type="button" onClick={()=>{setVisibility('private');setSheet(null);}}><LockSimple size={18}/>仅自己可见<span>{visibility==='private'?'✓':'○'}</span></button></div>}</div></div>}
  </section>;
}

export function MemoryDetailPage({ edit = false }: { edit?: boolean }) {
  const { user } = useSession();return user ? <DetailContent edit={edit}/> : <LoginGate/>;
}

function DetailContent({ edit }: { edit: boolean }) {
  const { memoryId } = useParams();const location = useLocation();
  const { user } = useSession();const [version, setVersion] = useState(0);
  const { value: card, error } = useData<Memory>(`/api/memories/${memoryId}`, version);
  if (!card) return <LoadingError error={error} retry={() => setVersion(x => x + 1)}/>;
  if (card.owner_id !== user?.id) return <LoadingError error="这不是当前账号的私人记忆。"/>;
  if (edit) return <MemoryForm key={card.id + ':' + card.revision} song={card.song} existing={card}/>;
  return <section className="journal-page memory-detail">
    <header className="memory-toolbar"><BackLink fallback="/memories"/></header>
    {location.state?.saved && <p className="saved-notice" role="status">已保存。</p>}
    <span className="journal-eyebrow">{card.is_demo_sample ? '样例记忆' : '我的音乐记忆'}</span><h1>{card.title||card.life_time || '那个有音乐的时刻'}</h1>
    <article className={`keepsake-paper${card.photo_url?' has-photo':''}`}>
      <span className="paper-date">{[card.life_year,card.life_time].filter(Boolean).join(' · ')||`记录于 ${dayLabel(card.created_at)}`}</span><p className="original-story">{card.story}</p><PhotoGallery photos={cardPhotos(card)} fallback={songCover(card.song)}/><TagLinks tags={card.tags} scope="mine"/>{card.offset_ms!==null&&<span className="paper-caption">我最喜欢的片段 · {formatPosition(card.offset_ms)}{card.end_ms!=null?` — ${formatPosition(card.end_ms)}`:''}</span>}
      <PublicationPanel key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
    </article>
    <MemoryActions key={'actions:'+card.id+':'+card.revision} card={card} onReload={()=>setVersion(v=>v+1)}/>
    {card.event_id&&<EventNote id={card.event_id}/>}
    {card.lyric&&<blockquote className="lyric-quote">“{card.lyric.text}”<small>原创示例词句</small></blockquote>}
    <SongHeading song={card.song}/><AudioPlayer song={card.song} anchor={card.offset_ms} end={card.end_ms}/>
    <QuickReflection key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
  </section>;
}
