export type OrbitView={bearing:number;pitch:number;zoom:number};
export type SceneController={orbit:(dx:number,dy:number)=>void;pinch:(from:number,to:number)=>void;zoom:(delta:number)=>void;home:()=>void};
export function isSceneTap(start:[number,number],end:[number,number],moved=false){
  return !moved&&Math.hypot(end[0]-start[0],end[1]-start[1])<8;
}
export function orbitScene(view:OrbitView,dx:number,dy:number,scene:string):OrbitView{
  return {...view,bearing:view.bearing-dx*.36,pitch:Math.max(Math.min(view.pitch,scene==='sky'?65:35),Math.min(82,view.pitch-dy*.2))};
}
export function pinchScene(zoom:number,from:number,to:number,scene:string){
  // During an interrupted flight, preserve the current distance instead of
  // jumping several zoom levels to a close-scene minimum.
  return Math.max(Math.min(zoom,scene==='sky'?18.8:15.8),Math.min(Math.max(zoom,scene==='sky'?20.5:19.2),zoom+Math.log2(Math.max(to,1)/Math.max(from,1))));
}
