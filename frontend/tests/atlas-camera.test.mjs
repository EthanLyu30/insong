import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraTarget} from '../src/atlasCamera.ts';

test('camera resolves actual venue coordinates and does not claim precision for an unknown venue',()=>{
  const city={lng:114.06,lat:22.54},event={venue_lng:114.2123,venue_lat:22.6970};
  const venue=cameraTarget('venue',city,event,false);
  assert.deepEqual(venue.center,[114.2123,22.6970]);assert.ok(venue.pitch>=50);assert.ok(venue.duration>=2000);
  assert.ok(cameraTarget('venue',city,{},false).zoom<=12);
  assert.deepEqual(cameraTarget('venue',city,{},false).center,[114.06,22.54]);
});

test('entering a concert moves closer in the same coordinate system and reduced motion skips the flight',()=>{
  const city={lng:114.06,lat:22.54},event={venue_lng:114.2123,venue_lat:22.6970};
  const exterior=cameraTarget('venue',city,event),interior=cameraTarget('sky',city,event);
  assert.deepEqual(interior.center,exterior.center);assert.ok(interior.zoom>exterior.zoom);assert.ok(interior.pitch>exterior.pitch);
  for(const scene of ['map','venue','sky'])assert.equal(cameraTarget(scene,city,event,true).duration,0);
  assert.equal(cameraTarget('map',null,null).pitch,0);assert.ok(cameraTarget('map',city,null).zoom>=10);
});
