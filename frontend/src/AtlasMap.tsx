import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import type {Map as GLMap,Marker,GeoJSONSource} from 'maplibre-gl';
import {cameraTarget,overviewFocus} from './atlasCamera';
import {eventPhase,projectChina,type AtlasArtist,type AtlasCity,type AtlasEvent} from './footprintAtlas';
import provinces from './china-provinces.json';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Plus,Minus,MapPinArea} from '@phosphor-icons/react';
import {atlasMapStyle} from './atlasMapStyle';
import {orbitScene,pinchScene,type SceneController} from './sceneInteraction';
import type {VenueLayer} from './venueMapLayer';
import {MapResourceStatus,resourceTileKey} from './mapResourceStatus';
import {mapMarkerPhotos,mapMarkerOffset} from './mapMarkerPhotos';
import {MapCredits} from './MapCredits';

type Props={cities:AtlasCity[];events:AtlasEvent[];artists?:AtlasArtist[];today:string;selectedCity?:AtlasCity;artistSelected:boolean;wantedEventIds?:string[];focusPoint?:[number,number];onCity:(city:AtlasCity)=>void;onVenue:(event:AtlasEvent)=>void;onNation:()=>void;scene?:string;venueEvent?:AtlasEvent;controller:RefObject<SceneController|null>};
function artistIdentity(city:string,events:AtlasEvent[],artists:AtlasArtist[]=[],artistId?:string){
  const event=events.find(item=>item.city===city&&(!artistId||item.artist_id===artistId)&&item.event_status!=='cancelled');
  return {photo:event?mapMarkerPhotos[event.artist_id]:undefined,name:artists.find(artist=>artist.id===event?.artist_id)?.name??event?.songs[0]?.artist??'',id:event?.artist_id??''};
}
function renderCityIdentity(button:HTMLElement,city:AtlasCity,events:AtlasEvent[],artists?:AtlasArtist[]){
  const identity=artistIdentity(city.name,events,artists,button.dataset.artist);
  button.replaceChildren();button.style.display=identity.photo?'':'none';
  if(identity.photo){const portrait=document.createElement('img');portrait.src=identity.photo.url;portrait.alt=identity.name;portrait.loading='lazy';portrait.classList.toggle('is-whole-photo',!!identity.photo.contain);button.append(portrait);}
  button.dataset.portrait=identity.photo?'verified':'unavailable';
  button.title=identity.photo?identity.photo.context:'';
}
function fitNation(map:GLMap,_height:number,duration:number,center:[number,number]){
  // Keep the map geographically continuous while focusing an area with concerts.
  map.setPadding({top:0,bottom:0,left:0,right:0});
  map.easeTo({center,zoom:6.4,offset:[0,-85],duration,pitch:0,bearing:0});
}
export function AtlasMap(props:Props){
  const {cities,events,today,selectedCity,artistSelected,scene='map',venueEvent}=props;
  const container=useRef<HTMLDivElement>(null),engine=useRef<GLMap|null>(null),markers=useRef<Marker[]>([]);
  const venuePins=useRef<Marker[]>([]),makeVenueMarker=useRef<((element:HTMLElement,point:[number,number])=>Marker)|null>(null);
  const latest=useRef(props);latest.current=props;
  const venueLayer=useRef<VenueLayer|null>(null);
  const [modelReady,setModelReady]=useState(false);
  const [sceneImageError,setSceneImageError]=useState(false);
  const [sceneImageLoading,setSceneImageLoading]=useState(false);
  const [layerRetry,setLayerRetry]=useState(0);
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[imageryError,setImageryError]=useState(false);
  const interacted=useRef(false);
  const needsModel=scene!=='map';
  const target=cameraTarget(scene,selectedCity,venueEvent);
  useEffect(()=>{if(!selectedCity)interacted.current=false;},[selectedCity?.id]);
  const route=useMemo(()=>{
    const seen=new Set<string>();return events.filter(event=>event.event_status!=='cancelled').sort((a,b)=>a.date.localeCompare(b.date)).flatMap(event=>{const city=cities.find(c=>c.name===event.city);if(!city||seen.has(city.id))return [];seen.add(city.id);return [[city.lng,city.lat]];});
  },[cities,events]);
  useEffect(()=>{
    // The engine owns gesture, camera and tile scheduling; no per-frame React updates.
    let cancelled=false;let resize:ResizeObserver|undefined;let cleanup=()=>{};
    if(typeof window.WebGL2RenderingContext==='undefined'){setFailed(true);return;}
    void import('maplibre-gl').then(gl=>{
      if(cancelled||!container.current)return;
      gl.setWorkerCount(2);
      gl.setWorkerUrl(mapWorkerUrl);
      const map=new gl.Map({container:container.current,center:overviewFocus(null),zoom:6.4,renderWorldCopies:false,minZoom:1,maxZoom:21,maxPitch:85,centerClampedToGround:false,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),fadeDuration:160,maxTileCacheSize:120,attributionControl:false,canvasContextAttributes:{antialias:true},style:atlasMapStyle()});
      engine.current=map;
      container.current.addEventListener('pointerdown',()=>{interacted.current=true;},{passive:true});
      makeVenueMarker.current=(element,point)=>new gl.Marker({element,anchor:'bottom'}).setLngLat(point).addTo(map);
      const resources=new MapResourceStatus();
      let pendingSource='',pendingSince=performance.now();
      const showResourceError=()=>{
        if(cancelled)return;
        const source=map.getZoom()>=7.5?'openmaptiles':'satellite';
        if(source!==pendingSource||map.isSourceLoaded(source)){pendingSource=source;pendingSince=performance.now();}
        setImageryError(resources.unavailable(map.getZoom())||performance.now()-pendingSince>10000);
      };
      // The local style is sufficient for camera/layers. Waiting for `load` also
      // waits for external tiles and can block every venue indefinitely.
      map.on('style.load',()=>{if(!cancelled){
        setReady(true);showResourceError();
      }});
      const resourceTimer=setInterval(showResourceError,1000);
      map.on('error',event=>{if(!cancelled){if('sourceId' in event&&['satellite','openmaptiles'].includes(String(event.sourceId))){resources.failed(String(event.sourceId),resourceTileKey(event));showResourceError();}if(container.current)container.current.dataset.mapError=event.error.message;}});
      map.on('sourcedata',event=>{
        if(cancelled||!['satellite','openmaptiles'].includes(event.sourceId))return;
        const tile=(event as unknown as {tile?:{state?:string}}).tile;
        if(tile?.state==='loaded'||event.sourceDataType==='metadata'){resources.loaded(event.sourceId,resourceTileKey(event));showResourceError();}
      });
      map.on('zoom',()=>{
        const zoom=map.getZoom(),approach=Math.max(0,Math.min(1,(zoom-7.5)/5));
        container.current?.classList.toggle('atlas-detail-zoom',zoom>5);container.current?.classList.toggle('atlas-street-view',zoom>=7.5);
        container.current?.parentElement?.style.setProperty('--atlas-approach',String(approach));
        showResourceError();
      });
      latest.current.cities.forEach(city=>(latest.current.artists??[]).forEach(artist=>{
        const button=document.createElement('button');button.type='button';button.className='real-city-pin';button.dataset.city=city.id;
        button.dataset.artist=artist.id;
        renderCityIdentity(button,city,latest.current.events,latest.current.artists);
        button.addEventListener('click',()=>latest.current.onCity(city));
        markers.current.push(new gl.Marker({element:button,anchor:'center',offset:mapMarkerOffset(city.name,artist.id,latest.current.events)}).setLngLat([city.lng,city.lat]).addTo(map));
      }));
      const arrange=()=>{
        const w=container.current?.clientWidth??390,h=container.current?.clientHeight??844;
        if(container.current)container.current.dataset.actualCamera=JSON.stringify({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),fov:map.getVerticalFieldOfView(),elevation:map.getCenterElevation()});
        if(latest.current.scene!=='map')return;
        const occupied:{x:number;y:number}[]=[];
        const sheet=container.current?parseFloat(getComputedStyle(container.current.closest('.atlas-page')??container.current).getPropertyValue('--atlas-sheet-height'))||160:160;
        const ordered=[...markers.current].sort((a,b)=>{
          const rank=(marker:Marker)=>{const el=marker.getElement();return el.classList.contains('is-selected')?3:el.classList.contains('is-upcoming')?2:el.classList.contains('is-lit')?1:0;};
          return rank(b)-rank(a);
        });
        ordered.forEach(marker=>{
          const projected=map.project(marker.getLngLat()),offset=marker.getOffset(),p={x:projected.x+offset.x,y:projected.y+offset.y},el=marker.getElement();
          if(el.style.display==='none')return;
          const collision=map.getZoom()<5&&occupied.some(other=>Math.abs(other.x-p.x)<58&&Math.abs(other.y-p.y)<38);
          const obscured=latest.current.scene!=='map'||p.y<(h<=720?160:190)||p.y>h-sheet-76||p.x<10||p.x>w-12;
          el.style.visibility=collision||obscured?'hidden':'visible';
          if(!collision&&!obscured)occupied.push(p);
        });
      };
      map.on('moveend',arrange);map.on('idle',arrange);
      map.on('move',()=>{if(container.current)container.current.dataset.actualCamera=JSON.stringify({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),fov:map.getVerticalFieldOfView(),elevation:map.getCenterElevation()});});
      map.on('click','venue-points',event=>{if(latest.current.scene!=='map')return;const feature=event.features?.[0],venue=latest.current.events.find(item=>item.id===feature?.properties.event_id);if(venue)latest.current.onVenue(venue);});
      let size=[container.current.clientWidth,container.current.clientHeight];
      resize=new ResizeObserver(()=>{
        const w=container.current?.clientWidth??390,h=container.current?.clientHeight??844;
        const changed=w!==size[0]||h!==size[1];size=[w,h];map.resize();
        if(changed&&latest.current.scene==='map'&&!latest.current.selectedCity)map.resize();
        arrange();
      });resize.observe(container.current);
      cleanup=()=>{clearInterval(resourceTimer);latest.current.controller.current=null;markers.current.forEach(marker=>marker.remove());markers.current=[];venuePins.current.forEach(marker=>marker.remove());venuePins.current=[];makeVenueMarker.current=null;engine.current=null;map.remove();venueLayer.current=null;};
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
    if(scene!=='map')venueLayer.current?.location(venueEvent);
    venueLayer.current?.scene(scene);
    map.setPaintProperty('buildings','fill-extrusion-opacity',scene==='map'?.93:0);
    map.setSky({'sky-color':scene==='sky'?'#17304a':'#c8d8dc','horizon-color':scene==='sky'?'#a88470':'#f9dec0','fog-color':scene==='sky'?'#243a4b':'#e7dfd0','sky-horizon-blend':.8,'horizon-fog-blend':.65,'fog-ground-blend':.25,'atmosphere-blend':0});
    // Do not unmount or swap surfaces: every step uses the same native map camera.
    const localVenues=events.filter(event=>event.city===selectedCity?.name&&Number.isFinite(event.venue_lng)&&Number.isFinite(event.venue_lat));
    if(scene==='map'&&selectedCity&&localVenues.length&&!Number.isFinite(venueEvent?.venue_lng)){
      const lngs=localVenues.map(event=>event.venue_lng!),lats=localVenues.map(event=>event.venue_lat!);
      map.setPadding({top:0,bottom:0,left:0,right:0});
      map.fitBounds([[Math.min(...lngs)-.003,Math.min(...lats)-.003],[Math.max(...lngs)+.003,Math.max(...lats)+.003]],{pitch:36,bearing:0,padding:{top:210,bottom:230,left:45,right:45},duration:reduced?0:2200,maxZoom:14.3});
    }
    else if(scene==='map'&&!selectedCity&&!interacted.current)fitNation(map,container.current?.clientHeight??844,reduced?0:1100,props.focusPoint??overviewFocus(null));
    else map.flyTo({...cameraTarget(scene,selectedCity,venueEvent,reduced),elevation:scene==='sky'?32:0,essential:false,curve:1.2,padding:{top:scene==='map'?190:scene==='sky'?145:170,bottom:scene==='map'?230:scene==='sky'?230:200,left:20,right:20}});
    latest.current.controller.current={
      orbit(dx,dy){
        if(venueLayer.current&&latest.current.scene!=='map'){venueLayer.current.orbit(dx,dy);return;}
        stopProjection();map.stop();map.jumpTo(orbitScene({bearing:map.getBearing(),pitch:map.getPitch(),zoom:map.getZoom()},dx,dy,latest.current.scene??'venue'));
      },
      pinch(from,to){
        if(venueLayer.current&&latest.current.scene!=='map'){venueLayer.current.pinch(from,to);return;}
        stopProjection();map.stop();map.jumpTo({zoom:pinchScene(map.getZoom(),from,to,latest.current.scene??'venue')});
      },
      zoom(delta){
        if(venueLayer.current&&latest.current.scene!=='map'){venueLayer.current.zoom(delta);return;}
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
  },[ready,modelReady,selectedCity?.id,scene,venueEvent?.venue,artistSelected,props.focusPoint]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready||!needsModel||venueLayer.current)return;
    let cancelled=false;
    void import('./venueMapLayer').then(({createVenueLayer})=>{if(cancelled)return;const layer=createVenueLayer(map,state=>{if(engine.current===map){setSceneImageError(state==='error');setSceneImageLoading(state==='loading');}});venueLayer.current=layer;layer.location(latest.current.venueEvent);layer.scene(latest.current.scene??'map');setModelReady(true);}).catch(()=>{if(!cancelled){setModelReady(true);setSceneImageLoading(false);setSceneImageError(true);if(container.current)container.current.dataset.modelError='unavailable';}});
    return()=>{cancelled=true;};
  },[ready,needsModel,layerRetry]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    const nextEvent=events.filter(event=>['upcoming','today'].includes(eventPhase(event,today))).sort((a,b)=>a.date.localeCompare(b.date))[0];
    markers.current.forEach(marker=>{
      const city=cities.find(c=>c.id===marker.getElement().dataset.city)!;const shows=events.filter(e=>e.city===city.name&&e.artist_id===marker.getElement().dataset.artist&&e.event_status!=='cancelled');
      const upcoming=shows.some(event=>['upcoming','today'].includes(eventPhase(event,today)));const button=marker.getElement();
      renderCityIdentity(button,city,events,props.artists);
      marker.setOffset(mapMarkerOffset(city.name,button.dataset.artist??'',events));
      button.classList.toggle('is-lit',shows.length>0);button.classList.toggle('is-upcoming',upcoming);button.classList.toggle('is-selected',city.id===selectedCity?.id||(!selectedCity&&artistSelected&&city.name===nextEvent?.city));
      const wanted=shows.some(show=>latest.current.wantedEventIds?.includes(show.id));button.classList.toggle('is-wanted',wanted);
      button.setAttribute('aria-label',city.name+' · '+artistIdentity(city.name,events,props.artists,button.dataset.artist).name+(shows.length?' · '+shows.length+' 场'+(upcoming?' · 有待演':'')+(wanted?' · 有想去的现场':''):''));
    });
    (map.getSource('route') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:artistSelected&&route.length>1?route:[]}});
    const seen=new Set<string>();const local=events.filter(event=>{const key=`${event.city}:${event.venue}`;if(seen.has(key)||event.city!==selectedCity?.name||!Number.isFinite(event.venue_lng)||!Number.isFinite(event.venue_lat))return false;seen.add(key);return true;});
    (map.getSource('venues') as GeoJSONSource)?.setData({type:'FeatureCollection',features:local.map(event=>({type:'Feature' as const,properties:{name:event.venue,event_id:event.id},geometry:{type:'Point' as const,coordinates:[event.venue_lng!,event.venue_lat!]}}))});
    venuePins.current.forEach(marker=>marker.remove());venuePins.current=[];
    if(scene==='map')for(const event of local){
      const button=document.createElement('button');button.type='button';button.className='real-venue-pin';button.dataset.event=event.id;
      const wanted=events.some(show=>show.city===event.city&&show.venue===event.venue&&latest.current.wantedEventIds?.includes(show.id));
      button.classList.toggle('is-wanted',wanted);button.setAttribute('aria-label',`地图场馆 · ${event.venue} · 进入外景`);button.append(document.createElement('i'),document.createElement('span'));button.lastElementChild!.textContent=event.venue+(wanted?' · 想去':'');
      button.addEventListener('click',()=>latest.current.onVenue(event));const marker=makeVenueMarker.current?.(button,[event.venue_lng!,event.venue_lat!]);if(marker)venuePins.current.push(marker);
    }
  },[ready,cities,events,today,selectedCity?.id,artistSelected,route,scene,props.wantedEventIds,props.artists]);
  function reset(){if(selectedCity){props.onNation();return;}if(engine.current)fitNation(engine.current,container.current?.clientHeight??844,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1000,props.focusPoint??overviewFocus(null));}
  function retryScene(){if(venueLayer.current)venueLayer.current.location(latest.current.venueEvent);else{setSceneImageError(false);setSceneImageLoading(true);setLayerRetry(value=>value+1);}}
  return <div className={'atlas-map-stage '+(scene!=='map'?'is-travelling':'')}>
    <div className="real-map-canvas" ref={container} aria-label="中国演唱会地图" role="region" data-camera={JSON.stringify(target)}/>
    <img className="atlas-sky-canopy" src="/scenes/atlas-sky.webp" alt="" aria-hidden="true"/>
    {scene==='map'&&!selectedCity&&<img className="atlas-cloud-canopy" src="/scenes/atlas-clouds.png" alt="" aria-hidden="true"/>}
    {failed&&<div className="atlas-map-fallback"><svg viewBox="0 0 1000 1050" aria-hidden="true">{provinces.features.map(feature=>{const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;const d=(polygons as number[][][][]).map(p=>p.map(r=>r.map(([x,y],i)=>(i?'L':'M')+projectChina(x,y).join(',')).join(' ')+'Z').join(' ')).join(' ');return <path key={feature.properties.adcode} d={d}/>;})}</svg>{cities.flatMap(city=>(props.artists??[]).map(artist=>{const [x,y]=projectChina(city.lng,city.lat),identity=artistIdentity(city.name,events,props.artists,artist.id),offset=mapMarkerOffset(city.name,artist.id,events);return identity.photo?<button type="button" key={`${city.id}:${artist.id}`} className="real-city-pin" aria-label={`${city.name} · ${identity.name}`} onClick={()=>props.onCity(city)} style={{left:`calc(${x/10}% + ${offset[0]}px)`,top:`calc(${y/10.5}% + ${offset[1]}px)`}}><img src={identity.photo.url} alt={identity.name} className={identity.photo.contain?'is-whole-photo':undefined}/></button>:null;}))}<p>当前设备无法开启三维地图，可继续选择照片标记或下方日程。</p></div>}
    {scene==='map'&&<MapCredits events={events} artists={props.artists}/>}
    {imageryError&&scene==='map'&&<div className="atlas-imagery-error" role="status">地图连接较慢，地点与日程仍可查看。</div>}
    {(!modelReady||sceneImageLoading)&&scene!=='map'&&!failed&&<span className="cinematic-loading" role="status">正在准备场馆画面…</span>}
    {sceneImageError&&scene!=='map'&&<span className="cinematic-loading cinematic-load-error" role="status">现场画面暂未载入，仍可查看歌单或返回地图。<button type="button" onClick={retryScene}>重新载入画面</button></span>}
    {scene==='map'&&<div className="atlas-map-controls"><button type="button" aria-label="放大地图" onClick={()=>engine.current?.zoomIn({duration:180})}><Plus size={24} weight="light"/></button><button type="button" aria-label="缩小地图" onClick={()=>engine.current?.zoomOut({duration:180})}><Minus size={24} weight="light"/></button><button type="button" aria-label="全国复位" onClick={reset}><MapPinArea size={23} weight="light"/></button></div>}
  </div>;
}
