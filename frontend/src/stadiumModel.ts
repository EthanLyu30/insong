import * as THREE from 'three';

// Original architectural scene; not a survey model of a particular venue.
function ovalRing(innerX:number,innerZ:number,outerX:number,outerZ:number,y:number,height=0,steps=128){
  const vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++){const a=i/steps*Math.PI*2;vertices.push(Math.cos(a)*innerX,y,Math.sin(a)*innerZ,Math.cos(a)*outerX,y+height,Math.sin(a)*outerZ);if(i<steps){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
export function buildStadium(){
  const root=new THREE.Group();
  const silver=new THREE.MeshStandardMaterial({color:'#a3adb0',metalness:.65,roughness:.4,side:THREE.DoubleSide});
  const concrete=new THREE.MeshStandardMaterial({color:'#747d7b',roughness:.92,side:THREE.DoubleSide});
  const steel=new THREE.MeshStandardMaterial({color:'#7d8989',metalness:.85,roughness:.3});
  const seats=new THREE.MeshStandardMaterial({color:'#4b6670',roughness:.8});
  const glass=new THREE.MeshStandardMaterial({color:'#30444b',metalness:.7,roughness:.18,transparent:true,opacity:.8,side:THREE.DoubleSide});
  const illuminated=new THREE.MeshStandardMaterial({color:'#d9d2b8',emissive:'#ffd394',emissiveIntensity:0,roughness:.5});
  const mesh=(geo:THREE.BufferGeometry,material:THREE.Material)=>{const object=new THREE.Mesh(geo,material);object.castShadow=true;object.receiveShadow=true;root.add(object);return object;};
  const base=mesh(new THREE.CylinderGeometry(205,208,3,96),concrete);base.scale.z=.73;base.position.y=-2;
  const wall=mesh(ovalRing(164,113,165,114,0,35),glass);
  // Cylindrical glass facade and service ring.
  const wallGeo=new THREE.CylinderGeometry(1,1,34,128,1,true);const facade=mesh(wallGeo,glass);facade.scale.set(164,1,113);facade.position.y=17;
  wall.visible=false;
  for(let row=0;row<12;row++)mesh(ovalRing(106+row*3.3,65+row*2.8,110+row*3.3,69+row*2.8,3+row*2.4,1.2),concrete);
  const chairGeo=new THREE.BoxGeometry(1.35,1.3,1.3),chairs=new THREE.InstancedMesh(chairGeo,seats,1920);const transform=new THREE.Object3D();
  for(let i=0;i<1920;i++){const row=Math.floor(i/160),a=(i%160)/160*Math.PI*2;transform.position.set(Math.cos(a)*(108+row*3.3),5+row*2.4,Math.sin(a)*(68+row*2.8));transform.rotation.y=-a+Math.PI/2;transform.updateMatrix();chairs.setMatrixAt(i,transform.matrix);}
  chairs.castShadow=false;root.add(chairs);
  const roof=mesh(ovalRing(111,71,171,121,43,-10),silver);
  const rim=mesh(ovalRing(110,70,113,73,43,.5),illuminated);rim.castShadow=false;
  const beams=new THREE.InstancedMesh(new THREE.CylinderGeometry(.35,.35,1,6),steel,160);
  for(let i=0;i<160;i++){const a=(i%80)/80*Math.PI*2;const bottom=new THREE.Vector3(Math.cos(a)*163,0,Math.sin(a)*114);const top=i<80?new THREE.Vector3(Math.cos(a)*169,34,Math.sin(a)*120):new THREE.Vector3(Math.cos(a)*111,44,Math.sin(a)*71);if(i>=80)bottom.set(Math.cos(a)*169,34,Math.sin(a)*120);const delta=top.clone().sub(bottom);transform.position.copy(bottom).add(top).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());transform.scale.set(1,delta.length(),1);transform.updateMatrix();beams.setMatrixAt(i,transform.matrix);}
  root.add(beams);transform.scale.set(1,1,1);transform.rotation.set(0,0,0);
  // Roof panel seams catch grazing light.
  const seamVertices:number[]=[];for(let i=0;i<96;i++){const a=i/96*Math.PI*2;seamVertices.push(Math.cos(a)*111,43.3,Math.sin(a)*71,Math.cos(a)*171,33.3,Math.sin(a)*121);}
  const seams=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(seamVertices,3)),new THREE.LineBasicMaterial({color:'#7a8687',transparent:true,opacity:.55}));root.add(seams);
  const track=mesh(new THREE.CircleGeometry(100,96),new THREE.MeshStandardMaterial({color:'#764a42',roughness:1}));track.rotation.x=-Math.PI/2;track.scale.y=.63;track.position.y=1;
  const field=mesh(new THREE.PlaneGeometry(135,75),new THREE.MeshStandardMaterial({color:'#425b45',roughness:1}));field.rotation.x=-Math.PI/2;field.position.y=1.2;
  const stage=mesh(new THREE.BoxGeometry(48,9,24),new THREE.MeshStandardMaterial({color:'#182029',metalness:.3,roughness:.55}));stage.position.set(0,5,-46);
  const screenMat=new THREE.MeshStandardMaterial({color:'#382d29',emissive:'#ffb961',emissiveIntensity:0,roughness:.45});
  const screen=mesh(new THREE.BoxGeometry(48,20,1),screenMat);screen.position.set(0,19,-57);
  const sideScreen=mesh(new THREE.BoxGeometry(15,14,1),screenMat);sideScreen.position.set(-45,18,-43);const right=sideScreen.clone();right.position.x=45;root.add(right);
  const path=mesh(ovalRing(210,155,280,205,-2),new THREE.MeshStandardMaterial({color:'#484e4e',roughness:1}));path.castShadow=false;
  const ground=mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshStandardMaterial({color:'#89928a',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-4;ground.castShadow=false;
  const windows=document.createElement('canvas');windows.width=128;windows.height=256;const ctx=windows.getContext('2d')!;ctx.fillStyle='#737b80';ctx.fillRect(0,0,128,256);
  for(let row=0;row<32;row++)for(let col=0;col<10;col++){ctx.fillStyle=(row*13+col*23)%7===0?'#a6a490':'#3e515d';ctx.fillRect(col*13+3,row*8+2,8,4);}
  const windowTexture=new THREE.CanvasTexture(windows);windowTexture.colorSpace=THREE.SRGBColorSpace;
  const cityMat=new THREE.MeshStandardMaterial({color:'#b9c2bf',map:windowTexture,emissiveMap:windowTexture,roughness:.7,metalness:.3,emissive:'#d1b787',emissiveIntensity:0});
  const city=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),cityMat,100);
  for(let i=0;i<100;i++){const a=i*2.39996,r=400+(i%8)*65,h=12+(i*37%83);transform.rotation.set(0,0,0);transform.position.set(Math.cos(a)*r,h/2-4,Math.sin(a)*r);transform.scale.set(24+(i%4)*8,h,22+(i%3)*9);transform.updateMatrix();city.setMatrixAt(i,transform.matrix);}
  city.castShadow=true;city.receiveShadow=true;root.add(city);
  const audienceGeo=new THREE.BufferGeometry(),audienceVertices:number[]=[];
  for(let i=0;i<1600;i++){const a=i*2.39996,r=Math.sqrt((i%137)/137);audienceVertices.push(Math.cos(a)*(78*r),2.5,Math.sin(a)*(43*r));}
  audienceGeo.setAttribute('position',new THREE.Float32BufferAttribute(audienceVertices,3));const audienceMaterial=new THREE.PointsMaterial({color:'#ffd59e',size:.8,transparent:true,opacity:0});root.add(new THREE.Points(audienceGeo,audienceMaterial));
  const beamMat=new THREE.MeshBasicMaterial({color:'#f4d8a9',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  const lights=new THREE.Group();for(let i=0;i<5;i++){const cone=new THREE.Mesh(new THREE.ConeGeometry(18,230,20,1,true),beamMat);cone.position.set((i-2)*23,135,-35);cone.rotation.z=(i-2)*.13;cone.rotation.x=.16;lights.add(cone);}root.add(lights);
  return {root,roof,lights,night:(n:number)=>{illuminated.emissiveIntensity=n*.7;screenMat.emissiveIntensity=n*1.8;cityMat.emissiveIntensity=n*.28;audienceMaterial.opacity=n*.85;beamMat.opacity=n*.022;}};
}
