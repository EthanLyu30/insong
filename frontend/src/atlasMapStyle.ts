import type {StyleSpecification} from 'maplibre-gl';
import provinces from './china-provinces.json';

// Satellite geography and DEM shading stay native and draggable.
const countryHoles=provinces.features.flatMap(feature=>{
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  return (polygons as number[][][][]).map(p=>{const ring=p[0];const area=ring.reduce((sum,point,i)=>{const next=ring[(i+1)%ring.length];return sum+point[0]*next[1]-next[0]*point[1];},0);return area>0?[...ring].reverse():ring;});
});
export function atlasMapStyle():StyleSpecification{
  const name=['coalesce',['get','name:zh'],['get','name'],['get','name:en']];
  return {
    version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    transition:{duration:1600,delay:0},
    sky:{'sky-color':'#a8cadb','horizon-color':'#f8e0bd','fog-color':'#bccfca','sky-horizon-blend':.8,'horizon-fog-blend':.6,'fog-ground-blend':.12,'atmosphere-blend':0},
    sources:{
      relief:{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'],tileSize:128,maxzoom:8,attribution:'Esri, US National Park Service, Natural Earth'},
      satellite:{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:128,maxzoom:19,attribution:'Esri, Vantor, Earthstar Geographics, GIS User Community'},
      shade:{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json',attribution:'<a href="https://mapterhorn.com/" target="_blank">Mapterhorn</a>'},
      openmaptiles:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>'},
      china:{type:'geojson',data:provinces as never},
      surroundings:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]],...countryHoles]}}},
      route:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[]}}},
      venues:{type:'geojson',data:{type:'FeatureCollection',features:[]}},
    },
    layers:[
      {id:'land',type:'background',paint:{'background-color':'#345b6a'}},
      {id:'physical-overview',type:'raster',source:'relief',maxzoom:8,paint:{'raster-saturation':.08,'raster-contrast':.07,'raster-brightness-max':.95,'raster-fade-duration':160}},
      {id:'satellite-detail',type:'raster',source:'satellite',paint:{'raster-opacity':['interpolate',['linear'],['zoom'],4,.75,7,1],'raster-saturation':.12,'raster-contrast':.1,'raster-brightness-min':.02,'raster-brightness-max':.95,'raster-fade-duration':160}},
      {id:'terrain-light',type:'hillshade',source:'shade',maxzoom:9,paint:{'hillshade-exaggeration':.65,'hillshade-illumination-direction':315,'hillshade-shadow-color':'#172f25','hillshade-highlight-color':'#ffe8b4','hillshade-accent-color':'#7d7551'}},
      {id:'parks',type:'fill',source:'openmaptiles','source-layer':'park',minzoom:8,paint:{'fill-color':'#799161','fill-opacity':.07}},
      {id:'wood',type:'fill',source:'openmaptiles','source-layer':'landcover',minzoom:8,filter:['==',['get','class'],'wood'],paint:{'fill-color':'#608950','fill-opacity':.05}},
      {id:'water',type:'fill',source:'openmaptiles','source-layer':'water',paint:{'fill-color':'#1d6580','fill-opacity':['interpolate',['linear'],['zoom'],0,.22,7,.07]}},
      {id:'surrounding-tone',type:'fill',source:'surroundings',maxzoom:7,paint:{'fill-color':'#183f48','fill-opacity':.22}},
      {id:'china-border-glow',type:'line',source:'china',maxzoom:9,paint:{'line-color':'#d6bc6c','line-opacity':.18,'line-width':3,'line-blur':2}},
      {id:'china-border',type:'line',source:'china',maxzoom:10,paint:{'line-color':'#f7dc92','line-opacity':.85,'line-width':['interpolate',['linear'],['zoom'],2,1.1,6,1.4]}},
      {id:'streets',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:9,filter:['in',['get','class'],['literal',['motorway','trunk','primary']]],paint:{'line-color':'#f9e2b7','line-opacity':.32,'line-width':['interpolate',['exponential',1.3],['zoom'],9,.5,14,1.6,18,3]}},
      {id:'buildings',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:15,paint:{'fill-extrusion-color':'#e7d9b9','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.32}},
      {id:'districts',type:'symbol',source:'openmaptiles','source-layer':'place',minzoom:9,maxzoom:15,filter:['in',['get','class'],['literal',['suburb','town','neighbourhood']]],layout:{'text-field':name as never,'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#fff4db','text-halo-color':'#243e35','text-halo-width':1.5}},
      {id:'tour-route-shadow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffb541','line-width':6,'line-blur':4,'line-opacity':.65}},
      {id:'tour-route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffe2a0','line-width':2,'line-dasharray':[1,2.5],'line-opacity':.85}},
      {id:'venue-points',type:'circle',source:'venues',minzoom:8,maxzoom:16,paint:{'circle-color':'#fff7dc','circle-radius':6,'circle-stroke-width':4,'circle-stroke-color':'#e9aa56'}},
      {id:'venue-names',type:'symbol',source:'venues',minzoom:8,maxzoom:16,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':13,'text-offset':[0,1.5],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#fff5dc','text-halo-color':'#243e35','text-halo-width':2}},
    ],
  };
}
