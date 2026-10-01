import {test} from 'node:test';
import assert from 'node:assert/strict';
import {venuePhotograph,photoSourceInfo} from '../src/photoSources.ts';
import {venueScene} from '../src/venueScenes.ts';

test('recent Shenzhen stadium photography never substitutes for another venue or artist',()=>{
  const photo=venuePhotograph('深圳大运中心体育场','gem');
  assert.equal(photo?.captured,'2026.09.26');
  assert.equal(photo?.kind,'concert');
  assert.equal(venuePhotograph('深圳大运中心体育馆','gem'),undefined);
  assert.equal(venuePhotograph('深圳大运中心体育场','liu-yuxin'),undefined);
  assert.equal(venuePhotograph('深圳湾体育中心','gem'),undefined);
  assert.equal(venuePhotograph('宝能广州国际体育演艺中心','liu-yuxin'),undefined);
  const liu=photoSourceInfo('/photos/liu-yuxin-2026-lightstick.webp');
  assert.equal(liu?.captured,undefined,'tour-year evidence cannot invent an exact concert date');
});

test('night scene changes with artist even at the same stadium, while the exterior is retained',()=>{
  const gem=venueScene({venue:'深圳大运中心体育场',artist_id:'gem'});
  const other=venueScene({venue:'深圳大运中心体育场',artist_id:'liu-yuxin'});
  assert.equal(gem.interior,'/photos/gem-shenzhen-20260926-bowl.webp');
  assert.equal(gem.interiorPhoto?.captured,'2026.09.26');
  assert.equal(gem.exterior,other.exterior);
  assert.notEqual(gem.id,other.id,'the texture cache must reload on artist changes');
  assert.notEqual(gem.interior,other.interior);
});
