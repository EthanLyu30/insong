import {Link} from 'react-router';
import {ArrowUpRight,Play} from '@phosphor-icons/react';
import type {Song} from './api';
import type {Lyric} from './api';
import type {Photo} from './memoryClient';
import {formatPosition} from './memoryClient';
import {PhotoGallery} from './PhotoGallery';
import {songCover} from './cardMedia';
import {AudioPlayer} from './AudioPlayer';
import {StoryBody} from './StoryContent';
import {memoryDateLabel} from './memoryDates';
import type {ConcertMusicSelection} from './memoryClient';
import {ConcertMusicLine} from './ConcertMusicLine';
import './readingRefinements.css';

type Props={author:string;sample?:boolean;title?:string|null;headingLevel?:'h1'|'h2';year?:number|null;time?:string|null;song:Song;photos:Photo[];text:string;tags?:string[];scope?:'public'|'mine';anchor?:number|null;end?:number|null;lyric?:Lyric|null;musicSelection?:ConcertMusicSelection|null};

export function StoryCard({author,sample=false,title,headingLevel:Heading='h1',year,time,song,photos,text,tags,scope='public',anchor=null,end=null,lyric,musicSelection}:Props){
  const date=memoryDateLabel({life_year:year,life_time:time});
  const playback=new URLSearchParams();if(anchor!==null)playback.set('at',String(anchor));if(end!==null)playback.set('end',String(end));
  const internal=`/songs/${song.id}${playback.size?`?${playback}`:''}`;
  const external=song.qq_music_url;
  const name=<><strong>{song.title}</strong><span>{song.artist}</span>{external&&<ArrowUpRight size={14} aria-hidden="true"/>}</>;
  return <article className="keepsake-paper public-moment unified-story-card">
    <header className="story-card-header"><div className="story-byline"><span className="story-avatar">{author.slice(0,1)}</span><div><strong>{author}</strong><small>{sample?'虚构样例故事':'听友的音乐卡片'}</small></div></div>{date&&<p className="story-life">{date}</p>}</header>
    {title&&<Heading className="moment-title">{title}</Heading>}
    {musicSelection?<ConcertMusicLine music={musicSelection}/>:<div className="card-song-line">
      {external?<a className="card-song-name" href={external} target="_blank" rel="noopener noreferrer" aria-label={`在QQ音乐查看${song.title} · ${song.artist}`}>{name}</a>:<Link className="card-song-name" to={internal} aria-label={`查看歌曲${song.title} · ${song.artist}`}>{name}</Link>}
      {song.audio_url?<AudioPlayer song={song} anchor={anchor} end={end} inline/>:external?<a className="card-song-play" href={external} target="_blank" rel="noopener noreferrer" aria-label={`在QQ音乐播放${song.title}`} title="在QQ音乐播放"><Play size={22} weight="fill"/></a>:<button type="button" className="card-song-play" disabled aria-label={`播放${song.title}`} title="暂未接入音源"><Play size={22} weight="fill"/></button>}
      {!song.audio_url&&<small className="card-song-status">{external?'QQ 音乐播放':'暂未接入音源'}</small>}
    </div>}
    <PhotoGallery photos={photos} fallback={songCover(song)}/>
    <StoryBody text={text} tags={tags} scope={scope}/>
    {lyric&&<blockquote className="lyric-quote">“{lyric.text}”<small>{song.is_demo?'原创示例词句 · ':''}{formatPosition(anchor)}</small></blockquote>}
  </article>;
}
