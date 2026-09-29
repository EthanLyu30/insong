import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { apiBaseUrl } from './api';
import { apiRequest, formatPosition, type Memory } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';

export function PublicationPanel({card,onChange}: {card:Memory;onChange:()=>void}) {
  const {user} = useSession();const live = useLivePage();
  const [open,setOpen] = useState(false);
  const [excerpt,setExcerpt] = useState(card.publication?.excerpt ?? card.story);
  const [shareLife,setShareLife] = useState(card.publication?.share_life_time ?? false);
  const [anonymous,setAnonymous] = useState(card.publication?.anonymous ?? true);
  const [confirmed,setConfirmed] = useState(false);const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');const lock = useRef(false);
  const valid = !!excerpt.trim() && card.story.includes(excerpt.trim());
  async function submit(event:FormEvent) {
    event.preventDefault(); if(!confirmed||!valid||lock.current)return;lock.current=true;setBusy(true);setError('');
    try {await apiRequest(apiBaseUrl,`/api/memories/${card.id}/publication`,{method:'POST',body:JSON.stringify({revision:card.revision,excerpt:excerpt.trim(),share_life_time:shareLife,anonymous,confirmed:true})});if(live.current)onChange();}
    catch(reason){if(live.current)setError((reason as Error).message);}finally{lock.current=false;if(live.current)setBusy(false);}
  }
  async function withdraw() {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {await apiRequest(apiBaseUrl,`/api/memories/${card.id}/publication?revision=${card.revision}`,{method:'DELETE'});if(live.current)onChange();}
    catch(reason){if(live.current)setError((reason as Error).message);}finally{lock.current=false;if(live.current)setBusy(false);}
  }
  return <section className="publication-panel">
    <span className="journal-eyebrow">从我的一刻，到我们的共鸣</span><h2>{card.publication?.published?'这段原文，已在共鸣里。':'愿意让谁，也听见这一刻？'}</h2>
    <p className="page-intro">{card.publication?.published?'公开的是你选中的片段。完整记忆和后来的补充，仍在自己的空间里。':'你可以选一段原文，分享给有相似经历的人。先看看别人会看到什么，再决定。'}</p>
    <div className="inline-actions">{card.publication?.published&&<><Link className="soft-button" to={`/stories/${card.id}`}>看看公开的这一页 ↗</Link><button className="text-button" disabled={busy} onClick={()=>void withdraw()}>撤回公开</button></>}<button className="soft-button" disabled={busy} onClick={()=>{setOpen(!open);setConfirmed(false);}}>{open?'收起预览':card.publication?.published?'重新选择分享片段':'挑一段，预览分享'}</button></div>
    {open&&<form className="publication-form" onSubmit={submit}><fieldset className="form-fields memory-form" disabled={busy}>
      <label htmlFor="public-excerpt">想分享的原文片段<textarea id="public-excerpt" value={excerpt} maxLength={500} rows={4} onChange={e=>{setExcerpt(e.target.value);setConfirmed(false);}}/></label>
      <p className={valid?'resource-note':'form-error'}>{valid?'可以删去首尾不想公开的部分；请保留原文中连续的一段。':'请保留原文中连续的一段，不改写或拼接。'}</p>
      <label className="check-option"><input type="checkbox" checked={shareLife} onChange={e=>{setShareLife(e.target.checked);setConfirmed(false);}}/>也分享人生年份与阶段</label>
      <label className="check-option"><input type="checkbox" checked={anonymous} onChange={e=>{setAnonymous(e.target.checked);setConfirmed(false);}}/>用“匿名听友”分享</label>
      <article className="share-preview" aria-label="公开卡片预览"><span className="journal-eyebrow">别人会看到的这一页</span><p className="story-byline">{anonymous?'匿名听友':user?.display_name} {card.is_demo_sample&&' · 虚构样例故事'}</p>{shareLife&&(card.life_year||card.life_time)&&<span className="story-life">{[card.life_year,card.life_time].filter(Boolean).join(' · ')}</span>}<p className="story-excerpt">{excerpt.trim()||'选一段想分享的文字吧。'}</p>{card.lyric&&<p className="lyric-quote">“{card.lyric.text}”</p>}<div className="story-record"><img src={`/covers/song-${card.song_id}.png`} alt=""/><div><strong>{card.song.title}</strong><span>{formatPosition(card.offset_ms)}</span></div></div>{card.theme_id&&<span className="resource-note">同时出现在所选主题中</span>}</article>
      <p className="resource-note">公开后，访客可以阅读这段文字，按经历搜索到它，并重听关联音乐。你可以随时撤回。</p>
      <label className="check-option consent-option"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已看过预览，愿意公开以上内容</label>
      <button className="primary-button" disabled={!confirmed||!valid||busy}>{busy?'正在分享…':'确认公开这一段'}</button>
    </fieldset></form>}
    {error&&<div className="form-error" role="alert">{error}<button className="text-button" onClick={onChange}>重新加载这张卡</button></div>}
  </section>;
}
