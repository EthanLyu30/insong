import * as THREE from 'three';
import type {Map as GLMap,CustomLayerInterface} from 'maplibre-gl';
import type {AtlasEvent} from './footprintAtlas';
import {HOME_PHOTO_VIEW,clampPhotoView,photoCoverage,sceneFrame,settlePhotoView,type PhotoView} from './sceneFraming';
import type {SceneController} from './sceneInteraction';
import {updateDepthSurface} from './sceneDepthSurface';
import {venueScene} from './venueScenes';
import {createDroneVenue} from './droneVenue';
import {HOME_DRONE,dragDrone,zoomDrone,dronePosition,droneFocus,settleDrone,type DroneView} from './droneOrbit';

export type VenueLayer=SceneController&{location:(event?:AtlasEvent)=>void;scene:(mode:string)=>void;dispose:()=>void};
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const DISTANCE=3.2,FOV=35;

// Preserve the cinematic arrival and night textures. Exterior drag enters a
// separate architectural volume, with an unrestricted orbit around its center.
// One map canvas survives the journey, including interrupted camera flights.
export function createVenueLayer(map:GLMap,onImageState:(state:'loading'|'ready'|'error')=>void=()=>{}):VenueLayer{
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(FOV,1,.1,100);
  const geometries=[0,1].map(()=>new THREE.PlaneGeometry(1,1,48,96));
  const materials=[0,1].map(()=>new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false}));
  const surfaces=materials.map((material,i)=>{const mesh=new THREE.Mesh(geometries[i],material);mesh.renderOrder=i;mesh.visible=false;world.add(mesh);return mesh;});
  let renderer:THREE.WebGLRenderer|undefined,disposed=false,mode='map',located=false;
  let night=0,fromNight=0,changed=performance.now(),lastFrame=performance.now();
  let departing=false,departureInterrupted=0,departureOpacity=0;
  let view:PhotoView={...HOME_PHOTO_VIEW},target:PhotoView={...view},maxZoom=1,pixelZoom=1;
  let sized='',readyAt=[0,0],dimensions=[[780,1688],[780,1688]],detailReady=[false,false];
  let profileId:string|null=null,profileFailed=false,loadVersion=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas=map.getCanvas();
  const droneCamera=new THREE.PerspectiveCamera(56,1,1,5000);
  let drone:ReturnType<typeof createDroneVenue>|undefined,droneActive=false,droneStarted=0,environmentRequested=false,foliageRequested=false;
  let droneView:DroneView={...HOME_DRONE},droneTarget:DroneView={...HOME_DRONE};

  function configureTexture(texture:THREE.Texture){
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(renderer?.capabilities.getMaxAnisotropy()??1,8);
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;
  }
  function install(texture:THREE.Texture<HTMLImageElement>,index:number,detail:boolean){
    if(disposed||(!detail&&detailReady[index])){texture.dispose();return;}
    configureTexture(texture);
    const previous=materials[index].map;materials[index].map=texture;materials[index].needsUpdate=true;
    dimensions[index]=[texture.image.width,texture.image.height];detailReady[index]=detail;
    if(index===0)drone?.setBackdrop(texture);
    if(!readyAt[index])readyAt[index]=performance.now();
    surfaces[index].visible=true;sized='';previous?.dispose();map.triggerRepaint();
  }
  function setLocation(event?:AtlasEvent){
    located=Number.isFinite(event?.venue_lng)&&Number.isFinite(event?.venue_lat);
    const profile=venueScene(event),id=profile?.id??'';if(profileId===id&&!profileFailed)return;
    profileId=id;const version=++loadVersion;
    drone?.dispose();drone=profile?createDroneVenue(profile):undefined;
    droneActive=false;droneStarted=0;environmentRequested=false;foliageRequested=false;droneView={...HOME_DRONE};droneTarget={...HOME_DRONE};delete canvas.dataset.droneView;
    profileFailed=false;
    readyAt=[0,0];detailReady=[false,false];sized='';target={...HOME_PHOTO_VIEW};view={...target};
    materials.forEach((material,index)=>{material.map?.dispose();material.map=null;material.needsUpdate=true;surfaces[index].visible=false;});
    canvas.dataset.sceneProfile=id;delete canvas.dataset.sceneImageError;
    if(!profile){profileFailed=true;onImageState('error');map.triggerRepaint();return;}
    onImageState('loading');let loaded=0,failed=false;
    [profile.exterior,profile.interior].forEach((url,index)=>{
      new THREE.TextureLoader().load(url,texture=>{
        if(disposed||version!==loadVersion){texture.dispose();return;}
        install(texture,index,true);loaded++;
        if(loaded===2&&!failed)onImageState('ready');
      },undefined,()=>{
        if(disposed||version!==loadVersion)return;
        failed=true;profileFailed=true;canvas.dataset.sceneImageError=url;onImageState('error');map.triggerRepaint();
      });
    });
  }
  function resize(){
    const width=map.getContainer().clientWidth,height=map.getContainer().clientHeight;
    const key=`${width}:${height}:${canvas.width}:${canvas.height}:${dimensions.flat().join(':')}:${mode}`;if(key===sized)return;sized=key;
    // MapLibre resizes the shared drawing buffer independently of Three. Keep
    // Three's cached viewport in sync, including mobile rotation/DPR changes.
    renderer?.setSize(canvas.width,canvas.height,false);
    const dpr=canvas.width/Math.max(1,width);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    const visibleHeight=2*DISTANCE*Math.tan(THREE.MathUtils.degToRad(FOV/2));
    const frames=dimensions.map(([w,h])=>sceneFrame(width,height,w,h,dpr));
    pixelZoom=frames[mode==='sky'?1:0].maxZoom;maxZoom=Math.max(1,pixelZoom/photoCoverage(camera.aspect,target.yaw,target.pitch));target=clampPhotoView(target,maxZoom);
    geometries.forEach((geometry,index)=>{
      const worldHeight=visibleHeight*frames[index].height/height,worldWidth=worldHeight*dimensions[index][0]/dimensions[index][1];
      updateDepthSurface(geometry,worldWidth,worldHeight,DISTANCE);
      surfaces[index].position.y=index===1?worldHeight*(height<=720?.09:.035):0;
    });
  }
  function arrival(){return located?smooth((map.getZoom()-12.7)/3.1):smooth((map.getZoom()-9.6)/1.4);}
  const layer:CustomLayerInterface={
    id:'concert-architecture',type:'custom',renderingMode:'3d',
    onAdd(_map,gl){
      renderer=new THREE.WebGLRenderer({canvas,context:gl as WebGL2RenderingContext,antialias:true});renderer.autoClear=false;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.resetState();
    },
    render(){
      if(!renderer||disposed)return;
      const now=performance.now(),elapsed=reduced.matches?1:Math.min((now-changed)/2400,1);
      night=fromNight+((mode==='sky'?1:0)-fromNight)*smooth(elapsed);
      const approach=arrival();if(mode==='map'&&approach===0)departing=false;
      let visible=mode==='map'&&!departing?0:approach;
      const departureFade=departureInterrupted?(reduced.matches?1:smooth((now-departureInterrupted)/650)):0;
      if(departureInterrupted){visible=Math.min(visible,departureOpacity*(1-departureFade));if(departureFade===1){departing=false;departureInterrupted=0;}}
      map.getContainer().parentElement?.style.setProperty('--scene-arrival',String(visible));
      // Map source attribution remains on visible geography, not over opaque concept art.
      map.getContainer().classList.toggle('is-portrait-view',visible>=.999);
      // Clear arrival even when nothing is drawn, so a later approach cannot use stale readiness.
      canvas.dataset.sceneArrival=visible.toFixed(3);canvas.dataset.night=night.toFixed(3);
      const fades=readyAt.map(t=>t?smooth((now-t)/500):0);
      const droneMix=droneActive?(reduced.matches?1:smooth((now-droneStarted)/900)):0;
      materials[0].opacity=visible*fades[0]*(1-droneMix);materials[1].opacity=night*visible*fades[1];
      if(visible<=0)return;
      resize();
      const seconds=(now-lastFrame)/1000;
      const settled=reduced.matches?{view:{...target},moving:false}:settlePhotoView(view,target,seconds);
      const droneSettled=reduced.matches?{view:{...droneTarget},moving:false}:settleDrone(droneView,droneTarget,seconds);
      droneView=droneSettled.view;
      view=settled.view;lastFrame=now;
      const cover=photoCoverage(camera.aspect,view.yaw,view.pitch);surfaces.forEach(surface=>surface.scale.set(cover,cover,1));
      const push=1+(mode==='sky'&&!reduced.matches ? .055*Math.sin(Math.PI*elapsed) : 0);
      const radius=DISTANCE/(view.zoom*push),yaw=THREE.MathUtils.degToRad(view.yaw),pitch=THREE.MathUtils.degToRad(view.pitch);
      camera.position.set(Math.sin(yaw)*Math.cos(pitch)*radius,Math.sin(pitch)*radius,Math.cos(yaw)*Math.cos(pitch)*radius);camera.lookAt(0,0,0);
      renderer.resetState();
      if(drone&&droneMix>0&&night<.999){
        // The orbit is a screen-space scene, not geometry inside MapLibre's
        // geographic depth buffer. Clear that buffer before its sky and facade.
        renderer.clearDepth();
        droneCamera.aspect=camera.aspect;droneCamera.updateProjectionMatrix();
        droneCamera.position.set(...dronePosition(droneView));droneCamera.lookAt(...droneFocus(droneView));
        drone.setCamera(droneCamera);drone.setOpacity(visible);renderer.render(drone.scene,droneCamera);renderer.clearDepth();
        canvas.dataset.droneView=JSON.stringify(droneView);
      }
      renderer.render(world,camera);renderer.resetState();
      canvas.dataset.model=droneMix>=.999&&night<.001?'drone-volume':'portrait-depth';
      canvas.dataset.photoView=JSON.stringify({...view,maxZoom,source:dimensions[mode==='sky'?1:0],detail:detailReady[mode==='sky'?1:0]});
      if(!document.hidden&&(settled.moving||droneSettled.moving||droneMix>0&&droneMix<1||!!departureInterrupted||elapsed<1||fades.some(fade=>fade>0&&fade<1)))map.triggerRepaint();
    },
    onRemove(){dispose();},
  };
  function dispose(){
    if(disposed)return;disposed=true;loadVersion++;document.removeEventListener('visibilitychange',visibility);map.off('movestart',interruptDeparture);
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>{material.map?.dispose();material.dispose();});renderer?.dispose();
    drone?.dispose();drone=undefined;
  }
  const interruptDeparture=(event:unknown)=>{
    if(mode!=='map'||!departing||departureInterrupted||!event||typeof event!=='object'||!('originalEvent' in event)||!event.originalEvent)return;
    departureOpacity=arrival();departureInterrupted=performance.now();map.triggerRepaint();
  };map.on('movestart',interruptDeparture);
  const visibility=()=>{if(!document.hidden&&!disposed){lastFrame=performance.now();map.triggerRepaint();}};document.addEventListener('visibilitychange',visibility);
  map.addLayer(layer);
  function move(next:PhotoView){resize();const bounded=clampPhotoView(next,pixelZoom);maxZoom=Math.max(1,pixelZoom/photoCoverage(camera.aspect,bounded.yaw,bounded.pitch));target=clampPhotoView(bounded,maxZoom);lastFrame=performance.now();map.triggerRepaint();}
  function flyDrone(next:DroneView){
    if(!drone)return;
    if(!foliageRequested){
      foliageRequested=true;const version=loadVersion,owner=drone;
      new THREE.TextureLoader().load('/scenes/materials/drone-foliage-v1.webp',texture=>{
        if(disposed||version!==loadVersion){texture.dispose();return;}
        configureTexture(texture);owner.setFoliage(texture);map.triggerRepaint();
      });
    }
    // This environment belongs to the Shenzhen crystal artwork. Other cities
    // keep their own horizon; never download a panorama on the initial map.
    if(!environmentRequested&&profileId==='shenzhen-stadium'){
      environmentRequested=true;const version=loadVersion,owner=drone;
      new THREE.TextureLoader().load('/scenes/drone-sunset-environment-v2.webp',texture=>{
        if(disposed||version!==loadVersion){texture.dispose();return;}
        configureTexture(texture);owner.setEnvironment(texture);map.triggerRepaint();
      },undefined,()=>{if(!disposed&&version===loadVersion)environmentRequested=false;});
    }
    if(!droneActive){droneActive=true;droneStarted=performance.now();}
    droneTarget=next;lastFrame=performance.now();map.triggerRepaint();
  }
  return {
    location(event){setLocation(event);map.triggerRepaint();},
    scene(value){
      if(mode===value)return;
      if(mode==='map'&&value!=='map'){droneActive=false;droneStarted=0;droneView={...HOME_DRONE};droneTarget={...HOME_DRONE};}
      departing=value==='map';
      // A venue map stays close (zoom 14.3), so departure must finish by time,
      // independently of the geographic approach threshold.
      departureOpacity=Number(canvas.dataset.sceneArrival)||arrival();
      departureInterrupted=departing?performance.now():0;
      fromNight=night;mode=value;changed=lastFrame=performance.now();target={...HOME_PHOTO_VIEW};sized='';map.triggerRepaint();
    },
    orbit(dx,dy){if(mode==='venue')flyDrone(dragDrone(droneTarget,dx,dy));else move({...target,yaw:target.yaw-dx*.1,pitch:target.pitch+dy*.055});},
    pinch(from,to){if(mode==='venue')flyDrone(zoomDrone(droneTarget,Math.max(to,1)/Math.max(from,1)));else move({...target,zoom:target.zoom*Math.max(to,1)/Math.max(from,1)});},
    zoom(delta){if(mode==='venue')flyDrone(zoomDrone(droneTarget,2**(delta*.4)));else move({...target,zoom:target.zoom*2**(delta*.4)});},
    home(){if(mode==='venue')flyDrone({...HOME_DRONE});else move({...HOME_PHOTO_VIEW});},dispose,
  };
}
