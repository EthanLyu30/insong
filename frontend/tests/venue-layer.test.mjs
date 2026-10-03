import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import * as framing from '../src/sceneFraming.ts';
import * as surface from '../src/sceneDepthSurface.ts';
import * as profiles from '../src/venueScenes.ts';
import * as droneOrbit from '../src/droneOrbit.ts';
import * as droneVenue from '../src/droneVenue.ts';

// Exercise the real layer's scene transition, with a deterministic clock and
// renderer boundary. No WebGL context or network is needed for opacity state.
test('returning to a close venue map fully removes the scene instead of leaving a transparent photograph',async()=>{
  const source=await readFile(new URL('../src/venueMapLayer.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let now=1000,zoom=16.1;
  const canvas={width:390,dataset:{}},module={exports:{}};
  const container={clientWidth:390,clientHeight:844,parentElement:{style:{setProperty(){}}},classList:{toggle(){}}};
  const map={getCanvas:()=>canvas,getContainer:()=>container,getZoom:()=>zoom,on(){},off(){},triggerRepaint(){},addLayer(layer){this.layer=layer;layer.onAdd(this,{});}};
  const mockedThree={...THREE,TextureLoader:class{load(_url,success){success(new THREE.Texture({width:941,height:1672}));}},WebGLRenderer:class{capabilities={getMaxAnisotropy:()=>1};shadowMap={};resetState(){}clearDepth(){}render(){}dispose(){}}};
  const dependencies={'three':mockedThree,'./sceneFraming':framing,'./sceneDepthSurface':surface,'./venueScenes':profiles,'./droneOrbit':droneOrbit,'./droneVenue':droneVenue};
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
  new Function('require','module','exports','window','document','performance',compiled)(name=>{assert.ok(name in dependencies,name);return dependencies[name];},module,module.exports,{matchMedia:()=>({matches:false})},{hidden:false,addEventListener(){},removeEventListener(){}},{now:()=>now});
  const layer=module.exports.createVenueLayer(map);
  layer.location({venue:'宝能广州国际体育演艺中心',venue_lng:113.47819539,venue_lat:23.17953048});
  layer.scene('venue');now=4000;map.layer.render();assert.equal(Number(canvas.dataset.sceneArrival),1);
  layer.orbit(1800,0);
  for(let i=0;i<30;i++){now+=100;map.layer.render();}
  assert.equal(canvas.dataset.model,'drone-volume');assert.ok(Math.abs(JSON.parse(canvas.dataset.droneView).azimuth-droneOrbit.HOME_DRONE.azimuth)>360);
  layer.scene('sky');now+=2600;map.layer.render();assert.equal(Number(canvas.dataset.night),1,'the night remains the chosen photographic starfield');
  layer.scene('venue');now+=2600;map.layer.render();
  const departingAt=now;
  layer.scene('map');zoom=14.3;now=departingAt+300;map.layer.render();
  assert.ok(Number(canvas.dataset.sceneArrival)>0&&Number(canvas.dataset.sceneArrival)<1,'return has a fade rather than an abrupt jump');
  now=departingAt+1000;map.layer.render();assert.equal(Number(canvas.dataset.sceneArrival),0,'close map cannot retain a ghost of the scene');
  layer.dispose();
  globalThis.document=previousDocument;
});
