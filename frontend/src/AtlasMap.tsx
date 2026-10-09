import {useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject,type CSSProperties} from 'react';
import type {Map as GLMap,Marker,GeoJSONSource} from 'maplibre-gl';
import {cameraTarget} from './atlasCamera';
import {eventPhase,projectChina,type AtlasArtist,type AtlasCity,type AtlasEvent} from './footprintAtlas';
import provinces from './china-provinces.json';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Plus,Minus,MapPinArea} from '@phosphor-icons/react';
import {atlasMapStyle} from './atlasMapStyle';
import {orbitScene,pinchScene,type SceneController} from './sceneInteraction';
import type {VenueLayer} from './venueMapLayer';
import {MapResourceStatus,resourceTileKey} from './mapResourceStatus';
import {mapMarkerLayout} from './mapMarkerPhotos';
import {MapCredits} from './MapCredits';
import {mapPhotoMarkers,type MapPhotoChoice,type PersonalRegion} from './personalMap';
import {updateMapPhotoElement} from './mapPhotoElement';
import {loadAtlasMapEngine} from './atlasMapEngine';
import {photoSource} from './cardMedia';
import {observeMapInteraction} from './mapInteraction';
import {regionalMapView,applyRegionalMapView} from './regionalMapView';
import {visibleMapPhotoKeys} from './mapPhotoVisibility';
import {mapZoomFocus} from './mapZoomFocus';

type Props={cities:AtlasCity[];events:AtlasEvent[];artists?:AtlasArtist[];today:string;selectedCity?:AtlasCity;artistSelected:boolean;wantedEventIds?:string[];focusPoint?:[number,number];overviewRegion?:PersonalRegion|null;photos?:MapPhotoChoice[];holdCamera?:boolean;focusRequest?:number;initialReady?:boolean;onCity:(city:AtlasCity,artistId?:string)=>void;onVenue:(event:AtlasEvent)=>void;onNation:()=>void;onLocate?:()=>void;locating?:boolean;onInteraction?:()=>void;scene?:string;venueEvent?:AtlasEvent;controller:RefObject<SceneController|null>};
function photoPriority(element:HTMLElement){return element.dataset.photoSource==='mine'?5:element.dataset.photoSource==='public'?4:element.classList.contains('is-selected')?3:element.classList.contains('is-upcoming')?2:1;}
function frameRegionalMap(map:GLMap,props:Props,height:number,page?:HTMLElement|null){
  const header=page?.querySelector('.atlas-searchbar')?.getBoundingClientRect().height??185;
  const sheet=page?parseFloat(getComputedStyle(page).getPropertyValue('--atlas-sheet-height'))||285:285;
  const nav=page?.closest('.site-shell')?.querySelector('.bottom-nav')?.getBoundingClientRect().height??70;
  applyRegionalMapView(map,regionalMapView(props.selectedCity,props.overviewRegion,props.focusPoint),{height,header,sheet,nav});
}
export function AtlasMap(props:Props){
  const {cities,events,today,selectedCity,artistSelected,scene='map',venueEvent}=props;
  const container=useRef<HTMLDivElement>(null),engine=useRef<GLMap|null>(null),markers=useRef<Marker[]>([]);
  const makeCityMarker=useRef<((element:HTMLElement,point:[number,number],offset:[number,number])=>Marker)|null>(null);
  const arrangeMarkers=useRef<(()=>void)|null>(null);
  const venuePins=useRef<Marker[]>([]),makeVenueMarker=useRef<((element:HTMLElement,point:[number,number])=>Marker)|null>(null);
  const latest=useRef(props);latest.current=props;
  const venueLayer=useRef<VenueLayer|null>(null);
  const [modelReady,setModelReady]=useState(false);
  const [sceneImageError,setSceneImageError]=useState(false);
  const [sceneImageLoading,setSceneImageLoading]=useState(false);
  const [layerRetry,setLayerRetry]=useState(0);
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[imageryError,setImageryError]=useState(false);
  const [canStart,setCanStart]=useState(props.initialReady!==false),[frameReady,setFrameReady]=useState(false);
  useEffect(()=>{if(props.initialReady!==false)setCanStart(true);},[props.initialReady]);
  const interacted=useRef(false);
  const previousNavigation=useRef(''),framedRegion=useRef('');
  const previousFocus=useRef(props.focusRequest??0);
  const needsModel=scene!=='map';
  const photoMarkers=useMemo(()=>mapPhotoMarkers(cities,events,props.artists,props.photos),[cities,events,props.artists,props.photos]);
  const target=scene==='map'?regionalMapView(selectedCity,props.overviewRegion,props.focusPoint):cameraTarget(scene,selectedCity,venueEvent);
  useEffect(()=>{if(!selectedCity)interacted.current=false;},[selectedCity?.id]);
  const route=useMemo(()=>{
    const seen=new Set<string>();return events.filter(event=>event.event_status!=='cancelled').sort((a,b)=>a.date.localeCompare(b.date)).flatMap(event=>{const city=cities.find(c=>c.name===event.city);if(!city||seen.has(city.id))return [];seen.add(city.id);return [[city.lng,city.lat]];});
  },[cities,events]);
  useEffect(()=>{
    if(!canStart)return;
    // The engine owns gesture, camera and tile scheduling; no per-frame React updates.
    let cancelled=false;let resize:ResizeObserver|undefined;let cleanup=()=>{},releaseInteraction=()=>{};
    if(typeof window.WebGL2RenderingContext==='undefined'){setFailed(true);setFrameReady(true);return;}
    void loadAtlasMapEngine().then(gl=>{
      if(cancelled||!container.current)return;
      gl.setWorkerCount(2);
      gl.setWorkerUrl(mapWorkerUrl);
      const initial=regionalMapView(latest.current.selectedCity,latest.current.overviewRegion,latest.current.focusPoint);
      const map=new gl.Map({container:container.current,center:initial.center,zoom:initial.zoom,renderWorldCopies:false,minZoom:1,maxZoom:21,maxPitch:85,centerClampedToGround:false,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),fadeDuration:0,maxTileCacheSize:120,attributionControl:false,canvasContextAttributes:{antialias:true},style:atlasMapStyle(true)});
      engine.current=map;
      releaseInteraction=observeMapInteraction(container.current,()=>{interacted.current=true;latest.current.onInteraction?.();});
      makeVenueMarker.current=(element,point)=>new gl.Marker({element,anchor:'bottom'}).setLngLat(point).addTo(map);
      makeCityMarker.current=(element,point,offset)=>new gl.Marker({element,anchor:'center',offset}).setLngLat(point).addTo(map);
      const resources=new MapResourceStatus();
      let pendingSource='',pendingSince=performance.now();
      const showResourceError=()=>{
        if(cancelled)return;
        const source=map.getZoom()>=7.5?'openmaptiles':'china';
        if(source!==pendingSource||map.isSourceLoaded(source)){pendingSource=source;pendingSince=performance.now();}
        setImageryError(source!=='china'&&(resources.unavailable(map.getZoom())||performance.now()-pendingSince>10000));
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
      const arrange=()=>{
        const w=container.current?.clientWidth??390,h=container.current?.clientHeight??844;
        if(container.current)container.current.dataset.actualCamera=JSON.stringify({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),fov:map.getVerticalFieldOfView(),elevation:map.getCenterElevation()});
        if(latest.current.scene!=='map')return;
        const sheet=container.current?parseFloat(getComputedStyle(container.current.closest('.atlas-page')??container.current).getPropertyValue('--atlas-sheet-height'))||160:160;
        const header=container.current?.closest('.atlas-page')?.querySelector('.atlas-searchbar')?.getBoundingClientRect().height??185;
        const nav=container.current?.closest('.site-shell')?.querySelector('.bottom-nav')?.getBoundingClientRect().height??70;
        const points=markers.current.filter(marker=>marker.getElement().style.display!=='none').map(marker=>{
          const element=marker.getElement(),city=latest.current.cities.find(item=>item.id===element.dataset.city);
          if(city){
            const layout=mapMarkerLayout(city.name,element.dataset.artist??'',latest.current.events,map.getZoom());
            const previous=marker.getOffset();
            if(previous.x!==layout.offset[0]||previous.y!==layout.offset[1])marker.setOffset(layout.offset);
            element.style.setProperty('--map-photo-size',`${layout.diameter}px`);
          }
          const point=map.project(marker.getLngLat()),offset=marker.getOffset();
          return {key:`${element.dataset.city}:${element.dataset.artist}`,x:point.x+offset.x,y:point.y+offset.y,diameter:parseFloat(element.style.getPropertyValue('--map-photo-size'))||58,priority:photoPriority(element),date:latest.current.events.find(event=>event.id===element.dataset.photoEvent)?.date??''};
        });
        const visible=new Set(visibleMapPhotoKeys(points,{left:3,top:header+3,right:w-3,bottom:h-sheet-nav-3}));
        markers.current.forEach(marker=>{const element=marker.getElement(),shown=visible.has(`${element.dataset.city}:${element.dataset.artist}`);element.style.visibility=shown?'visible':'hidden';element.tabIndex=shown?0:-1;element.setAttribute('aria-hidden',String(!shown));});
      };
      arrangeMarkers.current=arrange;
      map.on('zoom',arrange);map.on('moveend',arrange);map.on('idle',arrange);
      map.on('click','venue-points',event=>{if(latest.current.scene!=='map')return;const feature=event.features?.[0],venue=latest.current.events.find(item=>item.id===feature?.properties.event_id);if(venue)latest.current.onVenue(venue);});
      let size=[container.current.clientWidth,container.current.clientHeight];
      resize=new ResizeObserver(()=>{
        const w=container.current?.clientWidth??390,h=container.current?.clientHeight??844;
        const changed=w!==size[0]||h!==size[1];size=[w,h];map.resize();
        if(changed&&latest.current.scene==='map'&&!latest.current.selectedCity)map.resize();
        arrange();
      });resize.observe(container.current);
      cleanup=()=>{clearInterval(resourceTimer);latest.current.controller.current=null;markers.current.forEach(marker=>marker.remove());markers.current=[];venuePins.current.forEach(marker=>marker.remove());venuePins.current=[];makeCityMarker.current=null;arrangeMarkers.current=null;makeVenueMarker.current=null;engine.current=null;map.remove();venueLayer.current=null;};
    }).catch(()=>{if(!cancelled){setFailed(true);setFrameReady(true);}});
    return()=>{cancelled=true;resize?.disconnect();releaseInteraction();cleanup();};
  },[canStart]);
  useLayoutEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    const navigationKey=`${scene}:${selectedCity?.id??'overview'}:${venueEvent?.venue??''}`;
    const navigationChanged=previousNavigation.current!==navigationKey;
    const regionChanged=!!props.overviewRegion&&framedRegion.current!==props.overviewRegion.key;
    const focusChanged=previousFocus.current!==(props.focusRequest??0);previousFocus.current=props.focusRequest??0;
    // Artist/scope/search changes update data, not the user's camera. A newly
    // loaded personal region is framed only before a map gesture has occurred.
    if(scene==='map'&&props.holdCamera&&previousNavigation.current){previousNavigation.current=navigationKey;return;}
    if(scene==='map'&&!navigationChanged&&!focusChanged&&(!regionChanged||interacted.current))return;
    if(focusChanged)interacted.current=false;
    previousNavigation.current=navigationKey;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    map.stop();
    const canvas=map.getCanvas();canvas.tabIndex=scene==='map'?0:-1;
    canvas.setAttribute('aria-hidden',scene==='map'?'false':'true');
    if(scene==='map')map.keyboard.enable();else map.keyboard.disable();
    if(scene==='map'){
      venueLayer.current?.scene('map');
      frameRegionalMap(map,latest.current,container.current?.clientHeight??844,container.current?.closest<HTMLElement>('.atlas-page'));
      if(props.overviewRegion)framedRegion.current=props.overviewRegion.key;
      setFrameReady(true);
      return;
    }
    if(scene!=='map'&&!modelReady)return;
    setFrameReady(true);
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
    // Legacy venue/sky controls keep their own scene; map entry returned above without animation.
    map.flyTo({...cameraTarget(scene,selectedCity,venueEvent,reduced),elevation:scene==='sky'?32:0,essential:false,curve:1.2,padding:{top:scene==='sky'?145:170,bottom:scene==='sky'?230:200,left:20,right:20}});
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
  },[ready,modelReady,selectedCity?.id,scene,venueEvent?.venue,props.overviewRegion?.key,props.focusPoint,props.holdCamera,props.focusRequest]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready||!needsModel||venueLayer.current)return;
    let cancelled=false;
    void import('./venueMapLayer').then(({createVenueLayer})=>{if(cancelled)return;const layer=createVenueLayer(map,state=>{if(engine.current===map){setSceneImageError(state==='error');setSceneImageLoading(state==='loading');}});venueLayer.current=layer;layer.location(latest.current.venueEvent);layer.scene(latest.current.scene??'map');setModelReady(true);}).catch(()=>{if(!cancelled){setModelReady(true);setSceneImageLoading(false);setSceneImageError(true);if(container.current)container.current.dataset.modelError='unavailable';}});
    return()=>{cancelled=true;};
  },[ready,needsModel,layerRetry]);
  useLayoutEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    const nextEvent=events.filter(event=>['upcoming','today'].includes(eventPhase(event,today))).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const previous=new Map(markers.current.map(marker=>{const element=marker.getElement();return[`${element.dataset.city}:${element.dataset.artist}`,marker];}));
    const current:Marker[]=[];
    for(const {key,city,artistId,events:shows,identity} of photoMarkers){
      let marker=previous.get(key);
      const layout=mapMarkerLayout(city.name,artistId,events,map.getZoom());
      if(!marker){
        const button=document.createElement('button');button.type='button';button.className='real-city-pin';button.dataset.city=city.id;button.dataset.artist=artistId;
        button.addEventListener('click',()=>{const currentCity=latest.current.cities.find(item=>item.id===city.id);if(currentCity)latest.current.onCity(currentCity,artistId);});
        marker=makeCityMarker.current?.(button,[city.lng,city.lat],layout.offset);
      }
      if(!marker)continue;
      previous.delete(key);current.push(marker);
      const upcoming=shows.some(event=>['upcoming','today'].includes(eventPhase(event,today)));const button=marker.getElement();
      updateMapPhotoElement(button,identity,identity.photo?photoSource(identity.photo.url):'');
      const point=marker.getLngLat(),offset=marker.getOffset();
      if(point.lng!==city.lng||point.lat!==city.lat)marker.setLngLat([city.lng,city.lat]);
      if(offset.x!==layout.offset[0]||offset.y!==layout.offset[1])marker.setOffset(layout.offset);
      button.style.setProperty('--map-photo-size',`${layout.diameter}px`);
      button.classList.toggle('is-lit',shows.length>0);button.classList.toggle('is-upcoming',upcoming);button.classList.toggle('is-selected',city.id===selectedCity?.id||(!selectedCity&&artistSelected&&city.name===nextEvent?.city));
      const wanted=shows.some(show=>latest.current.wantedEventIds?.includes(show.id));button.classList.toggle('is-wanted',wanted);
      button.setAttribute('aria-label',city.name+' · '+identity.name+(shows.length?' · '+shows.length+' 场'+(upcoming?' · 有待演':'')+(wanted?' · 有想去的现场':''):''));
    }
    previous.forEach(marker=>marker.remove());markers.current=current;arrangeMarkers.current?.();
    (map.getSource('route') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:artistSelected&&route.length>1?route:[]}});
    (map.getSource('cities') as GeoJSONSource)?.setData({type:'FeatureCollection',features:cities.map(city=>({type:'Feature' as const,properties:{name:city.name},geometry:{type:'Point' as const,coordinates:[city.lng,city.lat]}}))});
    const seen=new Set<string>();const local=events.filter(event=>{const key=`${event.city}:${event.venue}`;if(seen.has(key)||event.city!==selectedCity?.name||!Number.isFinite(event.venue_lng)||!Number.isFinite(event.venue_lat))return false;seen.add(key);return true;});
    (map.getSource('venues') as GeoJSONSource)?.setData({type:'FeatureCollection',features:local.map(event=>({type:'Feature' as const,properties:{name:event.venue,event_id:event.id},geometry:{type:'Point' as const,coordinates:[event.venue_lng!,event.venue_lat!]}}))});
    venuePins.current.forEach(marker=>marker.remove());venuePins.current=[];
    if(scene==='map')for(const event of local){
      const button=document.createElement('button');button.type='button';button.className='real-venue-pin';button.dataset.event=event.id;
      const wanted=events.some(show=>show.city===event.city&&show.venue===event.venue&&latest.current.wantedEventIds?.includes(show.id));
      button.classList.toggle('is-wanted',wanted);button.setAttribute('aria-label',`地图场馆 · ${event.venue} · ${event.date} · 查看这场记忆`);button.append(document.createElement('i'),document.createElement('span'));button.lastElementChild!.textContent=event.venue+(wanted?' · 想去':'');
      button.addEventListener('click',()=>latest.current.onVenue(event));const marker=makeVenueMarker.current?.(button,[event.venue_lng!,event.venue_lat!]);if(marker)venuePins.current.push(marker);
    }
  },[ready,cities,events,today,selectedCity?.id,artistSelected,route,scene,props.wantedEventIds,photoMarkers]);
  useLayoutEffect(()=>{
    if(!failed||!frameReady)return;
    const fallback=container.current?.parentElement?.querySelector<HTMLElement>('.atlas-map-fallback');if(!fallback)return;
    const arrange=()=>{
      const rect=fallback.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const buttons=[...fallback.querySelectorAll<HTMLButtonElement>('.real-city-pin')];
      const points=buttons.map(button=>{const bounds=button.getBoundingClientRect();return{key:button.dataset.photoKey!,x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,diameter:bounds.width,priority:photoPriority(button),date:events.find(event=>event.id===button.dataset.photoEvent)?.date??''};});
      const visible=new Set(visibleMapPhotoKeys(points,{left:rect.left+3,top:rect.top+3,right:rect.right-3,bottom:rect.bottom-28}));
      buttons.forEach(button=>{const shown=visible.has(button.dataset.photoKey!);button.style.visibility=shown?'visible':'hidden';button.tabIndex=shown?0:-1;button.setAttribute('aria-hidden',String(!shown));});
    };
    arrange();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(arrange);observer.observe(fallback);return()=>observer.disconnect();
  },[failed,frameReady,cities,events,props.photos,props.artists,selectedCity?.id,props.overviewRegion,props.focusPoint]);
  function reset(){interacted.current=false;if(selectedCity){props.onNation();return;}if(engine.current)frameRegionalMap(engine.current,props,container.current?.clientHeight??844,container.current?.closest<HTMLElement>('.atlas-page'));}
  function zoomMap(direction:'in'|'out'){
    interacted.current=true;props.onInteraction?.();
    const map=engine.current,canvas=container.current;if(!map||!canvas)return;
    const page=canvas.closest<HTMLElement>('.atlas-page');
    const header=page?.querySelector('.atlas-searchbar')?.getBoundingClientRect().height??185;
    const sheet=page?parseFloat(getComputedStyle(page).getPropertyValue('--atlas-sheet-height'))||160:160;
    const nav=page?.closest('.site-shell')?.querySelector('.bottom-nav')?.getBoundingClientRect().height??70;
    const around=map.unproject(mapZoomFocus({width:canvas.clientWidth,height:canvas.clientHeight,header,sheet,nav}));
    map.zoomTo(map.getZoom()+(direction==='in'?1:-1),{duration:180,around});
  }
  function retryScene(){if(venueLayer.current)venueLayer.current.location(latest.current.venueEvent);else{setSceneImageError(false);setSceneImageLoading(true);setLayerRetry(value=>value+1);}}
  const fallbackView=regionalMapView(selectedCity,props.overviewRegion,props.focusPoint);
  const [fallbackX,fallbackY]=projectChina(fallbackView.bounds[0][0],fallbackView.bounds[1][1]);
  const [fallbackRight,fallbackBottom]=projectChina(fallbackView.bounds[1][0],fallbackView.bounds[0][1]);
  const fallbackWidth=fallbackRight-fallbackX,fallbackHeight=fallbackBottom-fallbackY;
  return <div className={'atlas-map-stage '+(scene!=='map'?'is-travelling':'')}>
    <div className="real-map-canvas" ref={container} aria-label="中国演唱会地图" role="region" aria-busy={!frameReady} data-frame-ready={frameReady} data-camera={JSON.stringify(target)}/>
    {!frameReady&&scene==='map'&&<p className="atlas-map-preparing" role="status">正在准备地图与照片…</p>}
    <img className="atlas-sky-canopy" src="/scenes/atlas-sky.webp" alt="" aria-hidden="true"/>
    {scene==='map'&&!selectedCity&&<img className="atlas-cloud-canopy" src="/scenes/atlas-clouds.png" alt="" aria-hidden="true"/>}
    {failed&&<div className="atlas-map-fallback"><svg viewBox={`${fallbackX} ${fallbackY} ${fallbackWidth} ${fallbackHeight}`} preserveAspectRatio="none" aria-hidden="true">{provinces.features.map(feature=>{const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;const d=(polygons as number[][][][]).map(p=>p.map(r=>r.map(([x,y],i)=>(i?'L':'M')+projectChina(x,y).join(',')).join(' ')+'Z').join(' ')).join(' ');return <path key={feature.properties.adcode} d={d}/>;})}</svg>{photoMarkers.map(({key,city,artistId,identity})=>{
      const [x,y]=projectChina(city.lng,city.lat),layout=mapMarkerLayout(city.name,artistId,events,fallbackView.zoom);
      const outside=x<fallbackX||x>fallbackRight||y<fallbackY||y>fallbackBottom;
      return identity.photo?<button type="button" key={key} className={`real-city-pin${events.some(event=>event.city===city.name&&event.artist_id===artistId&&event.date>=today)?' is-upcoming':''}`} data-photo-key={key} data-photo-source={identity.source} data-photo-event={identity.eventId} title={identity.photo.context} aria-label={`${city.name} · ${identity.name}`} aria-hidden={outside} tabIndex={outside?-1:0} onClick={()=>props.onCity(city,artistId)} style={{'--map-photo-size':`${layout.diameter}px`,visibility:outside?'hidden':undefined,left:`calc(${(x-fallbackX)/fallbackWidth*100}% + ${layout.offset[0]}px)`,top:`calc(${(y-fallbackY)/fallbackHeight*100}% + ${layout.offset[1]}px)`} as CSSProperties}><img src={photoSource(identity.photo.url)} alt={identity.name} className={identity.photo.bakedAvatar?'is-baked-avatar':undefined}/></button>:null;
    })}<p>当前设备无法开启三维地图，可继续选择照片标记或下方日程。</p></div>}
    {scene==='map'&&<MapCredits events={events} artists={props.artists} selections={props.photos}/>}
    {imageryError&&scene==='map'&&<div className="atlas-imagery-error" role="status">地图连接较慢，地点与日程仍可查看。</div>}
    {(!modelReady||sceneImageLoading)&&scene!=='map'&&!failed&&<span className="cinematic-loading" role="status">正在准备场馆画面…</span>}
    {sceneImageError&&scene!=='map'&&<span className="cinematic-loading cinematic-load-error" role="status">现场画面暂未载入，仍可查看歌单或返回地图。<button type="button" onClick={retryScene}>重新载入画面</button></span>}
    {scene==='map'&&<div className="atlas-map-controls"><button type="button" aria-label="放大地图" onClick={()=>zoomMap('in')}><Plus size={24} weight="light"/></button><button type="button" aria-label="缩小地图" onClick={()=>zoomMap('out')}><Minus size={24} weight="light"/></button><button type="button" aria-label={props.onLocate?'查看附近演唱会':'全国复位'} disabled={props.locating} onClick={props.onLocate??reset}><MapPinArea size={23} weight="light"/></button></div>}
  </div>;
}
