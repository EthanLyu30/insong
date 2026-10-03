import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

test('drone camera travels around the full building, with safe altitude and distance bounds',async()=>{
  const orbit=await import('../src/droneOrbit.ts').catch(()=>({}));
  assert.equal(typeof orbit.dragDrone,'function','a volume orbit controller is missing');
  const home=orbit.HOME_DRONE;
  const turned=orbit.dragDrone(home,1800,0);
  assert.ok(Math.abs(turned.azimuth-home.azimuth)>=360,'drag must exceed a full revolution');
  const opposite=orbit.dronePosition({...home,azimuth:home.azimuth+180});
  const start=orbit.dronePosition(home);
  assert.ok(Math.abs(start[0]+opposite[0])<.0001 && Math.abs(start[2]+opposite[2])<.0001,'camera must see the back, not yaw a photograph');
  assert.ok(orbit.dragDrone(home,0,10000).elevation>=16);
  assert.ok(orbit.dragDrone(home,0,-10000).elevation<=78);
  assert.ok(orbit.zoomDrone(home,100000).distance>=220);
  assert.ok(orbit.zoomDrone(home,.00001).distance<=620);
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
    let meshes=0,vertices=0,disposed=0,instances=0,releasedInstances=0;
    const geometries=new Set();
    scene.root.traverse(node=>{if(node.isMesh){meshes++;vertices+=node.geometry.attributes.position.count;geometries.add(node.geometry);}if(node.isInstancedMesh){instances++;node.addEventListener('dispose',()=>releasedInstances++);}});
    assert.ok(meshes<70,'mobile draw calls must be bounded');
    assert.ok(vertices>10000,'the scene must contain actual detailed architecture');
    geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
    scene.dispose();assert.equal(disposed,geometries.size,'switching venues must release geometry');
    assert.equal(releasedInstances,instances,'switching venues must also release the instance transform and color buffers');
  }
  assert.notEqual(open.building.userData.roof,lotus.building.userData.roof);
});
