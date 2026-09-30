type Point = {lng:number;lat:number};
type VenuePoint = {venue_lng?:number;venue_lat?:number};
export const CHINA_BOUNDS: [[number,number],[number,number]] = [[73,16],[135.5,54]];
export function cameraTarget(scene:string,city?:Point|null,event?:VenuePoint|null,reduced=false) {
  const precise=Number.isFinite(event?.venue_lng)&&Number.isFinite(event?.venue_lat);
  return {
    center:(scene!=='map'&&precise?[event!.venue_lng!,event!.venue_lat!]:city?[city.lng,city.lat]:[104,35]) as [number,number],
    zoom:scene==='map'?(city?7:3):precise?17:11,
    pitch:scene==='map'?0:58,bearing:scene==='map'?0:-28,
    duration:reduced?0:scene==='map'?1400:2200,
  };
}

type XYZ=[number,number,number];
export class SceneFlight {
  private mode='';private start=0;private from:XYZ=[0,0,0];
  deactivate(){this.mode='';}
  replay(){this.mode='';}
  sample(scene:string,now:number,current:XYZ,reduced:boolean){
    const started=scene!==this.mode;
    if(started){this.mode=scene;this.start=now;this.from=[...current];}
    const to:XYZ=scene==='sky'?[380,240,550]:[420,320,530];
    const t=reduced?1:Math.min(Math.max((now-this.start)/2100,0),1),e=t*t*(3-2*t);
    return {started,moving:t<1,position:to.map((value,i)=>this.from[i]+(value-this.from[i])*e) as XYZ};
  }
}
