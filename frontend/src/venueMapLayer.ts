import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MercatorCoordinate,type Map as GLMap,type CustomLayerInterface} from 'maplibre-gl';
import {buildStadium} from './stadiumModel';
import type {AtlasEvent} from './footprintAtlas';

export type VenueLayer={location:(event?:AtlasEvent)=>void;scene:(mode:string)=>void;dispose:()=>void};
export function createVenueLayer(map:GLMap):VenueLayer{
  const world=new THREE.Scene(),camera=new THREE.Camera(),conceptCamera=new THREE.PerspectiveCamera(110,1,.1,2000),model=buildStadium();world.add(model.root);
  const ambient=new THREE.HemisphereLight('#d7e1ed','#5c5346',1.4);world.add(ambient);
  const sun=new THREE.DirectionalLight('#ffcf95',2.3);sun.position.set(-260,360,180);world.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-250;sun.shadow.camera.right=250;sun.shadow.camera.top=210;sun.shadow.camera.bottom=-210;sun.shadow.camera.far=850;sun.shadow.bias=-.0005;sun.shadow.normalBias=.5;
  const blueFill=new THREE.DirectionalLight('#a6c4dc',1.2);blueFill.position.set(250,80,-90);world.add(blueFill);
  const stageLight=new THREE.PointLight('#ffc478',0,300,1.2);stageLight.position.set(0,25,-33);world.add(stageLight);
  const stars:number[]=[];
  const random=(i:number)=>{const n=Math.sin(i*12.9898+78.233)*43758.5453;return n-Math.floor(n);};
  for(let i=0;i<1400;i++){const a=random(i+1)*Math.PI*2,e=.12+random(i+3000)*1.35,r=950;stars.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r);}
  const starMaterial=new THREE.PointsMaterial({color:'#fff0d3',size:1.8,transparent:true,opacity:0,depthWrite:false});
  world.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(stars,3)),starMaterial));
  const panoramaMaterial=new THREE.MeshBasicMaterial({side:THREE.BackSide,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false});
  const panoramaGeometry=new THREE.SphereGeometry(450,64,32),uv=panoramaGeometry.attributes.uv;
  // Give the mobile portrait view more of the blue zenith without stretching the seating bowl.
  for(let i=0;i<uv.count;i++){const v=uv.getY(i);if(v>.5)uv.setY(i,.5+.5*Math.sqrt((v-.5)*2));}
  const panorama=new THREE.Mesh(panoramaGeometry,panoramaMaterial);panorama.position.y=32;panorama.rotation.y=Math.PI/2;panorama.renderOrder=100;panorama.visible=false;world.add(panorama);
  const combined=new THREE.Matrix4(),eye=new THREE.Vector3();
  let renderer:THREE.WebGLRenderer|undefined,environment:THREE.WebGLRenderTarget|undefined;
  let origin:THREE.Matrix4|null=null,mode='map',night=0,changed=performance.now(),fromNight=0,disposed=false;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const layer:CustomLayerInterface={
    id:'concert-architecture',type:'custom',renderingMode:'3d',
    onAdd(_map,gl){
      renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl as WebGL2RenderingContext,antialias:true});
      renderer.autoClear=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
      const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromScene(room,.04);world.environment=environment.texture;room.dispose();pmrem.dispose();renderer.resetState();
      new THREE.TextureLoader().load('/scenes/concert-panorama.webp',texture=>{
        if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
        panoramaMaterial.map=texture;panoramaMaterial.needsUpdate=true;panorama.visible=true;
        const generator=new THREE.PMREMGenerator(renderer!);environment?.dispose();environment=generator.fromEquirectangular(texture);world.environment=environment.texture;generator.dispose();renderer!.resetState();map.triggerRepaint();
      },undefined,()=>{});
    },
    render(_gl,args){
      if(!renderer||disposed||((!origin||map.getZoom()<14)&&mode!=='sky'))return;
      const progress=reduced.matches?1:Math.min((performance.now()-changed)/2600,1),ease=progress*progress*(3-2*progress);
      night=fromNight+((mode==='sky'?1:0)-fromNight)*ease;model.night(night);
      ambient.intensity=1.4-night*1.28;sun.intensity=2.3-night*2.26;blueFill.intensity=1.2-night*.87;stageLight.intensity=night*65;
      world.environmentIntensity=.7-night*.66;starMaterial.opacity=night*.8;
      if(!reduced.matches)model.lights.rotation.y=Math.sin(performance.now()*.00035)*.13;
      if(origin){
        combined.fromArray(args.defaultProjectionData.mainMatrix).multiply(origin);
        camera.projectionMatrix.fromArray(args.projectionMatrix);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        camera.matrixWorldInverse.copy(camera.projectionMatrixInverse).multiply(combined);camera.matrixWorld.copy(camera.matrixWorldInverse).invert();camera.matrixAutoUpdate=false;camera.matrixWorldAutoUpdate=false;
      }else{
        // Unknown venue coordinates stay at city scale. A labeled conceptual photosphere
        // allows the concert experience without placing a fake building on the city center.
        conceptCamera.position.set(0,32,0);conceptCamera.rotation.set((map.getPitch()-90)*Math.PI/180,-map.getBearing()*Math.PI/180,0,'YXZ');conceptCamera.fov=map.getVerticalFieldOfView();conceptCamera.aspect=map.getContainer().clientWidth/map.getContainer().clientHeight;conceptCamera.updateProjectionMatrix();
      }
      // Open the photosphere as the real camera enters the bowl, not merely when
      // a timer expires. An interrupted approach keeps the exterior geometry.
      const distance=origin?eye.setFromMatrixPosition(camera.matrixWorld).distanceTo(panorama.position):0;
      const proximity=origin?Math.max(0,Math.min(1,(750-distance)/420)):1;
      panoramaMaterial.opacity=Math.max(0,Math.min(1,(night-.2)/.8))*proximity*proximity*(3-2*proximity);
      model.root.visible=!!origin&&!(panoramaMaterial.map&&panoramaMaterial.opacity>.995);
      renderer.resetState();renderer.render(world,origin?camera:conceptCamera);renderer.resetState();
      const canvas=map.getCanvas();canvas.dataset.model=origin?'georeferenced-3d':'concept-panorama';canvas.dataset.night=night.toFixed(3);
      // Idle views stop repainting; native gestures and camera flights wake the map.
      if(!document.hidden&&progress<1)map.triggerRepaint();
    },
    onRemove(){dispose();},
  };
  function dispose(){
    if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',visibility);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    world.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>materials.add(material));});
    geometries.forEach(geometry=>geometry.dispose());panoramaMaterial.map?.dispose();materials.forEach(material=>material.dispose());sun.shadow.dispose();environment?.dispose();renderer?.dispose();
    // MapLibre owns the shared context; never forceContextLoss here.
  }
  const visibility=()=>{if(!document.hidden&&!disposed)map.triggerRepaint();};document.addEventListener('visibilitychange',visibility);
  map.addLayer(layer);
  return {location(event){
    if(!Number.isFinite(event?.venue_lng)||!Number.isFinite(event?.venue_lat)){origin=null;map.triggerRepaint();return;}
    const coord=MercatorCoordinate.fromLngLat([event!.venue_lng!,event!.venue_lat!],0),scale=coord.meterInMercatorCoordinateUnits();
    origin=new THREE.Matrix4().makeTranslation(coord.x,coord.y,coord.z).multiply(new THREE.Matrix4().makeScale(scale,-scale,scale)).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2));map.triggerRepaint();
  },scene(value){if(value===mode)return;fromNight=night;mode=value;changed=performance.now();map.triggerRepaint();},dispose};
}
