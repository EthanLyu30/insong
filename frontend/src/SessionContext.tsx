import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';
import type { DemoIdentity, DemoUser } from './demoAuth';

type Session = {
  user: DemoUser | null; loading: boolean; error: string;
  refresh: () => Promise<void>; logout: () => Promise<void>; demo: (id: number) => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function notifySessionChanged() {
  // Only invalidate other open tabs; never store identity or private text.
  try { localStorage.setItem('memory-session-change', crypto.randomUUID()); } catch { /* storage can be disabled */ }
}
export function useSession() { const value = useContext(Context); if (!value) throw new Error('Session missing'); return value; }

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(''); setUser(null);
    try {
      const identity = await apiRequest<DemoIdentity>(apiBaseUrl, '/api/me');
      if (current === generation.current) setUser(identity.user);
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : '无法确认登录状态。');
    } finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const changed = (event: StorageEvent) => { if (event.key === 'memory-session-change') void refresh(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [refresh]);
  const change = async (path: string, body?: object) => {
    ++generation.current; setLoading(true); setUser(null); setError('');
    try { await apiRequest(apiBaseUrl, path, { method: 'POST', ...(body ? {body: JSON.stringify(body)} : {}) }); notifySessionChanged(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '账号切换失败。'); setLoading(false); }
  };
  return <Context.Provider value={{ user, loading, error, refresh, logout: () => change('/api/accounts/logout'), demo: id => change('/api/demo/sessions', {user_id: id}) }}>{children}</Context.Provider>;
}

export function AccountControl() {
  const { user, loading, error, demo, logout, refresh } = useSession();
  return <div className="account-control">
    {loading ? <span role="status">正在确认账号…</span> : user ? <><Link className="account-name" to="/memories">{user.display_name}<small>{user.is_demo ? '共享样例账号' : '我的私人空间'}</small></Link><button type="button" className="text-button" onClick={() => void logout()}>退出</button></> : <><Link className="account-login" to="/account">登录 / 创建账号</Link><button className="text-button" type="button" onClick={() => void demo(1)}>体验样例</button></>}
    {error && <span className="account-error" role="alert">{error}<button className="text-button" onClick={() => void refresh()}>重试</button></span>}
  </div>;
}
