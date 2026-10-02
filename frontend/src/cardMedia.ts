import {apiBaseUrl, type Song} from './api';
import type {Memory, Photo, PublicStory} from './memoryClient';

export function photoSource(url:string):string {
  return url.startsWith('/api/') ? apiBaseUrl+url : url;
}

export function songCover(song:Song):string {
  return song.cover_url ?? `/covers/song-${song.id}.png`;
}

export function cardPhotos(card:Pick<Memory | PublicStory,'photos'|'photo_id'|'photo_url'>):Photo[] {
  return card.photos?.length ? card.photos : card.photo_id && card.photo_url ? [{id:card.photo_id,url:card.photo_url}] : [];
}

export function cardCover(card:Memory | PublicStory):string {
  return card.photo_url ? photoSource(card.photo_url) : songCover(card.song);
}

export function parseTags(text:string):string[] {
  return [...new Set(text.split(/[，,\s]+/).map(tag=>tag.replace(/^#+/,'').trim()).filter(Boolean))];
}
