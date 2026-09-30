export type AtlasArtist = { id: string; name: string; initial?: string; color?: string; aliases?: string[] };
export type AtlasCity = { id: string; name: string; lng: number; lat: number; capital?: boolean };
export type AtlasSong = { title: string; artist: string; url: string; platform?: string; link_kind?: 'search' | 'song' };
export type AtlasEvent = {
  id: string; artist_id: string; title: string; city: string; venue: string; date: string; time?: string;
  source_url: string; source_title: string; source_kind?: 'report' | 'announcement';
  setlist_kind?: 'confirmed' | 'partial' | 'artist_collection'; setlist_note?: string;
  venue_lng?: number; venue_lat?: number;
  songs: AtlasSong[];
};
export type AtlasCatalog = { artists: AtlasArtist[]; cities: AtlasCity[]; events: AtlasEvent[]; verified_on?: string; today?: string };
export type AtlasVenue = { id: string; city: string; name: string; events: AtlasEvent[] };

export function chinaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function eventPhase(event: Pick<AtlasEvent, 'date'>, today = chinaToday()) {
  return event.date > today ? 'upcoming' : event.date < today ? 'past' : 'today';
}
export function qqMusicUrl(title: string, artist: string) {
  return `https://y.qq.com/n/ryqq_v2/search?w=${encodeURIComponent(`${artist} ${title}`.trim())}`;
}
export function songLink(song: AtlasSong) {
  try { if (new URL(song.url).hostname === 'y.qq.com' && new URL(song.url).protocol === 'https:') return song.url; } catch { /* Normalize old catalog entries to QQ Music. */ }
  return qqMusicUrl(song.title, song.artist);
}
export function filterArtists(artists: AtlasArtist[], query: string) {
  const normalized = query.trim().toLocaleLowerCase().replace(/[.\s]/g, '');
  return artists.filter(artist => [artist.name, ...(artist.aliases ?? [])].some(value => value.toLocaleLowerCase().replace(/[.\s]/g, '').includes(normalized)));
}
export function groupVenues(events: AtlasEvent[]): AtlasVenue[] {
  const groups = new Map<string, AtlasVenue>();
  for (const event of events) {
    const id = `${event.city}:${event.venue}`;
    if (!groups.has(id)) groups.set(id, { id, city: event.city, name: event.venue, events: [] });
    groups.get(id)!.events.push(event);
  }
  return [...groups.values()].map(venue => ({ ...venue, events: venue.events.sort((a, b) => b.date.localeCompare(a.date)) }));
}
export function projectChina(lng: number, lat: number): [number, number] {
  const mercator = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 180 / Math.PI;
  return [55 + (lng - 73) * 14.2, 50 + (mercator(54) - mercator(lat)) * 14.2];
}
export function dateLabel(date: string) { return date.replaceAll('-', '.'); }
