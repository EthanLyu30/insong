import type {AtlasCity} from './footprintAtlas';

export type ExplorationArea={center:[number,number];bounds:[[number,number],[number,number]];zoom:number};
const validPoint=(lng:number,lat:number)=>Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<85.051129;

export function explorationFromParam(value:string|null):ExplorationArea|null{
  if(!value||value.split(',').length!==7||value.split(',').some(part=>!part.trim()))return null;
  const [lng,lat,zoom,west,south,east,north]=value.split(',').map(Number);
  if(!validPoint(lng,lat)||!validPoint(west,south)||!validPoint(east,north)||!Number.isFinite(zoom)||zoom<1||zoom>21||west>=east||south>=north||lng<west||lng>east||lat<south||lat>north)return null;
  return {center:[lng,lat],zoom,bounds:[[west,south],[east,north]]};
}
export function explorationParam(area:ExplorationArea):string{
  return [...area.center,area.zoom,...area.bounds[0],...area.bounds[1]].map(value=>Number(value.toFixed(6))).join(',');
}
type ProjectedMap={project(point:[number,number]):{x:number;y:number};unproject(point:[number,number]):{lng:number;lat:number};getZoom():number};
export function explorationAtPoint(map:ProjectedMap,center:[number,number],width:number,height:number):ExplorationArea|null{
  const point=map.project(center);
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>map.unproject([point.x+x*width/2,point.y+y*height/2]));
  const lngs=corners.map(point=>point.lng),lats=corners.map(point=>point.lat);
  return explorationFromParam(explorationParam({center,zoom:map.getZoom(),bounds:[[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]]}));
}
/** Scope follows the current visible map size/zoom, not a fixed business radius. */
export function eventsInExploration<T extends {city:string;venue_lng?:number;venue_lat?:number}>(events:T[],cities:AtlasCity[],area:ExplorationArea):T[]{
  const [[west,south],[east,north]]=area.bounds;
  return events.filter(event=>{
    const city=cities.find(item=>item.name===event.city);
    const lng=validPoint(event.venue_lng!,event.venue_lat!)?event.venue_lng:city?.lng;
    const lat=validPoint(event.venue_lng!,event.venue_lat!)?event.venue_lat:city?.lat;
    return lng!==undefined&&lat!==undefined&&validPoint(lng,lat)&&lng>=west&&lng<=east&&lat>=south&&lat<=north;
  });
}
