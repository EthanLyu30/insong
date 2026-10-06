import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Info,X} from '@phosphor-icons/react';
import {lockPageScroll,trapDialogFocus} from './dialogScroll';
import {mapMarkerPhotos} from './mapMarkerPhotos';
import type {AtlasArtist,AtlasEvent} from './footprintAtlas';
import './mapCredits.css';

export function MapCredits({events,artists=[]}:{events:AtlasEvent[];artists?:AtlasArtist[]}){
  const [open,setOpen]=useState(false),[brief,setBrief]=useState(true);
  const button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
  const seen=new Set<string>();
  const photos=events.filter(event=>event.event_status!=='cancelled').flatMap(event=>{
    const photo=mapMarkerPhotos[event.artist_id];
    if(!photo?.source||seen.has(photo.source))return [];
    seen.add(photo.source);return [{...photo,name:artists.find(artist=>artist.id===event.artist_id)?.name??event.artist_id}];
  });
  // Attribution is legible on arrival, then remains available from the information button.
  useEffect(()=>{const timer=window.setTimeout(()=>setBrief(false),5000);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{
    if(!open||!panel.current)return;
    const root=document.getElementById('root'),wasInert=root?.inert;
    if(root)root.inert=true;
    const unlock=lockPageScroll(),release=trapDialogFocus(panel.current,()=>setOpen(false),button.current);
    return()=>{if(root)root.inert=wasInert??false;release();unlock();};
  },[open]);
  return <>
    <div className="map-source-entry">
      <button ref={button} type="button" aria-label="地图信息" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>{setBrief(false);setOpen(true);}}><Info size={20}/></button>
      {brief&&<span className="map-source-brief"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> · <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noopener noreferrer">Esri</a></span>}
    </div>
    {open&&createPortal(<div className="map-credits-overlay">
      <button className="map-credits-scrim" type="button" aria-label="关闭地图信息" onClick={()=>setOpen(false)}/>
      <div ref={panel} id={id} className="map-credits-panel" role="dialog" aria-modal="true" aria-label="地图与照片来源">
        <header><h2>地图信息</h2><button type="button" aria-label="关闭地图信息" onClick={()=>setOpen(false)}><X size={20}/></button></header>
        <div className="map-credits-content">
          <section><h3>地图来源</h3><ul>
            <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a></li>
            <li><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a></li>
            <li><a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a></li>
            <li><a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noopener noreferrer">Esri · Vantor · Earthstar Geographics · GIS User Community</a></li>
            <li><a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener noreferrer">© Mapterhorn · 地形来源</a></li>
            <li><a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noopener noreferrer">DataV GeoAtlas 省界</a></li>
          </ul></section>
          {!!photos.length&&<section><h3>照片来源</h3><p>照片用于歌手标记，按圆形或矩形裁切显示。</p><ul>{photos.map(photo=><li key={photo.source}><strong>{photo.name}</strong><span>{photo.context}</span><div><a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author} · 原图</a><a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a></div></li>)}</ul></section>}
        </div>
      </div>
    </div>,document.body)}
  </>;
}
