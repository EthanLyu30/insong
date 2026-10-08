import type {AtlasArtist,AtlasCity,AtlasEvent} from './footprintAtlas';
import {mapMarkerPhotos,type MarkerPhoto} from './mapMarkerPhotos.ts';
import {officialArtistPhotos} from './officialArtistPhotos.ts';

export type MapPhotoChoice={event_id:string;url:string;source:'mine'|'public';memory_id:number;author_name?:string;is_demo_sample?:boolean;views?:number};
export type PersonalRegion={key:string;center:[number,number];bounds:[[number,number],[number,number]];eventIds:string[]};
type RegionEvent=Pick<AtlasEvent,'id'|'city'|'date'|'event_status'>;

/** Frame a new future view around real dates; camera interaction guards remain in AtlasMap. */
export function scheduleOverview(scope:string,period:'past'|'upcoming',events:RegionEvent[],cities:AtlasCity[]):PersonalRegion|null{
  return scope==='mine'||period==='upcoming'?personalOverview(events,cities):null;
}

function distance(a:AtlasCity,b:AtlasCity){
  const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}

/** Count distinct known nights; nearby cities form one regional memory map. */
export function personalOverview(events:RegionEvent[],cities:AtlasCity[]):PersonalRegion|null{
  const validCities=cities.filter(city=>Number.isFinite(city.lng)&&Number.isFinite(city.lat)&&city.lng>=73&&city.lng<=135.5&&city.lat>=16&&city.lat<=54);
  const unique=[...new Map(events.filter(event=>event.event_status!=='cancelled'&&validCities.some(city=>city.name===event.city)).map(event=>[event.id,event])).values()];
  if(!unique.length)return null;
  const anchors=validCities.filter(city=>unique.some(event=>event.city===city.name));
  const regions=anchors.map(anchor=>{
    const nearby=anchors.filter(city=>distance(anchor,city)<=160);
    const shows=unique.filter(event=>nearby.some(city=>city.name===event.city));
    return {nearby,shows,key:nearby.map(city=>city.id).sort().join(':'),latest:shows.map(event=>event.date).sort().at(-1)??''};
  }).sort((a,b)=>b.shows.length-a.shows.length||b.latest.localeCompare(a.latest)||a.key.localeCompare(b.key));
  const best=regions[0],lngs=best.nearby.map(city=>city.lng),lats=best.nearby.map(city=>city.lat);
  const west=Math.min(...lngs),east=Math.max(...lngs),south=Math.min(...lats),north=Math.max(...lats);
  return {key:best.key,center:[(west+east)/2,(south+north)/2],bounds:[[west-.14,south-.12],[east+.14,north+.12]],eventIds:best.shows.map(event=>event.id).sort()};
}

/** Choose a representative from the visible city's nights, without relabeling
 * an old sourced artist image as an official photograph of this performance. */
export function mapPhotoIdentity(city:string,events:AtlasEvent[],artists:AtlasArtist[]=[],photos:MapPhotoChoice[]=[],artistId?:string){
  const shows=events.filter(event=>event.city===city&&(!artistId||event.artist_id===artistId)&&event.event_status!=='cancelled');
  const ordered=[...shows].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const candidates=photos.filter(photo=>shows.some(event=>event.id===photo.event_id)&&/^\/api\/photos\/[\w-]+$/.test(photo.url)).sort((a,b)=>{
    const priority=(photo:MapPhotoChoice)=>photo.source==='mine'?1:0;
    const date=(photo:MapPhotoChoice)=>shows.find(event=>event.id===photo.event_id)?.date??'';
    return priority(b)-priority(a)||(a.source==='public'&&b.source==='public'?(b.views??0)-(a.views??0):0)||date(b).localeCompare(date(a))||b.memory_id-a.memory_id;
  });
  const selected=candidates[0],event=selected?shows.find(event=>event.id===selected.event_id):ordered[0];
  const official=event?officialArtistPhotos[event.artist_id]:undefined;
  const fallback=official??(event?mapMarkerPhotos[event.artist_id]:undefined);
  const name=artists.find(artist=>artist.id===event?.artist_id)?.name??event?.songs?.[0]?.artist??'';
  const photo=selected?{url:selected.url,context:`${selected.source==='mine'?'我的经历':'同担公开记忆'} · ${event?.date??''}${selected.is_demo_sample?' · 虚构样例配图（非本场实拍）':''}`,bakedAvatar:false,contain:false}:fallback?{...fallback,bakedAvatar:!official&&['gem','liu','liu-yuxin'].includes(event!.artist_id)}:undefined;
  return {photo,name,id:event?.artist_id??'',eventId:event?.id,source:selected?.source??(official?'official':fallback?'reference':'none'),eventCount:shows.length};
}

/** Only real, currently scoped city/artist pairs need engine markers. */
export function mapPhotoMarkers(cities:AtlasCity[],events:AtlasEvent[],artists:AtlasArtist[]=[],photos:MapPhotoChoice[]=[]){
  const byCity=new Map(cities.map(city=>[city.name,city]));
  const knownArtists=new Set(artists.map(artist=>artist.id));
  const groups=new Map<string,{city:AtlasCity;artistId:string;events:AtlasEvent[]}>();
  for(const event of events){
    const city=byCity.get(event.city);
    if(!city||!knownArtists.has(event.artist_id)||event.event_status==='cancelled')continue;
    const key=`${city.id}:${event.artist_id}`;
    const group=groups.get(key)??{city,artistId:event.artist_id,events:[]};
    group.events.push(event);groups.set(key,group);
  }
  return [...groups].flatMap(([key,group])=>{
    const identity=mapPhotoIdentity(group.city.name,group.events,artists,photos,group.artistId);
    return identity.photo?[{key,...group,identity}]:[];
  });
}

export function mapPhotoCredits(events:AtlasEvent[],artists:AtlasArtist[]=[],photos:MapPhotoChoice[]=[]):(MarkerPhoto&{name:string})[]{
  const seen=new Set<string>(),groups=[...new Map(events.map(event=>[JSON.stringify([event.city,event.artist_id]),event])).values()];
  return groups.flatMap(event=>{
    const identity=mapPhotoIdentity(event.city,events,artists,photos,event.artist_id);
    if(!identity.photo||!('source' in identity.photo))return [];
    const reference=identity.photo as MarkerPhoto;
    if(!reference.source||seen.has(reference.source))return [];
    seen.add(reference.source);return [{...reference,name:identity.name}];
  });
}
