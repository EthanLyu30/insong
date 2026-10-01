import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const song={id:1,title:'散场以后',artist:'Demo Artist',is_demo:true,audio_available:true,audio_url:'/api/audio/song-1-v1.wav',duration_ms:48000,recording_label:'原创器乐样例',lyrics:[]};
const photos=[{id:'a',url:'/api/photos/a'},{id:'b',url:'/api/photos/b'}];
const card={id:88,owner_id:3,song_id:1,song,title:'把这一晚带回家',story:'第一行。\n最后一行也必须完整。',life_time:'散场的晚上',life_year:2025,revision:1,reflections:[],tags:['演唱会','散场'],photos,photo_id:'a',photo_url:'/api/photos/a',created_at:'2026-01-01',updated_at:'2026-01-01',offset_ms:10000,end_ms:14000};

async function harness(path,respond,work){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{};
  window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  window.HTMLMediaElement.prototype.play=async function(){this.dispatchEvent(new window.Event('play'));};
  window.HTMLMediaElement.prototype.pause=function(){this.dispatchEvent(new window.Event('pause'));};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');const prior=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'我',is_demo:false}});
    if(url==='/api/themes')return Response.json([]);
    if(url==='/api/songs/1')return Response.json(song);
    if(url==='/api/memories/88'&&!options.method)return Response.json(card);
    if(url==='/api/memories')return Response.json([card]);
    if(url.startsWith('/api/stories?'))return Response.json([]);
    return respond(url,options);
  };
  const root=createRoot(document.getElementById('root'));
  const act=React.act;
  const fill=async(id,text)=>act(async()=>{const input=document.getElementById(id);assert.ok(input,`missing ${id}`);const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  try{await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(App))));await work({act,fill});}
  finally{await act(async()=>root.unmount());await server.close();globalThis.fetch=prior;dom.window.close();}
}

test('gallery cover, title and tags remain editable and are sent together',async()=>{
  let sent;
  await harness('/memories/88/edit',async(url,options)=>{if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    await fill('memory-title','第一次跨城，值得了');
    await fill('memory-tags','#跨城追星，演唱会');
    const cover=document.querySelector('[aria-label="将第2张照片设为封面"]');assert.ok(cover);
    await act(async()=>cover.click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.title,'第一次跨城，值得了');assert.deepEqual(sent.tags,['跨城追星','演唱会']);assert.deepEqual(sent.photo_ids,['a','b']);assert.equal(sent.photo_id,'b');
});

test('publication preview discloses complete gallery, title and tags without sharing private time',async()=>{
  await harness('/memories/88',async url=>{throw new Error(url);},async({act})=>{
    await act(async()=>document.querySelector('.visibility-trigger').click());
    await act(async()=>document.querySelector('.visibility-options button:last-child').click());
    const preview=document.querySelector('[aria-label="公开卡片预览"]');
    assert.ok(preview.textContent.includes(card.title));assert.ok(preview.textContent.includes('#演唱会'));assert.equal(preview.querySelectorAll('img').length,2);
    assert.ok(!preview.textContent.includes('2025'));assert.ok(!preview.textContent.includes(card.life_time));
  });
});

test('timeline removes private recall search and places complete date above memory text',async()=>{
  await harness('/memories',async url=>{throw new Error(url);},async()=>{
    assert.equal(document.querySelector('#memory-query'),null);
    const entry=document.querySelector('.memory-entry');assert.ok(entry);
    assert.ok(entry.querySelector('.snapshot-date').textContent.includes('2025'));
    assert.ok(entry.textContent.includes('最后一行也必须完整。'));
  });
});

test('large music player and song cards entrance are available on the regular song route',async()=>{
  await harness('/songs/1?at=10000&end=14000',async url=>{throw new Error(url);},async({act})=>{
    const play=document.querySelector('[aria-label="播放散场以后"]');assert.ok(play);
    const audio=document.querySelector('audio');await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
    await act(async()=>play.click());assert.equal(audio.currentTime,10);
    assert.ok(document.querySelector('[aria-label="播放进度"]'));
    assert.ok(document.querySelector('a[href="/discover?song=1"]'));
  });
});

test('marking a new listening position preserves loaded player controls',async()=>{
  await harness('/songs/1',async url=>{throw new Error(url);},async({act})=>{
    const audio=document.querySelector('audio');
    await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
    audio.currentTime=12;
    await act(async()=>audio.dispatchEvent(new window.Event('timeupdate')));
    await act(async()=>document.querySelector('.player-actions button').click());
    assert.equal(document.querySelector('[aria-label="播放进度"]').disabled,false);
    assert.equal(document.querySelector('[aria-label="播放散场以后"]').disabled,false);
    await act(async()=>document.querySelector('[aria-label="播放散场以后"]').click());
    assert.equal(audio.currentTime,12);
  });
});

test('artist search preserves the visible tag constraint',async()=>{
  let sent;
  await harness('/discover?tag=散场',async(url,options)=>{
    if(url==='/api/stories/search'){sent=JSON.parse(options.body);return Response.json({mode:'keyword',items:[]});}throw new Error(url);
  },async({act,fill})=>{
    await fill('public-query','周杰伦');
    await act(async()=>document.querySelector('form.public-search').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.tag,'散场');assert.equal(sent.query,'周杰伦');
});

test('discovery connects current catalog concerts and excludes cancelled dates',async()=>{
  await harness('/discover',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-01',artists:[{id:'gem',name:'邓紫棋'}],events:[{id:'cancelled',artist_id:'gem',city:'北京',venue:'五棵松体育馆',date:'2026-10-02',event_status:'cancelled'},{id:'shenzhen',artist_id:'gem',city:'深圳',venue:'深圳大运中心体育场',date:'2026-10-01',event_status:'scheduled'}]});
    throw new Error(url);
  },async()=>{
    const links=[...document.querySelectorAll('.recent-concerts a')];assert.equal(links.length,1);
    assert.ok(links[0].textContent.includes('邓紫棋'));assert.ok(links[0].textContent.includes('10.01'));assert.ok(links[0].href.includes('event=shenzhen'));
  });
});
