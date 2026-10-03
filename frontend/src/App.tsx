import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { getSongs, type Song } from './api';
import {songCover} from './cardMedia';
import { MemoryCollage } from './MemoryCollage';
import {BackLink,NavigationProvider} from './Navigation';
import { AccountControl, SessionProvider, useSession } from './SessionContext';
import { AccountPage } from './AccountPage';
import { CreateMemoryPage, MemoryCollection, MemoryDetailPage, SongPage } from './MemoryPages';
import {CreationPage} from './CreationPage';
import { DiscoverPage, StoryPage, ThemePage } from './PublicPages';
import './footprints.css';
import {House,MagnifyingGlass,BookmarkSimple,MapTrifold,Plus} from '@phosphor-icons/react';
function AtlasGlyph({name}:{name:'home'|'search'|'bookmark'|'map'}){const Icon={home:House,search:MagnifyingGlass,bookmark:BookmarkSimple,map:MapTrifold}[name];return <Icon size={25} weight="light" aria-hidden="true"/>;}
const FootprintsPage = lazy(() => import('./FootprintsPage').then(module => ({default:module.FootprintsPage})));
const PlaylistsPage = lazy(() => import('./ConcertPlaylist').then(module => ({default:module.PlaylistsPage})));

function Glyph({ name }: { name: 'home' | 'search' | 'bookmark' | 'map' }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'home' ? <><path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/></> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.4 4.4"/></> : name === 'map' ? <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></> : <path d="M6 3h12v18l-6-4-6 4V3Z"/>}</svg>;
}

function HomePage({intro,onEnter}:{intro:boolean;onEnter:()=>void}) {
  const [params] = useSearchParams();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    getSongs(controller.signal).then(setSongs).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '歌曲加载失败，请稍后重试。');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestKey]);
  // Keep the original five-card home independent of discovery's photo covers.
  const homeSongs = songs.filter(song=>song.is_demo && song.id>=1 && song.id<=5);
  const choosing = !intro && (params.has('theme') || params.has('event') || params.has('choose'));
  return <div className="home-page">
    {!intro && params.get('theme') && <aside className="home-theme-note">选一首属于这个时刻的歌，主题会和记忆一起留下。<Link to={`/themes/${encodeURIComponent(params.get('theme')!)}`}>回看主题 →</Link></aside>}
    {!intro && params.get('event') && <aside className="home-theme-note">选一首歌，把这场现场留进记忆。当前可试听的是原创样例配乐。</aside>}
    {choosing&&<BackLink fallback={params.get('event')?`/footprints?event=${encodeURIComponent(params.get('event')!)}`:params.get('theme')?`/themes/${encodeURIComponent(params.get('theme')!)}`:'/memories'}/>}
    {loading && <div className="status-card" role="status">正在布置你的音乐记忆…</div>}
    {error && <div className="status-card error-card" role="alert">{error}<button onClick={() => setRequestKey(x => x + 1)}>重新加载</button></div>}
    {!loading && !error && (choosing?<section className="journal-page song-selection"><h1>这一晚，你想留下哪首歌？</h1><p>从喜欢的歌开始，写自己的音乐卡片。</p><div>{songs.map(song=><Link key={song.id} to={`/songs/${song.id}/write?${params}`}><img src={songCover(song)} alt=""/><span><strong>{song.title}</strong><small>{song.artist}</small></span></Link>)}</div></section>:<MemoryCollage songs={homeSongs} intro={intro} onEnter={onEnter}/>)}
  </div>;
}

function Shell() {
  const { user, loading, error, refresh } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const homeParams = new URLSearchParams(location.search);
  // Home has one visual state, regardless of how the user arrived here.
  const intro = location.pathname === '/' && !['theme','event','choose'].some(key=>homeParams.has(key));
  const atlas = location.pathname === '/footprints';
  return <div className={`site-shell${intro?' intro-shell':''}${atlas?' atlas-shell':''}`}>
    {!atlas && <header className="topbar"><Link to="/" className="brand" aria-label="歌里有我，返回首页"><span className="brand-mark"><span/></span><span>歌里有我</span></Link><AccountControl/></header>}
    <main className="main-content">
      {loading ? <div className="status-card" role="status">正在打开你的空间…</div> : error ? <div className="status-card error-card" role="alert">{error}<button onClick={() => void refresh()}>重新确认登录状态</button></div> :
        <Routes key={`${user?.id ?? 'guest'}:${location.pathname}`}>
          <Route path="/" element={<HomePage intro={intro} onEnter={()=>navigate('/discover')}/>}/>
          <Route path="/account" element={<AccountPage/>}/>
          <Route path="/songs/:songId" element={<SongPage/>}/>
          <Route path="/songs/:songId/write" element={<CreateMemoryPage/>}/>
          <Route path="/discover" element={<DiscoverPage/>}/>
          <Route path="/footprints" element={<Suspense fallback={<section className="atlas-page atlas-loading" role="status">正在展开山河与歌声…</section>}><FootprintsPage/></Suspense>}/>
          <Route path="/playlists" element={<Suspense fallback={<p role="status">正在翻开歌单…</p>}><PlaylistsPage/></Suspense>}/>
          <Route path="/stories/:storyId" element={<StoryPage/>}/>
          <Route path="/themes/:themeId" element={<ThemePage/>}/>
          <Route path="/memories" element={<MemoryCollection/>}/>
          <Route path="/create" element={<CreationPage/>}/>
          <Route path="/memories/:memoryId" element={<MemoryDetailPage/>}/>
          <Route path="/memories/:memoryId/edit" element={<MemoryDetailPage edit/>}/>
          <Route path="*" element={<section className="journal-page empty-journal"><h1>这一页，还没有写下。</h1><BackLink className="soft-button"/></section>}/>
        </Routes>}
    </main>
    {<nav className="bottom-nav" aria-label="主导航">{([
      ['/', 'home', '听见'], ['/discover', 'search', '共鸣'], ['/create', 'create', '记录'], ['/memories', 'bookmark', '我的记忆'], ['/footprints', 'map', '足迹'],
    ] as const).map(([path, icon, label]) => <NavLink key={path} to={path} end={path === '/'} aria-label={icon==='create'?'创建记忆':undefined} className={({isActive}) => `nav-item${icon==='create'?' nav-create':''}${isActive||(icon==='create'&&location.pathname.endsWith('/write')) ? ' active' : ''}`}>{icon==='create'?<span className="nav-create-icon"><Plus size={25} weight="regular" aria-hidden="true"/></span>:atlas?<AtlasGlyph name={icon}/>:<Glyph name={icon}/>}<span>{label}</span></NavLink>)}</nav>}
  </div>;
}

export default function App() { return <NavigationProvider><SessionProvider><Shell/></SessionProvider></NavigationProvider>; }
