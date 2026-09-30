export type SceneView={x:number;y:number;zoom:number};
export function isSceneTap(start:[number,number],end:[number,number],moved=false){
  return !moved&&Math.hypot(end[0]-start[0],end[1]-start[1])<8;
}
export function clampSceneView(view:SceneView):SceneView{
  return {x:Math.max(-.08,Math.min(.08,view.x)),y:Math.max(-.06,Math.min(.06,view.y)),zoom:Math.max(1,Math.min(1.16,view.zoom))};
}
