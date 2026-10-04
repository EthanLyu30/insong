import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useParams, useSearchParams} from 'react-router';
import {ArrowUpRight, MusicNote} from '@phosphor-icons/react';
import {apiBaseUrl} from './api';
import {apiRequest, type Memory, type PublicStory, type PublicSearchResult, type Theme} from './memoryClient';
import {cardCover, cardPhotos} from './cardMedia';
import {StoryCard} from './StoryCard';
import {TagLinks} from './StoryContent';
export {TagLinks,StoryBody} from './StoryContent';
import {useData} from './useData';
import {EventNote} from './EventNote';
import {chinaToday, dateLabel, phaseLabel, type AtlasCatalog} from './footprintAtlas';
import {venuePhotograph} from './photoSources';
import {BackLink} from './Navigation';
import {useSession} from './SessionContext';
import {rankRecommendedStories} from './revisionBehavior';

export function ThemeLinks() {
  const {value:themes,error}=useData<Theme[]>('/api/themes');
  return <section className="theme-section" aria-label="从喜欢的现场开始">{error?<p role="alert">{error}</p>:<div className="theme-links">{themes?.map((theme,index)=><Link to={`/themes/${theme.id}`} key={theme.id} className={`theme-link theme-link-${index}`}><img src={theme.image_url??['/photos/memory-concert-20261002.webp','/photos/memory-festival-20261002.webp','/photos/memory-journey-20261002.webp'][index%3]} alt=""/><div><h3>{theme.title}</h3></div></Link>)}</div>}</section>;
}

function RecentConcerts() {
  const {value:catalog,error}=useData<AtlasCatalog>('/api/footprints/catalog');
  if(error)return <p className="resource-note">近期现场暂时无法加载，稍后可在足迹里重试。</p>;
  if(!catalog)return null;
  const today=catalog.today??chinaToday();
  const events=catalog.events.filter(event=>event.event_status!=='cancelled').sort((a,b)=>{
    const futureA=a.date>=today,futureB=b.date>=today;
    return futureA!==futureB?futureA?-1:1:futureA?a.date.localeCompare(b.date):b.date.localeCompare(a.date);
  }).filter((event,index,all)=>all.findIndex(other=>other.artist_id===event.artist_id&&other.city===event.city)===index).slice(0,3);
  return events.length?<section className="recent-concerts"><header className="list-heading"><h2>下一次，现场见</h2><Link className="text-button" to="/footprints">看演出行程 <ArrowUpRight size={14}/></Link></header><div>{events.map(event=>{
    const artist=catalog.artists.find(item=>item.id===event.artist_id)?.name??event.title;
    const photo=venuePhotograph(event.venue,event.artist_id);
    return <Link key={event.id} to={`/footprints?event=${encodeURIComponent(event.id)}&scene=map`}>
      {photo?<div className="recent-photo"><img src={photo.url} alt={photo.description} loading="lazy"/></div>:<div className="recent-date" aria-hidden="true"><span>{event.date.slice(5).replace('-','.')}</span><i>{event.date.slice(0,4)}</i></div>}<strong>{artist} · {event.city}</strong><small>{dateLabel(event.date)} · {phaseLabel(event,today)}</small>
    </Link>;
  })}</div></section>:null;
}

export function StoryEntry({story,matchLabel}:{story:PublicStory;matchLabel?:string}) {
  const body=useRef<HTMLDivElement>(null);
  const [rows,setRows]=useState<number>();
  useEffect(()=>{
    const element=body.current;if(!element)return;
    // Eight-pixel rows with a twelve-pixel gap keep the DOM in reading order.
    const measure=()=>{
      const offset=Number.parseFloat(window.getComputedStyle(element.parentElement!).paddingTop)||0;
      setRows(Math.ceil((element.getBoundingClientRect().height+offset+12)/20));
    };
    if(typeof ResizeObserver==='undefined'){
      measure();window.addEventListener('resize',measure);
      return()=>window.removeEventListener('resize',measure);
    }
    const observer=new ResizeObserver(measure);observer.observe(element);measure();
    return()=>observer.disconnect();
  },[]);
  return <article className="story-card" style={rows?{gridRowEnd:`span ${rows}`}:undefined}>
    <div className="story-card-body" ref={body}>
        <Link className="story-card-main card-read" to={`/stories/${story.id}`} aria-label={`阅读${story.song.title}的完整故事`}>
          <div className="story-cover"><img src={cardCover(story)} alt={`《${story.song.title}》${story.photo_url?'记忆照片':'配图'}`} loading="lazy"/><span className="cover-stamp">{story.is_demo_sample?'虚构样例':'音乐卡片'}</span>{cardPhotos(story).length>1&&<span className="photo-count">{cardPhotos(story).length} 张</span>}</div>
          <div className="story-front-copy"><h3>{story.song.title}</h3><span className="story-artist">{story.song.artist}</span><p className="story-card-title">{story.title||story.excerpt}</p>{matchLabel&&<span className="match-label">{matchLabel}</span>}</div>
        </Link>
        <TagLinks tags={story.tags}/>
        <div className="story-card-author"><span aria-hidden="true">{story.author_name.slice(0,1)}</span>{story.author_name}</div>
    </div>
  </article>;
}

export function StoryGrid({stories}:{stories:PublicStory[]}) {return <div className="story-masonry">{stories.map(story=><StoryEntry key={story.id} story={story}/>)}</div>;}

export function PublicStoryList({path,heading='同一首歌，不同的我们',excludeId,recommended=false}:{path:string;heading?:string|null;excludeId?:number;recommended?:boolean}) {
  const [version,setVersion]=useState(0);
  const {value,error}=useData<PublicStory[]>(path,version);
  const {user}=useSession();
  const [interests,setInterests]=useState<Memory[]|null>(null);
  useEffect(()=>{
    if(!recommended||!user){setInterests([]);return;}
    setInterests(null);
    const control=new AbortController();
    void apiRequest<Memory[]>(apiBaseUrl,'/api/memories',{signal:control.signal}).then(cards=>{if(!control.signal.aborted)setInterests(cards);}).catch(()=>{if(!control.signal.aborted)setInterests([]);});
    return()=>control.abort();
  },[recommended,user?.id,version]);
  const hasFanSamples=value?.some(story=>story.is_demo_sample&&story.song.is_demo===false);
  const ownIds=new Set(interests?.map(card=>card.id)??[]);
  const stories=value?.filter(story=>story.id!==excludeId&&!(recommended&&hasFanSamples&&story.is_demo_sample&&story.song.is_demo===true)&&!(recommended&&user&&(story.is_mine||ownIds.has(story.id))));
  const ordered=stories&&interests!==null?recommended?rankRecommendedStories(stories,interests):stories:undefined;
  return <section className="public-story-list">{heading&&<div className="list-heading"><h2>{heading}</h2>{!recommended&&stories&&<span>{stories.length} 张卡片</span>}</div>}{error?<div className="form-error" role="alert">{error}<button className="text-button" onClick={()=>setVersion(value=>value+1)}>重试</button></div>:!ordered?<p role="status">正在翻开卡片…</p>:ordered.length?<StoryGrid stories={ordered}/>:<div className="empty-paper"><h3>这里，等一段愿意分享的故事。</h3><p>每一张音乐卡片都先为自己保存，公开由你决定。</p></div>}</section>;
}

export function DiscoverPage({home=false}:{home?:boolean}) {
  const [params,setParams]=useSearchParams();
  const song=params.get('song'),lyric=params.get('lyric'),tag=params.get('tag');
  const submitted=params.get('q')?.trim()??'';
  const submittedMode=params.get('mode')==='semantic'?'semantic':'keyword';
  const [query,setQuery]=useState(submitted||(tag?`#${tag}`:''));
  const [mode,setMode]=useState<'semantic'|'keyword'>(submittedMode);
  const [result,setResult]=useState<PublicSearchResult|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const control=new AbortController();
    setQuery(submitted||(tag?`#${tag}`:''));setMode(submittedMode);
    setResult(null);setError('');setBusy(Boolean(submitted));
    if(submitted)void apiRequest<PublicSearchResult>(apiBaseUrl,'/api/stories/search',{
      method:'POST',signal:control.signal,body:JSON.stringify({query:submitted,mode:submitted.startsWith('#')?'keyword':submittedMode,...(song?{song_id:Number(song)}:{}),...(lyric?{lyric_id:lyric}:{}),...(tag?{tag}:{})}),
    }).then(response=>{if(!control.signal.aborted)setResult(response);})
      .catch(reason=>{if(!control.signal.aborted)setError((reason as Error).message);})
      .finally(()=>{if(!control.signal.aborted)setBusy(false);});
    return()=>control.abort();
  },[song,lyric,tag,submitted,submittedMode,retry]);
  function search(event:FormEvent){
    event.preventDefault();if(!query.trim())return;
    const next=new URLSearchParams(params);next.set('q',query.trim());
    if(mode==='semantic')next.set('mode',mode);else next.delete('mode');
    if(next.toString()===params.toString())setRetry(value=>value+1);else setParams(next);
  }
  function clearSearch(){const next=new URLSearchParams(params);next.delete('q');next.delete('mode');setParams(next);}
  const filters=new URLSearchParams();if(song)filters.set('song_id',song);if(lyric)filters.set('lyric_id',lyric);if(tag)filters.set('tag',tag);
  const recommended=!submitted&&!song&&!lyric&&!tag;
  return <section className={`journal-page discover-page${home?' fan-home':''}`}>
    {(song||lyric||tag)&&<BackLink fallback="/discover"/>}
    <header className="discover-intro"><div><span className="journal-eyebrow">追过的现场 · 爱过的歌</span><h1>{home?'把喜欢，听成生活。':'在歌里，遇见同路人。'}</h1></div><MusicNote className="discover-doodle" size={30} weight="light" aria-hidden="true"/></header>
    <form className="recall-form public-search" onSubmit={search}><label className="sr-only" htmlFor="public-query">{mode==='keyword'?'找歌手、歌曲、演出或 #标签':'用一句经历，找一段共鸣'}</label><div className="recall-input"><input id="public-query" value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} placeholder={mode==='keyword'?'歌手、歌曲、演出或 #标签':'第一次听完现场后，舍不得回家'}/><button disabled={busy||!query.trim()}>{busy?'寻找中…':'找共鸣'}</button></div><div className="recall-tools"><div className="segmented-control small"><button type="button" aria-pressed={mode==='keyword'} onClick={()=>setMode('keyword')}>歌曲 / 歌手 / 标签</button><button type="button" aria-pressed={mode==='semantic'} onClick={()=>setMode('semantic')}>AI 经历匹配</button></div></div></form>
    {recommended&&<ThemeLinks/>}
    {(song||lyric||tag)&&<div className="active-filter"><span>{tag?`#${tag}`:lyric?'同一句词下的卡片':'同一首歌里的卡片'}</span><button className="text-button" onClick={()=>setParams({})}>看全部共鸣 ×</button></div>}
    {busy&&<p className="inline-status" role="status">正在公开卡片里寻找…</p>}{error&&<p className="form-error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>}
    {submitted?result&&<section aria-live="polite"><div className="list-heading"><h2>关于“{submitted}”</h2><button className="text-button" onClick={clearSearch}>回看故事</button></div><p className="resource-note">{result.notice||(result.mode==='semantic'?'这些经历可能与你有关，下面是作者的公开原文。':`${result.items.length} 张相关卡片`)}</p>{result.items.length?<div className="story-masonry">{result.items.map(item=><StoryEntry key={item.story.id} story={item.story} matchLabel={result.mode==='semantic'?item.match_label:undefined}/>)}</div>:<div className="empty-paper"><h3>还没有找到相关卡片。</h3><p>试试歌手、歌名或标签，也可以切换经历匹配。</p></div>}</section>:<PublicStoryList path={`/api/stories?${filters}`} recommended={recommended} heading={tag?`关于 #${tag}`:lyric?'同一句词，不同的我们':song?'这首歌里的我们':'这些歌，唱进了生活'}/>}
    {recommended&&<RecentConcerts/>}
  </section>;
}

export function StoryPage() {
  const {storyId}=useParams(),[retry,setRetry]=useState(0);
  const {value:story,error}=useData<PublicStory>(`/api/stories/${storyId}`,retry);
  if(!story)return <section className="journal-page"><BackLink fallback="/discover"/>{error?<div className="empty-paper" role="alert"><h1>这一页，暂时合上了。</h1><p>{error}</p><button className="soft-button" onClick={()=>setRetry(value=>value+1)}>重新查看</button></div>:<p role="status">正在翻开故事…</p>}</section>;
  const capture=new URLSearchParams();if(story.offset_ms!==null)capture.set('at',String(story.offset_ms));if(story.lyric_id)capture.set('lyric',story.lyric_id);if(story.theme_id)capture.set('theme',story.theme_id);if(story.end_ms!=null)capture.set('end',String(story.end_ms));if(story.event_id)capture.set('event',story.event_id);
  return <section className="journal-page public-detail"><BackLink fallback="/discover"/>
    <StoryCard author={story.author_name} sample={story.is_demo_sample} title={story.title} year={story.life_year} time={story.life_time} song={story.song} photos={cardPhotos(story)} text={story.excerpt} tags={story.tags} anchor={story.offset_ms} end={story.end_ms} lyric={story.lyric}/>
    {story.event_id&&<EventNote id={story.event_id}/>}
    <Link className="primary-button" to={`/songs/${story.song_id}/write?${capture}`}>我也想留下这一刻 ↗</Link>
  </section>;
}

export function ThemePage() {
  const {themeId}=useParams();const {value,error}=useData<Theme[]>('/api/themes');
  const theme=value?.find(item=>item.id===themeId);
  return <section className="journal-page theme-page"><BackLink fallback="/discover"/>{!theme?<p role={error?'alert':'status'}>{error||(value?'这个主题还没有开启。':'正在打开主题…')}</p>:<><h1>{theme.title}</h1>{theme.image_url&&<img className="theme-hero" src={theme.image_url} alt=""/>}<p className="theme-question">{theme.prompt}</p><Link className="primary-button" to={`/?theme=${theme.id}`}>选一首歌，写我的这一刻 ↗</Link><PublicStoryList path={`/api/stories?theme_id=${theme.id}`} heading="这个主题里的我们"/></>}</section>;
}
