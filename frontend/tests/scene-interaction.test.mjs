import {test} from 'node:test';
import assert from 'node:assert/strict';

test('dragging a venue never counts as entering it; camera movement stays inside the image',async()=>{
  const {isSceneTap,clampSceneView}=await import('../src/sceneInteraction.ts');
  assert.equal(isSceneTap([100,300],[103,304]),true);
  assert.equal(isSceneTap([100,300],[140,310]),false);
  // Once a drag crosses the threshold, returning to the start is still a drag.
  assert.equal(isSceneTap([100,300],[103,304],true),false);
  assert.deepEqual(clampSceneView({x:99,y:-99,zoom:8}),{x:.08,y:-.06,zoom:1.16});
  assert.deepEqual(clampSceneView({x:0,y:0,zoom:.4}),{x:0,y:0,zoom:1});
});
