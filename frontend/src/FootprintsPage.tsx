import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import { PublicStoryList } from './PublicPages';
import { useSession } from './SessionContext';
import { useData } from './useData';
import './footprints.css';

type Artist = { id: string; name: string; initial?: string; color?: string; description?: string };
type Concert = {
  id: string; artist_id: string; title: string; city: string; venue: string; date: string;
  source_url: string; source_title: string; source_kind?: 'report' | 'announcement';
  map_x?: number; map_y?: number;
  songs: { title: string; artist: string; url: string; platform?: string }[];
};
type Catalog = { artists: Artist[]; events: Concert[]; verified_on?: string };
type Venue = { key: string; city: string; name: string; x: number; y: number; events: Concert[] };

function Stadium({ lit = false }: { lit?: boolean }) {
  return <svg className={`footprint-stadium${lit ? ' is-lit' : ''}`} viewBox="0 0 130 100" fill="none" aria-hidden="true">
    <ellipse cx="65" cy="85" rx="53" ry="9" fill="#6f7457" opacity=".12"/>
    <path d="M16 49v19c0 15 98 15 98 0V49" fill="var(--stadium-wall, #d7b898)" stroke="#8d7864" strokeWidth="1.4"/>
    <path d="M25 58v15m13-9v13m14-10v13m14-12v12m14-13v13m14-17v13m12-19v13" stroke="#a0846a" strokeWidth="2"/>
    <ellipse cx="65" cy="47" rx="50" ry="23" fill="#fbf0d8" stroke="#8d7864" strokeWidth="1.4"/>
    <ellipse cx="65" cy="47" rx="36" ry="15" fill="var(--stadium-field, #a4b29a)" stroke="#8d7864" strokeWidth="1.2"/>
    <ellipse cx="65" cy="47" rx="27" ry="10" stroke="#fff5df" strokeWidth="1.2"/>
    <path d="M65 37v20M17 40V17m96 23V17M35 28V8m60 20V8" stroke="#8d7864" strokeWidth="2"/>
    <path d="M11 17h12M107 17h12M29 8h12M89 8h12" stroke="var(--stadium-light, #aeb6a1)" strokeWidth="5" strokeLinecap="round"/>
    {lit && <><path d="m17 18 22 23H13Zm96 0L91 41h26ZM35 9l22 24H32Zm60 0L73 33h25Z" fill="#efc974" opacity=".22"/><path d="m64 14 2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1Z" fill="#b27646"/></>}
  </svg>;
}

function MapLandscape() {
  return <svg className="footprint-map-art" viewBox="0 0 600 410" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <path d="M-30 165C85 86 183 206 266 185S387 95 458 140s125 16 180-55v370H-30Z" fill="#e5eadc"/>
    <path d="M-20 319C84 258 118 397 245 338s180-99 233-76 109 41 147 3" stroke="#cadad3" strokeWidth="37"/>
    <path d="M-20 319C84 258 118 397 245 338s180-99 233-76 109 41 147 3" stroke="#e4eeea" strokeWidth="2"/>
    <path d="M-20 114 630 334M64-20l184 450M409-20 245 430M-20 235 598 49" stroke="#fbf6e8" strokeWidth="15" strokeLinejoin="round"/>
    <path d="M-20 114 630 334M64-20l184 450M409-20 245 430M-20 235 598 49" stroke="#d7d3bb" strokeDasharray="5 7" strokeWidth="1"/>
    <path d="m246 326 25-10m-13 29 23-10" stroke="#bda78d" strokeWidth="4"/>
    {[[82,81],[100,89],[486,199],[506,210],[470,213],[343,344],[361,350],[100,227],[82,237]].map(([x,y],i) => <g key={i} transform={`translate(${x} ${y})`}><path d="M0 2v16" stroke="#928e70" strokeWidth="2"/><ellipse cy="-4" rx="9" ry="12" fill={i%2 ? '#a8b293' : '#bac5a5'}/></g>)}
    <g stroke="#b4b7a0" strokeWidth="1.3"><path d="m448 71 5-9 5 9m-5-9v18m38 284 4-8 4 8m-4-8v16m-360-2 4-8 4 8m-4-8v16"/></g>
    <path d="M462 316c9-7 17-7 26 0m-20 8c8-6 15-6 22 0" stroke="#b1c8c0" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

function showDate(date: string) { return date.replaceAll('-', '.'); }

function ArtistFootprints({ artist, events, verifiedOn }: { artist: Artist; events: Concert[]; verifiedOn?: string }) {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [attended, setAttended] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const current = events.find(event => event.id === params.get('event')) ?? events[0];

  useEffect(() => {
    const control = new AbortController();
    setAttended(null); setLoadError(''); setSaveError(''); setNotice(''); setBusy(false);
    if (user) apiRequest<string[]>(apiBaseUrl, '/api/footprints', { signal: control.signal })
      .then(value => { if (!control.signal.aborted) setAttended(value); })
      .catch(reason => { if (!control.signal.aborted) setLoadError(reason instanceof Error ? reason.message : '足迹暂时没有读到，请重试。'); });
    return () => { control.abort(); mutation.current?.abort(); mutation.current = null; };
  }, [user?.id, retry]);

  const venues: Venue[] = [];
  for (const event of events) {
    const key = `${event.city}:${event.venue}`;
    const venue = venues.find(item => item.key === key);
    if (venue) venue.events.push(event);
    else venues.push({ key, city: event.city, name: event.venue, x: event.map_x ?? 50, y: event.map_y ?? 50, events: [event] });
  }
  const currentVenue = venues.find(venue => venue.events.some(event => event.id === current?.id));
  const isAttended = !!current && !!attended?.includes(current.id);
  const visited = events.filter(event => attended?.includes(event.id)).length;
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const future = !!current && current.date > todayString;

  function selectEvent(event: Concert) {
    setParams({ artist: artist.id, event: event.id }, { replace: true });
    setNotice(''); setSaveError('');
  }

  async function toggleAttendance() {
    if (!user || !current || attended === null || mutation.current || future) return;
    const control = new AbortController(); mutation.current = control;
    const marking = !isAttended;
    setBusy(true); setSaveError(''); setNotice('');
    try {
      const value = await apiRequest<string[]>(apiBaseUrl, `/api/footprints/${encodeURIComponent(current.id)}`, {
        method: 'PUT', signal: control.signal, body: JSON.stringify({ attended: marking }),
      });
      if (!control.signal.aborted) {
        setAttended(value);
        setNotice(marking ? `已留下 ${current.city} ${showDate(current.date)} 的到场足迹。` : `已取消 ${current.city} ${showDate(current.date)} 的到场标记。`);
      }
    } catch (reason) {
      if (!control.signal.aborted) setSaveError(reason instanceof Error ? reason.message : '足迹没有保存成功，请重试。');
    } finally {
      if (!control.signal.aborted) { mutation.current = null; setBusy(false); }
    }
  }

  if (!current || !currentVenue) return <div className="empty-paper"><h2>下一站，慢慢收集。</h2><p>这位歌手还没有收录场次。</p></div>;
  const next = `/footprints?${new URLSearchParams({ artist: artist.id, event: current.id })}`;
  return <div className="footprint-artist-content" style={{ '--footprint-accent': artist.color ?? '#a6785f' } as CSSProperties}>
    <div className="footprint-map-heading"><div><span className="footprint-kicker">演出地图 · 历史场次</span><h2>{artist.name}的音乐足迹</h2></div><span className="footprint-count"><b>{user && attended !== null ? visited : '—'}</b><span>我的到场 / {events.length} 场</span></span></div>
    <div className="footprint-map" role="group" aria-label={`${artist.name}演出场馆示意地图`}>
      <MapLandscape/>
      <span className="footprint-map-caption">在一座城，留一段回声。</span>
      <span className="footprint-compass" aria-hidden="true">N<span>↑</span></span>
      {venues.map(venue => {
        const lit = venue.events.some(event => event.source_kind === 'report');
        const mine = venue.events.some(event => attended?.includes(event.id));
        return <button type="button" key={venue.key} className={`footprint-pin${venue.key === currentVenue.key ? ' is-selected' : ''}${mine ? ' is-mine' : ''}`} style={{ left: `${venue.x}%`, top: `${venue.y}%` }} onClick={() => selectEvent(venue.events[0])} aria-pressed={venue.key === currentVenue.key} aria-label={`${venue.city} · ${venue.name}${mine ? ' · 有我的到场足迹' : ''}`}>
          <Stadium lit={lit}/><span className="footprint-pin-label">{venue.city}<small>{mine ? '✓ 我来过' : lit ? '演出已举行' : '历史演出公告'}</small></span>
        </button>;
      })}
      <span className="footprint-map-note">示意地图 · 非地理导航</span>
    </div>
    <div className="footprint-legend"><span><i className="is-concert"/>已举行的演出</span><span><i className="is-announced"/>官方历史公告</span><span><i className="is-personal"/>我的到场印记</span></div>
    <div className="footprint-city-tabs" aria-label="按场馆选择演出">{venues.map(venue => <button type="button" key={venue.key} aria-pressed={venue.key === currentVenue.key} onClick={() => selectEvent(venue.events[0])}>{venue.city}<span>{venue.events.length} 场</span></button>)}</div>

    <article className="footprint-ticket" aria-label="选中场次">
      <div className="footprint-ticket-top"><span>{artist.initial ?? artist.name} / LIVE MEMORY</span><span>{current.source_kind === 'report' ? '演后记录' : '官方公告'}</span></div>
      <div className="footprint-ticket-body">
        <div className="footprint-ticket-city"><strong>{current.city}</strong><span>{showDate(current.date)}</span></div>
        <h3 className="footprint-event-title">{current.title}</h3><p className="footprint-venue-name">{current.venue}</p>
        {currentVenue.events.length > 1 && <div className="footprint-date-tabs" aria-label="选择具体场次日期">{currentVenue.events.map(event => <button key={event.id} type="button" aria-pressed={event.id === current.id} onClick={() => selectEvent(event)}>{showDate(event.date)}{attended?.includes(event.id) ? ' ✓' : ''}</button>)}</div>}
        {isAttended && <div className="footprint-stamp" aria-label="本人已标记到场"><span>这晚 · 我在场</span><b>到场留念</b><small>{showDate(current.date)}</small></div>}
      </div>
      <div className="footprint-ticket-bottom">
        {user ? loadError ? <div className="form-error" role="alert">{loadError}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>重新读取足迹</button></div> : <button type="button" className={`footprint-attend${isAttended ? ' is-attended' : ''}`} disabled={attended === null || busy || future} onClick={() => void toggleAttendance()} aria-pressed={isAttended}>{busy ? '保存中…' : attended === null ? '读取我的足迹…' : future ? '演出开始后可标记到场' : isAttended ? '取消到场标记' : '点亮：我去过'}<span aria-hidden="true">{isAttended ? '✓' : '✧'}</span></button> : <Link className="footprint-attend" to={`/account?next=${encodeURIComponent(next)}`}>登录后点亮我的足迹 <span aria-hidden="true">↗</span></Link>}
        <p>到场印记仅由你手动留下，保存在当前账号中。</p>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <span className="footprint-save-notice" role="status">{notice}</span>
      </div>
    </article>

    <Link className="footprint-write-link" to={`/?event=${encodeURIComponent(current.id)}`}><span className="footprint-pencil" aria-hidden="true">✎</span><span><strong>把这晚，写进我的记忆</strong><small>选一首配乐，留下那时的自己 · 默认私密</small></span><span aria-hidden="true">↗</span></Link>

    <section className="footprint-songs" aria-label="关联歌曲"><div className="list-heading"><h2>散场了，歌还在。</h2><span>关联歌曲</span></div>
      {current.songs.length ? current.songs.map(song => <a className="footprint-song" key={`${song.artist}:${song.title}`} href={song.url} target="_blank" rel="noopener noreferrer"><span className="footprint-record" aria-hidden="true">♪</span><span><strong>{song.title}</strong><small>{song.artist} · {song.platform ?? '前往音乐平台'}</small></span><span aria-hidden="true">↗</span></a>) : <p className="resource-note">还没有收录关联歌曲。</p>}
      <p className="footprint-song-note">艺人作品关联，非本场完整歌单；暂未接入已核实的榜单排名。音乐将在外部平台打开。</p>
      <a className="footprint-song" href="https://y.qq.com/n/ryqq_v2/toplist/4" target="_blank" rel="noopener noreferrer"><span className="footprint-record" aria-hidden="true">↗</span><span><strong>去 QQ 音乐看看今天的榜单</strong><small>官方流行指数榜 · 在外部平台打开</small></span><span aria-hidden="true">↗</span></a>
    </section>
    <PublicStoryList key={current.id} path={`/api/stories?event_id=${encodeURIComponent(current.id)}`} heading="同一晚，我们都在歌里"/>
    <details className="footprint-sources"><summary>这场演出的资料来源</summary><p>{current.source_kind === 'report' ? '日期与场馆来自官方演后记录。' : '日期与场馆来自官方演出公告，公告本身不构成演出已举行的证明。'}</p><a href={current.source_url} target="_blank" rel="noopener noreferrer">{current.source_title} ↗</a><p>收录日期：{showDate(current.date)}{verifiedOn && ` · 核对：${showDate(verifiedOn)}`}<br/>仅收录有来源的部分场次，更多足迹会慢慢补齐。</p></details>
  </div>;
}

export function FootprintsPage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const { value: catalog, error } = useData<Catalog>('/api/footprints/catalog', retry);
  const linkedEvent = catalog?.events.find(event => event.id === params.get('event'));
  const selected = catalog?.artists.find(artist => artist.id === (params.get('artist') ?? linkedEvent?.artist_id));
  return <section className="journal-page footprints-page">
    <header className="footprints-intro"><span className="journal-eyebrow">把奔赴过的夜晚，轻轻收藏</span><h1>歌声到过的地方，<br/><em>也有我的足迹。</em></h1><p>先选一位歌手，看看那些亮起过的场馆。<br/>属于你的那一晚，由你亲手点亮。</p><span className="footprints-spark" aria-hidden="true">✧</span></header>
    {error ? <div className="form-error" role="alert">{error}<button className="text-button" type="button" onClick={() => setRetry(value => value + 1)}>重新加载演出地图</button></div> : !catalog ? <div className="empty-paper" role="status">正在展开演出地图…</div> : <>
      <div className="footprint-artists" aria-label="选择歌手">{catalog.artists.map(artist => <button type="button" key={artist.id} className={`footprint-artist${selected?.id === artist.id ? ' is-selected' : ''}`} aria-pressed={selected?.id === artist.id} onClick={() => setParams({ artist: artist.id }, { replace: true })} style={{ '--artist-color': artist.color ?? '#a6785f' } as CSSProperties}><span className="footprint-artist-disc" aria-hidden="true"><i/>{artist.initial ?? artist.name.slice(0,1)}</span><strong>{artist.name}</strong><small>{selected?.id === artist.id ? '正在看 TA 的足迹' : '展开演出地图 ↗'}</small></button>)}</div>
      {selected ? <ArtistFootprints key={`${selected.id}:${user?.id ?? 'guest'}`} artist={selected} events={catalog.events.filter(event => event.artist_id === selected.id).sort((a,b) => b.date.localeCompare(a.date))} verifiedOn={catalog.verified_on}/> : <div className="footprint-awaiting"><div aria-hidden="true"><Stadium lit/><span>♪</span></div><h2>{catalog.artists.length ? '下一张票根，从谁开始？' : '演出地图正在整理。'}</h2><p>{catalog.artists.length ? '选择上方歌手，把地图翻到 TA 的那一页。' : '暂时还没有收录歌手，请稍后再来看看。'}</p></div>}
    </>}
  </section>;
}
