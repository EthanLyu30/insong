import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import * as framing from '../src/sceneFraming.ts';
import * as surface from '../src/sceneDepthSurface.ts';
import * as profiles from '../src/venueScenes.ts';

// Exercise the real layer's scene transition, with a deterministic clock and
// renderer boundary. No WebGL context or network is needed for opacity state.
test('returning to a close venue map fully removes the scene instead of leaving a transparent photograph',async()=>{
  const source=await readFile(new URL('../src/venueMapLayer.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let now=1000,zoom=19.7;
  const canvas={width:390,height:844,dataset:{}},module={exports:{}};
  const container={clientWidth:390,clientHeight:844,parentElement:{style:{setProperty(){}}},classList:{toggle(){}}};
  const map={getCanvas:()=>canvas,getContainer:()=>container,getZoom:()=>zoom,on(){},off(){},triggerRepaint(){},addLayer(layer){this.layer=layer;layer.onAdd(this,{});}};
  const renderCommands=[],renderSizes=[],textureRequests=[];
  const mockedThree={...THREE,TextureLoader:class{load(url,success){textureRequests.push(url);success(new THREE.Texture({width:941,height:1672}));}},WebGLRenderer:class{capabilities={getMaxAnisotropy:()=>1};shadowMap={};setSize(w,h,style){renderSizes.push([w,h,style]);}resetState(){renderCommands.push('reset');}clearDepth(){renderCommands.push('clear-depth');}render(scene){renderCommands.push(scene.children[0]?.isGroup?'drone':'portrait');}dispose(){}}};
  const dependencies={'three':mockedThree,'./sceneFraming':framing,'./sceneDepthSurface':surface,'./venueScenes':profiles};
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
  new Function('require','module','exports','window','document','performance',compiled)(name=>{assert.ok(name in dependencies,name);return dependencies[name];},module,module.exports,{matchMedia:()=>({matches:false})},{hidden:false,addEventListener(){},removeEventListener(){}},{now:()=>now});
  const layer=module.exports.createVenueLayer(map);
  layer.location({venue:'宝能广州国际体育演艺中心',venue_lng:113.47819539,venue_lat:23.17953048});
  layer.scene('sky');map.layer.render();assert.equal(Number(canvas.dataset.night),1,'direct entry never displays an exterior sunset frame');
  now=4000;map.layer.render();assert.equal(Number(canvas.dataset.sceneArrival),1);
  layer.orbit(1800,0);
  for(let i=0;i<30;i++){now+=100;map.layer.render();}
  assert.equal(canvas.dataset.model,'portrait-depth','dragging retains the detailed concert scene');
  assert.equal(canvas.dataset.droneView,undefined);
  assert.ok(!renderCommands.includes('drone'));
  assert.deepEqual(textureRequests,['/scenes/venues/guangzhou-arena-interior.webp'],'direct night entry downloads only the concert interior');
  assert.ok(Math.abs(JSON.parse(canvas.dataset.photoView).yaw)<=12,'dragging cannot rotate past the image or overturn the horizon');
  assert.deepEqual(renderSizes.at(-1),[390,844,false],'Three must use the map drawing buffer, without changing its CSS size');
  container.clientWidth=430;container.clientHeight=932;canvas.width=645;canvas.height=1398;now+=100;map.layer.render();
  assert.deepEqual(renderSizes.at(-1),[645,1398,false],'mobile resize and DPR changes must update the separate renderer viewport');
  const departingAt=now;
  layer.scene('map');zoom=14.3;now=departingAt+300;map.layer.render();
  assert.ok(Number(canvas.dataset.sceneArrival)>0&&Number(canvas.dataset.sceneArrival)<1,'return has a fade rather than an abrupt jump');
  now=departingAt+1000;map.layer.render();assert.equal(Number(canvas.dataset.sceneArrival),0,'close map cannot retain a ghost of the scene');
  layer.dispose();
  globalThis.document=previousDocument;
});
