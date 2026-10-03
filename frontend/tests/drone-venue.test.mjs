import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

test('drone camera travels around the full building, with safe altitude and distance bounds',async()=>{
  const orbit=await import('../src/droneOrbit.ts').catch(()=>({}));
  assert.equal(typeof orbit.dragDrone,'function','a volume orbit controller is missing');
  const home=orbit.HOME_DRONE;
  const focus=orbit.droneFocus(home),oppositeFocus=orbit.droneFocus({...home,azimuth:home.azimuth+180});
  assert.ok(Math.abs(focus[0]+oppositeFocus[0])<.0001&&Math.abs(focus[2]+oppositeFocus[2])<.0001,'the portrait composition follows the camera around the venue');
  const turned=orbit.dragDrone(home,1800,0);
  assert.ok(Math.abs(turned.azimuth-home.azimuth)>=360,'drag must exceed a full revolution');
  const opposite=orbit.dronePosition({...home,azimuth:home.azimuth+180});
  const start=orbit.dronePosition(home);
  assert.ok(Math.abs(start[0]+opposite[0])<.0001 && Math.abs(start[2]+opposite[2])<.0001,'camera must see the back, not yaw a photograph');
  assert.ok(orbit.dragDrone(home,0,10000).elevation>=22,'the drone never drops below a safe viewing angle');
  assert.ok(orbit.dragDrone(home,0,-10000).elevation<=40,'vertical dragging never tips into a top-down or inverted horizon');
  assert.ok(orbit.zoomDrone(home,100000).distance>=220);
  assert.ok(orbit.zoomDrone(home,.00001).distance<=620);
});

test('crystal outline retains pronounced peaks instead of aliasing into a flat ring',async()=>{
  const {createDroneVenue}=await import('../src/droneVenue.ts');
  const venue=createDroneVenue({id:'shenzhen-stadium',covered:false});
  const position=venue.building.getObjectByName('roof-panels').geometry.attributes.position;
  const outer=[];for(let i=0;i<position.count;i++)if(Math.hypot(position.getX(i)/150,position.getZ(i)/116)>.99)outer.push(position.getY(i));
  assert.ok(Math.max(...outer)-Math.min(...outer)>15,'crystal peaks remain visibly dimensional at the chosen angular resolution');
  venue.dispose();
});

test('crystal faces point outward and panorama resources are released when leaving a venue',async()=>{
  const {createDroneVenue}=await import('../src/droneVenue.ts');
  const venue=createDroneVenue({id:'shenzhen-stadium',covered:false});
  const roof=venue.building.getObjectByName('roof-panels').geometry;
  const normals=roof.attributes.normal;
  let upward=0;for(let i=0;i<normals.count;i++)if(normals.getY(i)>0)upward++;
  assert.ok(upward>normals.count*.95,'downward roof normals break sun shading');
  const source=new THREE.Texture();let freed=0;source.addEventListener('dispose',()=>freed++);
  venue.setEnvironment(source);venue.setCamera(new THREE.PerspectiveCamera());venue.setOpacity(.5);
  assert.equal(venue.scene.environment,source);
  venue.dispose();venue.dispose();assert.equal(freed,1,'owned panorama texture is released exactly once');
  const late=new THREE.Texture();let lateFreed=0;late.addEventListener('dispose',()=>lateFreed++);
  venue.setEnvironment(late);assert.equal(lateFreed,1,'late image callbacks cannot leak textures after leaving');
});

test('photographic foliage stays instanced and releases its atlas, including late loads',async()=>{
  const {createDroneVenue}=await import('../src/droneVenue.ts');
  const venue=createDroneVenue({id:'shenzhen-stadium',covered:false}),atlas=new THREE.Texture();let freed=0;
  atlas.addEventListener('dispose',()=>freed++);venue.setFoliage(atlas);
  const plants=venue.root.getObjectByName('photographic-foliage');
  assert.ok(plants.isInstancedMesh);assert.equal(plants.count,1896);
  assert.equal(plants.material.alphaTest,.3,'foliage cutouts write clean depth without transparency sorting');
  assert.equal(plants.geometry.attributes.foliageRegion.count,plants.count);
  let draws=0;venue.root.traverse(node=>{if(node.isMesh&&node.visible)draws++;});assert.ok(draws<70);
  venue.dispose();assert.equal(freed,1);
  const late=new THREE.Texture();let lateFreed=0;late.addEventListener('dispose',()=>lateFreed++);venue.setFoliage(late);assert.equal(lateFreed,1);
});

test('late arrival artwork preserves an already installed panorama and enables the surface finish',async()=>{
  const {createDroneVenue}=await import('../src/droneVenue.ts');
  const venue=createDroneVenue({id:'shenzhen-stadium',covered:false});
  const material=venue.building.getObjectByName('roof-panels').material;
  const before={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  const cacheBefore=material.customProgramCacheKey();material.onBeforeCompile(before,{});
  assert.ok(!before.uniforms.crystalDetail,'loading artwork retains the working physical fallback');
  const panorama=new THREE.Texture();venue.setEnvironment(panorama);
  const previous=globalThis.document;
  try{
    globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
    const artwork=new THREE.Texture({width:853,height:1844});venue.setBackdrop(artwork);
    assert.equal(venue.scene.environment,panorama,'late portrait cannot replace the panoramic environment');
    assert.equal(venue.root.getObjectByName('arrival-horizon').visible,false,'late crop must stay hidden behind the installed panorama');
    assert.notEqual(material.customProgramCacheKey(),cacheBefore,'artwork arrival recompiles the fallback shader');
    const after={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(after,{});
    assert.ok(after.uniforms.crystalDetail.value,'arrival artwork supplies subtle surface grain');
    assert.ok(!after.fragmentShader.includes('arrivalProjection'),'a second building projection cannot double the structural lines');
    venue.dispose();artwork.dispose();
  }finally{globalThis.document=previous;}
});

test('exterior is a disposable volume with an open bowl; indoor and lotus roofs are distinct',async()=>{
  const module=await import('../src/droneVenue.ts').catch(()=>({}));
  assert.equal(typeof module.createDroneVenue,'function','the exterior is still a flat photo');
  const open=module.createDroneVenue({id:'shenzhen-stadium',covered:false});
  const arena=module.createDroneVenue({id:'shenzhen-arena',covered:true});
  const lotus=module.createDroneVenue({id:'hangzhou-lotus',covered:false});
  const box=module.createDroneVenue({id:'beijing-wukesong',covered:true});
  assert.equal(box.building.userData.roof,'rect','Wukesong must not inherit a domed or open stadium');box.dispose();
  const ray=new THREE.Raycaster(new THREE.Vector3(0,120,0),new THREE.Vector3(0,-1,0));
  open.building.updateMatrixWorld(true);arena.building.updateMatrixWorld(true);
  assert.ok(ray.intersectObject(open.building,true)[0].point.y<10,'outdoor bowl stays open to the field');
  assert.ok(ray.intersectObject(arena.building,true)[0].point.y>35,'the indoor center is closed by an actual roof');
  for(const scene of [open,arena,lotus]){
    const bounds=new THREE.Box3().setFromObject(scene.building);
    const size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x>100 && size.y>15 && size.z>100,'building needs roofs, facades and depth on all sides');
    let meshes=0,disposed=0,instances=0,population=0,releasedInstances=0;
    const geometries=new Set();
    scene.root.traverse(node=>{if(node.isMesh){meshes++;geometries.add(node.geometry);}if(node.isInstancedMesh){instances++;population+=node.count;node.addEventListener('dispose',()=>releasedInstances++);}});
    assert.ok(meshes<70,'mobile draw calls must be bounded');
    assert.ok(population>3000,'landscaping and structural detail use instancing instead of thousands of draw calls');
    geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
    scene.dispose();assert.equal(disposed,geometries.size,'switching venues must release geometry');
    assert.equal(releasedInstances,instances,'switching venues must also release the instance transform and color buffers');
  }
  assert.notEqual(open.building.userData.roof,lotus.building.userData.roof);
});
