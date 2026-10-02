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

test('full-screen night keeps the detailed virtual scene instead of enlarging a video cover',()=>{
  const gem=venueScene({venue:'深圳大运中心体育场',artist_id:'gem'});
  const other=venueScene({venue:'深圳大运中心体育场',artist_id:'liu-yuxin'});
  assert.equal(gem.interior,'/scenes/stadium-interior-detail.webp');
  assert.equal(gem.interiorPhoto,undefined);
  assert.equal(gem.exterior,other.exterior);
  assert.equal(gem.interior,other.interior);
  assert.equal(venueScene({venue:'宝能广州国际体育演艺中心',artist_id:'liu-yuxin'}).interior,'/scenes/venues/guangzhou-arena-interior.webp');
});
