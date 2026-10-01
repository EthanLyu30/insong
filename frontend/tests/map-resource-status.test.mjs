import {test} from 'node:test';
import assert from 'node:assert/strict';

test('satellite success never clears a vector failure and tile recovery is specific',async()=>{
  const {MapResourceStatus}=await import('../src/mapResourceStatus.ts');const status=new MapResourceStatus();
  status.failed('openmaptiles','tile-a');status.loaded('satellite','tile-a');
  assert.equal(status.unavailable(10),true);assert.equal(status.unavailable(4),false);
  status.loaded('openmaptiles','tile-b');assert.equal(status.unavailable(10),true);
  status.loaded('openmaptiles','tile-a');assert.equal(status.unavailable(10),false);
  status.failed('satellite','source');assert.equal(status.unavailable(4),true);assert.equal(status.unavailable(10),false);
});
