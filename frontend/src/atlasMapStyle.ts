import type {StyleSpecification} from 'maplibre-gl';
import provinces from './china-provinces.json';

// Natural aerial overview transitions to crisp vector streets before city zoom.
// Raster photography is never stretched over neighbourhoods or the venue approach.
const countryHoles=provinces.features.flatMap(feature=>{
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  return (polygons as number[][][][]).map(p=>{const ring=p[0];const area=ring.reduce((sum,point,i)=>{const next=ring[(i+1)%ring.length];return sum+point[0]*next[1]-next[0]*point[1];},0);return area>0?[...ring].reverse():ring;});
});
export function atlasMapStyle():StyleSpecification{
  const name=['coalesce',['get','name:zh'],['get','name'],['get','name:en']];
  return {
    version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    transition:{duration:350,delay:0},
    light:{anchor:'viewport',color:'#ffe6bd',intensity:.48,position:[1.4,210,45]},
    sky:{'sky-color':'#a8cadb','horizon-color':'#f8e0bd','fog-color':'#bccfca','sky-horizon-blend':.8,'horizon-fog-blend':.6,'fog-ground-blend':.12,'atmosphere-blend':0},
    sources:{
      satellite:{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:8,attribution:'Esri, Vantor, Earthstar Geographics, GIS User Community'},
      shade:{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json',attribution:'<a href="https://mapterhorn.com/" target="_blank">Mapterhorn</a>'},
      openmaptiles:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>'},
      china:{type:'geojson',data:provinces as never},
      surroundings:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]],...countryHoles]}}},
      route:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[]}}},
      venues:{type:'geojson',data:{type:'FeatureCollection',features:[]}},
    },
    layers:[
      {id:'land',type:'background',paint:{'background-color':'#cde3e3'}},
      {id:'china-fill',type:'fill',source:'china',maxzoom:8,paint:{'fill-color':'#f7f2e8','fill-opacity':1}},
      {id:'aerial-overview',type:'raster',source:'satellite',maxzoom:7.5,paint:{'raster-opacity':0,'raster-saturation':-.18,'raster-contrast':-.05,'raster-brightness-min':.08,'raster-brightness-max':.98,'raster-fade-duration':180}},
      {id:'terrain-light',type:'hillshade',source:'shade',maxzoom:7.5,paint:{'hillshade-exaggeration':0,'hillshade-illumination-direction':315,'hillshade-shadow-color':'#46655b','hillshade-highlight-color':'#f9f8ee','hillshade-accent-color':'#b3b5a0'}},
      {id:'urban-surfaces',type:'fill',source:'openmaptiles','source-layer':'landuse',minzoom:7,filter:['in',['get','class'],['literal',['residential','commercial','industrial']]],paint:{'fill-color':'#ddccb0','fill-opacity':['interpolate',['linear'],['zoom'],7,0,9,.65]}},
      {id:'wood',type:'fill',source:'openmaptiles','source-layer':'landcover',minzoom:6,filter:['in',['get','class'],['literal',['wood','grass']]],paint:{'fill-color':'#a5b89c','fill-opacity':['interpolate',['linear'],['zoom'],6,0,8,.9]}},
      {id:'parks',type:'fill',source:'openmaptiles','source-layer':'park',minzoom:7,paint:{'fill-color':'#94b199','fill-opacity':['interpolate',['linear'],['zoom'],7,0,9,.9]}},
      {id:'water',type:'fill',source:'openmaptiles','source-layer':'water',paint:{'fill-color':['interpolate',['linear'],['zoom'],5,'#376b7f',8,'#84abb4'],'fill-opacity':['interpolate',['linear'],['zoom'],5,.13,7.5,1]}},
      {id:'waterways',type:'line',source:'openmaptiles','source-layer':'waterway',minzoom:9,paint:{'line-color':'#a6cdd5','line-width':['interpolate',['linear'],['zoom'],9,.7,16,4]}},
      {id:'surrounding-tone',type:'fill',source:'surroundings',maxzoom:7,paint:{'fill-color':'#edf2e5','fill-opacity':.09}},
      {id:'china-border-glow',type:'line',source:'china',maxzoom:9,paint:{'line-color':'#d6bc6c','line-opacity':0,'line-width':3,'line-blur':2}},
      {id:'china-border',type:'line',source:'china',maxzoom:10,paint:{'line-color':'#a78670','line-opacity':.88,'line-width':['interpolate',['linear'],['zoom'],2,.9,6,1.5],'line-dasharray':[2,2]}},
      {id:'street-casing',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:9,filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#d7cec0','line-opacity':.8,'line-width':['interpolate',['exponential',1.35],['zoom'],9,1,14,4,18,15]}},
      {id:'local-streets',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:12,filter:['in',['get','class'],['literal',['minor','service']]],paint:{'line-color':'#faf8f2','line-width':['interpolate',['exponential',1.35],['zoom'],12,.8,16,4,19,12]}},
      {id:'streets',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:9,filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','class'],['motorway','trunk'],'#ead8ac','#fffdf5'],'line-width':['interpolate',['exponential',1.35],['zoom'],9,.6,14,2.8,18,12]}},
      {id:'buildings',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:14,paint:{'fill-extrusion-color':['interpolate',['linear'],['zoom'],14,'#cbb899',18,'#e0c5a1'],'fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.93,'fill-extrusion-vertical-gradient':true}},
      {id:'districts',type:'symbol',source:'openmaptiles','source-layer':'place',minzoom:8,maxzoom:15,filter:['in',['get','class'],['literal',['suburb','town','neighbourhood']]],layout:{'text-field':name as never,'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],8,11,13,14]},paint:{'text-color':'#637066','text-halo-color':'#f6f5eb','text-halo-width':1.8}},
      {id:'road-names',type:'symbol',source:'openmaptiles','source-layer':'transportation_name',minzoom:14,layout:{'symbol-placement':'line','text-field':name as never,'text-font':['Noto Sans Regular'],'text-size':10,'text-max-angle':30,'symbol-spacing':420},paint:{'text-color':'#776752','text-opacity':['interpolate',['linear'],['zoom'],14,.2,18,.6],'text-halo-color':'#fffdf5','text-halo-width':1.3}},
      {id:'tour-route-shadow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffebc4','line-width':4,'line-blur':2,'line-opacity':.5}},
      {id:'tour-route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['interpolate',['linear'],['zoom'],5,'#ffe2a0',8,'#ba8153'],'line-width':1.5,'line-dasharray':[1,2.5],'line-opacity':.85}},
      {id:'venue-points',type:'circle',source:'venues',minzoom:8,maxzoom:16,paint:{'circle-color':'#fff7dc','circle-radius':6,'circle-stroke-width':4,'circle-stroke-color':'#e9aa56'}},
    ],
  };
}
