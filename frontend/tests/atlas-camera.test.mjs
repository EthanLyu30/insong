import {test} from 'node:test';
import assert from 'node:assert/strict';

test('cinematic camera uses venue coordinates, avoids fake precise city zoom, and respects reduced motion', async()=>{
  const camera=await import('../src/atlasCamera.ts').catch(()=>null);
  assert.equal(typeof camera?.cameraTarget,'function','camera planner is missing');
  const city={lng:114.06,lat:22.54};
  const event={venue_lng:114.2123,venue_lat:22.6970};
  const venue=camera.cameraTarget('venue',city,event,false);
  assert.deepEqual(venue.center,[114.2123,22.6970]);assert.ok(venue.pitch>=50);assert.ok(venue.duration>=1500);
  assert.ok(camera.cameraTarget('venue',city,{},false).zoom<=12);
  assert.equal(camera.cameraTarget('venue',city,event,true).duration,0);
  assert.equal(camera.cameraTarget('map',city,null,false).pitch,0);
});

test('stage arrival begins on visibility, replays after map return and snaps reduced-motion endpoints',async()=>{
  const camera=await import('../src/atlasCamera.ts');assert.equal(typeof camera.SceneFlight,'function','stage lifecycle planner is missing');
  const flight=new camera.SceneFlight();
  assert.deepEqual(flight.sample('venue',0,[700,800,1100],false).position,[700,800,1100]);
  assert.deepEqual(flight.sample('venue',2500,[500,400,700],false).position,[420,320,530]);
  flight.deactivate();
  assert.deepEqual(flight.sample('venue',4000,[700,800,1100],false).position,[700,800,1100]);
  assert.deepEqual(flight.sample('venue',4001,[700,800,1100],true).position,[420,320,530]);
  const reduced=flight.sample('sky',5000,[420,320,530],true);assert.ok(reduced.started);assert.deepEqual(reduced.position,[380,240,550]);
  flight.replay();assert.deepEqual(flight.sample('sky',6000,[800,500,1100],true).position,[380,240,550]);
});
