import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { apiBaseUrl } from './api';
import { apiRequest, safeNext } from './memoryClient';
import { notifySessionChanged, useSession } from './SessionContext';
import { useLivePage } from './useLivePage';

export function AccountPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const live = useLivePage();
  const { refresh, demo, user } = useSession();
  const [register, setRegister] = useState(true);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState('');
  const next = safeNext(params.get('next'));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest(apiBaseUrl, `/api/accounts/${register ? 'register' : 'login'}`, {method:'POST', body:JSON.stringify({username:data.get('username'), password:data.get('password'), ...(register ? {display_name:data.get('display_name')} : {})})});
      notifySessionChanged();
      if (live.current) navigate(next, {replace:true});
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '没有成功，请重试。'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="journal-page account-page">
    <Link className="back-link" to="/">← 回到音乐里</Link>
    <span className="journal-eyebrow">只属于你的空间</span><h1>把这一刻，<br/>好好收起来。</h1>
    <p className="page-intro">有些话，先留给自己。用个人账号保存，下一次回来还在。</p>
    {user && !user.is_demo ? <Link className="primary-button" to={next}>继续回看我的记忆</Link> : <>
      <div className="segmented-control" aria-label="账号操作"><button disabled={busy} aria-pressed={register} onClick={() => {setRegister(true);setError('');}}>创建账号</button><button disabled={busy} aria-pressed={!register} onClick={() => {setRegister(false);setError('');}}>已有账号</button></div>
      <form className="paper-panel memory-form" onSubmit={submit}>
        <fieldset className="memory-form form-fields" disabled={busy}>
        {register && <label>怎么称呼你<input name="display_name" required maxLength={40} autoComplete="nickname" placeholder="一个喜欢的名字" /></label>}
        <label>用户名<input name="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]{3,32}" autoComplete="username" placeholder="3–32位字母、数字或下划线" /></label>
        <label>密码<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} placeholder="至少10位，请妥善记住" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? '正在收好你的空间…' : register ? '创建我的私人空间' : '回到我的空间'}</button>
        <p className="resource-note">这是本站独立账号。暂不支持密码找回，请妥善保存；尚未连接 QQ 音乐账号。</p>
        </fieldset>
      </form>
      <details className="sample-entry"><summary>想先看看它是什么样？</summary><p>共享样例账号中的内容所有体验者都能查看，请只使用虚构文字。</p><div className="inline-actions"><button className="soft-button" disabled={busy} onClick={() => {navigate(next);void demo(1);}}>体验小林的记忆</button><button className="soft-button" disabled={busy} onClick={() => {navigate(next);void demo(2);}}>体验阿远的记忆</button></div></details>
    </>}
  </section>;
}
