import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useLocation, useParams, useSearchParams} from 'react-router';
import {ArrowUpRight, MusicNote, X} from '@phosphor-icons/react';
import {apiBaseUrl} from './api';
import {apiRequest, type Memory, type PublicStory, type PublicSearchResult, type Theme} from './memoryClient';
import {cardCover, cardPhotos} from './cardMedia';
import {StoryCard} from './StoryCard';
export {TagLinks,StoryBody} from './StoryContent';
import {useData} from './useData';
import {EventNote} from './EventNote';
import {chinaToday, dateLabel, phaseLabel, type AtlasCatalog} from './footprintAtlas';
import {venuePhotograph} from './photoSources';
import {BackLink} from './Navigation';
import {useSession} from './SessionContext';
import {rankRecommendedStories} from './revisionBehavior';
import {discoverySearchMode} from './discoverySearch';
import {PublicFeed} from './PublicFeed';
import './readingRefinements.css';

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

export function StoryEntry(props:{story:PublicStory}|{memory:Memory;author:string}) {
  const memory='memory' in props?props.memory:undefined;
  const card='memory' in props?props.memory:props.story;
  const author='memory' in props?props.memory.owner_display_name??props.author:props.story.author_name;
  const text='memory' in props?props.memory.story:props.story.excerpt;
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
        <Link className="story-card-main card-read" to={`/${memory?'memories':'stories'}/${card.id}`} aria-label={memory?`阅读我的记忆：${card.title||card.song.title}`:`阅读${card.song.title}的完整故事`}>
          <div className="story-cover"><img src={cardCover(card)} alt={`《${card.song.title}》${card.is_demo_sample?'演出配图':card.photo_url?'记忆照片':'配图'}`} loading="lazy"/><span className="cover-stamp">{card.is_demo_sample?'虚构样例':'音乐卡片'}</span>{cardPhotos(card).length>1&&<span className="photo-count">{cardPhotos(card).length} 张</span>}</div>
          <div className="story-front-copy"><div className="story-song-line"><h3>{card.song.title}</h3><span className="story-artist">{card.song.artist}</span></div><p className="story-card-title">{card.title||text}</p></div>
        </Link>
        <div className="story-card-footer">{memory&&<span className="concert-card-privacy">{memory.publication?.published?'已公开':'仅自己'}</span>}<div className="story-card-author" role="img" aria-label={`作者：${author}`} title={author}><span aria-hidden="true">{author.slice(0,1)}</span></div></div>
    </div>
  </article>;
}

export function StoryGrid({stories,independentColumns=false}:{stories:PublicStory[];independentColumns?:boolean}) {
  if(!independentColumns)return <div className="story-masonry">{stories.map(story=><StoryEntry key={story.id} story={story}/>)}</div>;
  return <div className="story-masonry story-masonry-columns">{[0,1].map(column=><div className="story-masonry-column" key={column}>{stories.filter((_,index)=>index%2===column).map(story=><StoryEntry key={story.id} story={story}/>)}</div>)}</div>;
}

export function PublicStoryList({path,heading='同一首歌，不同的我们',excludeId,recommended=false,independentColumns=false}:{path:string;heading?:string|null;excludeId?:number;recommended?:boolean;independentColumns?:boolean}) {
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
  return <section className="public-story-list">{heading&&<div className="list-heading"><h2>{heading}</h2>{!recommended&&stories&&<span>{stories.length} 张卡片</span>}</div>}{error?<div className="form-error" role="alert">{error}<button className="text-button" onClick={()=>setVersion(value=>value+1)}>重试</button></div>:!ordered?<p role="status">正在翻开卡片…</p>:ordered.length?<StoryGrid stories={ordered} independentColumns={independentColumns}/>:<div className="empty-paper"><h3>这里，等一段愿意分享的故事。</h3><p>每一张音乐卡片都先为自己保存，公开由你决定。</p></div>}</section>;
}

export function DiscoverPage({home=false}:{home?:boolean}) {
  const [params,setParams]=useSearchParams();
  const song=params.get('song'),lyric=params.get('lyric'),tag=params.get('tag');
  const submitted=params.get('q')?.trim()??'';
  const submittedMode=discoverySearchMode(submitted,params.get('mode'));
  const [query,setQuery]=useState(submitted||(tag?`#${tag}`:''));
  const [suggestionsOpen,setSuggestionsOpen]=useState(false);
  const searchInput=useRef<HTMLInputElement>(null),composing=useRef(false);
  const [result,setResult]=useState<PublicSearchResult|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const control=new AbortController();
    setQuery(submitted||(tag?`#${tag}`:''));
    setResult(null);setError('');setBusy(Boolean(submitted));
    if(submitted)void apiRequest<PublicSearchResult>(apiBaseUrl,'/api/stories/search',{
      method:'POST',signal:control.signal,body:JSON.stringify({query:submitted,mode:submittedMode,...(song?{song_id:Number(song)}:{}),...(lyric?{lyric_id:lyric}:{}),...(tag?{tag}:{})}),
    }).then(response=>{if(!control.signal.aborted)setResult(response);})
      .catch(reason=>{if(!control.signal.aborted)setError((reason as Error).message);})
      .finally(()=>{if(!control.signal.aborted)setBusy(false);});
    return()=>control.abort();
  },[song,lyric,tag,submitted,submittedMode,retry]);
  function search(event:FormEvent){
    event.preventDefault();if(composing.current||!query.trim())return;
    const next=new URLSearchParams(params);next.set('q',query.trim());
    if(tag&&query.trim()!==`#${tag}`)next.delete('tag');
    if(query.trim()!==submitted)next.delete('mode');
    setSuggestionsOpen(false);
    if(next.toString()===params.toString())setRetry(value=>value+1);else setParams(next);
  }
  function clearSearch(){const next=new URLSearchParams(params);next.delete('q');next.delete('mode');setParams(next);}
  const filters=new URLSearchParams();if(song)filters.set('song_id',song);if(lyric)filters.set('lyric_id',lyric);if(tag)filters.set('tag',tag);
  const recommended=!submitted&&!song&&!lyric&&!tag;
  return <section className={`journal-page discover-page${home?' fan-home':''}`}>
    {(song||lyric||tag)&&<BackLink fallback="/discover"/>}
    <header className="discover-intro"><div><span className="journal-eyebrow">追过的现场 · 爱过的歌</span><h1>{home?'把喜欢，听成生活。':'在歌里，遇见同路人。'}</h1></div><MusicNote className="discover-doodle" size={30} weight="light" aria-hidden="true"/></header>
    <form className="recall-form public-search" onSubmit={search}><label className="sr-only" htmlFor="public-query">找歌手、歌曲、演出、标签，或用一句经历找共鸣</label><div className="public-search-field" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setSuggestionsOpen(false);}}><div className="recall-input"><input id="public-query" ref={searchInput} value={query} maxLength={200} autoComplete="off" onChange={event=>setQuery(event.target.value)} onFocus={()=>setSuggestionsOpen(true)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.nativeEvent.isComposing||composing.current||event.keyCode===229){if(event.key==='Enter')event.preventDefault();return;}if(event.key==='Escape')setSuggestionsOpen(false);}} placeholder="歌手、歌曲、#标签，或一句经历"/><button disabled={busy||!query.trim()}>{busy?'寻找中…':'找共鸣'}</button></div>{suggestionsOpen&&<div className="public-search-suggestions" aria-label="搜索建议">{['周杰伦','#散场','第一次听完现场后，舍不得回家'].map(value=><button type="button" key={value} onMouseDown={event=>event.preventDefault()} onClick={()=>{setQuery(value);setSuggestionsOpen(false);searchInput.current?.focus();}}>{value}</button>)}</div>}</div></form>
    {recommended&&<ThemeLinks/>}
    {(song||lyric)&&<div className="active-filter"><span>{lyric?'同一句词下的卡片':'同一首歌里的卡片'}</span><button className="text-button" onClick={()=>setParams({})}>看全部共鸣 ×</button></div>}
    {busy&&<p className="inline-status" role="status">正在公开卡片里寻找…</p>}{error&&<p className="form-error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>}
    {submitted?result&&<section aria-live="polite"><div className="list-heading"><h2>关于“{submitted}”</h2><button className="search-cancel-button" type="button" onClick={clearSearch} aria-label="取消搜索" title="取消搜索"><X size={18} weight="bold" aria-hidden="true"/></button></div>{(result.notice||result.mode==='keyword')&&<p className="resource-note">{result.items.length} 张相关卡片</p>}{result.items.length?<StoryGrid stories={result.items.map(item=>item.story)} independentColumns/>:<div className="empty-paper"><h3>还没有找到相关卡片。</h3><p>试试歌手、歌名或标签，也可以写一句自己的经历。</p></div>}</section>:<PublicStoryList path={`/api/stories?${filters}`} recommended={recommended} independentColumns heading={tag?`关于 #${tag}`:lyric?'同一句词，不同的我们':song?'这首歌里的我们':'这些歌，唱进了生活'}/>}
    {recommended&&<RecentConcerts/>}
  </section>;
}

function StoryTrailLinks({items,showSong=false}:{items:PublicStory[];showSong?:boolean}) {
  return <div>{items.map(item=><Link className="story-trail-link" key={item.id} to={`/stories/${item.id}`} state={{fromRelatedStory:true}}><img src={cardCover(item)} alt="" loading="lazy"/><span><strong>{item.title||item.excerpt}</strong><small>{showSong&&`《${item.song.title}》 · `}{item.author_name}{item.is_demo_sample?' · 虚构样例':''}</small></span><ArrowUpRight size={16} aria-hidden="true"/></Link>)}</div>;
}

function SameSongStories({story}:{story:PublicStory}) {
  const {value}=useData<PublicStory[]>(`/api/stories?song_id=${story.song_id}`);
  const others=value?.filter(item=>item.id!==story.id&&item.song_id===story.song_id&&(!story.event_id||item.event_id!==story.event_id)).slice(0,2);
  if(!others?.length)return null;
  return <section className="story-trail" aria-label="这首歌的其他故事"><h2>这首歌的其他故事</h2><StoryTrailLinks items={others}/></section>;
}

function SameEventStories({story}:{story:PublicStory}) {
  const {value}=useData<PublicStory[]>(`/api/stories?event_id=${encodeURIComponent(story.event_id!)}`);
  const others=value?.filter(item=>item.id!==story.id&&item.event_id===story.event_id).slice(0,2);
  if(!others?.length)return null;
  return <section className="story-trail" aria-label="这场演出的其他故事"><h2>这场演出的其他故事</h2><StoryTrailLinks items={others} showSong/></section>;
}

export function StoryPage() {
  const {storyId}=useParams(),[retry,setRetry]=useState(0);
  const fromRelatedStory=useLocation().state?.fromRelatedStory===true;
  const {value:story,error}=useData<PublicStory>(`/api/stories/${storyId}`,retry);
  const back=<BackLink fallback="/discover" returnToConcert={fromRelatedStory}/>;
  if(!story)return <section className="journal-page">{back}{error?<div className="empty-paper" role="alert"><h1>这一页，暂时合上了。</h1><p>{error}</p><button className="soft-button" onClick={()=>setRetry(value=>value+1)}>重新查看</button></div>:<p role="status">正在翻开故事…</p>}</section>;
  const capture=new URLSearchParams();if(story.offset_ms!==null)capture.set('at',String(story.offset_ms));if(story.lyric_id)capture.set('lyric',story.lyric_id);if(story.theme_id)capture.set('theme',story.theme_id);if(story.end_ms!=null)capture.set('end',String(story.end_ms));if(story.event_id)capture.set('event',story.event_id);
  return <section className="journal-page public-detail">{back}
    <StoryCard author={story.author_name} sample={story.is_demo_sample} title={story.title} year={story.life_year} time={story.life_time} song={story.song} photos={cardPhotos(story)} text={story.excerpt} tags={story.tags} anchor={story.offset_ms} end={story.end_ms} lyric={story.lyric} musicSelection={story.music_selection}/>
    {(story.event_id||story.event_snapshot)&&<EventNote id={story.event_id??''} snapshot={story.event_snapshot}/>}
    <Link className="primary-button" to={`/songs/${story.song_id}/write?${capture}`}>我也想留下这一刻 ↗</Link>
    <SameSongStories story={story}/>
    {story.event_id&&<SameEventStories story={story}/>}
  </section>;
}

export function ThemePage() {
  const {themeId}=useParams();const {value,error}=useData<Theme[]>('/api/themes');
  const theme=value?.find(item=>item.id===themeId);
  return <section className="journal-page theme-page"><BackLink fallback="/discover"/>{!theme?<p role={error?'alert':'status'}>{error||(value?'这个主题还没有开启。':'正在打开主题…')}</p>:<><h1>{theme.title}</h1>{theme.image_url&&<img className="theme-hero" src={theme.image_url} alt=""/>}<p className="theme-question">{theme.prompt}</p><Link className="primary-button" to={`/?theme=${theme.id}`}>选一首歌，写我的这一刻 ↗</Link><PublicFeed themeId={theme.id} sort="popular" renderStories={stories=><StoryGrid stories={stories}/>}/></>}</section>;
}
