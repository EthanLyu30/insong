import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiBaseUrl, type Song } from './api';
import { AudioPlayer } from './AudioPlayer';
import { apiRequest, dayLabel, formatPosition, parsePosition, timelineGroups, type Memory, type SearchResult, type Theme, type Photo } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';
import { useData } from './useData';
import { LyricPicker } from './LyricPicker';
import { PublicStoryList } from './PublicPages';
import { PublicationPanel } from './PublicationPanel';
import { PhotoPicker } from './PhotoPicker';
import { QuickReflection } from './QuickReflection';
import { EventNote } from './EventNote';

export function LoginGate() {
  const location = useLocation();
  return <section className="journal-page empty-journal"><span className="journal-eyebrow">我的音乐记忆</span><h1>留给自己的，<br/>慢慢听。</h1><p>登录后，一句心事、一段旋律，都会好好留在你的空间里。</p><Link className="primary-button" to={`/account?next=${encodeURIComponent(location.pathname + location.search)}`}>打开我的私人空间</Link><Link className="text-button" to="/">先选一首歌</Link></section>;
}

function SampleNotice() {
  const { user } = useSession();
  return user?.is_demo ? <aside className="sample-notice">你正在使用共享样例账号，请只填写虚构内容。<Link to="/account">创建个人账号 →</Link></aside> : null;
}

function LoadingError({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <div className="status-card error-card" role="alert">{error}{retry && <button onClick={retry}>重新加载</button>}<Link to="/memories">回到我的记忆</Link></div> : <div className="status-card" role="status">正在翻开这一页…</div>;
}

function SongHeading({ song }: { song: Song }) {
  return <div className="record-heading"><img src={`/covers/song-${song.id}.png`} alt=""/><div><span className="journal-eyebrow">这一刻的配乐</span><h2>{song.title}</h2><small>{song.artist} · {song.recording_label}</small></div></div>;
}

export function SongPage() {
  const { songId } = useParams();
  const [params] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const { value: song, error } = useData<Song>(`/api/songs/${songId}`, retry);
  const [position, setPosition] = useState<number | null>(null);
  const [lyricId, setLyricId] = useState<string|null>(null);
  const { user } = useSession();
  if (!song) return <LoadingError error={error} retry={() => setRetry(x => x + 1)} />;
  const capture = new URLSearchParams(); for(const key of ['theme','event'])if(params.get(key))capture.set(key,params.get(key)!);if(position!==null)capture.set('at',String(position));if(lyricId)capture.set('lyric',lyricId);
  return <section className="journal-page song-journal">
    <Link className="back-link" to="/">← 回到音乐里</Link>
    {params.get('event')&&<EventNote id={params.get('event')!}/>}
    <div className="song-artwork"><img src={`/covers/song-${song.id}.png`} alt={`《${song.title}》原创画面`}/><span>给生活留一段配乐</span></div>
    <div className="song-journal-title"><span className="journal-eyebrow">{song.recording_label}</span><h1>{song.title}</h1><p>此刻的你，想起了什么？</p></div>
    <AudioPlayer song={song} anchor={position} onMark={ms=>{setPosition(ms);setLyricId(null);}}/>
    <LyricPicker song={song} selected={lyricId} onSelect={(id,ms)=>{setLyricId(id);setPosition(ms);}}/>
    {position !== null && <p className="anchor-notice" role="status">已选中 {formatPosition(position)}，这段音乐会和文字一起保存。</p>}
    <Link className="primary-button" to={`/songs/${song.id}/write?${capture}`}>{lyricId ? '把我的经历，留在这一句' : position === null ? '留下一刻' : `把 ${formatPosition(position)} 留下来`} <span aria-hidden="true">↗</span></Link>
    <p className="quiet-caption">一句就好。先为自己收好。</p>
    {user && <SongMemories songId={song.id} />}
    <PublicStoryList path={`/api/stories?song_id=${song.id}${lyricId?`&lyric_id=${encodeURIComponent(lyricId)}`:''}`} heading={lyricId?'同一句词，不同的人生':'这首歌里的其他人'}/>
  </section>;
}

function SongMemories({ songId }: { songId: number }) {
  const { value, error } = useData<Memory[]>(`/api/memories?song_id=${songId}`);
  return <section className="song-memory-section"><h2>这首歌里的我</h2>{error ? <p role="alert">{error}</p> : !value ? <p role="status">正在翻找…</p> : value.length ? <><p className="page-intro">不同的日子，都可以在这里留下。</p>{value.map(card => <MemoryEntry key={card.id} memory={card}/>)}</> : <p className="page-intro">还没有为这首歌留下记录。今天，会是第一页。</p>}</section>;
}

function MemoryEntry({ memory, evidence, matchLabel }: { memory: Memory; evidence?: string; matchLabel?: string }) {
  return <Link className="memory-entry memory-snapshot" to={`/memories/${memory.id}`}>
    <div className="snapshot-image"><img src={memory.photo_url?apiBaseUrl+memory.photo_url:`/covers/song-${memory.song_id}.png`} alt={memory.photo_url?'记忆里的照片':'歌曲封面'} loading="lazy"/></div>
    <div className="snapshot-copy"><span className="snapshot-date">{memory.life_time||'某个有音乐的日子'}</span>{matchLabel&&<span className="match-label">{matchLabel}</span>}<p>{evidence||memory.story}</p><strong>♫ {memory.song.title}</strong><small>{memory.song.artist}</small><span className="snapshot-status">{memory.is_demo_sample?'虚构样例 · ':''}{memory.publication?.published?'已公开':'仅自己'}</span></div>
  </Link>;
}

export function MemoryCollection() {
  const { user } = useSession();
  return user ? <CollectionContent/> : <LoginGate/>;
}

function CollectionContent() {
  const [retry, setRetry] = useState(0);
  const { value: memories, error } = useData<Memory[]>('/api/memories', retry);
  const [query, setQuery] = useState(''); const [mode, setMode] = useState<'semantic' | 'keyword'>('semantic');
  const [songId, setSongId] = useState(''); const [result, setResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState(''); const [busy, setBusy] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [view,setView] = useState<'timeline'|'cards'>('timeline');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function reset() { request.current?.abort();setResult(null);setSearchError('');setBusy(false); }
  async function search(event: FormEvent) {
    event.preventDefault(); if (!query.trim()) {reset();return;}
    request.current?.abort(); const control = new AbortController(); request.current = control;
    setBusy(true);setSearchError('');setResult(null);setSearchedQuery(query.trim());
    try {
      const value = await apiRequest<SearchResult>(apiBaseUrl, '/api/memories/search', {method:'POST', signal:control.signal, body:JSON.stringify({query,mode,...(songId ? {song_id:Number(songId)} : {})})});
      if (!control.signal.aborted) setResult(value);
    } catch (reason) {if (!control.signal.aborted) setSearchError(reason instanceof Error ? reason.message : '查找失败。');}
    finally {if (!control.signal.aborted) setBusy(false);}
  }
  const songs = memories ? [...new Map(memories.map(card => [card.song_id, card.song])).values()] : [];
  const visible = memories?.filter(card => !songId || card.song_id === Number(songId)) ?? [];
  return <section className="journal-page collection-page">
    <div className="journal-title-row"><div><span className="journal-eyebrow">一首歌 一页生活</span><h1>我的音乐记忆</h1></div><Link className="round-action" to="/" aria-label="选择歌曲留下一刻">＋</Link></div>
    <p className="page-intro">同一首歌，经过不同年份的你。把生活按自己的时间慢慢翻开。</p><SampleNotice/>
    <Link className="memory-playlist-link" to="/playlists">我的现场歌单 ↗</Link>
    <form className="recall-form" onSubmit={search}>
      <label htmlFor="memory-query">还记得那时发生了什么？</label>
      <div className="recall-input"><input id="memory-query" value={query} maxLength={200} onChange={e => {setQuery(e.target.value);reset();}} placeholder="比如：离开校园的那个晚上"/><button disabled={busy || !query.trim()} aria-label="找回这段记忆">{busy ? '…' : '找回'}</button></div>
      <div className="recall-tools"><div className="segmented-control small"><button type="button" aria-pressed={mode === 'semantic'} onClick={() => {setMode('semantic');reset();}}>经历线索</button><button type="button" aria-pressed={mode === 'keyword'} onClick={() => {setMode('keyword');reset();}}>关键词</button></div><label className="song-filter"><span className="sr-only">按歌曲筛选</span><select value={songId} onChange={e => {setSongId(e.target.value);reset();}}><option value="">所有歌曲</option>{songs.map(song => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label></div>
      <p className="resource-note">只查找你自己的记录。经历线索由本站本地模型处理，返回你的原文。</p>
    </form>
    {busy && <p className="inline-status" role="status">正在沿着这条线索翻找…</p>}
    {searchError && <p className="form-error" role="alert">{searchError}</p>}
    {!memories && <LoadingError error={error} retry={() => setRetry(x => x + 1)}/>}
    {result ? <section aria-live="polite"><div className="list-heading"><h2>关于“{searchedQuery}”</h2><button className="text-button" onClick={() => {setQuery('');reset();}}>回看全部</button></div><p className="resource-note">{result.notice || (result.mode === 'semantic' ? '这些原文可能和线索有关，由你确认。' : '正在按关键词查找原文与记录信息。')}</p>{result.items.length ? result.items.map(item => <MemoryEntry key={item.memory.id} memory={item.memory} evidence={item.evidence} matchLabel={item.match_label}/>) : <div className="empty-paper"><h3>这条线索，还没有找到。</h3><p>试试一个人物、地点或当时发生的事，也可以切换关键词，慢慢翻看。</p></div>}</section> : memories && !busy && <section><div className="list-heading"><h2>我的人生时刻</h2><span>{visible.length} 段记忆</span></div><div className="segmented-control timeline-toggle"><button aria-pressed={view==='timeline'} onClick={()=>setView('timeline')}>人生时间轴</button><button aria-pressed={view==='cards'} onClick={()=>setView('cards')}>所有卡片</button></div>{visible.length ? view==='timeline'?<div className="memory-timeline"><p className="resource-note">按你填写的人生年份排列；同年按记录时间排列。记不清年份的，也会好好留着。</p>{timelineGroups(visible).map(group=><section className="timeline-year" key={group.year??'unknown'}><h3>{group.year??'未标年份'}<span>{group.cards.length} 个时刻</span></h3><div>{group.cards.map(card=><MemoryEntry key={card.id} memory={card}/>)}</div></section>)}</div>:visible.map(card => <MemoryEntry key={card.id} memory={card}/>) : <div className="empty-paper"><span aria-hidden="true">♪</span><h3>你的第一页，留给哪首歌？</h3><p>不必写成故事，一句话也能把这一刻留下。</p><Link className="soft-button" to="/">选一首歌</Link></div>}</section>}
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
  const live = useLivePage();
  const [story, setStory] = useState(existing?.story ?? '');
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
  const [photo,setPhoto]=useState<Photo|null>(existing?.photo_id&&existing.photo_url?{id:existing.photo_id,url:existing.photo_url}:null);
  const [uploading,setUploading]=useState(false);
  const [eventId,setEventId]=useState(existing?existing.event_id??null:initialEvent);
  const [error, setError] = useState('');const [busy, setBusy] = useState(false);
  const lock = useRef(false);const requestKey = useRef(crypto.randomUUID());
  async function save(event: FormEvent) {
    event.preventDefault();if (lock.current||uploading) return;
    setError('');
    let offset: number | null, end:number|null;
    try {offset = parsePosition(timeText, song.duration_ms ?? 0);end=parsePosition(endText,song.duration_ms??0,true);if(end!==null&&(offset===null||end<=offset))throw new Error('播放区间需要起点，结束时间要晚于起点。');} catch (reason) {setError((reason as Error).message);return;}
    if (!story.trim()) {setError('写一句想留住的线索吧。');return;}
    lock.current = true;setBusy(true);
    try {
      const body = {story:story.trim(),photo_id:photo?.id??null,end_ms:end,event_id:eventId,life_time:lifeTime.trim() || null,life_year:lifeYear?Number(lifeYear):null,lyric_id:lyricId,theme_id:theme?.id??null,life_precision: existing && lifeTime === (existing.life_time ?? '') ? existing.life_precision : 'unknown',offset_ms:offset,...(existing ? {revision:existing.revision} : {song_id:song.id,request_key:requestKey.current})};
      const saved = await apiRequest<Memory>(apiBaseUrl, existing ? `/api/memories/${existing.id}` : '/api/memories', {method:existing ? 'PATCH' : 'POST',body:JSON.stringify(body)});
      if (!live.current) return;
      navigate(`/memories/${saved.id}`, {replace:true,state:{saved:true}});
    } catch (reason) {setError(reason instanceof Error ? reason.message : '没有保存成功，请重试。');}
    finally {lock.current = false;setBusy(false);}
  }
  return <section className="journal-page">
    <Link className="back-link" to={existing ? `/memories/${existing.id}` : `/songs/${song.id}`}>← {existing ? '回到这段记忆' : '回到这首歌'}</Link>
    <span className="journal-eyebrow">{existing ? '整理这一页' : '先留给自己'}</span><h1>{existing ? '把记忆补完整。' : '这一刻，值得留下。'}</h1>
    <SampleNotice/><SongHeading song={song}/>
    {eventId&&<div><EventNote id={eventId}/><button className="text-button" type="button" disabled={busy} onClick={()=>setEventId(null)}>不关联这场现场</button></div>}
    {theme&&<aside className="theme-writing-prompt"><Link to={`/themes/${theme.id}`}>{theme.title} ↗</Link><p>{theme.prompt}</p></aside>}
    <details className="capture-music-tools"><summary>{lyricId?`已选词句 · ${formatPosition(position)}`:'试听配乐 / 选一句词'} <span>展开 ⌄</span></summary><AudioPlayer song={song} anchor={position} onMark={busy ? undefined : ms => {setPosition(ms);setTimeText(formatPosition(ms));setLyricId(null);}}/><LyricPicker song={song} selected={lyricId} disabled={busy} onSelect={(id,ms)=>{setLyricId(id);setPosition(ms);setTimeText(formatPosition(ms));}}/></details>
    <form className="memory-form paper-panel" onSubmit={save}>
      <fieldset className="memory-form form-fields" disabled={busy}>
      <PhotoPicker value={photo} onChange={setPhoto} onBusyChange={setUploading} disabled={busy}/>
      <label htmlFor="memory-story">听到这里，你想起了什么？<textarea id="memory-story" value={story} onChange={e => setStory(e.target.value)} maxLength={500} rows={5} required placeholder="比如：散场后，和朋友在路边坐到很晚。"/></label><span className="character-count">一句就好 · {story.length}/500</span>
      <div className="music-range"><div className="range-title"><strong>想留下哪一段？</strong><button className="text-button" type="button" onClick={()=>{setPosition(null);setTimeText('');setEndText('');setLyricId(null);}}>用整首歌</button></div><div className="range-inputs"><label>起点<input aria-label="音乐里的位置" value={timeText} onChange={e=>{setTimeText(e.target.value);setLyricId(null);}} placeholder="00:00" disabled={!song.audio_available}/></label><span aria-hidden="true">—</span><label>终点<input aria-label="播放区间终点" value={endText} onChange={e=>setEndText(e.target.value)} placeholder={formatPosition(song.duration_ms)} disabled={!song.audio_available}/></label></div><small>{lyricId?'起点已关联所选词句。':'可以只留一句词的位置。'}填写起止时间后，翻卡只播放这一段；未填写终点时播放整首。</small></div>
      <label>人生里的年份 <small>选填，用于时间轴</small><input aria-label="人生里的年份" type="number" min="1900" max={new Date().getFullYear()} step="1" value={lifeYear} onChange={e=>setLifeYear(e.target.value)} placeholder="比如 2022"/></label>
      <label>那是什么时候？ <small>选填，记不清也没关系</small><input value={lifeTime} onChange={e => setLifeTime(e.target.value)} maxLength={80} placeholder="毕业那年、去年夏天，或者今天"/></label>
      <label>从哪个主题开始？ <small>选填</small><select value={themeId} onChange={e=>setThemeId(e.target.value)}><option value="">只记录自己的这一刻</option>{themes?.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{themeError&&<p className="form-error" role="alert">主题暂时无法加载，请稍后重新打开。</p>}
      <p className="privacy-line">默认仅自己可见 · 保存后可以挑一段原文，自愿分享</p>
      {existing?.publication?.published&&<p className="sample-notice">修改原文或坐标后，会先撤回旧的公开片段。保存后可重新预览并分享。</p>}
      {error && <p className="form-error" role="alert">{error}<Link to={existing ? `/memories/${existing.id}` : '/memories'}>{existing ? '重新打开这段记忆' : '去我的记忆确认'}</Link></p>}
      <button className="primary-button" disabled={busy || uploading || !story.trim() || (!!themeId&&!theme)}>{busy ? '正在收好…' : uploading?'正在收好照片…':existing ? '保存修改' : '只为我保存这一刻'}</button>
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
    <Link className="back-link" to="/memories">← 回到我的记忆</Link>
    {location.state?.saved && <p className="saved-notice" role="status">这一刻，已经好好收下了。</p>}
    <SampleNotice/><span className="journal-eyebrow">{card.is_demo_sample ? '样例记忆' : '我的音乐记忆'}{card.life_year?` · ${card.life_year}`:''}</span><h1>{card.life_time || '那个有音乐的时刻'}</h1>
    <article className={`keepsake-paper${card.photo_url?' has-photo':''}`}>
      {card.photo_url&&<img className="keepsake-photo" src={apiBaseUrl+card.photo_url} alt="我留在这一刻的照片"/>}
      <span className="paper-date">当时的我 · 记录于 {dayLabel(card.created_at)}</span><p className="original-story">{card.story}</p><span className="paper-caption">{card.offset_ms === null ? '这首歌，陪我经过。' : `这一页，留在音乐的 ${formatPosition(card.offset_ms)}${card.end_ms!=null?` — ${formatPosition(card.end_ms)}`:''}。`}</span>
      <PublicationPanel key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
    </article>
    {card.event_id&&<EventNote id={card.event_id}/>}
    {card.lyric&&<blockquote className="lyric-quote">“{card.lyric.text}”<small>原创示例词句 · 歌曲里的这一刻</small></blockquote>}
    <SongHeading song={card.song}/><AudioPlayer song={card.song} anchor={card.offset_ms} end={card.end_ms}/>
    <div className="inline-actions detail-actions"><Link className="text-button" to={`/memories/${card.id}/edit`}>整理这段记忆</Link><Link className="text-button" to={`/songs/${card.song_id}`}>这首歌里的其他时刻 →</Link></div>
    <QuickReflection key={card.id+':'+card.revision} card={card} onChange={()=>setVersion(v=>v+1)}/>
    {actionError && <div className="form-error" role="alert">{actionError}<button className="text-button" onClick={() => setVersion(x=>x+1)}>重新加载</button></div>}
    {confirmDelete ? <div className="delete-confirm" role="alert"><p>要删除这一刻吗？原文和补充都会移除，之后无法恢复。</p><div className="inline-actions"><button className="soft-button" disabled={busy} onClick={() => setConfirmDelete(false)}>还是留着</button><button className="danger-button" disabled={busy} onClick={() => void remove()}>确认删除</button></div></div> : <button className="text-button delete-trigger" onClick={() => setConfirmDelete(true)}>删除这段记忆</button>}
  </section>;
}
