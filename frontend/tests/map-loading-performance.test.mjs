import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import * as personalMap from '../src/personalMap.ts';

const cities=[{id:'sz',name:'深圳',lng:114.06,lat:22.54},{id:'gz',name:'广州',lng:113.26,lat:23.13},{id:'unused',name:'未有演出的城市',lng:110,lat:30}];
const artists=[{id:'gem',name:'邓紫棋',aliases:[]},{id:'liu-yuxin',name:'刘雨昕',aliases:[]}];
const events=[
  {id:'sz-one',city:'深圳',artist_id:'gem',date:'2026-10-01',songs:[]},
  {id:'sz-two',city:'深圳',artist_id:'gem',date:'2026-10-02',songs:[]},
  {id:'gz-one',city:'广州',artist_id:'liu-yuxin',date:'2026-10-03',songs:[]},
  {id:'cancelled',city:'深圳',artist_id:'liu-yuxin',date:'2026-10-04',event_status:'cancelled',songs:[]},
  {id:'unknown-city',city:'不在目录的城市',artist_id:'gem',date:'2026-10-05',songs:[]},
];

test('map markers contain only distinct valid concert groups and follow the current scope',()=>{
  assert.equal(typeof personalMap.mapPhotoMarkers,'function','the map must select current concert groups instead of creating all city/artist combinations');
  const markers=personalMap.mapPhotoMarkers(cities,events,artists,[]);
  assert.deepEqual(markers.map(marker=>marker.key),['sz:gem','gz:liu-yuxin']);
  assert.equal(markers[0].identity.eventCount,2);
  assert.equal(markers[0].identity.eventId,'sz-two');
  assert.deepEqual(personalMap.mapPhotoMarkers(cities,[events[2]],artists,[]).map(marker=>marker.key),['gz:liu-yuxin']);
  assert.deepEqual(personalMap.mapPhotoMarkers(cities,[],artists,[]),[]);
});

test('same-photo marker updates reuse pixels while changed sources clear the previous image',async()=>{
  const module=await import('../src/mapPhotoElement.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
  assert.equal(typeof module.updateMapPhotoElement,'function','unchanged marker images must be reused');
  const dom=new JSDOM('<button></button>');
  try{
    const button=dom.window.document.querySelector('button');
    const identity={photo:{url:'/api/photos/public-one',context:'听友公开照片',contain:false,bakedAvatar:false},name:'邓紫棋',source:'public',eventId:'sz-one'};
    module.updateMapPhotoElement(button,identity,identity.photo.url);
    const image=button.firstElementChild;
    module.updateMapPhotoElement(button,{...identity,photo:{...identity.photo,context:'更新后的公开信息'}},identity.photo.url);
    assert.equal(button.firstElementChild,image,'a stable photo must retain the image node and its decoded pixels');
    assert.equal(button.title,'更新后的公开信息');
    module.updateMapPhotoElement(button,{...identity,source:'mine',photo:{...identity.photo,url:'/api/photos/mine-two',context:'我的照片'}},'/api/photos/mine-two');
    assert.notEqual(button.firstElementChild,image,'a changed photo must not retain the prior decoded pixels while its replacement loads');
    assert.equal(image.isConnected,false);
    assert.equal(button.firstElementChild.getAttribute('src'),'/api/photos/mine-two');
    assert.equal(button.dataset.photoSource,'mine');
    module.updateMapPhotoElement(button,{...identity,photo:undefined,source:'none'},'');
    assert.equal(button.children.length,0,'an unavailable identity cannot retain another account’s photograph');
    assert.equal(button.style.display,'none');
  }finally{dom.window.close();}
});

test('the flat map has no invisible raster or terrain dependencies and retains real geographic labels',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try{
    const {atlasMapStyle}=await server.ssrLoadModule('/src/atlasMapStyle.ts');
    const style=atlasMapStyle(true);
    assert.ok(!style.sources.satellite,'an invisible satellite layer must not schedule tile requests');
    assert.ok(!style.sources.shade,'unused terrain must not fetch metadata or DEM tiles');
    for(const layer of style.layers)if(layer.source)assert.ok(style.sources[layer.source],`${layer.id} must have its actual data source`);
    assert.ok(style.layers.some(layer=>layer.id==='province-names'));
    assert.ok(style.layers.some(layer=>layer.id==='city-names'));
    assert.ok(style.layers.some(layer=>layer.id==='streets'),'manual city zoom retains street detail');
  }finally{await server.close();}
});
