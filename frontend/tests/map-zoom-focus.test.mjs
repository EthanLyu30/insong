import assert from 'node:assert/strict';
import {test} from 'node:test';

test('zoom controls anchor to the uncovered map area rather than its hidden center',async()=>{
  const {mapZoomFocus}=await import('../src/mapZoomFocus.ts').catch(()=>({}));
  assert.equal(typeof mapZoomFocus,'function');
  assert.deepEqual(mapZoomFocus({width:393,height:720,header:159,sheet:238,nav:70}),[196.5,285.5]);
});
