import type {ConcertMusicSelection} from './memoryClient';

export function validConcertMusic(value:unknown,eventId:unknown):value is ConcertMusicSelection{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const music=value as ConcertMusicSelection;
  return typeof eventId==='string'&&music.event_id===eventId&&['tracks','playlist'].includes(music.mode)
    &&typeof music.note==='string'&&typeof music.setlist_kind==='string'
    &&Array.isArray(music.tracks)&&music.tracks.length>0&&music.tracks.length<=120
    &&new Set(music.tracks.map(track=>track?.title)).size===music.tracks.length
    &&music.tracks.every(track=>track&&typeof track.title==='string'&&track.title.length>0&&typeof track.artist==='string'
      &&typeof track.url==='string'&&/^https:\/\//.test(track.url));
}
