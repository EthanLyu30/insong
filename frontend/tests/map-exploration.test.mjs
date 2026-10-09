import assert from 'node:assert/strict';
import {test} from 'node:test';

test('nearby exploration uses the clicked visible region and prefers real venue coordinates',async()=>{
  const module=await import('../src/mapExploration.ts').catch(()=>({}));
  assert.equal(typeof module.eventsInExploration,'function');
  const cities=[{id:'sz',name:'深圳',lng:114.06,lat:22.54},{id:'gz',name:'广州',lng:113.26,lat:23.13}];
  const area={center:[114,22.6],bounds:[[113,22],[115,24]],zoom:6};
  const rows=[{id:'near',city:'深圳',venue_lng:114.2,venue_lat:22.7},
    {id:'city-only',city:'广州'},{id:'actual-far',city:'深圳',venue_lng:120,venue_lat:30},{id:'unknown',city:'未收录'}];
  assert.deepEqual(module.eventsInExploration(rows,cities,area).map(event=>event.id),['near','city-only']);
  assert.deepEqual(module.eventsInExploration(rows,cities,{...area,bounds:[[114.1,22.6],[114.3,22.8]],zoom:10}).map(event=>event.id),['near']);
  assert.deepEqual(module.eventsInExploration(rows,cities,{...area,bounds:[[80,20],[81,21]]}),[]);
});
test('area query survives navigation and rejects malformed coordinates rather than inventing nearby data',async()=>{
  const module=await import('../src/mapExploration.ts').catch(()=>({}));
  assert.equal(typeof module.explorationFromParam,'function');
  assert.deepEqual(module.explorationFromParam('114,22.6,6,113,22,115,24'),{center:[114,22.6],zoom:6,bounds:[[113,22],[115,24]]});
  for(const invalid of ['',null,'114,22,6','NaN,22,6,113,21,115,23','114,22,6,115,21,113,23','181,22,6,113,21,185,23'])assert.equal(module.explorationFromParam(invalid),null);
});
test('rotated map corners produce an ordered geographic region instead of silently rejecting a click',async()=>{
  const module=await import('../src/mapExploration.ts');assert.equal(typeof module.explorationAtPoint,'function');
  const map={project(){return{x:0,y:0};},unproject([x,y]){return{lng:114+(y-x)/1000,lat:22+(x+y)/1000};},getZoom(){return 8;}};
  assert.deepEqual(module.explorationAtPoint(map,[114,22],200,100),{center:[114,22],zoom:8,bounds:[[113.85,21.85],[114.15,22.15]]});
});
