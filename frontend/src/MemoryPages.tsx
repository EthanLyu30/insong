import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiBaseUrl, type Song } from './api';
import { AudioPlayer } from './AudioPlayer';
import { apiRequest, dayLabel, formatPosition, parsePosition, type Memory, type SearchResult } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';

function useData<T>(path: string, version = 0) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const control = new AbortController(); setValue(null); setError('');
    apiRequest<T>(apiBaseUrl, path, {signal:control.signal}).then(data => {if (!control.signal.aborted) setValue(data);})
      .catch(reason => {if (!control.signal.aborted) setError(reason instanceof Error ? reason.message : '加载失败，请重试。');});
    return () => control.abort();
  }, [path, version]);
  return { value, error };
}

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
  return <div className="record-heading"><img src={`/covers/song-${song.id}.png`} alt=""/><div><span className="journal-eyebrow">这一刻的配乐</span><h2>{song.title}</h2><small>{song.recording_label}</small></div></div>;
}

export function SongPage() {
  const { songId } = useParams();
  const [retry, setRetry] = useState(0);
  const { value: song, error } = useData<Song>(`/api/songs/${songId}`, retry);
  const [position, setPosition] = useState<number | null>(null);
  const { user } = useSession();
  if (!song) return <LoadingError error={error} retry={() => setRetry(x => x + 1)} />;
  return <section className="journal-page song-journal">
    <Link className="back-link" to="/">← 回到音乐里</Link>
    <div className="song-artwork"><img src={`/covers/song-${song.id}.png`} alt={`《${song.title}》原创画面`}/><span>给生活留一段配乐</span></div>
    <div className="song-journal-title"><span className="journal-eyebrow">{song.recording_label}</span><h1>{song.title}</h1><p>此刻的你，想起了什么？</p></div>
    <AudioPlayer song={song} onMark={setPosition}/>
    {position !== null && <p className="anchor-notice" role="status">已选中 {formatPosition(position)}，这段音乐会和文字一起保存。</p>}
    <Link className="primary-button" to={`/songs/${song.id}/write${position !== null ? `?at=${position}` : ''}`}>{position === null ? '留下一刻' : `把 ${formatPosition(position)} 留下来`} <span aria-hidden="true">↗</span></Link>
    <p className="quiet-caption">一句就好。先为自己收好。</p>
    {user && <SongMemories songId={song.id} />}
  </section>;
}

function SongMemories({ songId }: { songId: number }) {
  const { value, error } = useData<Memory[]>(`/api/memories?song_id=${songId}`);
  return <section className="song-memory-section"><h2>这首歌里的我</h2>{error ? <p role="alert">{error}</p> : !value ? <p role="status">正在翻找…</p> : value.length ? <><p className="page-intro">不同的日子，都可以在这里留下。</p>{value.map(card => <MemoryEntry key={card.id} memory={card}/>)}</> : <p className="page-intro">还没有为这首歌留下记录。今天，会是第一页。</p>}</section>;
}

function MemoryEntry({ memory, evidence, matchLabel }: { memory: Memory; evidence?: string; matchLabel?: string }) {
  return <Link className="memory-entry" to={`/memories/${memory.id}`}>
    <div className="memory-entry-top"><span>{memory.life_time || '一个未标日期的时刻'}</span><small>{memory.is_demo_sample ? '样例' : '仅自己可见'}</small></div>
    {matchLabel && <span className="match-label">{matchLabel} · 请确认是不是这一刻</span>}
    <p>{evidence || memory.story}</p>
    <div className="memory-entry-song"><img src={`/covers/song-${memory.song_id}.png`} alt=""/><span><strong>{memory.song.title}</strong><small>{memory.offset_ms === null ? '未标记具体片段' : `留在 ${formatPosition(memory.offset_ms)}`}</small></span><span className="entry-arrow" aria-hidden="true">↗</span></div>
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
  return <section className="journal-page">
    <div className="journal-title-row"><div><span className="journal-eyebrow">一首歌 一页生活</span><h1>我的音乐记忆</h1></div><Link className="round-action" to="/" aria-label="选择歌曲留下一刻">＋</Link></div>
    <p className="page-intro">找回一段旋律，也找回当时的自己。</p><SampleNotice/>
    <form className="recall-form" onSubmit={search}>
      <label htmlFor="memory-query">还记得那时发生了什么？</label>
      <div className="recall-input"><input id="memory-query" value={query} maxLength={200} onChange={e => {setQuery(e.target.value);reset();}} placeholder="比如：离开校园的那个晚上"/><button disabled={busy || !query.trim()} aria-label="找回这段记忆">{busy ? '…' : '找回'}</button></div>
      <div className="recall-tools"><div className="segmented-control small"><button type="button" aria-pressed={mode === 'semantic'} onClick={() => {setMode('semantic');reset();}}>经历线索</button><button type="button" aria-pressed={mode === 'keyword'} onClick={() => {setMode('keyword');reset();}}>关键词</button></div><label className="song-filter"><span className="sr-only">按歌曲筛选</span><select value={songId} onChange={e => {setSongId(e.target.value);reset();}}><option value="">所有歌曲</option>{songs.map(song => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label></div>
      <p className="resource-note">只查找你自己的记录。经历线索由本站本地模型处理，返回你的原文。</p>
    </form>
    {busy && <p className="inline-status" role="status">正在沿着这条线索翻找…</p>}
    {searchError && <p className="form-error" role="alert">{searchError}</p>}
    {!memories && <LoadingError error={error} retry={() => setRetry(x => x + 1)}/>}
    {result ? <section aria-live="polite"><div className="list-heading"><h2>关于“{searchedQuery}”</h2><button className="text-button" onClick={() => {setQuery('');reset();}}>回看全部</button></div><p className="resource-note">{result.notice || (result.mode === 'semantic' ? '这些原文可能和线索有关，由你确认。' : '正在按关键词查找原文与记录信息。')}</p>{result.items.length ? result.items.map(item => <MemoryEntry key={item.memory.id} memory={item.memory} evidence={item.evidence} matchLabel={item.match_label}/>) : <div className="empty-paper"><h3>这条线索，还没有找到。</h3><p>试试一个人物、地点或当时发生的事，也可以切换关键词，慢慢翻看。</p></div>}</section> : memories && !busy && <section><div className="list-heading"><h2>收好的时刻</h2><span>{visible.length} 段记忆</span></div>{visible.length ? visible.map(card => <MemoryEntry key={card.id} memory={card}/>) : <div className="empty-paper"><span aria-hidden="true">♪</span><h3>你的第一页，留给哪首歌？</h3><p>不必写成故事，一句话也能把这一刻留下。</p><Link className="soft-button" to="/">选一首歌</Link></div>}</section>}
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
  return <MemoryForm key={song.id} song={song} initialPosition={at !== null && Number.isFinite(at) && at >= 0 && at < (song.duration_ms ?? 0) ? at : null}/>;
}

function MemoryForm({ song, existing, initialPosition = null }: { song: Song; existing?: Memory; initialPosition?: number | null }) {
  const navigate = useNavigate();
  const live = useLivePage();
  const [story, setStory] = useState(existing?.story ?? '');
  const [lifeTime, setLifeTime] = useState(existing?.life_time ?? '');
  const [position, setPosition] = useState<number | null>(existing ? existing.offset_ms : initialPosition);
  const [timeText, setTimeText] = useState(position === null ? '' : formatPosition(position));
  const [error, setError] = useState('');const [busy, setBusy] = useState(false);
  const lock = useRef(false);const requestKey = useRef(crypto.randomUUID());
  async function save(event: FormEvent) {
    event.preventDefault();if (lock.current) return;
    setError('');
    let offset: number | null;
    try {offset = parsePosition(timeText, song.duration_ms ?? 0);} catch (reason) {setError((reason as Error).message);return;}
    if (!story.trim()) {setError('写一句想留住的线索吧。');return;}
    lock.current = true;setBusy(true);
    try {
      const body = {story:story.trim(),life_time:lifeTime.trim() || null,life_precision: existing && lifeTime === (existing.life_time ?? '') ? existing.life_precision : 'unknown',offset_ms:offset,...(existing ? {revision:existing.revision} : {song_id:song.id,request_key:requestKey.current})};
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
    <AudioPlayer song={song} anchor={position} onMark={busy ? undefined : ms => {setPosition(ms);setTimeText(formatPosition(ms));}}/>
    <form className="memory-form paper-panel" onSubmit={save}>
      <fieldset className="memory-form form-fields" disabled={busy}>
      <label htmlFor="memory-story">听到这里，你想起了什么？<textarea id="memory-story" value={story} onChange={e => setStory(e.target.value)} maxLength={500} rows={5} required placeholder="比如：散场后，和朋友在路边坐到很晚。"/></label><span className="character-count">一句就好 · {story.length}/500</span>
      <label>音乐里的位置 <small>可留空，只保存歌曲</small><div className="inline-field"><input aria-label="音乐里的位置" value={timeText} onChange={e => setTimeText(e.target.value)} placeholder="00:12" disabled={!song.audio_available} inputMode="text"/><button className="text-button" type="button" onClick={() => {setPosition(null);setTimeText('');}}>仅保存歌曲</button></div></label>
      <label>那是什么时候？ <small>选填，记不清也没关系</small><input value={lifeTime} onChange={e => setLifeTime(e.target.value)} maxLength={80} placeholder="毕业那年、去年夏天，或者今天"/></label>
      <p className="privacy-line">{existing?.visibility === 'public' ? '这是一张原有的公开样例卡。' : '仅自己可见 · 这一页先为你保管'}</p>
      {error && <p className="form-error" role="alert">{error}<Link to={existing ? `/memories/${existing.id}` : '/memories'}>{existing ? '重新打开这段记忆' : '去我的记忆确认'}</Link></p>}
      <button className="primary-button" disabled={busy || !story.trim()}>{busy ? '正在收好…' : existing ? '保存修改' : '只为我保存这一刻'}</button>
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
  const [note, setNote] = useState('');const [busy, setBusy] = useState(false);const lock = useRef(false);
  const [actionError, setActionError] = useState('');const [confirmDelete, setConfirmDelete] = useState(false);
  if (!card) return <LoadingError error={error} retry={() => setVersion(x => x + 1)}/>;
  if (card.owner_id !== user?.id) return <LoadingError error="这不是当前账号的私人记忆。"/>;
  if (edit) return <MemoryForm key={card.id + ':' + card.revision} song={card.song} existing={card}/>;
  async function append(event: FormEvent) {
    event.preventDefault(); if (!card || !note.trim() || lock.current) return;lock.current = true;setBusy(true);setActionError('');
    try {await apiRequest(apiBaseUrl, `/api/memories/${card.id}/reflections`, {method:'POST',body:JSON.stringify({revision:card.revision,text:note})});if (!live.current) return;setNote('');setVersion(x => x + 1);}
    catch (reason) {setActionError(reason instanceof Error ? reason.message : '补充没有保存。');}
    finally {lock.current=false;setBusy(false);}
  }
  async function remove() {
    if (!card || lock.current) return;lock.current=true;setBusy(true);setActionError('');
    try {await apiRequest(apiBaseUrl, `/api/memories/${card.id}?revision=${card.revision}`, {method:'DELETE'});if (live.current) navigate('/memories',{replace:true});}
    catch (reason) {setActionError(reason instanceof Error ? reason.message : '删除没有成功。');setConfirmDelete(false);}
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="journal-page memory-detail">
    <Link className="back-link" to="/memories">← 回到我的记忆</Link>
    {location.state?.saved && <p className="saved-notice" role="status">这一刻，已经好好收下了。</p>}
    <SampleNotice/><span className="journal-eyebrow">{card.is_demo_sample ? '样例记忆' : '只属于我'}</span><h1>{card.life_time || '那个有音乐的时刻'}</h1>
    <article className="keepsake-paper"><span className="paper-date">当时的我 · 记录于 {dayLabel(card.created_at)}</span><p className="original-story">{card.story}</p><span className="paper-caption">{card.offset_ms === null ? '这首歌，陪我经过。' : `这一页，留在音乐的 ${formatPosition(card.offset_ms)}。`}</span></article>
    <SongHeading song={card.song}/><AudioPlayer song={card.song} anchor={card.offset_ms}/>
    <div className="inline-actions detail-actions"><Link className="text-button" to={`/memories/${card.id}/edit`}>整理这段记忆</Link><Link className="text-button" to={`/songs/${card.song_id}`}>这首歌里的其他时刻 →</Link></div>
    <section className="reflection-section"><h2>今天的我，想补一句</h2><p className="page-intro">让新的心情留下，当时的文字仍在。</p>{card.reflections.map(item => <article className="reflection-note" key={item.id}><small>{dayLabel(item.created_at)}</small><p>{item.text}</p></article>)}
      <form onSubmit={append} className="memory-form"><label className="sr-only" htmlFor="new-reflection">今天想补充的话</label><textarea id="new-reflection" disabled={busy} value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} placeholder="重新听到这里，现在的我……"/><button className="soft-button" disabled={busy || !note.trim()}>把今天的这句也留下</button></form>
    </section>
    {actionError && <div className="form-error" role="alert">{actionError}<button className="text-button" onClick={() => setVersion(x=>x+1)}>重新加载</button></div>}
    {confirmDelete ? <div className="delete-confirm" role="alert"><p>要删除这一刻吗？原文和补充都会移除，之后无法恢复。</p><div className="inline-actions"><button className="soft-button" disabled={busy} onClick={() => setConfirmDelete(false)}>还是留着</button><button className="danger-button" disabled={busy} onClick={() => void remove()}>确认删除</button></div></div> : <button className="text-button delete-trigger" onClick={() => setConfirmDelete(true)}>删除这段记忆</button>}
  </section>;
}
