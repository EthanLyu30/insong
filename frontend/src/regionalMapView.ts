import type {Map as GLMap} from 'maplibre-gl';
import {overviewFocus} from './atlasCamera.ts';
import type {PersonalRegion} from './personalMap';

type CityPoint={lng:number;lat:number};
export type RegionalMapView={center:[number,number];bounds:[[number,number],[number,number]];zoom:number;maxZoom:number;duration:0;pitch:0;bearing:0};

/** The default is a province-scale paper map, never a venue/street approach. */
export function regionalMapView(city?:CityPoint|null,region?:PersonalRegion|null,focus?:[number,number]):RegionalMapView{
  const center:[number,number]=city?[city.lng,city.lat]:region?.center??focus??overviewFocus(null);
  const existing=city?undefined:region?.bounds;
  const bounds:[[number,number],[number,number]]=[
    [Math.min(existing?.[0][0]??center[0],center[0]-3.8),Math.min(existing?.[0][1]??center[1],center[1]-2.6)],
    [Math.max(existing?.[1][0]??center[0],center[0]+3.8),Math.max(existing?.[1][1]??center[1],center[1]+2.6)],
  ];
  return {center,bounds,zoom:5.8,maxZoom:6.4,duration:0,pitch:0,bearing:0};
}

type Camera=Pick<GLMap,'stop'|'setPadding'|'setTransformCameraUpdate'|'setCenterElevation'|'setVerticalFieldOfView'|'cameraForBounds'|'jumpTo'>;
export function applyRegionalMapView(map:Camera,view:RegionalMapView,layout:{height:number;header:number;sheet:number;nav:number}){
  map.stop();map.setPadding({top:0,bottom:0,left:0,right:0});
  map.setTransformCameraUpdate(null);map.setCenterElevation(0);map.setVerticalFieldOfView(36.87);
  const top=Math.min(layout.header+40,layout.height*.4);
  const bottom=Math.max(0,Math.min(layout.sheet+layout.nav+45,layout.height-top-120));
  const camera=map.cameraForBounds(view.bounds,{padding:{top,bottom,left:35,right:65},maxZoom:view.maxZoom,bearing:0});
  map.jumpTo({center:camera?.center??view.center,zoom:camera?.zoom??view.zoom,pitch:0,bearing:0});
}
