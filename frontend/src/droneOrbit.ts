export type DroneView={azimuth:number;elevation:number;distance:number};
export const HOME_DRONE:DroneView={azimuth:38,elevation:29,distance:590};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function dragDrone(view:DroneView,dx:number,dy:number):DroneView{
  return {...view,azimuth:view.azimuth-dx*.28,elevation:clamp(view.elevation-dy*.12,16,78)};
}
export function zoomDrone(view:DroneView,ratio:number):DroneView{
  return {...view,distance:clamp(view.distance/Math.max(ratio,.001),220,620)};
}
export function dronePosition(view:DroneView):[number,number,number]{
  const angle=view.azimuth*Math.PI/180,elevation=view.elevation*Math.PI/180,radius=view.distance;
  return [Math.sin(angle)*Math.cos(elevation)*radius,Math.sin(elevation)*radius+22,Math.cos(angle)*Math.cos(elevation)*radius];
}
// Preserve the lower-right architectural composition of the arrival artwork.
export function droneFocus(view:DroneView):[number,number,number]{
  const angle=view.azimuth*Math.PI/180;
  return [-42*Math.cos(angle),25,42*Math.sin(angle)];
}
export function settleDrone(view:DroneView,target:DroneView,seconds:number){
  const blend=1-Math.exp(-Math.min(.1,Math.max(0,seconds))*12);
  const next={azimuth:view.azimuth+(target.azimuth-view.azimuth)*blend,elevation:view.elevation+(target.elevation-view.elevation)*blend,distance:view.distance+(target.distance-view.distance)*blend};
  const moving=Math.abs(next.azimuth-target.azimuth)+Math.abs(next.elevation-target.elevation)+Math.abs(next.distance-target.distance)>.025;
  return {view:moving?next:{...target},moving};
}
