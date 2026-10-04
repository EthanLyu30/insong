type Point = {lng:number;lat:number};
type VenuePoint = {venue_lng?:number;venue_lat?:number};
export const CHINA_BOUNDS: [[number,number],[number,number]] = [[73,16],[135.5,54]];
export const YANGTZE_DELTA: [number,number] = [120.75,31.3];
export function overviewFocus(position?:{longitude:number;latitude:number}|null):[number,number] {
  return position && Number.isFinite(position.longitude) && Number.isFinite(position.latitude)
    && position.longitude>=73 && position.longitude<=135.5 && position.latitude>=16 && position.latitude<=54
    ? [position.longitude,position.latitude] : YANGTZE_DELTA;
}
export function cameraTarget(scene:string,city?:Point|null,event?:VenuePoint|null,reduced=false) {
  const precise=Number.isFinite(event?.venue_lng)&&Number.isFinite(event?.venue_lat);
  return {
    center:(precise?[event!.venue_lng!,event!.venue_lat!]:city?[city.lng,city.lat]:overviewFocus(null)) as [number,number],
    zoom:scene==='map'?(precise?14.3:city?10.8:6.4):precise?(scene==='sky'?19.7:16.1):11,
    pitch:scene==='map'?(city?36:0):scene==='sky'?80:64,bearing:scene==='sky'?0:scene==='map'?0:-28,
    duration:reduced?0:scene==='map'?2200:scene==='sky'?2600:3400,
  };
}
