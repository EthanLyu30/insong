import type {StyleSpecification} from 'maplibre-gl';
import provinces from './china-provinces.json';

// Native vector tiles from OpenFreeMap / OpenStreetMap, with Natural Earth relief.
// Local province boundaries remain authoritative for the China overview.
export function atlasMapStyle():StyleSpecification{
  const name=['coalesce',['get','name:zh'],['get','name'],['get','name:en']];
  return {
    version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    transition:{duration:2200,delay:0},
    light:{anchor:'viewport',color:'#ffe8c8',intensity:.35,position:[1.4,210,45]},
    sky:{'sky-color':'#bed1d8','horizon-color':'#f6dfc4','fog-color':'#e6ded0','sky-horizon-blend':.8,'horizon-fog-blend':.6,'fog-ground-blend':.2,'atmosphere-blend':0},
    sources:{
      earth:{type:'raster',tiles:['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],tileSize:256,maxzoom:6,attribution:'Natural Earth'},
      satellite:{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri, Vantor, Earthstar Geographics, GIS User Community'},
      openmaptiles:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>'},
      china:{type:'geojson',data:provinces as never},
      route:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[]}}},
      venues:{type:'geojson',data:{type:'FeatureCollection',features:[]}},
    },
    layers:[
      {id:'land',type:'background',paint:{'background-color':'#f2eee4'}},
      {id:'relief',type:'raster',source:'earth',maxzoom:7,paint:{'raster-opacity':['interpolate',['linear'],['zoom'],5,1,7,0],'raster-saturation':-.35,'raster-contrast':-.1,'raster-brightness-min':.08,'raster-brightness-max':1,'raster-fade-duration':160}},
      {id:'parks',type:'fill',source:'openmaptiles','source-layer':'park',minzoom:7,paint:{'fill-color':'#d3ddc5','fill-opacity':.7}},
      {id:'wood',type:'fill',source:'openmaptiles','source-layer':'landcover',minzoom:7,filter:['==',['get','class'],'wood'],paint:{'fill-color':'#d9dfcb','fill-opacity':.75}},
      {id:'water',type:'fill',source:'openmaptiles','source-layer':'water',minzoom:5,paint:{'fill-color':'#b9d1d5','fill-opacity':['interpolate',['linear'],['zoom'],5,0,7,1]}},
      {id:'river',type:'line',source:'openmaptiles','source-layer':'waterway',minzoom:8,paint:{'line-color':'#b9d1d5','line-width':['interpolate',['linear'],['zoom'],8,.5,14,2]}},
      {id:'china-border',type:'line',source:'china',maxzoom:9,paint:{'line-color':'#a99578','line-opacity':.38,'line-width':.7}},
      {id:'satellite-detail',type:'raster',source:'satellite',minzoom:13,paint:{'raster-opacity':['interpolate',['linear'],['zoom'],13,0,15,1],'raster-saturation':-.28,'raster-contrast':-.12,'raster-brightness-min':.12,'raster-brightness-max':.92,'raster-fade-duration':160}},
      {id:'streets-casing',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:8,filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary','minor','service']]],paint:{'line-color':'#ddd4c6','line-opacity':['interpolate',['linear'],['zoom'],12,1,16,.12],'line-width':['interpolate',['exponential',1.4],['zoom'],8,.4,12,2,18,12]}},
      {id:'streets',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:8,filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary','minor','service']]],paint:{'line-color':'#fffdf7','line-opacity':['interpolate',['linear'],['zoom'],12,1,16,.15],'line-width':['interpolate',['exponential',1.4],['zoom'],8,.3,12,1.3,18,9]}},
      {id:'highways',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:7,filter:['in',['get','class'],['literal',['motorway','trunk']]],paint:{'line-color':'#d9bc8c','line-width':['interpolate',['exponential',1.3],['zoom'],7,.4,12,1.8,18,7]}},
      {id:'buildings',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:14.5,paint:{'fill-extrusion-color':'#e5dece','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.72}},
      {id:'districts',type:'symbol',source:'openmaptiles','source-layer':'place',minzoom:8,maxzoom:15,filter:['in',['get','class'],['literal',['suburb','town','neighbourhood']]],layout:{'text-field':name as never,'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#797d73','text-halo-color':'#f8f3e8','text-halo-width':1.5}},
      {id:'road-names',type:'symbol',source:'openmaptiles','source-layer':'transportation_name',minzoom:12,layout:{'symbol-placement':'line','text-field':name as never,'text-font':['Noto Sans Regular'],'text-size':11},paint:{'text-color':'#8a8274','text-halo-color':'#fffdf6','text-halo-width':1.5}},
      {id:'tour-route-shadow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff4dd','line-width':5,'line-opacity':.65}},
      {id:'tour-route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#af764c','line-width':1.5,'line-opacity':.65}},
      {id:'venue-points',type:'circle',source:'venues',minzoom:8,maxzoom:16,paint:{'circle-color':'#aa6a43','circle-radius':6,'circle-stroke-width':4,'circle-stroke-color':'#fff7e8'}},
      {id:'venue-names',type:'symbol',source:'venues',minzoom:8,maxzoom:16,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.5],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#765333','text-halo-color':'#fffaf1','text-halo-width':2}},
    ],
  };
}
