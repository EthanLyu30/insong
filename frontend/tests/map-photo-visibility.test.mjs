import assert from 'node:assert/strict';
import {test} from 'node:test';

async function visibility(){return import('../src/mapPhotoVisibility.ts').catch(()=>({}));}

test('neighbor-city photos with partial overlap remain separately readable',async()=>{
  const {visibleMapPhotoKeys}=await visibility();assert.equal(typeof visibleMapPhotoKeys,'function');
  const points=[{key:'sz',x:205,y:340,diameter:58,priority:5,date:'2026-10-05'},{key:'gz',x:174,y:302,diameter:58,priority:5,date:'2025-10-18'}];
  assert.deepEqual(visibleMapPhotoKeys(points,{left:12,top:197,right:378,bottom:468}),['sz','gz']);
  assert.deepEqual(visibleMapPhotoKeys([...points].reverse(),{left:12,top:197,right:378,bottom:468}),['sz','gz'],'source row order must not decide photo priority');
});

test('nonoverlapping varied city circles remain visible with the renderer clearance',async()=>{
  const {visibleMapPhotoKeys}=await visibility();assert.equal(typeof visibleMapPhotoKeys,'function');
  const points=[{key:'a',x:80,y:80,diameter:58,priority:5,date:'2026-10-05'},{key:'b',x:140,y:80,diameter:50,priority:4,date:'2026-10-06'},{key:'c',x:110,y:145,diameter:40,priority:3,date:'2026-10-01'}];
  assert.deepEqual(visibleMapPhotoKeys(points,{left:0,top:0,right:220,bottom:220}),['a','b','c']);
});

test('priority and bounds suppress occluded or invalid photos without moving geographic anchors',async()=>{
  const {visibleMapPhotoKeys}=await visibility();assert.equal(typeof visibleMapPhotoKeys,'function');
  const points=Object.freeze([
    Object.freeze({key:'mine',x:80,y:80,diameter:40,priority:5,date:'2024-01-01'}),
    Object.freeze({key:'public',x:80,y:80,diameter:40,priority:4,date:'2026-10-01'}),
    Object.freeze({key:'edge',x:5,y:80,diameter:40,priority:5,date:'2026-10-07'}),
    Object.freeze({key:'invalid',x:NaN,y:80,diameter:40,priority:5,date:'2026-10-07'}),
  ]);
  assert.deepEqual(visibleMapPhotoKeys(points,{left:0,top:0,right:200,bottom:200}),['mine']);
  assert.equal(points[1].x,80);assert.equal(points[1].y,80);
});
