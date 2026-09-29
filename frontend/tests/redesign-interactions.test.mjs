import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('intro advances outside fixed cards; flip starts a bounded player and closes it', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  let plays=0,pauses=0;
  window.HTMLMediaElement.prototype.play=function(){plays++;this.dispatchEvent(new window.Event('play'));return Promise.resolve();};
  window.HTMLMediaElement.prototype.pause=function(){pauses++;this.dispatchEvent(new window.Event('pause'));};
  const React=await import('react');const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {MemoryCollage}=await server.ssrLoadModule('/src/MemoryCollage.tsx');
  const {StoryEntry}=await server.ssrLoadModule('/src/PublicPages.tsx');
  const song={id:1,title:'测试配乐',artist:'测试歌手',audio_url:'/audio/test.wav',audio_available:true,duration_ms:48000,recording_label:'原创样例'};
  const story={id:1,song_id:1,song,excerpt:'散场之后，路灯还亮着。',author_name:'匿名听友',offset_ms:10000,end_ms:14000,photo_url:'/api/photos/custom'};
  const root=createRoot(document.getElementById('root'));let entered=0;
  try {
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(MemoryCollage,{songs:[song],intro:true,onEnter:()=>entered++}))));
    const transforms=[...document.querySelectorAll('.collage-card')].map(x=>x.style.transform);
    await React.act(async()=>document.querySelector('.collage-card').click());
    assert.equal(entered,0,'selecting a song does not advance the scene');
    const advance=document.querySelector('[aria-label="进入我的音乐故事"]');assert.ok(advance,'background transition is keyboard accessible');
    await React.act(async()=>advance.click());assert.equal(entered,1);
    assert.deepEqual([...document.querySelectorAll('.collage-card')].map(x=>x.style.transform),transforms);
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(StoryEntry,{story}))));
    assert.equal(document.querySelector('.story-cover img').getAttribute('src'),'/api/photos/custom','uploaded photo replaces the card cover');
    assert.equal(document.querySelector('audio'),null,'front does not play');
    await React.act(async()=>document.querySelector('[aria-label="翻开测试配乐的故事并播放"]').click());
    const audio=document.querySelector('audio');assert.ok(audio);assert.ok(plays>0,'flip attempts playback');
    await React.act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
    assert.equal(audio.currentTime,10);
    await React.act(async()=>{audio.currentTime=15;audio.dispatchEvent(new window.Event('timeupdate'));});
    assert.equal(audio.currentTime,14);assert.ok(pauses>0,'playback stops at interval end');
    await React.act(async()=>document.querySelector('[aria-label="收起测试配乐的故事"]').click());
    assert.equal(document.querySelector('audio'),null);
    // Without an explicit end, the automatic playback covers the whole song.
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(StoryEntry,{story:{...story,end_ms:null}}))));
    await React.act(async()=>document.querySelector('[aria-label="翻开测试配乐的故事并播放"]').click());
    const full=document.querySelector('audio');await React.act(async()=>full.dispatchEvent(new window.Event('loadedmetadata')));
    assert.equal(full.currentTime,0);
  } finally {await React.act(async()=>root.unmount());await server.close();dom.window.close();}
});

test('closing a photo upload clears the reflection busy state and permits a mood-only save', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.FileReader=class {readAsDataURL(){this.result='data:image/png;base64,eA==';this.onload();}};
  const React=await import('react');const {createRoot}=await import('react-dom/client');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {QuickReflection}=await server.ssrLoadModule('/src/QuickReflection.tsx');
  const originalFetch=globalThis.fetch;let submitted;
  globalThis.fetch=(url,options)=>{
    if(url==='/api/photos')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
    if(url==='/api/memories/8/reflections'){submitted=JSON.parse(options.body);return Promise.resolve(Response.json({}));}
    throw new Error('Unexpected '+url);
  };
  const root=createRoot(document.getElementById('root'));
  const click=async label=>React.act(async()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent===label);assert.ok(button,label);button.click();});
  try {
    await React.act(async()=>root.render(React.createElement(QuickReflection,{card:{id:8,revision:1,reflections:[]},onChange(){}})));
    await click('＋ 留个心情');
    await React.act(async()=>{const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new window.File(['x'],'photo.png',{type:'image/png'})]});input.dispatchEvent(new window.Event('change',{bubbles:true}));});
    await click('＋ 留个心情');await click('＋ 留个心情');await click('❀平静');
    const save=[...document.querySelectorAll('button')].find(x=>x.textContent==='贴进这一页');
    assert.equal(save.disabled,false,'cancelled upload must not keep the parent composer busy');
    await click('贴进这一页');assert.equal(submitted.mood,'peaceful');assert.equal(submitted.photo_id,null);
  } finally {await React.act(async()=>root.unmount());await server.close();globalThis.fetch=originalFetch;delete globalThis.FileReader;dom.window.close();}
});
