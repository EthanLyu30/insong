import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Info,X} from '@phosphor-icons/react';
import {lockPageScroll,trapDialogFocus} from './dialogScroll';
import {mapPhotoCredits,type MapPhotoChoice} from './personalMap';
import type {AtlasArtist,AtlasEvent} from './footprintAtlas';
import './mapCredits.css';

export function MapCredits({events,artists=[],selections=[]}:{events:AtlasEvent[];artists?:AtlasArtist[];selections?:MapPhotoChoice[]}){
  const [open,setOpen]=useState(false);
  const button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
  const photos=mapPhotoCredits(events,artists,selections);
  useEffect(()=>{
    if(!open||!panel.current)return;
    const root=document.getElementById('root'),wasInert=root?.inert;
    if(root)root.inert=true;
    const unlock=lockPageScroll(),release=trapDialogFocus(panel.current,()=>setOpen(false),button.current);
    return()=>{if(root)root.inert=wasInert??false;release();unlock();};
  },[open]);
  return <>
    <div className="map-source-entry">
      <button ref={button} type="button" aria-label="地图信息" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(true)}><Info size={20}/></button>
    </div>
    <span className="map-source-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> · <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noopener noreferrer">Esri</a></span>
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
          <section><h3>照片来源</h3><p>优先使用你的经历照片，其次使用有效公开记忆中的照片。虚构样例照片是生成示意，不代表本场实拍。以下列出当前筛选下实际用作兜底的歌手资料图与参考素材。</p>{!!photos.length&&<ul>{photos.map(photo=><li key={photo.source}><strong>{photo.name}</strong><span>{photo.context}</span><div><a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author} · 来源</a><a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a></div></li>)}</ul>}</section>
        </div>
      </div>
    </div>,document.body)}
  </>;
}
