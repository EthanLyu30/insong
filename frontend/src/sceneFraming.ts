export type PhotoView={yaw:number;pitch:number;zoom:number};
export const HOME_PHOTO_VIEW:PhotoView={yaw:0,pitch:0,zoom:1};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

// Perspective foreshortening depends on horizontal FOV (hence viewport aspect).
// Scale in XY only: the home framing stays unchanged; yaw/pitch cannot reveal edges.
export function photoCoverage(aspect:number,yaw:number,pitch:number){
  const y=Math.abs(yaw)*Math.PI/180,p=Math.abs(pitch)*Math.PI/180,tanV=Math.tan(35*Math.PI/360);
  return 1/Math.max(.3,Math.cos(y)-tanV*aspect*Math.sin(y))/Math.max(.3,Math.cos(p)-tanV*Math.sin(p));
}

// Budget zoom using source pixels, viewport crop and the actual rendering density.
export function sceneFrame(width:number,height:number,imageWidth:number,imageHeight:number,dpr:number){
  const scale=Math.max(width/imageWidth,height/imageHeight)*1.08;
  const frameWidth=imageWidth*scale,frameHeight=imageHeight*scale;
  return {width:frameWidth,height:frameHeight,maxZoom:clamp(imageWidth/(frameWidth*Math.max(1,dpr))*1.06,1,1.6)};
}
export function clampPhotoView(view:PhotoView,maxZoom:number):PhotoView{
  return {yaw:clamp(view.yaw,-12,12),pitch:clamp(view.pitch,-7,7),zoom:clamp(view.zoom,1,maxZoom)};
}
export function settlePhotoView(from:PhotoView,to:PhotoView,dt:number){
  const moving=Math.abs(from.yaw-to.yaw)+Math.abs(from.pitch-to.pitch)+Math.abs(from.zoom-to.zoom)>.0005;
  if(!moving)return {view:{...to},moving:false};
  const mix=1-Math.exp(-Math.min(dt,.05)*11);
  return {view:{yaw:from.yaw+(to.yaw-from.yaw)*mix,pitch:from.pitch+(to.pitch-from.pitch)*mix,zoom:from.zoom+(to.zoom-from.zoom)*mix},moving:true};
}
