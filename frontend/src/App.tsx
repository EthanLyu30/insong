import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router";
import { apiBaseUrl, getSong, getSongs, type Song } from "./api";
import { DemoAccountSwitcher } from "./DemoAccountSwitcher";
import { getDemoIdentity, switchDemoIdentity, type DemoIdentity } from "./demoAuth";
import { MemoryCollage } from "./MemoryCollage";

function Glyph({ name, size = 22 }: { name: "arrow" | "search" | "music" | "pen" | "home" | "bookmark"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.4 4.4" /></>,
    music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    pen: <><path d="m4 20 4.6-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.6 16 4 20Z" /><path d="m14.7 6.7 3 3" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3V10Z" /><path d="M9 20v-7h6v7" /></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function PageShell({
  children, identity, loading, error, onSwitch, onRetry,
}: {
  children: ReactNode;
  identity: DemoIdentity | null;
  loading: boolean;
  error: string;
  onSwitch: (id: 1 | 2 | null) => Promise<void>;
  onRetry: () => void;
}) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="歌里有我，返回首页">
          <span className="brand-mark"><span /></span>
          <span>歌里有我</span>
        </Link>
        <DemoAccountSwitcher identity={identity} loading={loading} error={error} onSwitch={onSwitch} onRetry={onRetry} />
      </header>
      <main className="main-content">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Glyph name="home" size={21} /><span>发现</span>
        </NavLink>
        <NavLink to="/discover" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Glyph name="search" size={21} /><span>找故事</span>
        </NavLink>
        <NavLink to="/memories" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Glyph name="bookmark" size={21} /><span>我的记忆</span>
        </NavLink>
      </nav>
    </div>
  );
}

function SongCover({ songId, large = false }: { songId: number; large?: boolean }) {
  return (
    <div className={`song-cover${large ? " song-cover-large" : ""}`}>
      <img src={`/covers/song-${songId}.png`} alt="原创演示曲目画面" />
    </div>
  );
}

function HomePage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getSongs(controller.signal)
      .then(setSongs)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "歌曲加载失败，请稍后重试。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestKey]);

  return (
    <div className="home-page">
      {loading && <div className="status-card" role="status">正在布置你的音乐记忆…</div>}
      {error && <div className="status-card error-card" role="alert">{error}<button onClick={() => setRequestKey((value) => value + 1)}>重新加载</button></div>}
      {!loading && !error && <MemoryCollage songs={songs} />}
    </div>
  );
}

function SongPage() {
  const { songId } = useParams();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState("");
  const id = Number(songId);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setError("找不到这首演示歌曲。");
      return;
    }
    const controller = new AbortController();
    getSong(id, controller.signal)
      .then(setSong)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "歌曲加载失败，请稍后重试。");
      });
    return () => controller.abort();
  }, [id]);

  if (error) return <div className="status-card error-card" role="alert">{error}<Link to="/">返回发现</Link></div>;
  if (!song) return <div className="status-card" role="status">正在加载歌曲…</div>;

  return (
    <div className="song-page">
      <Link className="back-link" to="/">← 返回发现</Link>
      <div className="song-hero"><SongCover songId={song.id} large /><span className="eyebrow">演示曲目 · {song.version}</span><h1>{song.title}</h1><p>歌里有我 · 虚构演示</p></div>
      <div className="song-prompt"><span>写给这首歌的你</span><h2>这首歌曾出现在你人生的哪个瞬间？</h2><p>一首歌，一段故事，先为自己留住。</p><Link className="primary-button" to={`/songs/${song.id}/write`}>写下我的故事 <Glyph name="arrow" size={19} /></Link></div>
      <div className="audio-note">当前演示环境未接入已授权音源；音乐记忆的保存和阅读将在后续任务接入。</div>
      <section className="content-section"><div className="section-heading"><div><span className="section-kicker">SHARED STORIES</span><h2>关于这首歌的公开故事</h2></div></div><div className="empty-story"><p>公开故事将在下一阶段接入。</p></div></section>
    </div>
  );
}

function ComingSoon({ title, description }: { title: string; description: string }) {
  return <div className="coming-soon"><span className="coming-icon"><Glyph name="music" size={28} /></span><span className="section-kicker">SONG MEMORY</span><h1>{title}</h1><p>{description}</p><Link className="outline-button" to="/">先看看演示歌曲 <Glyph name="arrow" size={18} /></Link></div>;
}

export default function App() {
  const [identity, setIdentity] = useState<DemoIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState("");

  const loadIdentity = useCallback(async () => {
    setIdentityLoading(true);
    setIdentityError("");
    try {
      setIdentity(await getDemoIdentity(apiBaseUrl));
    } catch (reason) {
      setIdentityError(reason instanceof Error ? reason.message : "当前演示帐号加载失败，请重试。");
    } finally {
      setIdentityLoading(false);
    }
  }, []);

  useEffect(() => { void loadIdentity(); }, [loadIdentity]);

  async function onSwitch(userId: 1 | 2 | null) {
    setIdentityLoading(true);
    setIdentityError("");
    try {
      setIdentity(await switchDemoIdentity(apiBaseUrl, userId));
    } catch (reason) {
      setIdentityError(reason instanceof Error ? reason.message : "演示帐号切换失败，请重试。");
    } finally {
      setIdentityLoading(false);
    }
  }

  return <PageShell identity={identity} loading={identityLoading} error={identityError} onSwitch={onSwitch} onRetry={() => { void loadIdentity(); }}><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/songs/:songId" element={<SongPage />} />
    <Route path="/songs/:songId/write" element={<ComingSoon title="写下我的故事" description="故事编辑与私密保存正在接入，下一阶段即可使用。" />} />
    <Route path="/discover" element={<ComingSoon title="找一段相似的故事" description="公开故事与关键词搜索正在接入。" />} />
    <Route path="/memories" element={identityLoading ? <div className="status-card" role="status">正在确认演示帐号…</div> : identity?.user ? <ComingSoon title="我的音乐记忆" description="私密记忆管理正在接入。" /> : <ComingSoon title="先切换演示帐号" description="请在页面顶部切换到小林或阿远，再查看自己的音乐记忆。" />} />
    <Route path="*" element={<ComingSoon title="这里还没有音乐记忆" description="返回发现页，选一首歌重新开始。" />} />
  </Routes></PageShell>;
}
