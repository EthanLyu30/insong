import * as THREE from 'three';

// An original architectural scene, anchored to a verified venue location.
// The architecture is illustrative, not a surveyed model of the named venue.
function ring(ix:number,iz:number,ox:number,oz:number,y:number,rise=0,steps=192){
  const vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++){const a=i/steps*Math.PI*2;vertices.push(Math.cos(a)*ix,y,Math.sin(a)*iz,Math.cos(a)*ox,y+rise,Math.sin(a)*oz);if(i<steps){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function buildStadium(){
  const root=new THREE.Group();
  const stone=new THREE.MeshStandardMaterial({color:'#dad3c4',roughness:.85,side:THREE.DoubleSide});
  const steel=new THREE.MeshStandardMaterial({color:'#d4d3c9',metalness:.85,roughness:.24});
  const roofMaterials=['#c1cacc','#d0d4cf','#a8bec3','#ded4c1'].map(color=>new THREE.MeshStandardMaterial({color,metalness:.42,roughness:.32,side:THREE.DoubleSide}));
  const glass=new THREE.MeshStandardMaterial({color:'#91a6ad',metalness:.2,roughness:.28,side:THREE.DoubleSide});
  const warm=new THREE.MeshStandardMaterial({color:'#dcc5a0',emissive:'#ffb85f',emissiveIntensity:.12});
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material)=>{const object=new THREE.Mesh(geometry,material);object.castShadow=true;object.receiveShadow=true;root.add(object);return object;};
  // A paved plaza with concentric joints and low planted islands. No giant invented city plane.
  mesh(ring(0,0,237,177,.12),stone);
  const jointVertices:number[]=[];
  for(let r=190;r<=232;r+=7)for(let i=0;i<192;i++){const a=i/192*Math.PI*2,b=(i+1)/192*Math.PI*2;jointVertices.push(Math.cos(a)*r,.2,Math.sin(a)*r*.74,Math.cos(b)*r,.2,Math.sin(b)*r*.74);}
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(jointVertices,3)),new THREE.LineBasicMaterial({color:'#bcb7ac',transparent:true,opacity:.45})));
  mesh(ring(150,102,173,122,1,2),stone);
  const facade=mesh(new THREE.CylinderGeometry(1,1,32,192,1,true),glass);facade.scale.set(169,1,118);facade.position.y=18;
  // Folded triangular roof panels, with depth and individually lit reflective faces.
  const roof=new THREE.Group();root.add(roof);
  const seamVertices:number[]=[],panels:number[][]=[[],[],[],[]];
  for(let i=0;i<64;i++){
    const a=i/64*Math.PI*2,b=(i+1)/64*Math.PI*2,m=(a+b)/2;
    const inner=(angle:number)=>new THREE.Vector3(Math.cos(angle)*111,46,Math.sin(angle)*72);
    const outer=(angle:number)=>new THREE.Vector3(Math.cos(angle)*175,37+1.5*Math.cos(angle*8),Math.sin(angle)*125);
    const ridge=new THREE.Vector3(Math.cos(m)*145,47+1.5*Math.cos(m*8),Math.sin(m)*101);
    for(const triangle of [[inner(a),inner(b),ridge],[inner(b),outer(b),ridge],[outer(b),outer(a),ridge],[outer(a),inner(a),ridge]]){
      triangle.forEach(point=>panels[i%4].push(...point.toArray()));
      for(let j=0;j<3;j++)seamVertices.push(...triangle[j].toArray(),...triangle[(j+1)%3].toArray());
    }
  }
  panels.forEach((vertices,i)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();const panel=new THREE.Mesh(geometry,roofMaterials[i]);panel.castShadow=true;panel.receiveShadow=true;roof.add(panel);});
  roof.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(seamVertices,3)),new THREE.LineBasicMaterial({color:'#657f88',transparent:true,opacity:.38})));
  mesh(ring(109,70,112,73,46),warm);
  const truss=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.22,1,5),steel,384),transform=new THREE.Object3D();
  for(let i=0;i<384;i++){
    const a=(i%128)/128*Math.PI*2,b=a+Math.PI*2/128;
    const p=new THREE.Vector3(Math.cos(a)*169,2,Math.sin(a)*118);
    const q=i<128?new THREE.Vector3(Math.cos(a)*173,35,Math.sin(a)*123):i<256?new THREE.Vector3(Math.cos(b)*173,35,Math.sin(b)*123):new THREE.Vector3(Math.cos(a)*111,46,Math.sin(a)*72);
    if(i>=256)p.set(Math.cos(a)*173,35,Math.sin(a)*123);
    const delta=q.clone().sub(p);transform.position.copy(p).add(q).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());transform.scale.set(1,delta.length(),1);transform.updateMatrix();truss.setMatrixAt(i,transform.matrix);
  }
  root.add(truss);
  for(let row=0;row<24;row++)mesh(ring(89+row*2.8,50+row*2.1,92+row*2.8,52+row*2.1,2+row*1.32,.9),stone);
  const chairMaterial=new THREE.MeshStandardMaterial({color:'#688994',roughness:.7});
  const chairs=new THREE.InstancedMesh(new THREE.BoxGeometry(.7,.8,.8),chairMaterial,7680);
  transform.scale.set(1,1,1);transform.quaternion.identity();
  for(let i=0;i<7680;i++){const row=Math.floor(i/320),a=(i%320)/320*Math.PI*2;transform.position.set(Math.cos(a)*(91+row*2.8),3.5+row*1.32,Math.sin(a)*(52+row*2.1));transform.rotation.y=-a+Math.PI/2;transform.updateMatrix();chairs.setMatrixAt(i,transform.matrix);chairs.setColorAt(i,new THREE.Color(i%13===0?'#d1bda1':i%3===0?'#8eabae':'#657e85'));}
  root.add(chairs);
  const field=mesh(new THREE.PlaneGeometry(166,85),new THREE.MeshStandardMaterial({color:'#848579',roughness:1}));field.rotation.x=-Math.PI/2;field.position.y=1;
  const stageMat=new THREE.MeshStandardMaterial({color:'#242c32',metalness:.45,roughness:.4});
  const stage=mesh(new THREE.BoxGeometry(49,3,23),stageMat);stage.position.set(0,3,-44);
  const screenMat=new THREE.MeshStandardMaterial({color:'#efba72',emissive:'#ffb65e',emissiveIntensity:.2});
  mesh(new THREE.BoxGeometry(46,19,.9),screenMat).position.set(0,16,-55);
  for(const x of [-41,41]){mesh(new THREE.BoxGeometry(12,17,.6),screenMat).position.set(x,15,-44);mesh(new THREE.BoxGeometry(1,30,1),steel).position.set(x,17,-45);}
  // Thousands of separate wristband lights, distributed over floor and tiers.
  const audience:number[]=[];
  for(let i=0;i<5800;i++){const a=i*2.399963,r=Math.sqrt((i%997)/997);if(i<2200)audience.push(Math.cos(a)*76*r,2.2,Math.sin(a)*36*r+3);else{const row=i%24;audience.push(Math.cos(a)*(91+row*2.8),4+row*1.32,Math.sin(a)*(52+row*2.1));}}
  const audienceMaterial=new THREE.PointsMaterial({color:'#ffce82',size:1.35,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false});
  root.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(audience,3)),audienceMaterial));
  const beamMat=new THREE.MeshBasicMaterial({color:'#ffd29a',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  const lights=new THREE.Group();
  for(let i=0;i<5;i++){const cone=new THREE.Mesh(new THREE.ConeGeometry(22,190,24,1,true),beamMat);cone.position.set((i-2)*16,115,-42);cone.rotation.z=(i-2)*.15;lights.add(cone);}
  root.add(lights);
  const trees=new THREE.InstancedMesh(new THREE.SphereGeometry(3.2,8,6),new THREE.MeshStandardMaterial({color:'#879a79',roughness:1}),104);
  transform.scale.set(1,1.35,1);transform.rotation.set(0,0,0);
  for(let i=0;i<104;i++){const a=i/104*Math.PI*2;transform.position.set(Math.cos(a)*222,4,Math.sin(a)*165);transform.updateMatrix();trees.setMatrixAt(i,transform.matrix);}
  root.add(trees);
  return {root,roof,lights,night:(n:number)=>{warm.emissiveIntensity=.12+n*.9;screenMat.emissiveIntensity=.2+n*2.8;audienceMaterial.opacity=n*.95;beamMat.opacity=n*.035;}};
}
