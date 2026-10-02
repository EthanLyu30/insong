import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiBaseUrl, type Song } from './api';
import { AudioPlayer } from './AudioPlayer';
import { apiRequest, dayLabel, formatPosition, parsePosition, timelineGroups, type Memory, type Theme, type Photo } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';
import { useData } from './useData';
import { LyricPicker } from './LyricPicker';
import { PublicStoryList, TagLinks } from './PublicPages';
import { PublicationPanel } from './PublicationPanel';
import { PhotoGallery, GalleryPicker } from './PhotoGallery';
import { cardCover, cardPhotos, parseTags, songCover } from './cardMedia';
import { Cards, ChatCircle, Plus } from '@phosphor-icons/react';
import { QuickReflection } from './QuickReflection';
import { EventNote } from './EventNote';
import { PhotoCredit } from './PhotoCredit';
import {BackLink,useBackNavigation} from './Navigation';
import './composer.css';

export function LoginGate() {
  const location = useLocation();
  return <section className="journal-page empty-journal"><span className="journal-eyebrow">我的音乐记忆</span><h1>留给自己的，<br/>慢慢听。</h1><p>登录后，一句心事、一段旋律，都会好好留在你的空间里。</p><Link className="primary-button" to={`/account?next=${encodeURIComponent(location.pathname + location.search)}`}>打开我的私人空间</Link><Link className="text-button" to="/">先选一首歌</Link></section>;
}

function SampleNotice({compact=false}:{compact?:boolean}) {
  const { user } = useSession();
  return user?.is_demo ? <aside className={`sample-notice${compact?' is-compact':''}`}>{compact?'共享样例 · 请只填写虚构内容':'你正在使用共享样例账号，请只填写虚构内容。'}<Link to="/account">创建个人账号 →</Link></aside> : null;
}

function LoadingError({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <div className="status-card error-card" role="alert">{error}{retry && <button onClick={retry}>重新加载</button>}<BackLink fallback="/memories"/></div> : <div className="status-card" role="status">正在翻开这一页…</div>;
}

function SongHeading({ song }: { song: Song }) {
  return <div className="record-heading"><img src={songCover(song)} alt=""/><div><span className="journal-eyebrow">这一刻的配乐</span><h2>{song.title}</h2><small>{song.artist} · {song.recording_label}</small></div></div>;
}

export function SongPage() {
  const { songId } = useParams();
  const [params,setParams] = useSearchParams();
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
    <div className="song-journal-title"><h1>{song.title}</h1><p>{song.artist}</p><span className="journal-eyebrow">{song.recording_label}</span></div>
    <AudioPlayer song={song} full anchor={safePosition} end={safeEnd} onMark={ms=>mark(ms)}/>
    {safePosition !== null && <p className="anchor-notice" role="status">已选中 {formatPosition(safePosition)}，这段音乐会和文字一起保存。</p>}
    <div className="song-community-actions"><button type="button" onClick={()=>{const target=document.getElementById('song-conversation');target?.focus({preventScroll:true});target?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}><ChatCircle size={23}/>听友共鸣</button><Link to={`/discover?song=${song.id}`}><Cards size={23}/>音乐卡片</Link><Link to={`/songs/${song.id}/write?${capture}`}><Plus size={23}/>{safePosition===null?'留下一刻':`留下 ${formatPosition(safePosition)}`}</Link></div>
    <LyricPicker song={song} selected={lyricId} onSelect={(id,ms)=>mark(ms,id)}/>
    <PhotoCredit url={songCover(song)}/>

    {user && <SongMemories songId={song.id} />}
    <div id="song-conversation" tabIndex={-1}><PublicStoryList path={`/api/stories?song_id=${song.id}${lyricId?`&lyric_id=${encodeURIComponent(lyricId)}`:''}`} heading={lyricId?'同一句词，不同的人生':'听友留下的音乐故事'}/></div>
  </section>;
}

function SongMemories({ songId }: { songId: number }) {
  const { value, error } = useData<Memory[]>(`/api/memories?song_id=${songId}`);
  return <section className="song-memory-section"><h2>这首歌里的我</h2>{error ? <p role="alert">{error}</p> : !value ? <p role="status">正在翻找…</p> : value.length ? <>{value.map(card => <MemoryEntry key={card.id} memory={card}/>)}</> : <p className="page-intro">还没有为这首歌留下记录。今天，会是第一页。</p>}</section>;
}

function MemoryEntry({ memory, evidence, matchLabel }: { memory: Memory; evidence?: string; matchLabel?: string }) {
  return <Link className="memory-entry memory-snapshot" to={`/memories/${memory.id}`}>
    <span className="snapshot-date">{[memory.life_year,memory.life_time].filter(Boolean).join(' · ')||`记录于 ${dayLabel(memory.created_at)}`}</span>
    <div className="snapshot-image"><img src={cardCover(memory)} alt={memory.photo_url?'记忆里的照片':'歌曲配图'} loading="lazy"/>{cardPhotos(memory).length>1&&<span className="photo-count">{cardPhotos(memory).length} 张</span>}</div>
    <div className="snapshot-copy">{matchLabel&&<span className="match-label">{matchLabel}</span>}{memory.title&&<h3>{memory.title}</h3>}<p>{evidence||memory.story}</p><strong>{memory.song.title}</strong><small>{memory.song.artist}</small><span className="snapshot-status">{memory.is_demo_sample?'虚构样例 · ':''}{memory.publication?.published?'已公开':'仅自己'}</span></div>
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
  const songId=params.get('song')??'',view=params.get('view')==='cards'?'cards':'timeline';
  function setSongId(value:string){const next=new URLSearchParams(params);if(value)next.set('song',value);else next.delete('song');setParams(next,{replace:true});}
  function setView(value:string){const next=new URLSearchParams(params);if(value==='cards')next.set('view',value);else next.delete('view');setParams(next,{replace:true});}
  const songs=memories?[...new Map(memories.map(card=>[card.song_id,card.song])).values()]:[];
  const visible=memories?.filter(card=>!songId||card.song_id===Number(songId))??[];
  return <section className="journal-page collection-page">
    <div className="journal-title-row"><div><span className="journal-eyebrow">追过的现场，留住的喜欢</span><h1>我的音乐记忆</h1></div><Link className="round-action" to="/?choose=1" aria-label="选择歌曲留下一刻"><Plus size={24}/></Link></div>
    <SampleNotice compact/>
    <div className="collection-tools"><Link className="memory-playlist-link" to="/playlists">我的现场歌单 ↗</Link><label className="song-filter"><span className="sr-only">按歌曲筛选</span><select value={songId} onChange={event=>setSongId(event.target.value)}><option value="">所有歌曲</option>{songs.map(song=><option key={song.id} value={song.id}>{song.title}</option>)}</select></label></div>
    {!memories?<LoadingError error={error} retry={()=>setRetry(value=>value+1)}/>:<section><div className="list-heading"><h2>我的人生时刻</h2><span>{visible.length} 张卡片</span></div><div className="segmented-control timeline-toggle"><button aria-pressed={view==='timeline'} onClick={()=>setView('timeline')}>人生时间轴</button><button aria-pressed={view==='cards'} onClick={()=>setView('cards')}>所有卡片</button></div>{visible.length?view==='timeline'?<div className="memory-timeline">{timelineGroups(visible).map(group=><section className="timeline-year" key={group.year??'unknown'}><h3>{group.year??'未标年份'}<span>{group.cards.length} 个时刻</span></h3><div>{group.cards.map(card=><MemoryEntry key={card.id} memory={card}/>)}</div></section>)}</div>:visible.map(card=><MemoryEntry key={card.id} memory={card}/>):<div className="empty-paper"><h3>你的第一页，留给哪首歌？</h3><p>喜欢的现场，值得被好好记住。</p><Link className="soft-button" to="/?choose=1">选一首歌</Link></div>}</section>}
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

function MemoryForm({ song, existing, initialPosition = null, initialLyric = null, initialTheme = null, initialEvent = null, initialEnd = null }: { song: Song; existing?: Memory; initialPosition?: number | null; initialLyric?:string|null;initialTheme?:string|null;initialEvent?:string|null;initialEnd?:string|null }) {
  const navigate = useNavigate();
  const location=useLocation();
  const {previous,back}=useBackNavigation(existing?`/memories/${existing.id}`:`/songs/${song.id}${location.search}`);
  const musicOptions=useRef<HTMLDetailsElement>(null),extraOptions=useRef<HTMLDetailsElement>(null);
  const live = useLivePage();
  const [story, setStory] = useState(existing?.story ?? '');
  const [title,setTitle]=useState(existing?.title??'');
  const [tagText,setTagText]=useState(existing?.tags.join('，')??'');
  const [lifeTime, setLifeTime] = useState(existing?.life_time ?? '');
  const [lifeYear,setLifeYear] = useState(existing?.life_year?.toString() ?? '');
  const initialLine = song.lyrics?.find(line=>line.id===(existing?existing.lyric_id:initialLyric));
  const [lyricId,setLyricId] = useState<string|null>(initialLine?.id ?? null);
  const [themeId,setThemeId] = useState(existing?.theme_id ?? initialTheme ?? '');
  const {value:themes,error:themeError} = useData<Theme[]>('/api/themes');
  const theme = themes?.find(item=>item.id===themeId);
  const [position, setPosition] = useState<number | null>(initialLine?.start_ms ?? (existing ? existing.offset_ms : initialPosition));
  const [timeText, setTimeText] = useState(position === null ? '' : formatPosition(position));
  const [endText,setEndText] = useState(existing?.end_ms!=null?formatPosition(existing.end_ms):initialEnd&&Number.isFinite(Number(initialEnd))?formatPosition(Number(initialEnd)):'');
  const [photos,setPhotos]=useState<Photo[]>(existing?cardPhotos(existing):[]);
  const [cover,setCover]=useState<string|null>(existing?.photo_id??null);
  const [uploading,setUploading]=useState(false);
  const [eventId,setEventId]=useState(existing?existing.event_id??null:initialEvent);
  const [error, setError] = useState('');const [busy, setBusy] = useState(false);
  const lock = useRef(false);const requestKey = useRef(crypto.randomUUID());
  async function save(event: FormEvent) {
    event.preventDefault();if (lock.current||uploading) return;
    setError('');
    let offset: number | null, end:number|null;
    try {offset = parsePosition(timeText, song.duration_ms ?? 0);end=parsePosition(endText,song.duration_ms??0,true);if(end!==null&&(offset===null||end<=offset))throw new Error('播放区间需要起点，结束时间要晚于起点。');} catch (reason) {if(musicOptions.current)musicOptions.current.open=true;setError((reason as Error).message);return;}
    if (!story.trim()) {setError('写一句想留住的线索吧。');return;}
    const tags=parseTags(tagText);if(tags.length>8||tags.some(tag=>tag.length>24)){if(extraOptions.current)extraOptions.current.open=true;setError('最多添加8个标签，每个不超过24字。');return;}
    lock.current = true;setBusy(true);
    try {
      const body = {story:story.trim(),title:title.trim()||null,tags,photo_ids:photos.map(photo=>photo.id),photo_id:cover,end_ms:end,event_id:eventId,life_time:lifeTime.trim() || null,life_year:lifeYear?Number(lifeYear):null,lyric_id:lyricId,theme_id:theme?.id??null,life_precision: existing && lifeTime === (existing.life_time ?? '') ? existing.life_precision : 'unknown',offset_ms:offset,...(existing ? {revision:existing.revision} : {song_id:song.id,request_key:requestKey.current})};
      const saved = await apiRequest<Memory>(apiBaseUrl, existing ? `/api/memories/${existing.id}` : '/api/memories', {method:existing ? 'PATCH' : 'POST',body:JSON.stringify(body)});
      if (!live.current) return;
      if(existing&&previous?.url.split('?')[0]===`/memories/${saved.id}`)back();
      else navigate(`/memories/${saved.id}`, {replace:true,state:{saved:true}});
    } catch (reason) {setError(reason instanceof Error ? reason.message : '没有保存成功，请重试。');}
    finally {lock.current = false;setBusy(false);}
  }
  return <section className="journal-page memory-composer">
    <header className="composer-heading"><BackLink fallback={existing?`/memories/${existing.id}`:`/songs/${song.id}${location.search}`}/><h1>{existing?'整理这一刻':'留下一刻'}</h1><span>仅自己可见</span></header>
    <SampleNotice compact/>
    <form className="memory-form composer-paper" onSubmit={save} onInvalidCapture={event=>{const details=(event.target as HTMLElement).closest('details');if(details)details.open=true;}}>
      <fieldset className="memory-form form-fields" disabled={busy}>
      <label className="composer-title" htmlFor="memory-title"><span className="sr-only">标题（选填）</span><input id="memory-title" value={title} maxLength={80} onChange={event=>setTitle(event.target.value)} placeholder="给这一刻起个名字（选填）"/></label>
      <label className="composer-story" htmlFor="memory-story"><span className="sr-only">听到这里，你想起了什么？</span><textarea id="memory-story" value={story} onChange={e => setStory(e.target.value)} maxLength={500} rows={5} required placeholder="听到这里，你想起了什么？&#10;一句心事，或一个难忘的瞬间。"/></label><span className="character-count">{story.length} / 500</span>
      <GalleryPicker photos={photos} cover={cover} onChange={setPhotos} onCover={setCover} onBusyChange={setUploading} disabled={busy||uploading} compact/>
      <details ref={musicOptions} className="composer-options composer-music"><summary><img src={songCover(song)} alt=""/><span><strong>{song.title}</strong><small>{song.artist} · {timeText?`${lyricId?'所选词句 · ':''}${timeText}${endText?`—${endText}`:' 起'}`:'整首歌'}</small></span><span className="composer-disclosure">调整配乐</span></summary><div className="composer-options-body">
      <AudioPlayer song={song} anchor={position} onMark={busy ? undefined : ms => {setPosition(ms);setTimeText(formatPosition(ms));setLyricId(null);}}/><LyricPicker song={song} selected={lyricId} disabled={busy} onSelect={(id,ms)=>{setLyricId(id);setPosition(ms);setTimeText(formatPosition(ms));}}/>
      <div className="music-range"><div className="range-title"><strong>想留下哪一段？</strong><button className="text-button" type="button" onClick={()=>{setPosition(null);setTimeText('');setEndText('');setLyricId(null);}}>用整首歌</button></div><div className="range-inputs"><label>起点<input aria-label="音乐里的位置" value={timeText} onChange={e=>{setTimeText(e.target.value);setLyricId(null);}} placeholder="00:00" disabled={!song.audio_available}/></label><span aria-hidden="true">—</span><label>终点<input aria-label="播放区间终点" value={endText} onChange={e=>setEndText(e.target.value)} placeholder={formatPosition(song.duration_ms)} disabled={!song.audio_available}/></label></div><small>{lyricId?'起点已关联所选词句。':'可以只留一句词的位置。'}填写起止时间后，翻卡只播放这一段；未填写终点时播放整首。</small></div>
      </div></details>
      {themeError&&themeId&&<p className="form-error" role="alert">关联主题暂时无法加载，请展开“补充细节”重选主题，或刷新后再试。</p>}
      <details ref={extraOptions} className="composer-options composer-extra"><summary><span><strong>补充细节</strong><small>{[lifeYear,lifeTime,tagText?'已添加标签':'',theme?.title,eventId?'已关联现场':''].filter(Boolean).join(' · ')||'时间、标签、主题 · 选填'}</small></span><span className="composer-disclosure">展开</span></summary><div className="composer-options-body">
      <div className="composer-date"><label>年份 <small>用于时间轴</small><input aria-label="人生里的年份" type="number" min="1900" max={new Date().getFullYear()} step="1" value={lifeYear} onChange={e=>setLifeYear(e.target.value)} placeholder="比如 2022"/></label>
      <label>那是什么时候？ <small>选填，记不清也没关系</small><input value={lifeTime} onChange={e => setLifeTime(e.target.value)} maxLength={80} placeholder="毕业那年、去年夏天，或者今天"/></label>
      </div><label htmlFor="memory-tags">标签 <small>用逗号分开，最多8个</small><input id="memory-tags" value={tagText} onChange={event=>setTagText(event.target.value)} maxLength={220} placeholder="#演唱会，#散场，#跨城追星"/></label>
      <label>从哪个主题开始？ <small>选填</small><select value={themeId} onChange={e=>setThemeId(e.target.value)}><option value="">只记录自己的这一刻</option>{themes?.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{themeError&&<p className="form-error" role="alert">主题暂时无法加载，请稍后重新打开。</p>}
      {theme&&<p className="composer-theme-prompt">{theme.prompt}</p>}
      {eventId&&<div><EventNote id={eventId}/><button className="text-button" type="button" disabled={busy} onClick={()=>setEventId(null)}>不关联这场现场</button></div>}
      </div></details>
      {existing?.publication?.published&&<p className="sample-notice">修改原文或坐标后，会先撤回旧的公开片段。保存后可重新预览并分享。</p>}
      {error && <p className="form-error" role="alert">{error}<Link to={existing ? `/memories/${existing.id}` : '/memories'}>{existing ? '重新打开这段记忆' : '去我的记忆确认'}</Link></p>}
      <div className="composer-save"><p className="privacy-line">先留给自己，分享由你决定。</p><button className="primary-button" disabled={busy || uploading || !story.trim() || (!!themeId&&!theme)}>{busy ? '正在收好…' : uploading?'正在收好照片…':existing ? '保存修改' : '保存这一刻'}</button></div>
      </fieldset>
    </form>
  </section>;
}

export function MemoryDetailPage({ edit = false }: { edit?: boolean }) {
  const { user } = useSession();return user ? <DetailContent edit={edit}/> : <LoginGate/>;
}

function DetailContent({ edit }: { edit: boolean }) {
  const { memoryId } = useParams();const navigate = useNavigate();const location = useLocation();
  const live = useLivePage();
  const { user } = useSession();const [version, setVersion] = useState(0);
  const { value: card, error } = useData<Memory>(`/api/memories/${memoryId}`, version);
  const [busy, setBusy] = useState(false);const lock = useRef(false);
  const [actionError, setActionError] = useState('');const [confirmDelete, setConfirmDelete] = useState(false);
  if (!card) return <LoadingError error={error} retry={() => setVersion(x => x + 1)}/>;
  if (card.owner_id !== user?.id) return <LoadingError error="这不是当前账号的私人记忆。"/>;
  if (edit) return <MemoryForm key={card.id + ':' + card.revision} song={card.song} existing={card}/>;
  async function remove() {
    if (!card || lock.current) return;lock.current=true;setBusy(true);setActionError('');
    try {await apiRequest(apiBaseUrl, `/api/memories/${card.id}?revision=${card.revision}`, {method:'DELETE'});if (live.current) navigate('/memories',{replace:true});}
    catch (reason) {setActionError(reason instanceof Error ? reason.message : '删除没有成功。');setConfirmDelete(false);}
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="journal-page memory-detail">
    <BackLink fallback="/memories"/>
    {location.state?.saved && <p className="saved-notice" role="status">这一刻，已经好好收下了。</p>}
    <span className="journal-eyebrow">{card.is_demo_sample ? '样例记忆' : '我的音乐记忆'}</span><h1>{card.title||card.life_time || '那个有音乐的时刻'}</h1>
    <article className={`keepsake-paper${card.photo_url?' has-photo':''}`}>
      <span className="paper-date">{[card.life_year,card.life_time].filter(Boolean).join(' · ')||`记录于 ${dayLabel(card.created_at)}`}</span><p className="original-story">{card.story}</p><PhotoGallery photos={cardPhotos(card)} fallback={songCover(card.song)}/><TagLinks tags={card.tags}/>{card.offset_ms!==null&&<span className="paper-caption">我最喜欢的片段 · {formatPosition(card.offset_ms)}{card.end_ms!=null?` — ${formatPosition(card.end_ms)}`:''}</span>}
      <PublicationPanel key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
    </article>
    {card.event_id&&<EventNote id={card.event_id}/>}
    {card.lyric&&<blockquote className="lyric-quote">“{card.lyric.text}”<small>原创示例词句</small></blockquote>}
    <SongHeading song={card.song}/><AudioPlayer song={card.song} anchor={card.offset_ms} end={card.end_ms}/>
    <div className="inline-actions detail-actions"><Link className="text-button" to={`/memories/${card.id}/edit`}>整理这段记忆</Link><Link className="text-button" to={`/songs/${card.song_id}`}>这首歌里的其他时刻 →</Link></div>
    <QuickReflection key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
    {actionError && <div className="form-error" role="alert">{actionError}<button className="text-button" onClick={() => setVersion(x=>x+1)}>重新加载</button></div>}
    {confirmDelete ? <div className="delete-confirm" role="alert"><p>要删除这一刻吗？原文和补充都会移除，之后无法恢复。</p><div className="inline-actions"><button className="soft-button" disabled={busy} onClick={() => setConfirmDelete(false)}>还是留着</button><button className="danger-button" disabled={busy} onClick={() => void remove()}>确认删除</button></div></div> : <button className="text-button delete-trigger" onClick={() => setConfirmDelete(true)}>删除这段记忆</button>}
  </section>;
}
