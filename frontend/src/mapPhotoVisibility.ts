export type MapPhotoCircle={key:string;x:number;y:number;diameter:number;priority:number;date:string};
export type MapPhotoBounds={left:number;top:number;right:number;bottom:number};

/** Resolve crowding without moving photos away from their real city anchors. */
export function visibleMapPhotoKeys(points:MapPhotoCircle[],bounds:MapPhotoBounds):string[]{
  const ordered=[...points].sort((a,b)=>b.priority-a.priority||b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
  const visible:MapPhotoCircle[]=[];
  for(const point of ordered){
    if(![point.x,point.y,point.diameter].every(Number.isFinite)||point.diameter<=0)continue;
    const radius=point.diameter/2;
    if(point.x-radius<bounds.left||point.x+radius>bounds.right||point.y-radius<bounds.top||point.y+radius>bounds.bottom)continue;
    // A little overlap makes dense cities readable; only hide near-duplicates.
    if(visible.some(other=>Math.hypot(point.x-other.x,point.y-other.y)<(point.diameter+other.diameter)*.31))continue;
    visible.push(point);
  }
  return visible.map(point=>point.key);
}
