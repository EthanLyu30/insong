import {useState} from 'react';
import {MusicNotes} from '@phosphor-icons/react';
import type {ConcertMusicSelection} from './memoryClient';
import {MusicSelectionDialog} from './ConcertMusicPicker';

export function ConcertMusicLine({music}:{music:ConcertMusicSelection}){
  const [open,setOpen]=useState(false);
  const collection=music.setlist_kind==='artist_collection';
  const title=music.mode==='playlist'?collection?'这一晚的音乐':'这一场的歌单':music.tracks.length===1?music.tracks[0].title:`${music.tracks[0].title}等 ${music.tracks.length} 首`;
  return <><div className="card-song-line concert-music-line"><button type="button" className="card-song-name" onClick={()=>setOpen(true)}><strong>{title}</strong><span>{music.tracks[0]?.artist} · {music.tracks.length} 首</span></button><button type="button" className="card-song-play" aria-label="查看分享的音乐" title="查看分享的音乐" onClick={()=>setOpen(true)}><MusicNotes size={22}/></button><small className="card-song-status">{collection?'关联作品 · ':''}QQ 音乐查看</small></div>
    {open&&<MusicSelectionDialog title="分享的音乐" onClose={()=>setOpen(false)}><p className="concert-music-note">{music.note}</p><div className="concert-music-track-list">{music.tracks.map(track=><a key={track.title} href={track.url} target="_blank" rel="noopener noreferrer"><strong>{track.title}</strong><span>{track.artist}</span><small>QQ 音乐查看 ↗</small></a>)}</div></MusicSelectionDialog>}
  </>;
}
