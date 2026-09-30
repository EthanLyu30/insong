import {useEffect,useRef,useState} from 'react';
import type {AtlasEvent,AtlasSong} from './footprintAtlas';
import type * as Three from 'three';
import {SceneFlight} from './atlasCamera';

type Runtime={resume:()=>void;pause:()=>void;home:()=>void;zoom:(value:number)=>void;location:(event?:AtlasEvent)=>void};
type Props={scene:string;visible:boolean;event?:AtlasEvent;venueName?:string;city?:string;selected:AtlasSong|null;onSong:(song:AtlasSong)=>void};
export function CinematicStage(props:Props){
  const {scene,event,venueName,city,selected,onSong}=props;
  const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),latest=useRef(props);latest.current=props;
  const [started,setStarted]=useState(scene!=='map'),[failed,setFailed]=useState(false),[ready,setReady]=useState(false);
  useEffect(()=>{if(scene!=='map')setStarted(true);},[scene]);
  useEffect(()=>{
    if(!started)return;let disposed=false,cleanup=()=>{};
    if(typeof window.WebGL2RenderingContext==='undefined'){setFailed(true);return;}
    void Promise.all([import('three'),import('three/addons/controls/OrbitControls.js'),import('./stadiumModel'),import('three/addons/environments/RoomEnvironment.js')]).then(([THREE,{OrbitControls},{buildStadium},{RoomEnvironment}])=>{
      if(disposed||!host.current)return;
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor('#b9c9c7');host.current.prepend(renderer.domElement);
      const world=new THREE.Scene();world.background=new THREE.Color('#b9c9c7');world.fog=new THREE.FogExp2('#b9c9c7',.0009);
      const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environmentMap=pmrem.fromScene(environment,.04);world.environment=environmentMap.texture;environment.dispose();pmrem.dispose();
      const model=buildStadium();world.add(model.root);
      const satelliteMaterial=new THREE.MeshStandardMaterial({roughness:1});const satelliteGround=new THREE.Mesh(new THREE.PlaneGeometry(1,1),satelliteMaterial);satelliteGround.rotation.x=-Math.PI/2;satelliteGround.position.y=-3.8;satelliteGround.receiveShadow=true;satelliteGround.visible=false;world.add(satelliteGround);
      let locationVersion=0;
      const location=(point?:AtlasEvent)=>{
        const version=++locationVersion;satelliteGround.visible=false;satelliteMaterial.map?.dispose();satelliteMaterial.map=null;
        if(!Number.isFinite(point?.venue_lng)||!Number.isFinite(point?.venue_lat))return;
        const lng=point!.venue_lng!,lat=point!.venue_lat!,n=32768,x=Math.floor((lng+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
        const width=40075016.686*Math.cos(lat*Math.PI/180)/n,centerLng=(x+.5)/n*360-180,centerLat=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/n)))*180/Math.PI;
        new THREE.TextureLoader().load('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/15/'+y+'/'+x,texture=>{
          if(disposed||version!==locationVersion){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);satelliteMaterial.map=texture;satelliteMaterial.needsUpdate=true;satelliteGround.scale.set(width,width,1);satelliteGround.position.set((centerLng-lng)*111319.49*Math.cos(lat*Math.PI/180),-3.8,-(centerLat-lat)*111319.49);satelliteGround.visible=true;
        },undefined,()=>{});
      };
      const camera=new THREE.PerspectiveCamera(39,1,1,7000);camera.position.set(700,800,1100);
      const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,8,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=260;controls.maxDistance=1000;controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.25;controls.enablePan=false;controls.autoRotateSpeed=.25;
      const ambient=new THREE.HemisphereLight('#e7edf8','#51493d',2.8);world.add(ambient);
      const sun=new THREE.DirectionalLight('#ffedcc',3);sun.position.set(-320,500,160);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-250;sun.shadow.camera.right=250;sun.shadow.camera.top=230;sun.shadow.camera.bottom=-230;sun.shadow.camera.far=1000;sun.shadow.bias=-.0003;world.add(sun);
      const stageLight=new THREE.PointLight('#ffb76a',0,480,1.2);stageLight.position.set(0,90,-30);world.add(stageLight);
      const starPositions:number[]=[];const random=(seed:number)=>{const value=Math.sin(seed)*43758.5453;return value-Math.floor(value);};for(let i=0;i<1500;i++){const a=random(i*78.233+1)*Math.PI*2,e=.12+random(i*31.773+2)*1.3,r=1200+random(i*12.9898+3)*900;starPositions.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r-100,Math.sin(a)*Math.cos(e)*r);}
      const starMaterial=new THREE.PointsMaterial({color:'#e5eefb',size:2.5,transparent:true,opacity:0,depthWrite:false,fog:false});const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3)),starMaterial);world.add(stars);
      const daytime=new THREE.Color('#bac9c7'),nighttime=new THREE.Color('#071424');const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
      let raf=0,paused=true,last=0,night=0,userOrbit=false,finishedFlight=false;
      const flightPlan=new SceneFlight();
      const width=()=>host.current?.clientWidth||390,height=()=>host.current?.clientHeight||844;
      const resize=()=>{const w=width(),h=height();renderer.setSize(w,h);camera.aspect=w/h;camera.fov=Math.max(39,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(25))/camera.aspect)));camera.setViewOffset(w,h,0,h*.1,w,h);camera.updateProjectionMatrix();};resize();
      const observer=new ResizeObserver(resize);observer.observe(host.current);
      const flight=()=>{flightPlan.replay();finishedFlight=false;controls.enabled=false;userOrbit=false;};
      controls.addEventListener('start',()=>{userOrbit=true;controls.autoRotate=false;});
      const render=(now:number)=>{
        if(paused||disposed)return;const dt=Math.min((now-last)/1000||.016,.05);last=now;
        const targetNight=latest.current.scene==='sky'?1:0;
        const frame=flightPlan.sample(latest.current.scene,now,[camera.position.x,camera.position.y,camera.position.z],mq.matches);
        if(frame.started)finishedFlight=false;
        if(frame.moving){finishedFlight=false;controls.enabled=false;camera.position.set(...frame.position);camera.lookAt(controls.target);}else{if(!finishedFlight){camera.position.set(...frame.position);camera.lookAt(controls.target);finishedFlight=true;}controls.enabled=true;controls.autoRotate=!mq.matches&&!userOrbit;controls.update();}
        night=mq.matches?targetNight:night+(targetNight-night)*(1-Math.exp(-dt*2.3));model.night(night);
        world.background=(world.background as Three.Color).copy(daytime).lerp(nighttime,night);(world.fog as Three.FogExp2).color.copy(world.background as Three.Color);
        world.environmentIntensity=.6-night*.575;(world.fog as Three.FogExp2).density=.00035-night*.00023;
        ambient.intensity=1.5-night*1.4;sun.intensity=2.4-night*2.38;stageLight.intensity=night*55;starMaterial.opacity=night*.88;
        controls.target.y=8+night*72;
        if(!mq.matches)model.lights.rotation.y=Math.sin(now*.0004)*.12;
        renderer.render(world,camera);raf=requestAnimationFrame(render);
      };
      const pause=()=>{paused=true;cancelAnimationFrame(raf);flightPlan.deactivate();finishedFlight=false;};
      const resume=()=>{if(disposed||!latest.current.visible||latest.current.scene==='map'||document.hidden)return;if(paused){paused=false;last=performance.now();camera.position.set(700,800,1100);userOrbit=false;raf=requestAnimationFrame(render);}};
      const visibility=()=>document.hidden?pause():resume();document.addEventListener('visibilitychange',visibility);
      runtime.current={resume,pause,home:flight,location,zoom:value=>{userOrbit=true;controls.autoRotate=false;camera.position.sub(controls.target).multiplyScalar(value).clampLength(260,1000).add(controls.target);controls.update();}};
      cleanup=()=>{pause();observer.disconnect();document.removeEventListener('visibilitychange',visibility);controls.dispose();const geometries=new Set<Three.BufferGeometry>(),materials=new Set<Three.Material>(),textures=new Set<Three.Texture>();world.traverse(object=>{const mesh=object as Three.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>{materials.add(material);const mapped=material as Three.MeshStandardMaterial;if(mapped.map)textures.add(mapped.map);});});geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());environmentMap.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();runtime.current=null;};
      // Compile while the map is approaching, before the first visible 3D frame.
      void renderer.compileAsync(world,camera).then(()=>{if(!disposed){setReady(true);resume();}},()=>{if(!disposed){setReady(true);resume();}});
    }).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;cleanup();};
  },[started]);
  useEffect(()=>{if(scene==='map'||!props.visible)runtime.current?.pause();else runtime.current?.resume();},[scene,props.visible,ready]);
  useEffect(()=>{runtime.current?.location(event);},[event?.venue_lng,event?.venue_lat,ready]);
  return <div className={'cinematic-stage '+(scene==='map'?'is-hidden':'')+(scene==='sky'?' is-night':'')} aria-hidden={scene==='map'} inert={scene==='map'}>
    <div ref={host} className="cinematic-canvas" aria-label="可拖动环绕的三维场馆" role="region"/>
    <div className="cinematic-haze" aria-hidden="true"/>
    {scene==='venue'&&<div className="cinematic-location"><span>{city} / LIVE VENUE</span><h1>{venueName}</h1><p>拖动环绕 · 双指调整视角</p></div>}
    {!ready&&!failed&&scene!=='map'&&<span className="cinematic-loading" role="status">正在抵达现场…</span>}
    {failed&&scene!=='map'&&<p className="cinematic-loading">当前设备无法显示三维场馆，仍可选择场次和收藏歌单。</p>}
    {scene==='sky'&&event&&<div className={'atlas-song-stars '+(event.songs.length>12?'is-long':'')} aria-label="歌曲星空">{event.songs.map((song,i)=>{
      const x=12+(i%4)*25+(Math.floor(i/4)%2?4:0),y=20+Math.floor(i/4)*26+(i%2?9:0);
      return <button key={i} type="button" className={'atlas-song-star '+(selected===song?'is-selected':'')} style={{left:`${Math.min(x,88)}%`,top:`${y}%`}} aria-label={`第${i+1}颗星 · ${song.title}`} aria-pressed={selected===song} onClick={()=>onSong(song)}><i/><span>{song.title}</span><small>{String(i+1).padStart(2,'0')}</small></button>;
    })}</div>}
    {scene!=='map'&&<div className="cinematic-controls"><button type="button" onClick={()=>runtime.current?.zoom(.88)} aria-label="拉近场馆">＋</button><button type="button" onClick={()=>runtime.current?.zoom(1.12)} aria-label="拉远场馆">−</button><button type="button" onClick={()=>runtime.current?.home()} aria-label="重新运镜">↺</button></div>}
  </div>;
}
