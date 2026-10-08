import type {AtlasCity,AtlasEvent} from './footprintAtlas';
import {personalOverview,type PersonalRegion} from './personalMap.ts';

export type MapPosition={longitude:number;latitude:number};
type RegionEvent=Pick<AtlasEvent,'id'|'city'|'date'|'event_status'>;

export function validMapPosition(position:MapPosition):boolean{
  return Number.isFinite(position.longitude)&&Number.isFinite(position.latitude)&&Math.abs(position.longitude)<=180&&Math.abs(position.latitude)<=90;
}

function kilometres(position:MapPosition,city:AtlasCity){
  const rad=Math.PI/180,a=position.latitude*rad,b=city.lat*rad;
  const h=Math.sin((b-a)/2)**2+Math.cos(a)*Math.cos(b)*Math.sin((city.lng-position.longitude)*rad/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}

/** Local discovery uses actual catalog cities within 200km, never a guessed position. */
export function nearbyConcertOverview(events:RegionEvent[],cities:AtlasCity[],position:MapPosition):PersonalRegion|null{
  if(!validMapPosition(position))return null;
  const nearby=cities.filter(city=>Number.isFinite(city.lng)&&Number.isFinite(city.lat)&&kilometres(position,city)<=200);
  return personalOverview(events.filter(event=>nearby.some(city=>city.name===event.city)),nearby);
}

/** A dense regional fallback only considers real nights within 60 days of today. */
export function recentConcertOverview(events:RegionEvent[],cities:AtlasCity[],today:string):PersonalRegion|null{
  const current=Date.parse(today+'T00:00:00Z');if(!Number.isFinite(current))return null;
  const from=new Date(current-60*86400000).toISOString().slice(0,10),to=new Date(current+60*86400000).toISOString().slice(0,10);
  return personalOverview(events.filter(event=>event.date>=from&&event.date<=to),cities);
}
