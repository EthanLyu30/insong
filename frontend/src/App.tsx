import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { getSongs, type Song } from './api';
import { MemoryCollage } from './MemoryCollage';
import { AccountControl, SessionProvider, useSession } from './SessionContext';
import { AccountPage } from './AccountPage';
import { CreateMemoryPage, MemoryCollection, MemoryDetailPage, SongPage } from './MemoryPages';
import { DiscoverPage, StoryPage, ThemePage, ThemeLinks } from './PublicPages';

function Glyph({ name }: { name: 'home' | 'search' | 'bookmark' }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'home' ? <><path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/></> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.4 4.4"/></> : <path d="M6 3h12v18l-6-4-6 4V3Z"/>}</svg>;
}

function HomePage() {
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
  return <div className="home-page">
    {params.get('theme') && <aside className="home-theme-note">选一首属于这个时刻的歌，主题会和记忆一起留下。<Link to={`/themes/${encodeURIComponent(params.get('theme')!)}`}>回看主题 →</Link></aside>}
    {loading && <div className="status-card" role="status">正在布置你的音乐记忆…</div>}
    {error && <div className="status-card error-card" role="alert">{error}<button onClick={() => setRequestKey(x => x + 1)}>重新加载</button></div>}
    {!loading && !error && <MemoryCollage songs={songs}/>}
    {!loading && !error && <section className="journal-page home-discovery"><Link className="soft-button" to="/discover">听听，歌里其他人的故事 ↗</Link><ThemeLinks/></section>}
  </div>;
}

function Shell() {
  const { user, loading, error, refresh } = useSession();
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="site-shell">
    <header className="topbar"><Link to="/" className="brand" aria-label="歌里有我，返回首页"><span className="brand-mark"><span/></span><span>歌里有我</span></Link><AccountControl/></header>
    <main className="main-content">
      {loading ? <div className="status-card" role="status">正在打开你的空间…</div> : error ? <div className="status-card error-card" role="alert">{error}<button onClick={() => void refresh()}>重新确认登录状态</button></div> :
        <Routes key={`${user?.id ?? 'guest'}:${location.pathname}`}>
          <Route path="/" element={<HomePage/>}/>
          <Route path="/account" element={<AccountPage/>}/>
          <Route path="/songs/:songId" element={<SongPage/>}/>
          <Route path="/songs/:songId/write" element={<CreateMemoryPage/>}/>
          <Route path="/discover" element={<DiscoverPage/>}/>
          <Route path="/stories/:storyId" element={<StoryPage/>}/>
          <Route path="/themes/:themeId" element={<ThemePage/>}/>
          <Route path="/memories" element={<MemoryCollection/>}/>
          <Route path="/memories/:memoryId" element={<MemoryDetailPage/>}/>
          <Route path="/memories/:memoryId/edit" element={<MemoryDetailPage edit/>}/>
          <Route path="*" element={<section className="journal-page empty-journal"><h1>这一页，还没有写下。</h1><Link className="soft-button" to="/">回到音乐里</Link></section>}/>
        </Routes>}
    </main>
    <nav className="bottom-nav" aria-label="主导航">{([
      ['/', 'home', '听见'], ['/discover', 'search', '共鸣'], ['/memories', 'bookmark', '我的记忆'],
    ] as const).map(([path, icon, label]) => <NavLink key={path} to={path} end={path === '/'} className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}><Glyph name={icon}/><span>{label}</span></NavLink>)}</nav>
  </div>;
}

export default function App() { return <SessionProvider><Shell/></SessionProvider>; }
