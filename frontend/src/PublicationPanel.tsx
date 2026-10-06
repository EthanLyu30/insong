import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { apiBaseUrl } from './api';
import { apiRequest, formatPosition, type Memory, type Theme } from './memoryClient';
import { useSession } from './SessionContext';
import { useLivePage } from './useLivePage';
import { EventNote } from './EventNote';
import { useData } from './useData';
import {cardPhotos, photoSource} from './cardMedia';

// The editor uses the same consented snapshot presentation, never the private reflections.
export function EditPublicationPreview({card,excerpt,anonymous,shareLife,onReady}:{card:Memory;excerpt:string;anonymous:boolean;shareLife:boolean;onReady:(ready:boolean)=>void}){
  const {user}=useSession();
  const {value:themes,error:themeError}=useData<Theme[]>('/api/themes');
  const theme=themes?.find(item=>item.id===card.theme_id);
  useEffect(()=>onReady(!card.theme_id||Boolean(theme)),[card.theme_id,theme,onReady]);
  return <><article className="share-preview compact-preview" aria-label="公开卡片预览"><div className="preview-gallery">{cardPhotos(card).map(photo=><img key={photo.id} src={photoSource(photo.url)} alt="将随这段文字公开的照片"/>)}</div><div><small>{anonymous?'匿名听友':user?.display_name} · {card.song.title}</small>{card.title&&<h3>{card.title}</h3>}{shareLife&&<small>{[card.life_year,card.life_time].filter(Boolean).join(' · ')}</small>}<p>{excerpt}</p><div className="preview-tags">{card.tags.map(tag=><span key={tag}>#{tag}</span>)}</div>{card.lyric&&<p>“{card.lyric.text}”</p>}<small>{formatPosition(card.offset_ms)}{card.end_ms!=null?` — ${formatPosition(card.end_ms)}`:''}</small>{card.theme_id&&<small>{theme?`也会出现在「${theme.title}」主题`:themeError?'主题加载失败，请重新打开后再公开。':'正在读取关联主题…'}</small>}</div>{card.event_id&&<EventNote id={card.event_id} snapshot={card.event_snapshot}/>}</article><p className="resource-note">上面预览的标题、标签、{cardPhotos(card).length?`${cardPhotos(card).length}张照片与`:''}文字将公开，听友可搜索到这张卡。后来的补记仍仅自己可见。</p></>;
}

export function PublicationPanel({card,onChange}: {card:Memory;onChange:()=>void}) {
  const {user}=useSession(),live=useLivePage();
  const [open,setOpen]=useState(false),[wantsPublic,setWantsPublic]=useState(!!card.publication?.published);
  const [excerpt,setExcerpt]=useState(card.publication?.excerpt??card.story);
  const [shareLife,setShareLife]=useState(card.publication?.share_life_time??false);
  const [anonymous,setAnonymous]=useState(card.publication?.anonymous??true);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
  const {value:themes,error:themeError}=useData<Theme[]>('/api/themes');
  const theme=themes?.find(item=>item.id===card.theme_id);
  const excerptValid=!!excerpt.trim()&&card.story.includes(excerpt.trim());
  const valid=excerptValid&&(!card.theme_id||!!theme);
  async function submit(event:FormEvent) {
    event.preventDefault();if(!valid||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await apiRequest(apiBaseUrl,`/api/memories/${card.id}/publication`,{method:'POST',body:JSON.stringify({revision:card.revision,excerpt:excerpt.trim(),share_life_time:shareLife,anonymous,confirmed:true})});if(live.current)onChange();}
    catch(reason){if(live.current)setError((reason as Error).message);}finally{lock.current=false;if(live.current)setBusy(false);}
  }
  async function makePrivate() {
    if(lock.current)return;
    if(!card.publication?.published){setWantsPublic(false);setOpen(false);return;}
    lock.current=true;setBusy(true);setError('');
    try{await apiRequest(apiBaseUrl,`/api/memories/${card.id}/publication?revision=${card.revision}`,{method:'DELETE'});if(live.current)onChange();}
    catch(reason){if(live.current)setError((reason as Error).message);}finally{lock.current=false;if(live.current)setBusy(false);}
  }
  return <div className="card-visibility">
    <button className="visibility-trigger" type="button" aria-expanded={open} onClick={()=>setOpen(!open)} disabled={busy}>{card.publication?.published?'☀ 公开可见':'♧ 仅自己可见'} <span aria-hidden="true">⌄</span></button>
    {card.publication?.published&&<Link className="text-button" to={`/stories/${card.id}`}>查看公开卡片 ↗</Link>}
    {open&&<section className="visibility-picker" aria-label="谁可以看"><div className="visibility-heading"><strong>谁可以看</strong><button className="text-button" type="button" onClick={()=>setOpen(false)} aria-label="关闭可见范围设置">×</button></div>
      <div className="visibility-options"><button type="button" disabled={busy} onClick={()=>void makePrivate()}><span>♧</span><strong>仅自己</strong><small>留在我的记忆里</small></button><button type="button" aria-pressed={wantsPublic} disabled={busy} onClick={()=>setWantsPublic(true)}><span>☀</span><strong>公开</strong><small>让听友看到这张卡</small></button></div>
      {wantsPublic&&<form onSubmit={submit}><fieldset className="form-fields memory-form" disabled={busy}>
        <label htmlFor="public-excerpt">公开这段原文<textarea id="public-excerpt" value={excerpt} maxLength={500} rows={3} onChange={e=>setExcerpt(e.target.value)}/></label>
        {!excerptValid&&<p className="form-error">请保留原文中连续的一段，可以删去首尾。</p>}
        <details className="sharing-options"><summary>公开设置</summary><label className="check-option"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/>匿名发布</label><label className="check-option"><input type="checkbox" checked={shareLife} onChange={e=>setShareLife(e.target.checked)}/>公开年份和时间</label></details>
        <article className="share-preview compact-preview" aria-label="公开卡片预览"><div className="preview-gallery">{cardPhotos(card).map(photo=><img key={photo.id} src={photoSource(photo.url)} alt="将随这段文字公开的照片"/>)}</div><div><small>{anonymous?'匿名听友':user?.display_name} · {card.song.title}</small>{card.title&&<h3>{card.title}</h3>}{shareLife&&<small>{[card.life_year,card.life_time].filter(Boolean).join(' · ')}</small>}<p>{excerpt}</p><div className="preview-tags">{card.tags.map(tag=><span key={tag}>#{tag}</span>)}</div>{card.lyric&&<p>“{card.lyric.text}”</p>}<small>{formatPosition(card.offset_ms)}{card.end_ms!=null?` — ${formatPosition(card.end_ms)}`:''}</small>{card.theme_id&&<small>{theme?`也会出现在「${theme.title}」主题`:themeError?'主题加载失败，请重新打开后再公开。':'正在读取关联主题…'}</small>}</div>{card.event_id&&<EventNote id={card.event_id} snapshot={card.event_snapshot}/>}</article>
        <p className="resource-note">上面预览的标题、标签、{cardPhotos(card).length?`${cardPhotos(card).length}张照片与`:''}文字将公开，听友可搜索到这张卡。后来的补记仍仅自己可见。</p>
        <button className="primary-button" disabled={!valid||busy}>{busy?'正在保存…':'确认公开这张卡'}</button>
      </fieldset></form>}
    </section>}
    {error&&<div className="form-error" role="alert">{error}<button className="text-button" onClick={onChange}>重新加载这张卡</button></div>}
  </div>;
}
