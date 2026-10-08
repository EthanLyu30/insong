import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {createServer} from 'vite';

const provinces=JSON.parse(await readFile(new URL('../src/china-provinces.json',import.meta.url),'utf8'));

function insideRing([x,y],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

async function withStyle(check){
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try{
    const {atlasMapStyle}=await server.ssrLoadModule('/src/atlasMapStyle.ts');
    await check(atlasMapStyle(true));
  }finally{await server.close();}
}

test('province labels have one real named point per administrative feature',async()=>{
  await withStyle(style=>{
    const source=style.sources['province-labels'];
    assert.equal(source.type,'geojson');
    assert.equal(source.data.type,'FeatureCollection');
    const labels=source.data.features;
    const named=provinces.features.filter(feature=>feature.properties.name);
    assert.equal(labels.length,named.length);
    assert.equal(new Set(labels.map(feature=>feature.properties.adcode)).size,named.length);
    for(const original of named){
      const matching=labels.filter(label=>label.properties.adcode===original.properties.adcode);
      assert.equal(matching.length,1,`${original.properties.name} should get one label`);
      assert.equal(matching[0].properties.name,original.properties.name);
      assert.deepEqual(matching[0].geometry.type,'Point');
      const [lng,lat]=matching[0].geometry.coordinates;
      assert.ok(Number.isFinite(lng)&&Number.isFinite(lat));
      assert.ok(lng>=73&&lng<=135&&lat>=17&&lat<=54,`${original.properties.name} has a plausible China location`);
      const polygons=original.geometry.type==='Polygon'?[original.geometry.coordinates]:original.geometry.coordinates;
      assert.ok(polygons.some(rings=>insideRing([lng,lat],rings[0])&&!rings.slice(1).some(hole=>insideRing([lng,lat],hole))),`${original.properties.name} label lies within its province`);
    }
    const guangdong=labels.find(feature=>feature.properties.name==='广东省');
    const [lng,lat]=guangdong.geometry.coordinates;
    assert.ok(lng>=109.65&&lng<=117.2&&lat>=20.2&&lat<=25.52,'Guangdong label stays on its main land polygon');
    const mainland=provinces.features.find(feature=>feature.properties.name==='广东省').geometry.coordinates[0];
    assert.ok(insideRing([lng,lat],mainland[0])&&!mainland.slice(1).some(hole=>insideRing([lng,lat],hole)),'Guangdong label lies on the main land polygon');
  });
});

test('the renderer labels points while province fill and borders retain polygon geometry',async()=>{
  await withStyle(style=>{
    const labelLayer=style.layers.find(layer=>layer.id==='province-names');
    assert.equal(labelLayer.type,'symbol');
    assert.equal(labelLayer.source,'province-labels');
    assert.deepEqual(labelLayer.layout['text-field'],['get','name']);
    assert.deepEqual(style.sources.china.data,provinces);
    assert.equal(style.layers.find(layer=>layer.id==='china-fill').source,'china');
    assert.equal(style.layers.find(layer=>layer.id==='china-border').source,'china');
  });
});
