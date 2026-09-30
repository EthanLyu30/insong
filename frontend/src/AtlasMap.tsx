import {useEffect,useMemo,useRef,useState} from 'react';
import type {Map as GLMap,Marker,GeoJSONSource} from 'maplibre-gl';
import {cameraTarget,CHINA_BOUNDS} from './atlasCamera';
import {eventPhase,projectChina,type AtlasCity,type AtlasEvent} from './footprintAtlas';
import provinces from './china-provinces.json';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

type Props={cities:AtlasCity[];events:AtlasEvent[];today:string;selectedCity?:AtlasCity;artistSelected:boolean;onCity:(city:AtlasCity)=>void;scene?:string;venueEvent?:AtlasEvent;onArrive?:()=>void};
export function AtlasMap(props:Props){
  const {cities,events,today,selectedCity,artistSelected,scene='map',venueEvent}=props;
  const container=useRef<HTMLDivElement>(null),engine=useRef<GLMap|null>(null),markers=useRef<Marker[]>([]);
  const latest=useRef(props);latest.current=props;
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
      const map=new gl.Map({container:container.current,center:[104,35],zoom:3,renderWorldCopies:false,minZoom:1.5,maxZoom:19,maxPitch:70,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),fadeDuration:180,maxTileCacheSize:140,attributionControl:false,
        style:{version:8,sources:{satellite:{type:'raster',tileSize:256,maxzoom:19,tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],attribution:'Esri, Vantor, Earthstar Geographics, GIS User Community'},china:{type:'geojson',data:provinces as never},route:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[]}}}},layers:[{id:'satellite',type:'raster',source:'satellite',paint:{'raster-saturation':-.28,'raster-brightness-min':.12,'raster-brightness-max':.94,'raster-fade-duration':180}},{id:'china-border',type:'line',source:'china',paint:{'line-color':'#eee9d5','line-opacity':.32,'line-width':.7}},{id:'tour-route',type:'line',source:'route',paint:{'line-color':'#f4d6a2','line-width':1.4,'line-dasharray':[3,4],'line-opacity':.7}}]}});
      engine.current=map;
      map.addControl(new gl.AttributionControl({compact:true,customAttribution:'省界 DataV'}),'bottom-left');
      map.on('load',()=>{if(!cancelled){setReady(true);setImageryError(false);}});
      map.on('error',event=>{if(!cancelled){setImageryError(true);if(container.current)container.current.dataset.mapError=event.error.message;}});
      map.on('sourcedata',event=>{if(event.sourceId==='satellite'&&event.isSourceLoaded&&!cancelled)setImageryError(false);});
      map.on('zoom',()=>container.current?.classList.toggle('atlas-detail-zoom',map.getZoom()>5));
      latest.current.cities.forEach(city=>{
        const button=document.createElement('button');button.type='button';button.className='real-city-pin';button.dataset.city=city.id;
        button.append(document.createElement('i'),document.createElement('span'));button.lastElementChild!.textContent=city.name;
        button.addEventListener('click',()=>latest.current.onCity(city));
        markers.current.push(new gl.Marker({element:button,anchor:'bottom'}).setLngLat([city.lng,city.lat]).addTo(map));
      });
      resize=new ResizeObserver(()=>map.resize());resize.observe(container.current);
      cleanup=()=>{markers.current.forEach(marker=>marker.remove());markers.current=[];engine.current=null;map.remove();};
    }).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;resize?.disconnect();cleanup();};
  },[]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    map.stop();
    const arriving=()=>{if(latest.current.scene===scene&&latest.current.venueEvent?.venue===venueEvent?.venue)latest.current.onArrive?.();};map.once('moveend',arriving);
    if(scene==='map'&&!selectedCity)map.fitBounds(CHINA_BOUNDS,{padding:{top:150,bottom:220,left:24,right:24},duration:reduced?0:1300,maxZoom:5});
    else map.flyTo({...cameraTarget(scene,selectedCity,venueEvent,reduced),essential:false,padding:{top:scene==='map'?170:100,bottom:scene==='map'?210:290,left:20,right:20}});
    return()=>{map.off('moveend',arriving);map.stop();};
  },[ready,selectedCity?.id,scene,venueEvent?.venue,artistSelected]);
  useEffect(()=>{
    const map=engine.current;if(!map||!ready)return;
    markers.current.forEach(marker=>{
      const city=cities.find(c=>c.id===marker.getElement().dataset.city)!;const shows=events.filter(e=>e.city===city.name);
      const upcoming=shows.some(event=>eventPhase(event,today)!=='past');const button=marker.getElement();
      button.classList.toggle('is-lit',shows.length>0);button.classList.toggle('is-upcoming',upcoming);button.classList.toggle('is-selected',city.id===selectedCity?.id);
      button.setAttribute('aria-label',city.name+(shows.length?' · '+shows.length+' 场'+(upcoming?' · 有待演':''):''));
    });
    (map.getSource('route') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:artistSelected&&route.length>1?route:[]}});
  },[ready,cities,events,today,selectedCity?.id,artistSelected,route]);
  function reset(){engine.current?.fitBounds(CHINA_BOUNDS,{padding:{top:150,bottom:220,left:24,right:24},duration:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1000});}
  return <div className={'atlas-map-stage '+(scene!=='map'?'is-travelling':'')} aria-hidden={scene!=='map'} inert={scene!=='map'}>
    <div className="real-map-canvas" ref={container} aria-label="中国演唱会地图" role="region" data-camera={JSON.stringify(target)}/>
    {failed&&<div className="atlas-map-fallback"><svg viewBox="0 0 1000 1050" aria-hidden="true">{provinces.features.map(feature=>{const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;const d=(polygons as number[][][][]).map(p=>p.map(r=>r.map(([x,y],i)=>(i?'L':'M')+projectChina(x,y).join(',')).join(' ')+'Z').join(' ')).join(' ');return <path key={feature.properties.adcode} d={d}/>;})}</svg>{cities.map(city=>{const [x,y]=projectChina(city.lng,city.lat);return <button type="button" key={city.id} onClick={()=>props.onCity(city)} style={{left:x/10+'%',top:y/10.5+'%'}}>{city.name}</button>;})}<p>当前设备无法开启三维地图，可继续选择城市。</p></div>}
    {imageryError&&scene==='map'&&<div className="atlas-imagery-error" role="status">卫星影像连接较慢，地点与日程仍可查看。</div>}
    <div className="atlas-map-controls"><button type="button" aria-label="放大地图" onClick={()=>engine.current?.zoomIn({duration:180})}>＋</button><button type="button" aria-label="缩小地图" onClick={()=>engine.current?.zoomOut({duration:180})}>−</button><button type="button" aria-label="全国复位" onClick={reset}>⌖</button></div>
  </div>;
}
