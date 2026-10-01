import * as THREE from 'three';
import type {Map as GLMap,CustomLayerInterface} from 'maplibre-gl';
import type {AtlasEvent} from './footprintAtlas';

export type VenueLayer={location:(event?:AtlasEvent)=>void;scene:(mode:string)=>void;dispose:()=>void};
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

// Conceptual photographic environments share the native canvas and gesture values.
// They are not surveyed venue geometry or real event photographs.
export function createVenueLayer(map:GLMap,onImageError:()=>void=()=>{}):VenueLayer{
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(90,1,.1,100);
  const geometry=new THREE.SphereGeometry(10,64,40),nightGeometry=geometry.clone();
  // Portrait composition: retain a broad sky, bring the photographic focal
  // points into the visible scene above the bottom sheet.
  for(const [mesh,power,horizontal] of [[geometry,1.6,.7],[nightGeometry,2.2,1.3]] as const){
    const uv=mesh.attributes.uv;
    for(let i=0;i<uv.count;i++){
      const u=uv.getX(i)-.5;
      uv.setXY(i,.5+Math.atan(u*2*horizontal)/(2*Math.atan(horizontal)),Math.pow(uv.getY(i),power));
    }
  }
  const exteriorMaterial=new THREE.MeshBasicMaterial({side:THREE.BackSide,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false});
  const nightMaterial=exteriorMaterial.clone();
  const exterior=new THREE.Mesh(geometry,exteriorMaterial),interior=new THREE.Mesh(nightGeometry,nightMaterial);
  exterior.rotation.y=Math.PI/2;interior.rotation.y=Math.PI/2;
  exterior.visible=false;interior.visible=false;
  exterior.renderOrder=1;interior.renderOrder=2;world.add(exterior,interior);
  let renderer:THREE.WebGLRenderer|undefined,disposed=false,mode='map',located=false;
  let night=0,fromNight=0,changed=performance.now();
  let exteriorReady=0,nightReady=0,departing=false,departureInterrupted=0,departureOpacity=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const load=(path:string,material:THREE.MeshBasicMaterial)=>new THREE.TextureLoader().load(path,texture=>{
    if(disposed){texture.dispose();return;}
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer!.capabilities.getMaxAnisotropy(),4);
    if(material===exteriorMaterial){texture.wrapS=THREE.RepeatWrapping;texture.offset.x=.04;}
    material.map=texture;material.needsUpdate=true;map.triggerRepaint();
    if(material===exteriorMaterial){exterior.visible=true;exteriorReady=performance.now();}else{interior.visible=true;nightReady=performance.now();}
  },undefined,()=>{if(!disposed){map.getCanvas().dataset.sceneImageError=path;onImageError();}});
  const layer:CustomLayerInterface={
    id:'concert-architecture',type:'custom',renderingMode:'3d',
    onAdd(_map,gl){
      renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl as WebGL2RenderingContext,antialias:true});
      renderer.autoClear=false;
      load('/scenes/venue-sunset-panorama.webp',exteriorMaterial);
      load('/scenes/venue-night-panorama.webp',nightMaterial);
      renderer.resetState();
    },
    render(){
      if(!renderer||disposed)return;
      const elapsed=reduced.matches?1:Math.min((performance.now()-changed)/2600,1);
      night=fromNight+((mode==='sky'?1:0)-fromNight)*smooth(elapsed);
      // Arrival follows geographic zoom, so an interrupted approach stays at city scale.
      const arrival=located?smooth((map.getZoom()-12.7)/3.1):smooth((map.getZoom()-9.6)/1.4);
      if(mode==='map'&&arrival===0)departing=false;
      let visible=mode==='map'&&!departing?0:arrival;
      const departureFade=departureInterrupted?smooth((performance.now()-departureInterrupted)/650):0;
      if(departureInterrupted){visible=Math.min(visible,departureOpacity*(1-departureFade));if(departureFade===1){departing=false;departureInterrupted=0;}}
      map.getContainer().parentElement?.style.setProperty('--scene-arrival',String(visible));
      const exteriorFade=exteriorReady?smooth((performance.now()-exteriorReady)/500):0;
      const nightFade=nightReady?smooth((performance.now()-nightReady)/500):0;
      exteriorMaterial.opacity=visible*exteriorFade;nightMaterial.opacity=night*visible*nightFade;
      if(visible<=0)return;
      camera.aspect=map.getContainer().clientWidth/map.getContainer().clientHeight;
      const exteriorFov=Math.max(60,Math.min(125,110*2**((16.1-map.getZoom())*.22)));
      camera.fov=exteriorFov*(1-night)+map.getVerticalFieldOfView()*night;
      const tilt=(6+(map.getPitch()-64)*.75)*(1-night)+(6+(map.getPitch()-80)*.75)*night;
      camera.rotation.set(tilt*Math.PI/180,-(map.getBearing()+28*(1-night))*Math.PI/180,0,'YXZ');
      camera.updateProjectionMatrix();
      renderer.resetState();renderer.render(world,camera);renderer.resetState();
      const canvas=map.getCanvas();canvas.dataset.model='concept-panorama';canvas.dataset.night=night.toFixed(3);canvas.dataset.sceneArrival=arrival.toFixed(3);
      if(!document.hidden&&(!!departureInterrupted||elapsed<1||(exteriorReady&&exteriorFade<1)||(nightReady&&nightFade<1)))map.triggerRepaint();
    },
    onRemove(){dispose();},
  };
  function dispose(){
    if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',visibility);map.off('movestart',interruptDeparture);
    geometry.dispose();nightGeometry.dispose();exteriorMaterial.map?.dispose();nightMaterial.map?.dispose();exteriorMaterial.dispose();nightMaterial.dispose();renderer?.dispose();
  }
  const interruptDeparture=(event:unknown)=>{
    if(mode!=='map'||!departing||departureInterrupted||!event||typeof event!=='object'||!('originalEvent' in event)||!event.originalEvent)return;
    departureOpacity=located?smooth((map.getZoom()-12.7)/3.1):smooth((map.getZoom()-9.6)/1.4);departureInterrupted=performance.now();map.triggerRepaint();
  };map.on('movestart',interruptDeparture);
  const visibility=()=>{if(!document.hidden&&!disposed)map.triggerRepaint();};document.addEventListener('visibilitychange',visibility);
  map.addLayer(layer);
  return {
    location(event){if(event)located=Number.isFinite(event.venue_lng)&&Number.isFinite(event.venue_lat);map.triggerRepaint();},
    scene(value){if(mode===value)return;departing=value==='map';departureInterrupted=0;fromNight=night;mode=value;changed=performance.now();map.triggerRepaint();},
    dispose,
  };
}
