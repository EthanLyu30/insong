type Point = {lng:number;lat:number};
type VenuePoint = {venue_lng?:number;venue_lat?:number};
export const CHINA_BOUNDS: [[number,number],[number,number]] = [[73,16],[135.5,54]];
export function cameraTarget(scene:string,city?:Point|null,event?:VenuePoint|null,reduced=false) {
  const precise=Number.isFinite(event?.venue_lng)&&Number.isFinite(event?.venue_lat);
  return {
    center:(scene!=='map'&&precise?[event!.venue_lng!,event!.venue_lat!]:city?[city.lng,city.lat]:[104,35]) as [number,number],
    zoom:scene==='map'?(city?10.8:3):precise?(scene==='sky'?19.7:16.1):11,
    pitch:scene==='map'?(city?36:0):scene==='sky'?80:64,bearing:scene==='sky'?0:scene==='map'?0:-28,
    duration:reduced?0:scene==='map'?2200:scene==='sky'?2600:3400,
  };
}
