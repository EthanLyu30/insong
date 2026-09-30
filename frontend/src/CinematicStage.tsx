import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowClockwise,ArrowRight,Minus,Plus,StarFour} from '@phosphor-icons/react';
import type {AtlasEvent,AtlasSong} from './footprintAtlas';
import {clampSceneView,isSceneTap,type SceneView} from './sceneInteraction';

type Runtime={wake:()=>void;pause:()=>void;home:()=>void;zoom:(amount:number)=>void;pan:(x:number,y:number)=>void};
type Props={scene:string;visible:boolean;event?:AtlasEvent;venueName?:string;city?:string;artistName?:string;selected:AtlasSong|null;onSong:(song:AtlasSong)=>void;onEnter:()=>void};
const exterior='/scenes/stadium-exterior.webp',interior='/scenes/stadium-interior.webp';
const constellation=[[14,14],[39,24],[63,6],[88,22],[23,62],[48,80],[67,49],[88,70]];

export function CinematicStage(props:Props){
  const {scene,event,venueName,city,artistName,selected,onSong,onEnter}=props;
  const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),latest=useRef(props);latest.current=props;
  const [started,setStarted]=useState(scene!=='map'),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const gesture=useRef<{start:[number,number];last:[number,number];enter:boolean;handled:boolean;moved:boolean}|null>(null);
  useEffect(()=>{if(scene!=='map')setStarted(true);},[scene]);
  useEffect(()=>{
    if(!started)return;
    let disposed=false,cleanup=()=>{};
    if(typeof window.WebGL2RenderingContext==='undefined'){setFailed(true);return;}
    void import('three').then(async THREE=>{
      if(disposed||!host.current)return;
      // Photographic depth surfaces preserve the chosen art direction. They are not survey models.
      const renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0,0);host.current.prepend(renderer.domElement);
      const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,20);
      camera.position.z=3.2;
      const geometry=new THREE.PlaneGeometry(390/844,1,32,64),position=geometry.attributes.position,uv=geometry.attributes.uv;
      for(let i=0;i<position.count;i++)position.setZ(i,.15*Math.pow(1-uv.getY(i),1.7));
      geometry.computeVertexNormals();
      const materials=[0,1].map(()=>new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false}));
      const surfaces=materials.map((material,i)=>{const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=i;world.add(mesh);return mesh;});
      let raf=0,last=0,paused=true,night=latest.current.scene==='sky'?1:0,phase='',flightStarted=0,photoRise=0;
      let view:SceneView={x:0,y:0,zoom:1},target:SceneView={...view};
      const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
      const resize=()=>{
        const w=host.current?.clientWidth||390,h=host.current?.clientHeight||844;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
        const height=2*3.2*Math.tan(THREE.MathUtils.degToRad(17.5))*1.08*Math.max(1,camera.aspect/(390/844));
        photoRise=height*(h<=720?.09:.035);
        surfaces.forEach(mesh=>mesh.scale.set(height,height,1));wake();
      };
      const render=(now:number)=>{
        if(paused||disposed)return;
        const dt=Math.min((now-last)/1000||.016,.05);last=now;
        if(phase!==latest.current.scene){phase=latest.current.scene;flightStarted=now;target={x:0,y:0,zoom:1};}
        const t=motion.matches?1:Math.min((now-flightStarted)/1450,1),ease=t*t*(3-2*t);
        const mix=motion.matches?1:1-Math.exp(-dt*7);
        view={x:view.x+(target.x-view.x)*mix,y:view.y+(target.y-view.y)*mix,zoom:view.zoom+(target.zoom-view.zoom)*mix};
        const targetNight=phase==='sky'?1:0;night=motion.matches?targetNight:night+(targetNight-night)*(1-Math.exp(-dt*3));
        materials[0].opacity=1;materials[1].opacity=night;
        surfaces[1].position.y=photoRise;
        camera.position.set(motion.matches?0:view.x,motion.matches?0:view.y,3.2/(view.zoom*(.94+.06*ease)));
        camera.lookAt(0,0,0);renderer.render(world,camera);
        if(host.current)host.current.dataset.view=`${view.x.toFixed(3)},${view.y.toFixed(3)},${view.zoom.toFixed(3)}`;
        const moving=t<1||Math.abs(night-targetNight)>.001||Math.abs(view.x-target.x)+Math.abs(view.y-target.y)+Math.abs(view.zoom-target.zoom)>.0003;
        if(moving)raf=requestAnimationFrame(render);else{paused=true;raf=0;}
      };
      const pause=()=>{paused=true;cancelAnimationFrame(raf);raf=0;phase='';};
      function wake(){if(disposed||!latest.current.visible||latest.current.scene==='map'||document.hidden)return;if(paused){paused=false;last=performance.now();raf=requestAnimationFrame(render);}}
      const home=()=>{target={x:0,y:0,zoom:1};phase='';wake();};
      const visibility=()=>document.hidden?pause():wake();document.addEventListener('visibilitychange',visibility);
      const observer=new ResizeObserver(resize);observer.observe(host.current);resize();
      runtime.current={wake,pause,home,zoom:amount=>{target=clampSceneView({...target,zoom:target.zoom+amount});wake();},pan:(x,y)=>{target=clampSceneView({...target,x:target.x+x,y:target.y+y});wake();}};
      let cleaned=false;
      cleanup=()=>{if(cleaned)return;cleaned=true;pause();observer.disconnect();document.removeEventListener('visibilitychange',visibility);geometry.dispose();materials.forEach(material=>{material.map?.dispose();material.dispose();});renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();runtime.current=null;};
      try{
        const results=await Promise.allSettled([exterior,interior].map(src=>new THREE.TextureLoader().loadAsync(src)));
        const textures=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
        if(disposed||textures.length!==2){textures.forEach(texture=>texture.dispose());if(!disposed){cleanup();setFailed(true);}return;}
        textures.forEach((texture,i)=>{texture.colorSpace=THREE.SRGBColorSpace;materials[i].map=texture;materials[i].needsUpdate=true;});
        await renderer.compileAsync(world,camera);
        if(!disposed){setReady(true);phase='';wake();}
      }catch{if(!disposed){cleanup();setFailed(true);}}
    }).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;cleanup();};
  },[started]);
  useEffect(()=>{if(scene==='map'||!props.visible)runtime.current?.pause();else runtime.current?.wake();},[scene,props.visible,ready]);
  useEffect(()=>{runtime.current?.home();},[event?.venue]);
  function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if((e.target as HTMLElement).closest('.cinematic-controls,.atlas-song-stars')||e.button!==0)return;
    gesture.current={start:[e.clientX,e.clientY],last:[e.clientX,e.clientY],enter:!!(e.target as HTMLElement).closest('.cinematic-enter'),handled:false,moved:false};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||g.handled)return;
    g.moved=g.moved||!isSceneTap(g.start,[e.clientX,e.clientY]);
    runtime.current?.pan((e.clientX-g.last[0])*.0006,-(e.clientY-g.last[1])*.0005);g.last=[e.clientX,e.clientY];
  }
  function pointerUp(e:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g)return;g.handled=true;
    if(scene==='venue'&&g.enter&&isSceneTap(g.start,[e.clientX,e.clientY],g.moved))onEnter();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }
  return <div className={'cinematic-stage '+(scene==='map'?'is-hidden':'')+(scene==='sky'?' is-night':'')} aria-hidden={scene==='map'} inert={scene==='map'} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{gesture.current=null;}}>
    {started&&<div className="cinematic-photographs" aria-hidden="true"><img src={exterior} alt=""/><img src={interior} alt="" className="cinematic-night-photo"/></div>}
    <div ref={host} className={'cinematic-canvas '+(ready?'is-ready':'')} aria-label="可拖动调整景深视角的场馆概念场景" role="region"/>
    {scene==='venue'&&<>
      <div className="cinematic-location"><h1>{venueName?.match(/体育[场馆]$/)?<>{venueName.slice(0,-3)}<br/>{venueName.slice(-3)}</>:venueName}</h1><p>歌声即将抵达</p></div>
      <button className="cinematic-enter" type="button" aria-label="进入这座场馆" onClick={e=>{if(e.detail===0||!gesture.current?.handled)onEnter();}}><span>点击场馆，走进这一晚 <ArrowRight size={16}/></span></button>
    </>}
    {scene==='sky'&&event&&<>
      <div className="cinematic-night-title"><h1>{artistName??'我们'} · 这一晚</h1><p>{event.date.replaceAll('-','.')} · {city}</p><span>把歌声，留在星光里。</span></div>
      <div className={'atlas-song-stars '+(event.songs.length>constellation.length?'is-long':'')} aria-label="歌曲星空">{event.songs.map((song,i)=>{
        const [x,y]=constellation[i%constellation.length];
        return <button key={i} type="button" className={'atlas-song-star '+(selected?.title===song.title?'is-selected':'')} style={{left:`${x}%`,top:`${y}%`}} aria-label={`第${i+1}颗星 · ${song.title}`} aria-pressed={selected?.title===song.title} onClick={()=>onSong(song)}><StarFour size={18} weight="fill"/><span>{song.title}</span></button>;
      })}</div>
    </>}
    {!ready&&!failed&&scene!=='map'&&<span className="cinematic-loading" role="status">正在抵达现场…</span>}
    {scene==='venue'&&<div className="cinematic-controls"><button type="button" onClick={()=>runtime.current?.zoom(.04)} aria-label="拉近场馆"><Plus size={24} weight="light"/></button><button type="button" onClick={()=>runtime.current?.zoom(-.04)} aria-label="拉远场馆"><Minus size={24} weight="light"/></button><button type="button" onClick={()=>runtime.current?.home()} aria-label="重新运镜"><ArrowClockwise size={21} weight="light"/></button></div>}
    {scene!=='map'&&<span className="cinematic-demo-label">场景示意{failed?' · 静态视角':''}</span>}
  </div>;
}
