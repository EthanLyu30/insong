import type * as THREE from 'three';

export function updateDepthSurface(geometry:THREE.PlaneGeometry,worldWidth:number,worldHeight:number,distance=3.2){
  const position=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<position.count;i++){
    const u=uv.getX(i),v=uv.getY(i),t=Math.max(0,Math.min(1,(.68-v)/.68));
    const foreground=t*t*(3-2*t);
    const venue=.1*Math.exp(-Math.pow((v-.45)/.15,2))*Math.exp(-Math.pow((u-.5)/.46,2));
    const depth=.28*foreground+venue,compensation=1-depth/distance;
    position.setXYZ(i,(u-.5)*worldWidth*compensation,(v-.5)*worldHeight*compensation,depth);
  }
  position.needsUpdate=true;geometry.computeBoundingSphere();
}
