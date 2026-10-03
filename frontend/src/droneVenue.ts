import * as THREE from 'three';
import {HOME_DRONE,dronePosition,droneFocus} from './droneOrbit.ts';

type Profile={id:string;covered:boolean};
type Shape={rx:number;rz:number;roof:'crystal'|'petals'|'shell'|'arena'|'rect';height:number;lobes:number;rotation:number};
// Architectural interpretations, not measured models. The bowl, roof silhouette
// and enclosed/open distinction vary by venue, while every side is real geometry.
function shapeFor(profile:Profile):Shape{
  if(profile.id==='hangzhou-lotus')return {rx:154,rz:120,roof:'petals',height:42,lobes:28,rotation:0};
  if(profile.id==='shenzhen-stadium')return {rx:150,rz:116,roof:'crystal',height:38,lobes:12,rotation:.14};
  if(profile.id==='shenzhen-arena')return {rx:100,rz:92,roof:'crystal',height:35,lobes:12,rotation:0};
  if(profile.id==='beijing-wukesong')return {rx:98,rz:91,roof:'rect',height:35,lobes:4,rotation:0};
  if(profile.covered)return {rx:100,rz:86,roof:'arena',height:35,lobes:profile.id==='shenzhen-arena'?12:8,rotation:0};
  return {rx:150,rz:112,roof:'shell',height:34,lobes:profile.id.includes('egret')?16:8,rotation:0};
}
export function createDroneVenue(profile:Profile){
  const shape=shapeFor(profile),root=new THREE.Group(),building=new THREE.Group();
  building.userData.roof=shape.roof;root.add(building);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instancedMeshes=new Set<THREE.InstancedMesh>(),textures=new Set<THREE.Texture>();
  const standard=(options:THREE.MeshStandardMaterialParameters)=>{const m=new THREE.MeshStandardMaterial(options);materials.add(m);return m;};
  const basic=(options:THREE.MeshBasicMaterialParameters)=>{const m=new THREE.MeshBasicMaterial(options);materials.add(m);return m;};
  const add=(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Group=root)=>{geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  let seed=[...profile.id].reduce((n,c)=>n*31+c.charCodeAt(0),17)>>>0;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function paintedTexture(width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void){
    if(typeof document==='undefined')return undefined;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx?.fillRect)return undefined;
    paint(ctx);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);return texture;
  }
  const metal=standard({color:'#d5d8d7',metalness:.8,roughness:.23,side:THREE.DoubleSide});
  const concrete=standard({color:'#716858',roughness:.94});
  const bronze=standard({color:'#77766b',metalness:.76,roughness:.28});
  const glass=standard({color:'#ced5d7',metalness:.55,roughness:.27,vertexColors:true,side:THREE.DoubleSide});
  const stageMaterial=standard({color:'#141921',roughness:.58});
  const warm=basic({color:'#ffd193',toneMapped:false});
  const segments=shape.roof==='crystal'?24:192,bands=shape.roof==='crystal'?3:6,positions:number[]=[],colors:number[]=[],wire:number[]=[];
  const color=new THREE.Color();
  function roofPoint(i:number,j:number):THREE.Vector3{
    const a=i/segments*Math.PI*2+shape.rotation,t=j/bands;
    const inner=profile.covered?.02:.66,rad=inner+(1-inner)*t;
    const wave=shape.roof==='crystal'?Math.abs(Math.cos(a*shape.lobes/2)):shape.roof==='petals'?Math.pow((1+Math.cos(a*shape.lobes))/2,3):Math.cos(a*2)*.24;
    const y=profile.covered?shape.height+14*(1-t*t)+wave*8:shape.height-5+Math.sin(t*Math.PI)*11+wave*(shape.roof==='crystal'?18:8)*t;
    const signPower=(v:number)=>Math.sign(v)*Math.abs(v)**.2;
    return new THREE.Vector3((shape.roof==='rect'?signPower(Math.sin(a)):Math.sin(a))*shape.rx*rad,shape.roof==='rect'?shape.height:y,(shape.roof==='rect'?signPower(Math.cos(a)):Math.cos(a))*shape.rz*rad);
  }
  function triangle(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,tint:number){
    color.set('#c1d0d5').multiplyScalar(tint);
    for(const p of [a,b,c]){positions.push(p.x,p.y,p.z);colors.push(color.r,color.g,color.b);}
    for(const [p,q] of [[a,b],[b,c],[c,a]])wire.push(p.x,p.y,p.z,q.x,q.y,q.z);
  }
  for(let i=0;i<segments;i++)for(let j=0;j<bands;j++){
    const a=roofPoint(i,j),b=roofPoint(i+1,j),c=roofPoint(i,j+1),d=roofPoint(i+1,j+1);
    triangle(a,c,b,.65+rand()*.75);triangle(b,c,d,.65+rand()*.75);
  }
  const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roof.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roof.computeVertexNormals();
  const roofMaterial=standard({color:'#e0e2df',metalness:.68,roughness:.24,vertexColors:true,side:THREE.DoubleSide});
  geometries.add(roof);
  const canopy=shape.roof==='rect'?add(new THREE.BoxGeometry(shape.rx*2.05,2,shape.rz*2.05),metal,building):add(roof,roofMaterial,building);if(shape.roof==='rect')canopy.position.y=shape.height;canopy.name='roof-panels';canopy.castShadow=true;
  if(profile.covered&&shape.roof!=='rect'){const cap=add(new THREE.CircleGeometry(Math.max(shape.rx,shape.rz)*.035,64),metal,building);cap.rotation.x=-Math.PI/2;cap.position.y=shape.height+19;cap.castShadow=true;}
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wire,3));geometries.add(lineGeometry);
  const lineMaterial=new THREE.LineBasicMaterial({color:'#e4ce9c',transparent:true,opacity:.45});materials.add(lineMaterial);
  if(shape.roof!=='rect')building.add(new THREE.LineSegments(lineGeometry,lineMaterial));
  // All-round curtain wall and steel ribs; no screen-facing billboard facade.
  const facade:number[]=[],facadeColors:number[]=[],facadeWire:number[]=[],ribs=segments;
  const wallSegments=shape.roof==='crystal'?24:segments;
  function wallPoint(i:number,t:number){const p=roofPoint(i/wallSegments*segments,bands);const radius=shape.roof==='crystal'?(.88+.12*t+Math.sin(t*Math.PI)*(i%2===0?.15:-.02)):1;return new THREE.Vector3(p.x*radius,4+(p.y-4)*t,p.z*radius);}
  for(let i=0;i<wallSegments;i++)for(let j=0;j<3;j++){
    const a=wallPoint(i,j/3),b=wallPoint(i+1,j/3),c=wallPoint(i,(j+1)/3),d=wallPoint(i+1,(j+1)/3);
    for(const vertices of [[a,b,c],[b,d,c]]){
      color.set('#9fb7c1').multiplyScalar(.82+rand()*.21);
      for(const p of vertices){facade.push(p.x,p.y,p.z);facadeColors.push(color.r,color.g,color.b);}
      for(let k=0;k<3;k++){const p=vertices[k],q=vertices[(k+1)%3];facadeWire.push(p.x,p.y,p.z,q.x,q.y,q.z);}
    }
  }
  const facadeGeometry=new THREE.BufferGeometry();facadeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(facade,3));facadeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(facadeColors,3));facadeGeometry.computeVertexNormals();add(facadeGeometry,glass,building).castShadow=true;
  if(shape.roof==='crystal'||shape.roof==='petals'){
    const structure=new THREE.BufferGeometry();structure.setAttribute('position',new THREE.Float32BufferAttribute(facadeWire,3));geometries.add(structure);
    const structureMaterial=new THREE.LineBasicMaterial({color:'#c8b994'});materials.add(structureMaterial);building.add(new THREE.LineSegments(structure,structureMaterial));
  }
  function instances(g:THREE.BufferGeometry,m:THREE.Material,count:number,parent:THREE.Group=root){geometries.add(g);const mesh=new THREE.InstancedMesh(g,m,count);instancedMeshes.add(mesh);parent.add(mesh);return mesh;}
  const dummy=new THREE.Object3D();
  function place(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,sx=1,sy=1,sz=1,angle=0){dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,angle,0);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
  // Tubular structural members catch the low sun from every angle. Screen-space
  // outlines alone flatten the crystal facade during an orbit.
  if(shape.roof==='crystal'){
    const edges=[...wire,...facadeWire],bars=instances(new THREE.CylinderGeometry(.13,.13,1,5),metal,edges.length/6,building);
    const up=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3();
    for(let i=0;i<edges.length;i+=6){start.fromArray(edges,i);end.fromArray(edges,i+3);dummy.position.copy(start).add(end).multiplyScalar(.5);dummy.scale.set(1,start.distanceTo(end),1);dummy.quaternion.setFromUnitVectors(up,end.sub(start).normalize());dummy.updateMatrix();bars.setMatrixAt(i/6,dummy.matrix);}
  }
  const mullions=instances(new THREE.BoxGeometry(1,1,1),bronze,ribs,building);
  for(let i=0;i<ribs;i++){const p=roofPoint(i,bands);place(mullions,i,p.x*.935,p.y/2,p.z*.935,.3,p.y,.4,i/segments*Math.PI*2);}
  function ellipseRing(rx:number,rz:number,inner:number,y:number,material:THREE.Material,parent:THREE.Group=root){
    const values:number[]=[];
    for(let i=0;i<192;i++){
      const a=i/192*Math.PI*2,b=(i+1)/192*Math.PI*2;
      const p=(angle:number,r:number)=>[Math.sin(angle)*rx*r,y,Math.cos(angle)*rz*r];
      values.push(...p(a,1),...p(b,1),...p(a,inner),...p(b,1),...p(b,inner),...p(a,inner));
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));g.computeVertexNormals();return add(g,material,parent);
  }
  if(shape.roof!=='rect'){ellipseRing(shape.rx*1.1,shape.rz*1.1,.81,3,concrete,building);for(const y of [7,15,23])ellipseRing(shape.rx*.995,shape.rz*.995,.98,y,metal,building);}
  const podium=add(shape.roof==='rect'?new THREE.BoxGeometry(2,4,2):new THREE.CylinderGeometry(1,1,4,128),concrete,building);podium.scale.set(shape.rx*1.075,1,shape.rz*1.075);podium.position.y=.8;podium.castShadow=true;
  // Bowl and individual seats remain visible while the drone crosses the roof.
  if(!profile.covered){
    const rows=32,seatsPerRow=384,seats=instances(new THREE.BoxGeometry(.65,.5,.65),standard({color:'#614842',roughness:.92}),rows*seatsPerRow,building);
    for(let row=0;row<rows;row++){
      const r=.39+row*.0082,y=4+row*.81;
      ellipseRing(shape.rx*r,shape.rz*r,.982,y,concrete,building);
      for(let seat=0;seat<seatsPerRow;seat++){
        const a=seat/seatsPerRow*Math.PI*2;const index=row*seatsPerRow+seat;
        place(seats,index,Math.sin(a)*shape.rx*r,y+.35,Math.cos(a)*shape.rz*r,1,1,1,-a);
        seats.setColorAt(index,color.setHSL(.017+rand()*.05,.16+rand()*.18,.19+rand()*.17));
      }
    }
    const floor=add(new THREE.PlaneGeometry(shape.rx*.84,shape.rz*.86),standard({color:'#2c3835',roughness:.96}),building);floor.rotation.x=-Math.PI/2;floor.position.y=3.1;
    const stage=add(new THREE.BoxGeometry(44,6,17),stageMaterial,building);stage.position.set(0,6,-shape.rz*.42);
    const led=paintedTexture(256,128,ctx=>{
      ctx.fillStyle='#301a23';ctx.fillRect(0,0,256,128);
      const glow=ctx.createRadialGradient(128,72,8,128,72,103);glow.addColorStop(0,'#fff5be');glow.addColorStop(.25,'#eea544');glow.addColorStop(.6,'#9a3d2a');glow.addColorStop(1,'#1e1923');ctx.fillStyle=glow;ctx.fillRect(0,0,256,128);
      ctx.strokeStyle='#ffedbb';ctx.lineWidth=2;for(let r=18;r<100;r+=14){ctx.beginPath();ctx.ellipse(128,72,r,r*.6,0,0,Math.PI*2);ctx.stroke();}
    });
    const screen=add(new THREE.BoxGeometry(40,18,1),basic({color:'#fff6dd',map:led??null,toneMapped:false}),building);screen.position.set(0,17,-shape.rz*.47);
    const lights=instances(new THREE.SphereGeometry(.3,5,4),warm,3800,building);
    for(let i=0;i<3800;i++){
      if(i<1800){const a=rand()*Math.PI*2,r=.4+rand()*.245;place(lights,i,Math.sin(a)*shape.rx*r,5+(r-.39)*98,Math.cos(a)*shape.rz*r);}
      else place(lights,i,(rand()-.5)*shape.rx*.64,3.8,(rand()-.5)*shape.rz*.59);
    }
  }
  // Lit entrances, walking paths and plaza planting establish scale and depth.
  const entrances=instances(new THREE.BoxGeometry(1,1,1),warm,32,building);
  for(let i=0;i<32;i++){const a=i/32*Math.PI*2;place(entrances,i,Math.sin(a)*shape.rx*1.004,5,Math.cos(a)*shape.rz*1.004,5,4,.4,a);}
  const groundMaterial=standard({color:'#464d43',roughness:1});
  groundMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain;').replace('#include <color_fragment>',`#include <color_fragment>
    float grain=fract(sin(dot(vTerrain.xy,vec2(12.9898,78.233)))*43758.5453);
    float broad=sin(vTerrain.x*.024)*cos(vTerrain.y*.017);diffuseColor.rgb*=.82+grain*.25+broad*.12;`);};
  const ground=add(new THREE.CircleGeometry(650,128),groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-1;
  const paving=paintedTexture(256,256,ctx=>{
    ctx.fillStyle='#8c8575';ctx.fillRect(0,0,256,256);
    for(let y=0;y<256;y+=16)for(let x=0;x<256;x+=32){const shade=128+Math.round(rand()*30);ctx.fillStyle=`rgb(${shade},${shade-3},${shade-13})`;ctx.fillRect(x+(y%32?16:0),y,31,15);}
  });
  if(paving){paving.wrapS=paving.wrapT=THREE.RepeatWrapping;paving.repeat.set(35,35);}
  const plaza=add(new THREE.CircleGeometry(1,128),standard({color:'#c6b89f',map:paving??null,roughness:.85}));plaza.rotation.x=-Math.PI/2;plaza.scale.set(shape.rx*1.5,shape.rz*1.6,1);plaza.position.y=-.7;
  const pathMaterial=standard({color:'#b5a990',roughness:.85});
  ellipseRing(shape.rx*1.25,shape.rz*1.29,.993,-.4,pathMaterial);
  ellipseRing(shape.rx*1.45,shape.rz*1.56,.995,-.4,pathMaterial);
  const paths=instances(new THREE.BoxGeometry(1,1,1),pathMaterial,16);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;place(paths,i,Math.sin(a)*shape.rx*1.32,-.35,Math.cos(a)*shape.rz*1.4,2,.1,65,a);}
  const treeCount=900,trunks=instances(new THREE.CylinderGeometry(.45,.8,11,5),standard({color:'#635442',roughness:1}),treeCount);
  const crown=new THREE.IcosahedronGeometry(5,1),crownPositions=crown.attributes.position;
  for(let i=0;i<crownPositions.count;i++){
    const x=crownPositions.getX(i),y=crownPositions.getY(i),z=crownPositions.getZ(i);
    const wrinkle=.86+.13*Math.sin(x*2.5+y)*Math.cos(z*2.2-y);
    crownPositions.setXYZ(i,x*wrinkle,y*wrinkle,z*wrinkle);
  }
  crown.computeVertexNormals();
  const leaves=instances(crown,standard({color:'#4b5e37',roughness:1}),treeCount*3);leaves.castShadow=true;trunks.castShadow=true;
  for(let i=0;i<treeCount;i++){
    const a=rand()*Math.PI*2,r=1.55+rand()*.95,x=Math.sin(a)*shape.rx*r,z=Math.cos(a)*shape.rz*r,size=.6+rand()*.75;
    place(trunks,i,x,5*size,z,size,size,size);
    for(let side=0;side<3;side++){const offset=(side-1)*3*size;place(leaves,i*3+side,x+Math.sin(a)*offset,(10+side%2*3)*size,z+Math.cos(a)*offset,size,(.8+rand()*.4)*size,size,a);leaves.setColorAt(i*3+side,color.setHSL(.22+rand()*.06,.12,.5+rand()*.16));}
  }
  const poles=instances(new THREE.CylinderGeometry(.22,.28,9,5),bronze,64),lamps=instances(new THREE.SphereGeometry(.65,6,4),warm,64);
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2,x=Math.sin(a)*shape.rx*1.38,z=Math.cos(a)*shape.rz*1.5;place(poles,i,x,4.5,z);place(lamps,i,x,9,z);}
  const scene=new THREE.Scene();scene.add(root);
  scene.fog=new THREE.FogExp2('#dab990',.0004);
  scene.add(new THREE.HemisphereLight('#d4e1ef','#393223',1.1));
  const sun=new THREE.DirectionalLight('#ffd099',2.2);sun.position.set(-350,120,240);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-380,right:380,top:380,bottom:-380,near:1,far:1200});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0002;sun.shadow.normalBias=.45;scene.add(sun);
  const fill=new THREE.DirectionalLight('#8eaeca',.6);fill.position.set(150,140,320);scene.add(fill);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{opacity:{value:1}},transparent:true,vertexShader:'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
    varying vec3 vWorld; uniform float opacity;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);vec3 col=mix(vec3(.98,.78,.52),vec3(.44,.63,.76),smoothstep(0.,.8,h));
      float s=pow(max(dot(d,normalize(vec3(-350.,160.,-200.))),0.),85.);col+=vec3(.7,.37,.08)*s;
      vec2 p=d.xz/(h+.18)*3.;float n=noise(p)*.55+noise(p*2.2)*.28+noise(p*4.4)*.17;
      float cloud=smoothstep(.52,.7,n)*smoothstep(.08,.3,h)*(1.-smoothstep(.7,.95,h));col=mix(col,vec3(1.,.9,.74),cloud*.7);
      gl_FragColor=vec4(col,opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});materials.add(skyMaterial);
  const sky=add(new THREE.SphereGeometry(2200,32,16),skyMaterial);sky.renderOrder=-100;
  // Crop the arrival artwork to its distant city/sky for a photographic horizon;
  // the stadium itself stays mesh geometry, visible from front, back and above.
  let backdrop:THREE.Mesh|undefined,backdropTexture:THREE.Texture|undefined,reflection:THREE.Texture|undefined,panorama:THREE.Mesh|undefined;
  const horizonPitch={value:26*Math.PI/180};
  const artwork={value:null as THREE.Texture|null},detail={value:null as THREE.Texture|null};
  const reference=new THREE.PerspectiveCamera(56,853/1844,1,5000);
  reference.position.set(...dronePosition(HOME_DRONE));reference.lookAt(...droneFocus(HOME_DRONE));reference.updateMatrixWorld(true);
  const projection=new THREE.Matrix4().multiplyMatrices(reference.projectionMatrix,reference.matrixWorldInverse);
  // Photo projection keeps the front finish faithful to the arrival image. The
  // unpictured sides reuse a crystal crop on actual, orbitable roof geometry.
  // This is illustrative architecture, not a photogrammetry scan.
  for(const material of [roofMaterial,glass]){
    material.toneMapped=false;
    material.onBeforeCompile=shader=>{
      if(!artwork.value)return; // Keep usable physical materials until artwork arrives.
      Object.assign(shader.uniforms,{arrivalArtwork:artwork,crystalDetail:detail,arrivalProjection:{value:projection},arrivalEye:{value:reference.position}});
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        varying vec3 vArtworkWorld; varying vec3 vArtworkNormal;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
        vArtworkWorld=(modelMatrix*vec4(position,1.0)).xyz;
        vArtworkNormal=normalize(mat3(modelMatrix)*normal);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        uniform sampler2D arrivalArtwork; uniform sampler2D crystalDetail;
        uniform mat4 arrivalProjection; uniform vec3 arrivalEye;
        varying vec3 vArtworkWorld; varying vec3 vArtworkNormal;`)
        .replace('#include <color_fragment>',`#include <color_fragment>
        vec4 projected=arrivalProjection*vec4(vArtworkWorld,1.0);
        vec2 photoUV=projected.xy/projected.w*.5+.5;
        float facing=dot(normalize(vArtworkNormal),normalize(arrivalEye-vArtworkWorld));
        float inside=step(.002,photoUV.x)*step(.002,photoUV.y)*step(photoUV.x,.998)*step(photoUV.y,.998);
        float usePhoto=smoothstep(.12,.55,facing)*inside;
        vec2 finishUV=fract(vec2(atan(vArtworkWorld.x,vArtworkWorld.z)*2.6,vArtworkWorld.y*.032));
        vec3 finish=texture2D(crystalDetail,finishUV).rgb;
        vec3 arrival=texture2D(arrivalArtwork,clamp(photoUV,.002,.998)).rgb;
        // Never paint the photographed dark opening onto a solid roof panel.
        float solid= smoothstep(.06,.22,dot(arrival,vec3(.2126,.7152,.0722)));
        // Reuse the photograph's subtle surface grain, not its mismatched truss
        // lines. Broad, individually lit facets retain a readable crystal roof.
        float grain=dot(finish,vec3(.2126,.7152,.0722));
        vec3 photographicFinish=mix(diffuseColor.rgb,arrival,usePhoto*solid*.12);
        diffuseColor.rgb=photographicFinish*(.92+grain*.16);`)
        .replace('#include <opaque_fragment>',`outgoingLight=mix(outgoingLight,photographicFinish,.18);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`arrival-crystal-${profile.id}-${artwork.value?'ready':'fallback'}`;
  }
  function cropTexture(texture:THREE.Texture,x:number,y:number,w:number,h:number){
    const image=texture.image as HTMLImageElement,crop=document.createElement('canvas');
    crop.width=Math.round(image.width*w);crop.height=Math.round(image.height*h);
    crop.getContext('2d')?.drawImage(image,image.width*x,image.height*y,crop.width,crop.height,0,0,crop.width,crop.height);
    const result=new THREE.CanvasTexture(crop);result.colorSpace=THREE.SRGBColorSpace;result.anisotropy=texture.anisotropy;return result;
  }
  // 32 seating rings + architecture/plaza/instancing stay below 70 draw calls.
  let disposed=false;
  return {scene,root,building,setBackdrop(texture:THREE.Texture){
    backdropTexture?.dispose();reflection?.dispose();detail.value?.dispose();groundMaterial.map?.dispose();
    artwork.value=texture;
    detail.value=cropTexture(texture,.45,.57,.35,.075);detail.value.wrapS=detail.value.wrapT=THREE.MirroredRepeatWrapping;
    groundMaterial.map=cropTexture(texture,0,.75,1,.25);groundMaterial.map.wrapS=groundMaterial.map.wrapT=THREE.MirroredRepeatWrapping;groundMaterial.map.repeat.set(5,5);groundMaterial.color.set('#b4baa5');groundMaterial.needsUpdate=true;
    roofMaterial.needsUpdate=glass.needsUpdate=true;
    const image=texture.image as HTMLImageElement,crop=document.createElement('canvas');crop.width=image.width;crop.height=Math.round(image.height*.42);
    reference.aspect=image.width/image.height;reference.updateProjectionMatrix();projection.multiplyMatrices(reference.projectionMatrix,reference.matrixWorldInverse);
    crop.getContext('2d')?.drawImage(image,0,0,image.width,crop.height,0,0,crop.width,crop.height);
    backdropTexture=new THREE.CanvasTexture(crop);backdropTexture.colorSpace=THREE.SRGBColorSpace;backdropTexture.repeat.set(8,1);backdropTexture.wrapS=THREE.MirroredRepeatWrapping;backdropTexture.needsUpdate=true;
    if(!panorama){reflection=texture.clone();reflection.mapping=THREE.EquirectangularReflectionMapping;reflection.needsUpdate=true;scene.environment=reflection;scene.environmentIntensity=.35;}
    if(backdrop){root.remove(backdrop);}
    backdrop=add(new THREE.CylinderGeometry(680,680,550,192,1,true),basic({map:backdropTexture,side:THREE.BackSide,fog:false,toneMapped:false}));backdrop.name='arrival-horizon';backdrop.position.y=230;backdrop.renderOrder=-50;backdrop.visible=!panorama;
  },setEnvironment(texture:THREE.Texture){
    if(disposed){texture.dispose();return;}
    textures.add(texture);texture.mapping=THREE.EquirectangularReflectionMapping;
    scene.environment=texture;scene.environmentIntensity=.5;
    if(backdrop)backdrop.visible=false;sky.visible=false;
    if(panorama)root.remove(panorama);
    // Aerial illustration framing leaves room for the sky in a tall viewport.
    // The complete panorama follows heading; pitch adjustment keeps the distant
    // horizon above the ground geometry rather than stretching buildings upward.
    const skyMap=texture.clone();skyMap.mapping=THREE.UVMapping;skyMap.wrapS=THREE.MirroredRepeatWrapping;skyMap.needsUpdate=true;textures.add(skyMap);
    const horizonMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,transparent:true,uniforms:{panorama:{value:skyMap},horizonPitch,opacity:{value:1}},vertexShader:`varying vec3 vWorld;
      void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 vWorld;uniform sampler2D panorama;uniform float horizonPitch;uniform float opacity;
      void main(){vec3 d=normalize(vWorld-cameraPosition);float u=atan(d.x,d.z)/6.2831853+.5;
      float v=.42+(atan(d.y,length(d.xz))+horizonPitch)*.62;
      gl_FragColor=vec4(texture2D(panorama,vec2(u*2.,clamp(v,.002,.998))).rgb,opacity);
      #include <colorspace_fragment>
      }`});materials.add(horizonMaterial);
    panorama=add(new THREE.SphereGeometry(2100,64,32),horizonMaterial);panorama.renderOrder=-100;
  },setCamera(camera:THREE.PerspectiveCamera){
    const d=camera.getWorldDirection(new THREE.Vector3());horizonPitch.value=-Math.atan2(d.y,Math.hypot(d.x,d.z));
  },setOpacity(value:number){
    for(const material of materials){if(material instanceof THREE.ShaderMaterial){material.uniforms.opacity.value=value;continue;}material.transparent=value<.999||material===lineMaterial;material.opacity=(material===lineMaterial?.45:1)*value;}
  },dispose(){if(disposed)return;disposed=true;backdropTexture?.dispose();reflection?.dispose();detail.value?.dispose();groundMaterial.map?.dispose();sun.shadow.dispose();instancedMeshes.forEach(mesh=>mesh.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(texture=>texture.dispose());root.clear();}};
}
