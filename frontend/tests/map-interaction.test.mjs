import {test} from 'node:test';
import assert from 'node:assert/strict';

test('manual wheel and camera keyboard gestures protect the viewport, but programmatic moves do not',async()=>{
  const {observeMapInteraction}=await import('../src/mapInteraction.ts').catch(()=>({}));
  assert.equal(typeof observeMapInteraction,'function');
  const target=new EventTarget();let interactions=0;
  const release=observeMapInteraction(target,()=>interactions++);
  target.dispatchEvent(new Event('pointerdown'));
  target.dispatchEvent(new Event('wheel'));
  const arrow=new Event('keydown');Object.defineProperty(arrow,'key',{value:'ArrowLeft'});target.dispatchEvent(arrow);
  assert.equal(interactions,3,'keyboard and trackpad/wheel are genuine map interactions too');
  const other=new Event('keydown');Object.defineProperty(other,'key',{value:'Tab'});target.dispatchEvent(other);
  target.dispatchEvent(new Event('move'));
  assert.equal(interactions,3,'a programmatic fit or focus-only key must not count as a gesture');
  release();target.dispatchEvent(new Event('wheel'));
  assert.equal(interactions,3,'unmounted maps cannot receive further gestures');
});
