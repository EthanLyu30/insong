import {test} from 'node:test';
import assert from 'node:assert/strict';

test('dragging never enters the concert and the geographic approach camera can rotate freely',async()=>{
  const {isSceneTap,orbitScene}=await import('../src/sceneInteraction.ts');
  assert.equal(isSceneTap([100,300],[103,304]),true);
  assert.equal(isSceneTap([100,300],[140,310]),false);
  // Once a drag crosses the threshold, returning to the start is still a drag.
  assert.equal(isSceneTap([100,300],[103,304],true),false);
  assert.equal(typeof orbitScene,'function');
  const turned=orbitScene({bearing:0,pitch:64,zoom:17.5},1200,0,'venue');
  assert.ok(Math.abs(turned.bearing)>=360,'the native map approach bearing is not restricted by portrait framing');
  assert.equal(orbitScene(turned,0,-10000,'venue').pitch,82);
  assert.equal(orbitScene(turned,0,10000,'venue').pitch,35);
  assert.equal(orbitScene({...turned,pitch:80},0,10000,'sky').pitch,65);
});

test('pinching changes the camera distance with bounded close and wide views',async()=>{
  const {pinchScene}=await import('../src/sceneInteraction.ts');
  assert.equal(typeof pinchScene,'function');
  assert.equal(pinchScene(18,100,200,'venue'),19);
  assert.equal(pinchScene(18,100,50,'venue'),17);
  assert.ok(pinchScene(19,1,10000,'sky')<=20.5);
  assert.ok(pinchScene(19,10000,1,'sky')>=18.8);
  assert.ok(Math.abs(pinchScene(11,100,101,'venue')-11)<.02,'an arrival pinch must not jump to a close venue view');
  assert.ok(Math.abs(pinchScene(11,100,101,'sky')-11)<.02,'an arrival pinch must not jump to a close concert view');
  const {orbitScene}=await import('../src/sceneInteraction.ts');
  assert.equal(orbitScene({bearing:0,pitch:36,zoom:11},10,0,'sky').pitch,36,'interrupting arrival does not jump the pitch');
});

test('two pointers reach the scene camera and never activate the venue entrance',async()=>{
  const {JSDOM}=await import('jsdom');const {createServer}=await import('vite');
  const dom=new JSDOM('<div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {CinematicStage}=await server.ssrLoadModule('/src/CinematicStage.tsx');const root=createRoot(document.getElementById('root'));
  const calls=[];let entries=0;const controller={current:{orbit:(...args)=>calls.push(['orbit',...args]),pinch:(...args)=>calls.push(['pinch',...args]),zoom:()=>{},home:()=>{}}};
  try{
    await React.act(async()=>root.render(React.createElement(CinematicStage,{scene:'venue',controller,venueName:'体育场',selected:null,onSong:()=>{},onEnter:()=>entries++})));
    const entrance=document.querySelector('.cinematic-enter');
    await React.act(async()=>{
      for(const [type,id,x] of [['pointerdown',1,100],['pointerdown',2,200],['pointermove',2,240],['pointerup',2,240],['pointerup',1,100]]){
        const event=new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:350,button:0});Object.defineProperty(event,'pointerId',{value:id});entrance.dispatchEvent(event);
      }
    });
    assert.deepEqual(calls,[['pinch',100,140]]);assert.equal(entries,0);
    await React.act(async()=>{
      for(const [type,x] of [['pointerdown',100],['pointermove',130],['pointerup',130]]){
        const event=new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:350,button:0});Object.defineProperty(event,'pointerId',{value:3});entrance.dispatchEvent(event);
      }
    });
    assert.deepEqual(calls[1],['orbit',30,0]);assert.equal(entries,0);
    assert.ok(!document.querySelector('.cinematic-orbit-hint'),'the retired orbit action is absent');
    const stage=document.querySelector('.cinematic-stage');
    assert.ok(!stage.getAttribute('aria-label').includes('360'));
    await React.act(async()=>{
      const down=new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:180,clientY:350,button:0});Object.defineProperty(down,'pointerId',{value:5});entrance.dispatchEvent(down);
      // Native pointer capture retargets pointer-up and its click to the stage.
      const up=new dom.window.MouseEvent('pointerup',{bubbles:true,clientX:180,clientY:350,button:0});Object.defineProperty(up,'pointerId',{value:5});stage.dispatchEvent(up);
      stage.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,detail:1}));
    });
    assert.equal(entries,1,'an ordinary entrance tap still opens the concert');
    assert.equal(calls.length,2,'a tap never starts an orbit or resets the camera');
  }finally{await React.act(async()=>root.unmount());await server.close();dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
