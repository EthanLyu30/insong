import {test} from 'node:test';
import assert from 'node:assert/strict';

test('portrait scene framing keeps its native proportions and limits magnification to available pixels',async()=>{
  const {sceneFrame,clampPhotoView}=await import('../src/sceneFraming.ts');
  const frame=sceneFrame(390,844,853,1844,1.5);
  assert.ok(frame.width>=390&&frame.height>=844,'the photo must cover the mobile frame');
  assert.ok(Math.abs(frame.width/frame.height-853/1844)<.00001,'no stretched UV composition');
  const close=clampPhotoView({yaw:100,pitch:-100,zoom:100},frame.maxZoom);
  assert.ok(close.zoom*frame.width*1.5<=853*1.06,'close zoom must have a source pixel budget');
  assert.ok(Math.abs(close.yaw)<=12&&Math.abs(close.pitch)<=7,'single-view images must not expose their edges');
  assert.deepEqual(clampPhotoView({yaw:0,pitch:0,zoom:1},frame.maxZoom),{yaw:0,pitch:0,zoom:1});
  const wide=sceneFrame(1280,720,853,1844,1.5);
  assert.equal(wide.maxZoom,1,'never further magnify a portrait already cropped for desktop');
});

test('drag and pinch settle smoothly without snapping or an endless render loop',async()=>{
  const {settlePhotoView}=await import('../src/sceneFraming.ts');
  const from={yaw:0,pitch:0,zoom:1},to={yaw:10,pitch:5,zoom:1.3};
  const first=settlePhotoView(from,to,.016);
  assert.ok(first.view.yaw>0&&first.view.yaw<10);
  assert.ok(first.moving);
  let state=from;
  for(let i=0;i<300;i++)state=settlePhotoView(state,to,.016).view;
  assert.deepEqual(settlePhotoView(state,to,.016),{view:to,moving:false});
});

test('depth camera extreme angles leave no exposed image edge on portrait or wide frames',async()=>{
  const THREE=await import('three');
  const {photoCoverage,sceneFrame}=await import('../src/sceneFraming.ts');
  const {updateDepthSurface}=await import('../src/sceneDepthSurface.ts');
  for(const [width,height] of [[390,844],[360,640],[375,667],[1280,720]]){
    const frame=sceneFrame(width,height,853,1844,1);
    const visibleHeight=2*3.2*Math.tan(35*Math.PI/360),worldHeight=visibleHeight*frame.height/height;
    const geometry=new THREE.PlaneGeometry(1,1,48,96);updateDepthSurface(geometry,worldHeight*853/1844,worldHeight);
    const surface=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    const camera=new THREE.PerspectiveCamera(35,width/height,.1,100);
    for(const night of [false,true])for(const yaw of [-12,0,12])for(const pitch of [-7,0,7]){
      const cover=photoCoverage(width/height,yaw,pitch),y=yaw*Math.PI/180,p=pitch*Math.PI/180;
      surface.position.y=night?worldHeight*(height<=720?.09:.035):0;
      surface.scale.set(cover,cover,1);surface.updateMatrixWorld();
      const close=Math.max(1,sceneFrame(width,height,853,1844,1.5).maxZoom/cover);
      for(const zoom of [1,close]){
        const radius=3.2/zoom;
        camera.position.set(Math.sin(y)*Math.cos(p)*radius,Math.sin(p)*radius,Math.cos(y)*Math.cos(p)*radius);camera.lookAt(0,0,0);camera.updateMatrixWorld();
        // The opaque song sheet covers the lower night frame; test every visible edge.
        for(const x of [-.99,0,.99])for(const sy of [night?(height<=720?-.1:-.3):-.99,0,.99]){
          const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,sy),camera);
          assert.ok(ray.intersectObject(surface).length,`${width}x${height} night ${night} angle ${yaw},${pitch} zoom ${zoom} corner ${x},${sy} must show the scene`);
        }
      }
    }
    geometry.dispose();surface.material.dispose();
  }
});
