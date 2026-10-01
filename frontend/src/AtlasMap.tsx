import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import type {Map as GLMap,Marker,GeoJSONSource} from 'maplibre-gl';
import {cameraTarget,CHINA_BOUNDS} from './atlasCamera';
import {eventPhase,projectChina,type AtlasCity,type AtlasEvent} from './footprintAtlas';
import provinces from './china-provinces.json';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Plus,Minus,MapPinArea} from '@phosphor-icons/react';
import {atlasMapStyle} from './atlasMapStyle';
import {orbitScene,pinchScene,type SceneController} from './sceneInteraction';
import type {VenueLayer} from './venueMapLayer';

type Props={cities:AtlasCity[];events:AtlasEvent[];today:string;selectedCity?:AtlasCity;artistSelected:boolean;onCity:(city:AtlasCity)=>void;scene?:string;venueEvent?:AtlasEvent;controller:RefObject<SceneController|null>};
function nationalPadding(height:number){return {top:height<=720?160:220,bottom:height<=720?192:208,left:12,right:12};}
function fitNation(map:GLMap,height:number,duration:number){
  // MapLibre adds retained camera padding when fitting bounds; venue padding must be cleared.
  map.setPadding({top:0,bottom:0,left:0,right:0});
  map.fitBounds(CHINA_BOUNDS,{padding:nationalPadding(height),offset:[0,height<=720?-22:-52],duration,maxZoom:5,pitch:0,bearing:0});
}
export function AtlasMap(props:Props){
  const {cities,events,today,selectedCity,artistSelected,scene='map',venueEvent}=props;
  const container=useRef<HTMLDivElement>(null),engine=useRef<GLMap|null>(null),markers=useRef<Marker[]>([]);
  const latest=useRef(props);latest.current=props;
  const venueLayer=useRef<VenueLayer|null>(null);
  const [modelReady,setModelReady]=useState(false);
  const [sceneImageError,setSceneImageError]=useState(false);
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[imageryError,setImageryError]=useState(false);
  const target=cameraTarget(scene,selectedCity,venueEvent);
  const route=useMemo(()=>{
    const seen=new Set<string>();return [...events].sort((a,b)=>a.date.localeCompare(b.date)).flatMap(event=>{const city=cities.find(c=>c.name===event.city);if(!city||seen.has(city.id))return [];seen.add(city.id);return [[city.lng,city.lat]];});
  },[cities,events]);
  useEffect(()=>{
    // The engine owns gesture, camera and tile scheduling; no per-frame React updates.
    let cancelled=false;let resize:ResizeObserver|undefined;let cleanup=()=>{};
    if(typeof window.WebGL2RenderingContext==='undefined'){setFailed(true);return;}
    void import('maplibre-gl').then(gl=>{
      if(cancelled||!container.current)return;
      gl.setWorkerCount(2);
      gl.setWorkerUrl(mapWorkerUrl);
      const map=new gl.Map({container:container.current,center:[104,35],zoom:3,renderWorldCopies:false,minZoom:1,maxZoom:21,maxPitch:85,centerClampedToGround:false,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),fadeDuration:160,maxTileCacheSize:120,attributionControl:false,canvasContextAttributes:{antialias:true},style:atlasMapStyle()});
      engine.current=map;
      map.addControl(new gl.AttributionControl({compact:true,customAttribution:'省界 DataV'}),'bottom-left');
      map.on('load',()=>{if(!cancelled){
        const credit=map.getContainer().querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib');
        if(credit){credit.open=false;credit.classList.remove('maplibregl-compact-show');}
        setReady(true);setImageryError(false);
      }});
      map.on('error',event=>{if(!cancelled){if('sourceId' in event&&event.sourceId==='satellite')setImageryError(true);if(container.current)container.current.dataset.mapError=event.error.message;}});
      map.on('sourcedata',event=>{if(event.sourceId==='satellite'&&event.isSourceLoaded&&!cancelled)setImageryError(false);});
      map.on('zoom',()=>container.current?.classList.toggle('atlas-detail-zoom',map.getZoom()>5));
      latest.current.cities.forEach(city=>{
        const button=document.createElement('button');button.type='button';button.className='real-city-pin';button.dataset.city=city.id;
        button.append(document.createElement('i'),document.createElement('span'));button.lastElementChild!.textContent=city.name;
        button.addEventListener('click',()=>latest.current.onCity(city));
        markers.current.push(new gl.Marker({element:button,anchor:'center'}).setLngLat([city.lng,city.lat]).addTo(map));
      });
      const arrange=()=>{
        const w=container.current?.clientWidth??390,h=container.current?.clientHeight??844;
        if(container.current)container.current.dataset.actualCamera=JSON.stringify({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),fov:map.getVerticalFieldOfView(),elevation:map.getCenterElevation()});
        if(latest.current.scene!=='map')return;
        const occupied:{x:number;y:number}[]=[];
        const ordered=[...markers.current].sort((a,b)=>{
          const rank=(marker:Marker)=>{const el=marker.getElement();return el.classList.contains('is-selected')?3:el.classList.contains('is-upcoming')?2:el.classList.contains('is-lit')?1:0;};
          return rank(b)-rank(a);
        });
        ordered.forEach(marker=>{
          const p=map.project(marker.getLngLat()),el=marker.getElement();
          const collision=map.getZoom()<5&&occupied.some(other=>Math.abs(other.x-p.x)<58&&Math.abs(other.y-p.y)<38);
          const obscured=latest.current.scene!=='map'||p.y<(h<=720?160:190)||p.y>h-(h<=720?205:224)||p.x<10||p.x>w-12;
          el.style.visibility=collision||obscured?'hidden':'visible';
          if(!collision&&!obscured)occupied.push(p);
        });
      };
      map.on('moveend',arrange);map.on('idle',arrange);
      map.on('move',()=>{if(container.current)container.current.dataset.actualCamera=JSON.stringify({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),fov:map.getVerticalFieldOfView(),elevation:map.getCenterElevation()});});
      map.on('click','venue-points',event=>{const feature=event.features?.[0],venue=latest.current.events.find(item=>item.venue===feature?.properties.name);const city=latest.current.cities.find(item=>item.name===venue?.city);if(city)latest.current.onCity(city);});
      let size=[container.current.clientWidth,container.current.clientHeight];
      resize=new ResizeObserver(()=>{
        const w=container.current?.clientWidth??390,h=container.current?.clientHeight??844;
        const changed=w!==size[0]||h!==size[1];size=[w,h];map.resize();
        if(changed&&latest.current.scene==='map'&&!latest.current.selectedCity)fitNation(map,h,0);
        arrange();
      });resize.observe(container.current);
      cleanup=()=>{latest.current.controller.current=null;markers.current.forEach(marker=>marker.remove());markers.current=[];engine.current=null;map.remove();venueLayer.current=null;};
    }).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;resize?.disconnect();cleanup();};
  },[]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    map.stop();
    const canvas=map.getCanvas();canvas.tabIndex=scene==='map'?0:-1;
    canvas.setAttribute('aria-hidden',scene==='map'?'false':'true');
    if(scene==='map')map.keyboard.enable();else map.keyboard.disable();
    if(scene!=='map'){
      const attribution=map.getContainer().querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib');
      if(attribution){attribution.open=false;attribution.classList.remove('maplibregl-compact-show');}
    }
    if(scene!=='map'&&!modelReady)return;
    markers.current.forEach(marker=>{if(scene!=='map')marker.getElement().style.visibility='hidden';});
    const fromFov=map.getVerticalFieldOfView(),toFov=scene==='sky'?110:36.87,start=performance.now();let projectionFrame=0,projectionCancelled=false;
    const stopProjection=()=>{projectionCancelled=true;cancelAnimationFrame(projectionFrame);const elevation=map.getCenterElevation();map.setTransformCameraUpdate(()=>({elevation}));};
    const settleProjection=()=>{if(!projectionCancelled)map.setVerticalFieldOfView(toFov);};
    const fromElevation=map.getCenterElevation(),toElevation=scene==='sky'?32:0;
    // MapLibre flyTo ignores explicit elevation during normal animation. Supply it through
    // its public camera transform hook and keep ground clamping disabled for the concert eye height.
    map.setTransformCameraUpdate(()=>{const t=reduced?1:Math.min((performance.now()-start)/2600,1);return {elevation:fromElevation+(toElevation-fromElevation)*t*t*(3-2*t)};});
    const project=(now:number)=>{const t=reduced?1:Math.min((now-start)/2600,1),ease=t*t*(3-2*t);map.setVerticalFieldOfView(fromFov+(toFov-fromFov)*ease);if(t<1||map.isMoving())projectionFrame=requestAnimationFrame(project);else map.once('idle',settleProjection);};
    if(reduced)map.setVerticalFieldOfView(toFov);else projectionFrame=requestAnimationFrame(project);
    venueLayer.current?.location(venueEvent);venueLayer.current?.scene(scene);
    map.setPaintProperty('buildings','fill-extrusion-opacity',scene==='map'?.32:0);
    map.setSky({'sky-color':scene==='sky'?'#17304a':'#c8d8dc','horizon-color':scene==='sky'?'#a88470':'#f9dec0','fog-color':scene==='sky'?'#243a4b':'#e7dfd0','sky-horizon-blend':.8,'horizon-fog-blend':.65,'fog-ground-blend':.25,'atmosphere-blend':0});
    // Do not unmount or swap surfaces: every step uses the same native map camera.
    const localVenues=events.filter(event=>event.city===selectedCity?.name&&Number.isFinite(event.venue_lng)&&Number.isFinite(event.venue_lat));
    if(scene==='map'&&selectedCity&&localVenues.length){
      const lngs=[selectedCity.lng,...localVenues.map(event=>event.venue_lng!)],lats=[selectedCity.lat,...localVenues.map(event=>event.venue_lat!)];
      map.setPadding({top:0,bottom:0,left:0,right:0});
      map.fitBounds([[Math.min(...lngs)-.025,Math.min(...lats)-.025],[Math.max(...lngs)+.025,Math.max(...lats)+.025]],{pitch:36,bearing:0,padding:{top:210,bottom:230,left:45,right:45},duration:reduced?0:2200,maxZoom:11.8});
    }
    else if(scene==='map'&&!selectedCity)fitNation(map,container.current?.clientHeight??844,reduced?0:1800);
    else map.flyTo({...cameraTarget(scene,selectedCity,venueEvent,reduced),elevation:scene==='sky'?32:0,essential:false,curve:1.2,padding:{top:scene==='map'?190:scene==='sky'?145:170,bottom:scene==='map'?230:scene==='sky'?230:200,left:20,right:20}});
    latest.current.controller.current={
      orbit(dx,dy){
        if(Number(canvas.dataset.sceneArrival)>.95){venueLayer.current?.orbit(dx,dy);return;}
        stopProjection();map.stop();map.jumpTo(orbitScene({bearing:map.getBearing(),pitch:map.getPitch(),zoom:map.getZoom()},dx,dy,latest.current.scene??'venue'));
      },
      pinch(from,to){
        if(Number(canvas.dataset.sceneArrival)>.95){venueLayer.current?.pinch(from,to);return;}
        stopProjection();map.stop();map.jumpTo({zoom:pinchScene(map.getZoom(),from,to,latest.current.scene??'venue')});
      },
      zoom(delta){
        if(Number(canvas.dataset.sceneArrival)>.95){venueLayer.current?.zoom(delta);return;}
        stopProjection();map.stop();map.easeTo({zoom:pinchScene(map.getZoom(),1,2**delta,latest.current.scene??'venue'),duration:180});
      },
      home(){
        venueLayer.current?.home();
        if(Number(canvas.dataset.sceneArrival)>.95)return;
        stopProjection();map.setTransformCameraUpdate(null);map.setCenterElevation(latest.current.scene==='sky'?32:0);map.setVerticalFieldOfView(latest.current.scene==='sky'?110:36.87);
        map.flyTo({...cameraTarget(latest.current.scene??'venue',latest.current.selectedCity,latest.current.venueEvent,reduced),elevation:latest.current.scene==='sky'?32:0,padding:{top:170,bottom:200,left:20,right:20},duration:reduced?0:1500});
      },
    };
    return()=>{stopProjection();map.off('idle',settleProjection);map.stop();map.setTransformCameraUpdate(null);};
  },[ready,modelReady,selectedCity?.id,scene,venueEvent?.venue,artistSelected]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready||venueLayer.current)return;
    let cancelled=false;
    void import('./venueMapLayer').then(({createVenueLayer})=>{if(cancelled)return;const layer=createVenueLayer(map,()=>{if(!cancelled)setSceneImageError(true);});venueLayer.current=layer;layer.location(latest.current.venueEvent);setModelReady(true);}).catch(()=>{if(!cancelled){setModelReady(true);setSceneImageError(true);if(container.current)container.current.dataset.modelError='unavailable';}});
    return()=>{cancelled=true;};
  },[ready]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    const nextEvent=[...events].filter(event=>eventPhase(event,today)!=='past').sort((a,b)=>a.date.localeCompare(b.date))[0];
    markers.current.forEach(marker=>{
      const city=cities.find(c=>c.id===marker.getElement().dataset.city)!;const shows=events.filter(e=>e.city===city.name);
      const upcoming=shows.some(event=>eventPhase(event,today)!=='past');const button=marker.getElement();
      button.classList.toggle('is-lit',shows.length>0);button.classList.toggle('is-upcoming',upcoming);button.classList.toggle('is-selected',city.id===selectedCity?.id||(!selectedCity&&artistSelected&&city.name===nextEvent?.city));
      button.setAttribute('aria-label',city.name+(shows.length?' · '+shows.length+' 场'+(upcoming?' · 有待演':''):''));
    });
    (map.getSource('route') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:artistSelected&&route.length>1?route:[]}});
    const seen=new Set<string>();(map.getSource('venues') as GeoJSONSource)?.setData({type:'FeatureCollection',features:events.flatMap(event=>{if(seen.has(event.venue)||event.city!==selectedCity?.name||!Number.isFinite(event.venue_lng)||!Number.isFinite(event.venue_lat))return [];seen.add(event.venue);return [{type:'Feature' as const,properties:{name:event.venue},geometry:{type:'Point' as const,coordinates:[event.venue_lng!,event.venue_lat!]}}];})});
  },[ready,cities,events,today,selectedCity?.id,artistSelected,route]);
  function reset(){if(engine.current)fitNation(engine.current,container.current?.clientHeight??844,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1000);}
  return <div className={'atlas-map-stage '+(scene!=='map'?'is-travelling':'')}>
    <div className="real-map-canvas" ref={container} aria-label="中国演唱会地图" role="region" data-camera={JSON.stringify(target)}/>
    <img className="atlas-sky-canopy" src="/scenes/atlas-sky.webp" alt="" aria-hidden="true"/>
    {scene==='map'&&!selectedCity&&<img className="atlas-cloud-canopy" src="/scenes/atlas-clouds.png" alt="" aria-hidden="true"/>}
    {failed&&<div className="atlas-map-fallback"><svg viewBox="0 0 1000 1050" aria-hidden="true">{provinces.features.map(feature=>{const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;const d=(polygons as number[][][][]).map(p=>p.map(r=>r.map(([x,y],i)=>(i?'L':'M')+projectChina(x,y).join(',')).join(' ')+'Z').join(' ')).join(' ');return <path key={feature.properties.adcode} d={d}/>;})}</svg>{cities.map(city=>{const [x,y]=projectChina(city.lng,city.lat);return <button type="button" key={city.id} onClick={()=>props.onCity(city)} style={{left:x/10+'%',top:y/10.5+'%'}}>{city.name}</button>;})}<p>当前设备无法开启三维地图，可继续选择城市。</p></div>}
    {imageryError&&scene==='map'&&<div className="atlas-imagery-error" role="status">地图连接较慢，地点与日程仍可查看。</div>}
    {!modelReady&&scene!=='map'&&!failed&&<span className="cinematic-loading" role="status">正在准备现场…</span>}
    {sceneImageError&&scene!=='map'&&<span className="cinematic-loading" role="status">现场画面暂未载入，仍可查看歌单或返回地图。</span>}
    {scene==='map'&&<div className="atlas-map-controls"><button type="button" aria-label="放大地图" onClick={()=>engine.current?.zoomIn({duration:180})}><Plus size={24} weight="light"/></button><button type="button" aria-label="缩小地图" onClick={()=>engine.current?.zoomOut({duration:180})}><Minus size={24} weight="light"/></button><button type="button" aria-label="全国复位" onClick={reset}><MapPinArea size={23} weight="light"/></button></div>}
  </div>;
}
