import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {venueScene} from '../src/venueScenes.ts';

test('indoor venues retain a roof and never borrow an outdoor stadium scene',()=>{
  const indoor=venueScene({venue:'宝能广州国际体育演艺中心'});
  const outdoor=venueScene({venue:'深圳大运中心体育场'});
  assert.equal(indoor.covered,true);assert.equal(outdoor.covered,false);
  assert.notEqual(indoor.exterior,outdoor.exterior);assert.notEqual(indoor.interior,outdoor.interior);
  assert.equal(venueScene({venue:'尚未制作的场馆'}),undefined);
  assert.equal(venueScene({venue:'江西省奥林匹克体育中心'}),undefined,'do not mix up two different Nanchang venues');
});

test('every catalog venue has its own decodable WebP pair rather than a substituted background',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../../backend/app/footprint_catalog.json',import.meta.url),'utf8'));
  const profiles=new Set(),venues=[...new Set(catalog.events.map(event=>event.venue))];
  for(const venue of venues){
    const profile=venueScene({venue});assert.ok(profile,venue);assert.ok(!profiles.has(profile.id),'shared profile: '+venue);profiles.add(profile.id);
    for(const url of [profile.exterior,profile.interior]){
      const data=await readFile(new URL('../public'+url,import.meta.url));
      assert.equal(data.subarray(0,4).toString(),'RIFF',url);
      assert.equal(data.subarray(8,12).toString(),'WEBP',url);
      assert.ok(data.length>50000,url);
    }
  }
});
