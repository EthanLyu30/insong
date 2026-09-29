import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { apiBaseUrl } from './api';
import { AudioPlayer } from './AudioPlayer';
import { apiRequest, formatPosition, type PublicStory, type PublicSearchResult, type Theme } from './memoryClient';
import { useData } from './useData';
import { EventNote } from './EventNote';

export function ThemeLinks() {
  const {value: themes, error} = useData<Theme[]>('/api/themes');
  return <section className="theme-section"><div className="list-heading"><h2>从一个时刻，开始</h2><span>给记忆一点线索</span></div>{error ? <p role="alert">{error}</p> : <div className="theme-links">{themes?.map((theme,i) => <Link to={`/themes/${theme.id}`} key={theme.id} className={`theme-link theme-link-${i}`}><span className="theme-number">0{i+1} /</span><h3>{theme.title}</h3><p>{theme.description}</p><span className="theme-arrow" aria-hidden="true">↗</span></Link>)}</div>}</section>;
}

export function StoryEntry({story, matchLabel}: {story: PublicStory; matchLabel?: string}) {
  const [flipped,setFlipped]=useState(false);
  return <article className={`flip-card${flipped?' is-flipped':''}`}>
    <div className="flip-rotor">
      <div className="flip-face flip-front" inert={flipped} aria-hidden={flipped}>
        <button className="card-flip-trigger" aria-label={`翻开${story.song.title}的故事并播放`} onClick={()=>setFlipped(true)}>
          <div className="story-cover"><img src={story.photo_url?apiBaseUrl+story.photo_url:`/covers/song-${story.song_id}.png`} alt={`《${story.song.title}》${story.photo_url?'记忆照片':'封面'}`} loading="lazy"/><span className="cover-stamp">{story.is_demo_sample?'虚构样例':'听友的这一刻'}</span><span className="cover-turn" aria-hidden="true">↗</span></div>
          <div className="story-front-copy"><h3>{story.song.title}</h3><span className="story-artist">{story.song.artist}</span>{matchLabel&&<span className="match-label">{matchLabel}</span>}<p className="story-excerpt">{story.excerpt}</p>{(story.life_year||story.life_time)&&<span className="story-life">{[story.life_year,story.life_time].filter(Boolean).join(' · ')}</span>}</div>
        </button>
        <div className="card-bottom"><span className="card-author">{story.author_name}</span><Link to={`/stories/${story.id}`} className="card-read" aria-label={`阅读${story.song.title}的完整故事`}>全文</Link><button className="card-play" aria-label={`播放${story.song.title}并翻到背面`} onClick={()=>setFlipped(true)}>▶</button></div>
      </div>
      <div className="flip-face flip-back" inert={!flipped} aria-hidden={!flipped}>
        <button className="card-close" aria-label={`收起${story.song.title}的故事`} onClick={()=>setFlipped(false)}>↶ 正面</button>
        <img className="story-back-photo" src={story.photo_url?apiBaseUrl+story.photo_url:`/covers/song-${story.song_id}.png`} alt={story.photo_url?'听友分享的照片':'这段故事的歌曲封面'}/>
        <div className="story-back-copy"><h3>{story.song.title}</h3><small>{story.song.artist} · {story.author_name}</small><div className="story-back-scroll" tabIndex={flipped?0:-1} aria-label="公开故事原文"><p>{story.excerpt}</p>{story.lyric&&<blockquote>“{story.lyric.text}”</blockquote>}</div><Link className="card-read" to={`/stories/${story.id}`}>展开读这一页 ↗</Link></div>
        {flipped&&<AudioPlayer song={story.song} anchor={story.offset_ms} end={story.end_ms} autoPlay compact/>}
      </div>
    </div>
  </article>;
}

export function StoryGrid({stories}:{stories:PublicStory[]}) {return <div className="story-masonry">{stories.map(story=><StoryEntry key={story.id} story={story}/>)}</div>;}

export function PublicStoryList({path, heading = '同一首歌，不同的人生', excludeId}: {path:string; heading?:string; excludeId?:number}) {
  const [version,setVersion] = useState(0);
  const {value,error} = useData<PublicStory[]>(path,version);
  const stories = value?.filter(story => story.id !== excludeId);
  return <section className="public-story-list"><div className="list-heading"><h2>{heading}</h2>{stories && <span>{stories.length} 段故事</span>}</div>{error ? <div className="form-error" role="alert">{error}<button className="text-button" onClick={() => setVersion(v=>v+1)}>重试</button></div> : !stories ? <p role="status">正在翻开故事…</p> : stories.length ? <StoryGrid stories={stories}/> : <div className="empty-paper"><h3>这里，等一段愿意分享的故事。</h3><p>每一张记忆卡都先为自己保存，公开由你决定。</p></div>}</section>;
}

export function DiscoverPage() {
  const [params,setParams] = useSearchParams();
  const song = params.get('song'); const lyric = params.get('lyric');
  const [query,setQuery] = useState(''); const [mode,setMode] = useState<'semantic'|'keyword'>('semantic');
  const [result,setResult] = useState<PublicSearchResult|null>(null); const [searched,setSearched] = useState('');
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const request = useRef<AbortController|null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {request.current?.abort();setResult(null);setBusy(false);setError('');}, [song,lyric]);
  function reset() {request.current?.abort();setResult(null);setBusy(false);setError('');}
  async function search(event:FormEvent) {
    event.preventDefault(); if (!query.trim()) return;
    request.current?.abort();const control = new AbortController();request.current = control;
    setBusy(true);setError('');setResult(null);setSearched(query.trim());
    try {
      const response = await apiRequest<PublicSearchResult>(apiBaseUrl,'/api/stories/search',{method:'POST',signal:control.signal,body:JSON.stringify({query:query.trim(),mode,...(song ? {song_id:Number(song)} : {}),...(lyric ? {lyric_id:lyric}: {})})});
      if (!control.signal.aborted) setResult(response);
    } catch(reason) {if(!control.signal.aborted) setError((reason as Error).message);}
    finally {if(!control.signal.aborted) setBusy(false);}
  }
  const filters = new URLSearchParams(); if(song) filters.set('song_id',song);if(lyric) filters.set('lyric_id',lyric);
  return <section className="journal-page discover-page">
    <header className="discover-intro"><div><span className="journal-eyebrow">歌里有我，也有你</span><h1>听见彼此的生活。</h1></div><span className="discover-doodle" aria-hidden="true">♪</span></header>
    <form className="recall-form public-search" onSubmit={search}><label htmlFor="public-query">用一句经历，找一段共鸣</label><div className="recall-input"><input id="public-query" value={query} maxLength={200} onChange={e=>{setQuery(e.target.value);reset();}} placeholder="第一次听完现场后，舍不得回家"/><button disabled={busy||!query.trim()}>{busy?'寻找中…':'找共鸣'}</button></div><div className="recall-tools"><div className="segmented-control small"><button type="button" aria-pressed={mode==='semantic'} onClick={()=>{setMode('semantic');reset();}}>AI 经历匹配</button><button type="button" aria-pressed={mode==='keyword'} onClick={()=>{setMode('keyword');reset();}}>关键词</button></div><span className="resource-note">只搜索主动公开的原文</span></div></form>
    <ThemeLinks/>
    {(song||lyric) && <div className="active-filter"><span>{lyric ? '正在看同一句词下的故事' : '正在看同一首歌里的故事'}</span><button className="text-button" onClick={()=>{setParams({});reset();}}>看全部共鸣 ×</button></div>}
    {busy && <p className="inline-status" role="status">正在公开故事里寻找相近的经历…</p>}{error&&<p className="form-error" role="alert">{error}</p>}
    {result ? <section aria-live="polite"><div className="list-heading"><h2>关于“{searched}”</h2><button className="text-button" onClick={()=>{setQuery('');reset();}}>回看故事</button></div><p className="resource-note">{result.notice || (result.mode==='semantic'?'这些经历可能与你的描述有关，下面是作者的公开原文。':'按公开原文与分享信息中的关键词查找。')}</p>{result.items.length?<div className="story-masonry">{result.items.map(item=><StoryEntry key={item.story.id} story={item.story} matchLabel={item.match_label}/>)}</div>:<div className="empty-paper"><h3>还没有找到足够相近的故事。</h3><p>换一种说法，或从上面的主题慢慢看。</p></div>}</section>:!busy&&<PublicStoryList path={`/api/stories?${filters}`} heading={lyric?'同一句词，留下不同的我们':'有人把这一刻，留在了歌里'}/>}
    <p className="resource-note">标有“虚构样例”的内容用于演示；AI 帮你找原文，不替听友编写经历。</p>
  </section>;
}

export function StoryPage() {
  const {storyId} = useParams();const [retry,setRetry] = useState(0);
  const {value:story,error} = useData<PublicStory>(`/api/stories/${storyId}`,retry);
  if(!story) return <section className="journal-page"><Link className="back-link" to="/discover">← 回到共鸣</Link>{error?<div className="empty-paper" role="alert"><h1>这一页，暂时合上了。</h1><p>{error}</p><button className="soft-button" onClick={()=>setRetry(v=>v+1)}>重新查看</button></div>:<p role="status">正在翻开故事…</p>}</section>;
  const capture = new URLSearchParams(); if(story.offset_ms!==null) capture.set('at',String(story.offset_ms));if(story.lyric_id)capture.set('lyric',story.lyric_id);if(story.theme_id)capture.set('theme',story.theme_id);if(story.end_ms!=null)capture.set('end',String(story.end_ms));if(story.event_id)capture.set('event',story.event_id);
  return <section className="journal-page public-detail"><Link className="back-link" to="/discover">← 回到共鸣</Link><span className="journal-eyebrow">{story.is_demo_sample?'虚构样例故事':'听友主动分享的原文'}</span><h1>这首歌，<br/>经过了 TA 的生活。</h1><article className="keepsake-paper">{story.photo_url&&<img className="keepsake-photo" src={apiBaseUrl+story.photo_url} alt="听友分享的照片"/>}<div className="story-byline"><span className="story-avatar">{story.author_name.slice(0,1)}</span><span>{story.author_name}</span></div>{(story.life_year||story.life_time)&&<p className="story-life">{[story.life_year,story.life_time].filter(Boolean).join(' · ')}</p>}<p className="original-story">{story.excerpt}</p>{story.lyric&&<blockquote className="lyric-quote">“{story.lyric.text}”<small>原创示例词句 · {formatPosition(story.offset_ms)}</small></blockquote>}</article><div className="record-heading"><img src={`/covers/song-${story.song_id}.png`} alt=""/><div><span className="journal-eyebrow">这一刻的配乐</span><h2>{story.song.title}</h2><small>{story.song.artist}</small><Link className="text-button" to={`/songs/${story.song_id}`}>走进这首歌 →</Link></div></div><AudioPlayer song={story.song} anchor={story.offset_ms} end={story.end_ms}/>{story.event_id&&<EventNote id={story.event_id}/>}<Link className="primary-button" to={`/songs/${story.song_id}/write?${capture}`}>我也想留下这一刻 ↗</Link><p className="quiet-caption">从同一段旋律开始，写自己的经历。默认私密保存。</p><PublicStoryList path={`/api/stories?song_id=${story.song_id}${story.lyric_id?`&lyric_id=${encodeURIComponent(story.lyric_id)}`:''}`} excludeId={story.id} heading={story.lyric_id?'同一句词，别人的人生':'同一首歌，别人的人生'}/></section>;
}

export function ThemePage() {
  const {themeId} = useParams(); const {value,error} = useData<Theme[]>('/api/themes');
  const theme = value?.find(item=>item.id===themeId);
  return <section className="journal-page theme-page"><Link className="back-link" to="/discover">← 回到共鸣</Link>{!theme ? <p role={error?'alert':'status'}>{error || (value?'这个主题还没有开启。':'正在打开主题…')}</p>:<><span className="journal-eyebrow">让一段音乐，唤起一个时刻</span><h1>{theme.title}</h1><p className="theme-question">{theme.prompt}</p><p className="page-intro">{theme.description}</p><Link className="primary-button" to={`/?theme=${theme.id}`}>选一首歌，写我的这一刻 ↗</Link><p className="quiet-caption">主题是一个开始。记忆会留在你的时间轴，公开由你决定。</p><PublicStoryList path={`/api/stories?theme_id=${theme.id}`} heading="这个主题里的我们"/></>}</section>;
}
