import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router';
import { apiBaseUrl, type Song } from './api';
import { AudioPlayer } from './AudioPlayer';
import { apiRequest, dayLabel, formatPosition, parsePosition, timelineGroups, type Memory, type Photo, type EventSnapshot } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';
import { useData } from './useData';
import { LyricPicker } from './LyricPicker';
import { PublicStoryList } from './PublicPages';
import {StoryCard} from './StoryCard';
import { GalleryPicker } from './PhotoGallery';
import { cardCover, cardPhotos, parseTags, photoSource, songCover } from './cardMedia';
import { Plus, X, MagnifyingGlass, MapPin, CalendarBlank, LockSimple, CaretRight, Hash, At } from '@phosphor-icons/react';
import { QuickReflection } from './QuickReflection';
import { EventNote } from './EventNote';
import {BackLink,useBackNavigation} from './Navigation';
import {MemoryActions} from './MemoryActions';
import {ChoicePicker} from './ChoicePicker';
import {MemoryTimeFilter} from './MemoryTimeFilter';
import {SongPicker} from './SongPicker';
import {PlacePicker} from './PlacePicker';
import {lockPageScroll,trapDialogFocus} from './dialogScroll';
import './composer.css';
import {filterMemories,memoryCategory,memoryCity} from './memoryPresentation';
import {currentLocalMark,extractHashtags,insertAtCursor} from './revisionBehavior';
import {recommendMemoryTags} from './tagRecommendations';
import {MemoryExitDialog,useMemoryExitGuard} from './MemoryExitGuard';

export function LoginGate() {
  const location = useLocation();
  return <section className="journal-page empty-journal"><span className="journal-eyebrow">我的音乐记忆</span><h1>留给自己的，<br/>慢慢听。</h1><p>登录后，一句心事、一段旋律，都会好好留在你的空间里。</p><Link className="primary-button" to={`/account?next=${encodeURIComponent(location.pathname + location.search)}`}>打开我的私人空间</Link><Link className="text-button" to="/?choose=1">先选一首歌</Link></section>;
}

function LoadingError({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <div className="status-card error-card" role="alert">{error}{retry && <button onClick={retry}>重新加载</button>}<BackLink fallback="/memories"/></div> : <div className="status-card" role="status">正在翻开这一页…</div>;
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
  if(collection)return <Link className="memory-entry memory-snapshot collection-card" to={`/memories/${memory.id}`}>
    <div className="snapshot-image"><img src={cardCover(memory)} alt={memory.photo_url?'记忆里的照片':'歌曲配图'} loading="lazy"/>{cardPhotos(memory).length>1&&<span className="photo-count">{cardPhotos(memory).length} 张</span>}</div>
    <div className="snapshot-copy"><strong>{memory.song.title}</strong><small>{memory.song.artist}</small><span className="snapshot-status">{[memoryCategory(memory),memoryCity(memory)].filter(Boolean).join(' · ')}</span>{date&&<span className="snapshot-date">{date}</span>}</div><span className="snapshot-privacy">{memory.publication?.published?'公开':'私密'}</span>
  </Link>;
  return <Link className={`memory-entry memory-snapshot${collection?' collection-card':''}`} to={`/memories/${memory.id}`}>
    {(date||!collection)&&<span className="snapshot-date">{date||`记录于 ${dayLabel(memory.created_at)}`}</span>}
    <div className="snapshot-image"><img src={cardCover(memory)} alt={memory.photo_url?'记忆里的照片':'歌曲配图'} loading="lazy"/>{cardPhotos(memory).length>1&&<span className="photo-count">{cardPhotos(memory).length} 张</span>}</div>
    <div className="snapshot-copy">{matchLabel&&<span className="match-label">{matchLabel}</span>}{memory.title&&<h3>{memory.title}</h3>}{!collection&&<p>{evidence||memory.story}</p>}<strong>{memory.song.title}</strong><small>{memory.song.artist}</small><span className="snapshot-status">{collection?[memoryCategory(memory),memoryCity(memory)].filter(Boolean).join(' · '):`${memory.is_demo_sample?'虚构样例 · ':''}${memory.publication?.published?'已公开':'仅自己'}`}</span></div>{collection&&<span className="snapshot-privacy">{memory.publication?.published?'公开':'私密'}</span>}
  </Link>;
}

export function MemoryCollection() {
  const { user } = useSession();
  return user ? <CollectionContent/> : <LoginGate/>;
}

function validDraftSong(value:unknown) {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const song=value as Record<string,unknown>;
  return Number.isInteger(song.id)&&Number(song.id)>0&&typeof song.title==='string'&&typeof song.artist==='string'
    &&['version','source_label','recording_label','cover_url','lyrics_note','qq_music_url','audio_url'].every(key=>song[key]==null||typeof song[key]==='string')
    &&(song.duration_ms==null||(typeof song.duration_ms==='number'&&Number.isFinite(song.duration_ms)&&song.duration_ms>=0))
    &&['is_demo','audio_available'].every(key=>song[key]===undefined||typeof song[key]==='boolean')
    &&(song.lyrics===undefined||(Array.isArray(song.lyrics)&&song.lyrics.every(line=>line&&typeof line==='object'&&typeof line.id==='string'&&typeof line.text==='string'&&typeof line.start_ms==='number'&&Number.isFinite(line.start_ms)&&line.start_ms>=0)));
}

function hasDraftContent(data:Record<string,unknown>) {
  const automatic=Array.isArray(data.autoEventFields)?data.autoEventFields:[];
  return ['title','story','tagText','lifeTime','lifeYear','locationName'].some(key=>!automatic.includes(key)&&typeof data[key]==='string'&&data[key].trim())
    ||Array.isArray(data.photos)&&data.photos.length>0;
}

function validEventSnapshot(value:unknown,eventId:unknown):value is EventSnapshot{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  return record.id===eventId&&['id','title','artist','date','city','venue'].every(key=>typeof record[key]==='string');
}

function readLocalMemoryDraft(userId:number) {
  try {
    const serialized=window.localStorage.getItem(`memory-draft:${userId}`);
    if(!serialized)return null;
    const data=JSON.parse(serialized);
    if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==1||typeof data.story!=='string')return null;
    if(data.song!=null&&!validDraftSong(data.song))return null;
    if(data.eventSnapshot!=null&&!validEventSnapshot(data.eventSnapshot,data.eventId))return null;
    if(data.photos!==undefined&&(!Array.isArray(data.photos)||data.photos.some((photo:Photo|null)=>!photo||typeof photo.id!=='string'||typeof photo.url!=='string')))return null;
    if(!hasDraftContent(data))return null;
    return {serialized,data};
  } catch { return null; }
}

function LocalDraftEntry() {
  const {user}=useSession();
  const [available,setAvailable]=useState(()=>!!user&&!!readLocalMemoryDraft(user.id));
  useEffect(()=>{
    const refresh=()=>setAvailable(!!user&&!!readLocalMemoryDraft(user.id));
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key===`memory-draft:${user?.id}`)refresh();};
    refresh();window.addEventListener('storage',changed);window.addEventListener('focus',refresh);
    return()=>{window.removeEventListener('storage',changed);window.removeEventListener('focus',refresh);};
  },[user?.id]);
  return available?<Link className="collection-draft" to="/create?draft=1">草稿</Link>:null;
}

function CollectionContent() {
  const navigate=useNavigate();
  const location=useLocation();
  const [retry,setRetry]=useState(0);
  const {value:memories,error}=useData<Memory[]>('/api/memories',retry);
  const [params,setParams]=useSearchParams();
  const [searchOpen,setSearchOpen]=useState(false);
  const query=params.get('q')??'';
  function setQuery(value:string){const next=new URLSearchParams(params);if(value)next.set('q',value);else next.delete('q');setParams(next,{replace:true});}
  const songId=params.get('song')??'',tag=params.get('tag')??'',untagged=!tag&&params.get('withoutTags')==='1';
  const category=params.get('category')??'',city=params.get('city')??'';
  const experience=tag?`tag:${tag}`:untagged?'untagged':category?`category:${category}`:'';
  const timeRange={startYear:params.get('startYear')??'',startMonth:params.get('startMonth')??'',endYear:params.get('endYear')??'',endMonth:params.get('endMonth')??''};
  function setExperience(value:string){
    const next=new URLSearchParams(params);
    next.delete('song');next.delete('tag');next.delete('withoutTags');next.delete('category');
    if(value.startsWith('tag:'))next.set('tag',value.slice(4));
    else if(value==='untagged')next.set('withoutTags','1');
    else if(value.startsWith('category:'))next.set('category',value.slice(9));
    setParams(next,{replace:true});
  }
  function clearSong(){const next=new URLSearchParams(params);next.delete('song');setParams(next,{replace:true});}
  function clearAll(){const next=new URLSearchParams(params);for(const key of ['song','tag','withoutTags','category','city','startYear','startMonth','endYear','endMonth','q'])next.delete(key);setParams(next,{replace:true});}
  function setCity(value:string){const next=new URLSearchParams(params);if(value)next.set('city',value);else next.delete('city');setParams(next,{replace:true});}
  function setTime(value:typeof timeRange){const next=new URLSearchParams(params);for(const key of ['startYear','startMonth','endYear','endMonth'] as const){if(value[key])next.set(key,value[key]);else next.delete(key);}setParams(next,{replace:true});}
  // The user's explicit tags organize experiences; never infer a category from prose or music.
  const tags=[...new Set((memories??[]).flatMap(card=>card.tags))];
  const options=[{value:'',label:'全部经历'},...tags.map(tag=>({value:`tag:${tag}`,label:tag})),
    ...(memories?.some(card=>!card.tags.length)?[{value:'untagged',label:'未加标签'}]:[]),
    ...(category&&memories?.some(card=>memoryCategory(card)===category)?[{value:`category:${category}`,label:category}]:[])];
  const base=memories?.filter(card=>(!songId||card.song_id===Number(songId))&&(!tag||card.tags.includes(tag))&&(!untagged||!card.tags.length))??[];
  const visible=filterMemories(base,{category,city,query,timeRange});
  const cityOptions=[...new Set((memories??[]).map(memoryCity).filter(Boolean))];
  const years=[...new Set((memories??[]).flatMap(card=>card.life_year==null?[]:[card.life_year]))].sort((a,b)=>b-a);
  const filtered=Boolean(songId||experience||category||city||query||timeRange.startYear||timeRange.endYear);
  const songTitle=memories?.find(card=>card.song_id===Number(songId))?.song.title??'指定歌曲';
  return <section className="journal-page collection-page">
    <div className="journal-title-row collection-title"><div><h1>我的记忆</h1></div><div className="collection-create-actions"><LocalDraftEntry/><Link className="collection-new" to="/create"><Plus size={16}/>新建记忆</Link></div></div>
    <div className="collection-filters" role="group" aria-label="筛选我的记忆"><ChoicePicker label="按经历标签筛选" value={experience} selectedLabel={tag||category||undefined} onChange={setExperience} options={options} disabled={!memories}/><MemoryTimeFilter value={timeRange} years={years} onChange={setTime} disabled={!memories}/><ChoicePicker label="按城市筛选" value={city} selectedLabel={city||undefined} onChange={setCity} options={[{value:'',label:'全部城市'},...cityOptions.map(value=>({value,label:value}))]} disabled={!memories}/></div>
    <div className="segmented-control timeline-toggle"><button aria-pressed="true" type="button">时间轴</button><button aria-pressed="false" type="button" onClick={()=>navigate(`/footprints?${new URLSearchParams({from:'mine',return:location.pathname+location.search})}`)}>足迹</button></div>
    <div className={`collection-search-surface${searchOpen?' is-open':''}`}>{searchOpen?<><div className="collection-search-panel"><label><MagnifyingGlass size={18}/><input aria-label="搜索我的记忆" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索记忆、歌曲或歌手" onKeyDown={event=>{if(event.key==='Escape'||event.key==='Enter')setSearchOpen(false);}}/></label><button type="button" onClick={()=>setSearchOpen(false)}>完成</button></div><div className="collection-search-preview" role="status">{visible.length} 条结果</div></>:<button type="button" className="collection-search-trigger" onClick={()=>setSearchOpen(true)}><MagnifyingGlass size={18}/><span>{query||'搜索记忆、歌曲或歌手'}</span></button>}
    {songId&&<button type="button" className="collection-song-context" aria-label="清除歌曲筛选" onClick={clearSong}><span>配乐：{songTitle}</span><X size={14} aria-hidden="true"/></button>}
    {!memories?<LoadingError error={error} retry={()=>setRetry(value=>value+1)}/>:<section className="collection-results">{visible.length?<div className="memory-timeline">{timelineGroups(visible).map(group=><section className="timeline-year" key={group.year??'unknown'}><h3>{group.year??'未标年份'}<span>{group.cards.length} 个时刻</span></h3><div>{group.cards.map(card=><MemoryEntry key={card.id} memory={card} collection/>)}</div></section>)}</div>:<div className="empty-paper">{filtered?<><h3>没有符合筛选的记忆</h3><button type="button" className="soft-button" onClick={clearAll}>查看全部记忆</button></>:<><h3>你的第一页，留给哪个瞬间？</h3><Link className="soft-button" to="/create">记录第一刻</Link></>}</div>}</section>}</div>
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
  const navigationAction=useNavigationType();
  const resumeLocalDraft=location.pathname==='/create'&&new URLSearchParams(location.search).get('draft')==='1';
  const fallback=existing?`/memories/${existing.id}`:initialSong?`/songs/${initialSong.id}${location.search}`:initialEvent?`/footprints?event=${encodeURIComponent(initialEvent)}&scene=sky`:'/memories';
  const {previous,back}=useBackNavigation(fallback);
  const musicOptions=useRef<HTMLDetailsElement>(null);
  const live = useLivePage();
  const [story, setStory] = useState(existing?.story ?? '');
  const [title,setTitle]=useState(existing?.title??'');
  const [tagText,setTagText]=useState(existing?.tags.join('，')??'');
  const [lifeTime, setLifeTime] = useState(existing?.life_time ?? '');
  const [lifeYear,setLifeYear] = useState(existing?.life_year?.toString() ?? '');
  const [locationName,setLocationName]=useState(existing?.location_name??'');
  const [locationQuery,setLocationQuery]=useState('');
  const [sheet,setSheet]=useState<'place'|'time'|'visibility'|'drafts'|null>(null);
  const [boxedDraft,setBoxedDraft]=useState<ReturnType<typeof readLocalMemoryDraft>>(null);
  const [confirmDraft,setConfirmDraft]=useState(false);
  const sheetPanel=useRef<HTMLDivElement>(null),sheetOrigin=useRef<HTMLElement|null>(null);
  function openSheet(value:'place'|'time'|'visibility'){sheetOrigin.current=document.activeElement as HTMLElement|null;setSheet(value);}
  const [savedDraftSnapshot,setSavedDraftSnapshot]=useState<string|null>(null);
  const ownedLocalDraft=useRef<string|null>(null);
  const storyInput=useRef<HTMLTextAreaElement>(null);
  const [markedDate,setMarkedDate]=useState(/^\d{4}-\d{2}-\d{2}/.exec(existing?.life_time??'')?.[0]??'');
  const initialLine = initialSong?.lyrics?.find(line=>line.id===(existing?existing.lyric_id:initialLyric));
  const [lyricId,setLyricId] = useState<string|null>(initialLine?.id ?? null);
  const [themeId,setThemeId] = useState(existing ? existing.theme_id ?? null : initialTheme);
  const [position, setPosition] = useState<number | null>(initialLine?.start_ms ?? (existing ? existing.offset_ms : initialPosition));
  const [timeText, setTimeText] = useState(position === null ? '' : formatPosition(position));
  const [endText,setEndText] = useState(existing?.end_ms!=null?formatPosition(existing.end_ms):initialEnd&&Number.isFinite(Number(initialEnd))?formatPosition(Number(initialEnd)):'');
  const [photos,setPhotos]=useState<Photo[]>(existing?cardPhotos(existing):[]);
  const [cover,setCover]=useState<string|null>(existing?.photo_id??null);
  const [uploading,setUploading]=useState(false);
  const [eventId,setEventId]=useState(existing?existing.event_id??null:initialEvent);
  const [eventSnapshot,setEventSnapshot]=useState<EventSnapshot|null>(existing?.event_snapshot??null);
  const [autoEventFields,setAutoEventFields]=useState<string[]>([]);
  const prefilled=useRef(!!existing),dateTouched=useRef(false),placeTouched=useRef(false);
  const [visibility,setVisibility]=useState(existing?.publication?.published?'public':'private');
  const [anonymous,setAnonymous]=useState(existing?.publication?.anonymous??true),[shareLife,setShareLife]=useState(existing?.publication?.share_life_time??false);
  const editRevision=useRef(existing?.revision??1);
  const [error, setError] = useState('');const [busy, setBusy] = useState(false);
  const lock = useRef(false);const requestKey = useRef(crypto.randomUUID());
  useEffect(()=>{if(!sheet)return;const unlock=lockPageScroll();const release=sheetPanel.current?trapDialogFocus(sheetPanel.current,()=>setSheet(null),sheetOrigin.current):()=>{};return()=>{release();unlock();};},[sheet]);
  useEffect(()=>{
    if(existing||!user)return;
    try {
      const returnPath=location.pathname+location.search;
      const routed=location.state?.composerTransition;
      let stored=null;
      if(navigationAction==='POP')try{stored=JSON.parse(window.sessionStorage.getItem(`composer-transition:${user.id}`)??'null');}catch{/* An explicit return still works without browser storage. */}
      const transition=stored?.ownerId===user.id&&stored?.version===1&&stored?.originKey===location.key&&stored?.returnPath===returnPath?stored:routed?.ownerId===user.id&&routed?.version===1&&routed?.returnPath===returnPath?routed:null;
      const saved=!transition&&resumeLocalDraft?readLocalMemoryDraft(user.id):null;
      const draft=transition??saved?.data;
      if(transition){try {window.sessionStorage.removeItem(`composer-transition:${user.id}`);} catch { /* Route state is enough. */ }}
      if(!draft){if(resumeLocalDraft)setError('未找到可读取的草稿，你可以新建记忆。');return;}
      if(draft.version!==1)return;
      if(saved)ownedLocalDraft.current=saved.serialized;
      const restored=restoreDraft(draft);
      if(transition)initialDraft.current=normalizeDraft(transition.exitBaseline??{});
      if(typeof draft.ownedLocalDraft==='string')ownedLocalDraft.current=draft.ownedLocalDraft;
      if(ownedLocalDraft.current)try{setSavedDraftSnapshot(JSON.stringify(normalizeDraft(JSON.parse(ownedLocalDraft.current))));}catch{setSavedDraftSnapshot(JSON.stringify(restored));}
    } catch { /* A corrupt local draft must never prevent a new memory. */ }
  },[]);
  function insertToken(value:string){
    const input=storyInput.current;const start=input?.selectionStart??story.length,end=input?.selectionEnd??story.length;
    const next=insertAtCursor(story,value,start,end);setStory(next.text);
    window.setTimeout(()=>{input?.focus();input?.setSelectionRange(next.cursor,next.cursor);},0);
  }
  function draftPayload(){return {version:1,story,title,tagText,lifeTime,lifeYear,locationName,markedDate,song,photos,cover,position,timeText,endText,lyricId,visibility,eventId,eventSnapshot,autoEventFields,themeId,anonymous,shareLife};}
  const initialDraft=useRef(draftPayload());
  const stableDraft=(value:ReturnType<typeof draftPayload>)=>JSON.stringify({...value,markedDate:''});
  const dirty=(!!existing||hasDraftContent(draftPayload()))&&stableDraft(draftPayload())!==(savedDraftSnapshot?stableDraft(normalizeDraft(JSON.parse(savedDraftSnapshot))):stableDraft(initialDraft.current));
  const exit=useMemoryExitGuard(dirty||uploading);
  useEffect(()=>{if(exit.blocker.state==='blocked')setSheet(null);},[exit.blocker.state]);
  function prefillEvent(value:EventSnapshot){
    if(prefilled.current||existing||value.id!==eventId)return;
    prefilled.current=true;setEventSnapshot(value);
    const defaults:Partial<ReturnType<typeof draftPayload>>={eventSnapshot:value};
    const automatic:string[]=[];
    if(!dateTouched.current&&!lifeTime){
      defaults.lifeTime=value.date;defaults.lifeYear=value.date.slice(0,4);defaults.markedDate=value.date;
      setLifeTime(value.date);setLifeYear(value.date.slice(0,4));setMarkedDate(value.date);automatic.push('lifeTime','lifeYear');
    }
    if(!placeTouched.current&&!locationName){
      defaults.locationName=[value.city,value.venue].filter(Boolean).join(' · ').slice(0,160);
      setLocationName(defaults.locationName);automatic.push('locationName');
    }
    const fields=[...new Set([...autoEventFields,...automatic])];
    defaults.autoEventFields=fields;setAutoEventFields(fields);
    initialDraft.current={...initialDraft.current,...defaults};
    if(savedDraftSnapshot){const baseline=normalizeDraft(JSON.parse(savedDraftSnapshot));setSavedDraftSnapshot(JSON.stringify({...baseline,...defaults}));}
  }
  function normalizeDraft(draft:Partial<ReturnType<typeof draftPayload>>) {
    return {version:1,story:typeof draft.story==='string'?draft.story:'',title:typeof draft.title==='string'?draft.title:'',tagText:typeof draft.tagText==='string'?draft.tagText:'',
      lifeTime:typeof draft.lifeTime==='string'?draft.lifeTime:'',lifeYear:typeof draft.lifeYear==='string'?draft.lifeYear:'',locationName:typeof draft.locationName==='string'?draft.locationName:'',markedDate:typeof draft.markedDate==='string'?draft.markedDate:'',
      song:validDraftSong(draft.song)?draft.song!:null,photos:Array.isArray(draft.photos)?draft.photos:[],cover:typeof draft.cover==='string'?draft.cover:null,
      position:typeof draft.position==='number'?draft.position:null,timeText:typeof draft.timeText==='string'?draft.timeText:'',endText:typeof draft.endText==='string'?draft.endText:'',lyricId:typeof draft.lyricId==='string'?draft.lyricId:null,
      visibility:draft.visibility==='public'?'public':'private',eventId:typeof draft.eventId==='string'?draft.eventId:null,eventSnapshot:validEventSnapshot(draft.eventSnapshot,draft.eventId)?draft.eventSnapshot:null,autoEventFields:Array.isArray(draft.autoEventFields)?draft.autoEventFields.filter(key=>['lifeTime','lifeYear','locationName'].includes(key)):[],themeId:typeof draft.themeId==='string'?draft.themeId:null,anonymous:draft.anonymous!==false,shareLife:draft.shareLife===true};
  }
  function restoreDraft(draft:Partial<ReturnType<typeof draftPayload>>) {
    const value=normalizeDraft(draft);
    setStory(value.story);setTitle(value.title);setTagText(value.tagText);setLifeTime(value.lifeTime);setLifeYear(value.lifeYear);setLocationName(value.locationName);setMarkedDate(value.markedDate);
    setSong(value.song);setPhotos(value.photos);setCover(value.cover);setPosition(value.position);setTimeText(value.timeText);setEndText(value.endText);setLyricId(value.lyricId);
    setVisibility(value.visibility);setEventId(value.eventId);setThemeId(value.themeId);setAnonymous(value.anonymous);setShareLife(value.shareLife);
    setEventSnapshot(value.eventSnapshot);setAutoEventFields(value.autoEventFields);
    prefilled.current=!!value.eventSnapshot;dateTouched.current=!!value.lifeTime;placeTouched.current=!!value.locationName;
    initialDraft.current=value;
    return value;
  }
  const canSaveDraft=hasDraftContent(draftPayload());
  const draftSaved=savedDraftSnapshot===JSON.stringify(draftPayload());
  function saveDraft(){if(!user||!canSaveDraft||busy||uploading)return false;try{const serialized=JSON.stringify(draftPayload());window.localStorage.setItem(`memory-draft:${user.id}`,serialized);ownedLocalDraft.current=serialized;setSavedDraftSnapshot(serialized);setError('');return true;}catch{setError('浏览器无法保存本地草稿，请先不要关闭此页面。');return false;}}
  function openDraftBox(){
    if(!user||busy||uploading)return;
    sheetOrigin.current=document.activeElement as HTMLElement|null;
    setBoxedDraft(readLocalMemoryDraft(user.id));setConfirmDraft(false);setSheet('drafts');
  }
  function resumeBoxedDraft(confirmed=false){
    if(!boxedDraft||!user)return;
    const same=JSON.stringify(draftPayload())===JSON.stringify(normalizeDraft(boxedDraft.data));
    if(!confirmed&&canSaveDraft&&!same){setConfirmDraft(true);return;}
    const restored=restoreDraft(boxedDraft.data);
    ownedLocalDraft.current=boxedDraft.serialized;setSavedDraftSnapshot(JSON.stringify(restored));setError('');setSheet(null);
  }
  function openSongSearch(){
    if(!user)return;
    const returnPath=location.pathname+location.search;
    const transition={...draftPayload(),exitBaseline:initialDraft.current,ownerId:user.id,returnPath,originKey:location.key,ownedLocalDraft:ownedLocalDraft.current};
    try {window.sessionStorage.setItem(`composer-transition:${user.id}`,JSON.stringify(transition));} catch { /* Route state keeps the draft available. */ }
    // POP can recover only the history entry that opened this song picker.
    exit.permit();
    navigate(`/song-search?return=${encodeURIComponent(returnPath)}`,{state:{composerTransition:transition}});
  }
  function openTimeSheet(){
    dateTouched.current=true;
    const now=currentLocalMark(new Date());
    if(!markedDate)setMarkedDate(now.date);
    openSheet('time');
  }
  async function save(event: FormEvent) {
    event.preventDefault();if (lock.current||uploading) return;
    setError('');
    if(!song){setError('请选择这一刻的配乐。');return;}
    let offset: number | null, end:number|null;
    try {offset = parsePosition(timeText, song.duration_ms ?? 0);end=parsePosition(endText,song.duration_ms??0,true);if(end!==null&&(offset===null||end<=offset))throw new Error('播放区间需要起点，结束时间要晚于起点。');} catch (reason) {if(musicOptions.current)musicOptions.current.open=true;setError((reason as Error).message);return;}
    if (!story.trim()) {setError('写一句想留住的线索吧。');return;}
    const tags=[...new Set([...parseTags(tagText),...extractHashtags(story)])];if(tags.length>8||tags.some(tag=>tag.length>24)){setError('最多添加8个标签，每个不超过24字。');return;}
    lock.current = true;setBusy(true);
    try {
      const body = {story:story.trim(),title:title.trim()||null,tags,photo_ids:photos.map(photo=>photo.id),photo_id:cover,end_ms:end,event_id:eventId,location_name:locationName.trim()||null,life_time:lifeTime.trim() || null,life_year:lifeYear?Number(lifeYear):null,lyric_id:lyricId,theme_id:themeId,life_precision: existing && lifeTime === (existing.life_time ?? '') ? existing.life_precision : markedDate&&lifeTime===markedDate?'day':'unknown',offset_ms:offset,...(existing ? {revision:editRevision.current} : {song_id:song.id,request_key:requestKey.current,...(visibility==='public'?{publication:{confirmed:true,anonymous,share_life_time:shareLife}}:{})})};
      let saved = await apiRequest<Memory>(apiBaseUrl, existing ? `/api/memories/${existing.id}` : '/api/memories', {method:existing ? 'PATCH' : 'POST',body:JSON.stringify(body)});
      // Finish an explicitly confirmed edit's visibility write even after route exit.
      // Liveness only guards the newer page's UI, navigation and local draft.
      if (!live.current&&!existing) return;
      if(existing){
        editRevision.current=saved.revision;
        try{
          if(visibility==='public')saved=await apiRequest<Memory>(apiBaseUrl,`/api/memories/${saved.id}/publication`,{method:'POST',body:JSON.stringify({revision:saved.revision,excerpt:story.trim(),share_life_time:shareLife,anonymous,confirmed:true})});
          else if(saved.publication?.published)saved=await apiRequest<Memory>(apiBaseUrl,`/api/memories/${saved.id}/publication?revision=${saved.revision}`,{method:'DELETE'});
          editRevision.current=saved.revision;
        }catch(reason){throw new Error(`记忆内容已保存，但可见范围尚未确认。${reason instanceof Error?reason.message:'请重新打开编辑页确认最新状态。'}`);}
        if(!live.current)return;
      }
      if(user&&!existing&&ownedLocalDraft.current)try{const key=`memory-draft:${user.id}`;if(window.localStorage.getItem(key)===ownedLocalDraft.current)window.localStorage.removeItem(key);}catch{ /* A saved card must remain successful even without local storage. */ }
      exit.permit();
      if(existing&&previous?.url.split('?')[0]===`/memories/${saved.id}`)back();
      else navigate(`/memories/${saved.id}`, {replace:true,state:{saved:true}});
    } catch (reason) {if(live.current)setError(reason instanceof Error ? reason.message : '没有保存成功，请重试。');}
    finally {lock.current = false;if(live.current)setBusy(false);}
  }
  return <section className={`journal-page memory-composer ${existing?'is-edit':'is-new'}`}>
    <header className="composer-heading"><BackLink fallback={fallback}/><h1>{existing?'编辑记忆':'新建记忆'}</h1>{existing?<span>{visibility==='public'?'公开可见':'私密'}</span>:<button type="button" className="composer-draft-box" disabled={busy||uploading} onClick={openDraftBox}>草稿箱</button>}</header>
    <form className="memory-form composer-paper" onSubmit={save} onInvalidCapture={event=>{const details=(event.target as HTMLElement).closest('details');if(details)details.open=true;}}>
      <fieldset className="memory-form form-fields" disabled={busy}>
      {eventId&&<div className="composer-event-context"><EventNote key={eventId} id={eventId} snapshot={eventSnapshot} onResolved={prefillEvent} label="关联现场" linked={false}/><button className="composer-event-remove" type="button" aria-label="取消关联这场演出" title="取消关联这场演出" disabled={busy||uploading} onClick={()=>{setEventId(null);setEventSnapshot(null);}}><X size={16} aria-hidden="true"/></button></div>}
      <GalleryPicker photos={photos} cover={cover} onChange={setPhotos} onCover={setCover} onBusyChange={setUploading} disabled={busy||uploading} compact/>
      {!existing&&<SongPicker song={song} onOpen={openSongSearch} disabled={busy||uploading}/>}
      <label className="composer-title" htmlFor="memory-title"><span className="sr-only">标题（选填）</span><input id="memory-title" value={title} maxLength={80} onChange={event=>setTitle(event.target.value)} placeholder="标题（选填）"/></label>
      <label className="composer-story" htmlFor="memory-story"><span className="sr-only">写下这一刻</span><textarea ref={storyInput} id="memory-story" value={story} onChange={e => setStory(e.target.value)} maxLength={500} rows={5} required placeholder="写下这一刻的故事…"/></label><span className="character-count">{story.length} / 500</span>
      <div className="composer-recommendations" aria-label="推荐标签">{existing&&parseTags(tagText).map(value=><button className="composer-existing-tag" key={`saved-${value}`} type="button" aria-label={`移除标签${value}`} onClick={()=>setTagText(parseTags(tagText).filter(tag=>tag!==value).join('，'))}>#{value} ×</button>)}{recommendMemoryTags(title,story,song).filter(value=>!parseTags(tagText).includes(value)).map(value=><button key={value} type="button" onClick={()=>insertToken(`#${value}`)}>#{value}</button>)}</div>
      <div className="composer-mentions"><button type="button" onClick={()=>insertToken('#')}><Hash size={16}/>话题</button><button type="button" onClick={()=>insertToken('@')}><At size={16}/>用户</button></div>
      <div className="composer-setting-rows"><div className="composer-place-row"><button type="button" onClick={()=>openSheet('place')}><MapPin size={20}/>标记地点 <span>{locationName||'未标记'} <CaretRight size={17}/></span></button></div><button type="button" onClick={openTimeSheet}><CalendarBlank size={20}/>标记时间 <span>{lifeTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0]||lifeTime||'未标记'} <CaretRight size={17}/></span></button><button type="button" onClick={()=>openSheet('visibility')}><LockSimple size={20}/>可见范围 <span>{visibility==='public'?'公开可见':'仅自己可见'} <CaretRight size={17}/></span></button></div>
      {!existing&&visibility==='public'&&<div className="composer-sharing" role="group" aria-label="公开设置"><label><input type="checkbox" aria-label="匿名发布" checked={anonymous} onChange={event=>setAnonymous(event.target.checked)}/>匿名发布</label><label><input type="checkbox" aria-label="公开年份和时间" checked={shareLife} onChange={event=>setShareLife(event.target.checked)}/>公开年份和时间</label></div>}
      {song&&<details ref={musicOptions} className="composer-options composer-music"><summary>{existing&&<img src={songCover(song)} alt=""/>}<span><strong>{existing?song.title:'词句与片段'}</strong><small>{timeText?`${lyricId?'所选词句 · ':''}${timeText}${endText?`—${endText}`:' 起'}`:'整首歌'}</small></span><span className="composer-disclosure">调整</span></summary><div className="composer-options-body">
      <AudioPlayer song={song} anchor={position} onMark={busy ? undefined : ms => {setPosition(ms);setTimeText(formatPosition(ms));setLyricId(null);}}/><LyricPicker song={song} selected={lyricId} disabled={busy} onSelect={(id,ms)=>{setLyricId(id);setPosition(ms);setTimeText(formatPosition(ms));}}/>
      {existing&&<div className="music-range"><div className="range-title"><strong>音乐片段</strong><button className="text-button" type="button" onClick={()=>{setPosition(null);setTimeText('');setEndText('');setLyricId(null);}}>用整首歌</button></div><div className="range-inputs"><label>起点<input aria-label="音乐里的位置" value={timeText} onChange={e=>{setTimeText(e.target.value);setLyricId(null);}} placeholder="00:00" disabled={!song.audio_available}/></label><span aria-hidden="true">—</span><label>终点<input aria-label="播放区间终点" value={endText} onChange={e=>setEndText(e.target.value)} placeholder={formatPosition(song.duration_ms)} disabled={!song.audio_available}/></label></div><small>填写起止时间，查看记忆时播放这一段。</small></div>}
      </div></details>}
      {error && <p className="form-error" role="alert">{error}<Link to={existing ? `/memories/${existing.id}` : '/memories'}>{existing ? '重新打开这段记忆' : '去我的记忆确认'}</Link></p>}
      <div className="composer-save">{!existing&&<button type="button" className="composer-draft" disabled={!canSaveDraft||busy||uploading} onClick={saveDraft}>{draftSaved?'已存草稿':'存草稿'}</button>}<button type="submit" className="primary-button" disabled={busy || uploading || !story.trim() || !song}>{busy ? '保存中…' : uploading?'上传中…':existing ? visibility==='public'?'保存':'保存修改' : visibility==='public'?'发布记忆':'保存记忆'}</button></div>
      </fieldset>
    </form>
    {sheet&&<div className="composer-modal" role="dialog" aria-modal="true" aria-label={sheet==='place'?'标记地点':sheet==='time'?'标记时间':sheet==='drafts'?'草稿箱':'可见范围'}><button className="composer-modal-scrim" type="button" aria-label="关闭弹层" onClick={()=>setSheet(null)}/><div ref={sheetPanel} className="composer-sheet"><div className="composer-sheet-handle"/><header><button type="button" onClick={()=>setSheet(null)} aria-label="关闭弹层"><X size={20}/></button><h2>{sheet==='place'?'标记地点':sheet==='time'?'标记时间':sheet==='drafts'?'草稿箱':'谁可以看到这段记忆'}</h2></header>{sheet==='drafts'?<div className="composer-draft-list">
      {boxedDraft?confirmDraft?<div className="composer-draft-confirm"><p>读取这份草稿会替换当前内容。</p><div><button type="button" className="soft-button composer-draft-cancel" onClick={()=>setConfirmDraft(false)}>取消</button><button type="button" className="primary-button composer-draft-replace" onClick={()=>resumeBoxedDraft(true)}>读取草稿</button></div></div>:<>
        <div className="composer-draft-preview">
          {boxedDraft.data.photos?.length>0&&<img src={photoSource((boxedDraft.data.photos.find((photo:Photo)=>photo.id===boxedDraft.data.cover)??boxedDraft.data.photos[0]).url)} alt="草稿照片"/>}
          <div><h3>{typeof boxedDraft.data.title==='string'&&boxedDraft.data.title.trim()||boxedDraft.data.song?.title||'未命名草稿'}</h3>{boxedDraft.data.story.trim()&&<p>{boxedDraft.data.story}</p>}{boxedDraft.data.photos?.length>0&&<small>{boxedDraft.data.photos.length} 张照片</small>}</div>
        </div><button type="button" className="primary-button composer-draft-resume" onClick={()=>resumeBoxedDraft()}>继续编辑</button>
      </>:<p className="composer-draft-empty">暂无草稿</p>}
    </div>:sheet==='place'?<PlacePicker query={locationQuery} onQuery={setLocationQuery} selected={locationName} eventId={eventId} onSelect={value=>{placeTouched.current=true;setAutoEventFields(fields=>fields.filter(key=>key!=='locationName'));setLocationName(value);setSheet(null);}}/>:sheet==='time'?<div className="composer-time-sheet"><p>选择这段记忆发生的时间</p><div className="composer-date-parts" role="group" aria-label="日期">{(['年','月','日'] as const).map((unit,index)=><label key={unit}><input aria-label={unit} inputMode="numeric" maxLength={index===0?4:2} value={markedDate.split('-')[index]??''} placeholder={unit} onChange={event=>{const parts=markedDate.split('-');while(parts.length<3)parts.push('');parts[index]=event.target.value.replace(/\D/g,'');setMarkedDate(parts.join('-'));}}/><span>{unit}</span></label>)}</div><button type="button" className="primary-button" disabled={!/^\d{4}-\d{1,2}-\d{1,2}$/.test(markedDate)} onClick={()=>{const [year,month,day]=markedDate.split('-');const date=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;const checked=new Date(`${date}T12:00:00`);if(Number.isNaN(checked.getTime())||checked.getFullYear()!==Number(year)||checked.getMonth()+1!==Number(month)||checked.getDate()!==Number(day)){setError('日期不正确，请重新填写。');return;}setError('');dateTouched.current=true;setAutoEventFields(fields=>fields.filter(key=>key!=='lifeTime'&&key!=='lifeYear'));setMarkedDate(date);setLifeYear(year);setLifeTime(date);setSheet(null);}}>完成</button></div>:<div className="composer-sheet-options"><button type="button" onClick={()=>{setVisibility('public');setSheet(null);}}><LockSimple size={18}/>公开可见<span>{visibility==='public'?'✓':'○'}</span></button><button type="button" onClick={()=>{setVisibility('private');setSheet(null);}}><LockSimple size={18}/>仅自己可见<span>{visibility==='private'?'✓':'○'}</span></button></div>}</div></div>}
    {!sheet&&<MemoryExitDialog blocker={exit.blocker} save={!existing&&canSaveDraft?saveDraft:undefined} busy={busy} uploading={uploading} editing={!!existing} error={error}/>}
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
    <StoryCard author={card.is_demo_sample?'虚构歌迷 · 演示故事':user.display_name} sample={card.is_demo_sample} title={card.title} year={card.life_year} time={card.life_time} song={card.song} photos={cardPhotos(card)} text={card.story} tags={card.tags} scope="mine" anchor={card.offset_ms} end={card.end_ms} lyric={card.lyric}/>
    <MemoryActions key={'actions:'+card.id+':'+card.revision} card={card} onReload={()=>setVersion(v=>v+1)}/>
    {card.event_id&&<EventNote id={card.event_id} snapshot={card.event_snapshot}/>}
    <QuickReflection key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
  </section>;
}
