import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const song={id:8,title:'泡沫',artist:'邓紫棋',is_demo:false,audio_available:false,audio_url:null,duration_ms:null,version:'资料',source_label:'',recording_label:'资料',lyrics:[]};
const tracks=['泡沫','光年之外','再见'].map(title=>({title,artist:'邓紫棋',url:'https://y.qq.com/n/ryqq_v2/search?w='+encodeURIComponent('邓紫棋 '+title),platform:'QQ音乐',link_kind:'search'}));
const event={id:'night',artist_id:'gem',title:'邓紫棋巡回演唱会 · 深圳站',date:'2026-10-05',city:'深圳',venue:'场馆',setlist_kind:'artist_collection',setlist_note:'本场实际歌单待核实；以下为歌手关联作品。',songs:tracks};
const music={event_id:'night',mode:'tracks',tracks:tracks.slice(0,2),setlist_kind:'artist_collection',note:event.setlist_note};

async function harness(work){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};window.HTMLMediaElement.prototype.pause=function(){};window.HTMLMediaElement.prototype.load=function(){};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{createMemoryRouter,RouterProvider,useNavigate}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {CreationPage}=await server.ssrLoadModule('/src/CreationPage.tsx'),{SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx'),{StoryCard}=await server.ssrLoadModule('/src/StoryCard.tsx');
  const {SongSearchPage}=await server.ssrLoadModule('/src/SongPicker.tsx');
  let navigate,sent;
  function Probe(){navigate=useNavigate();return null;}
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'听友',is_demo:false}});
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-08',artists:[{id:'gem',name:'邓紫棋'}],events:[event],cities:[]});
    if(url==='/api/songs')return Response.json([song]);
    if(url==='/api/memories'&&options.method==='POST'){sent=JSON.parse(options.body);return Response.json({id:88,revision:1});}
    throw Error('Unexpected '+url);
  };
  const root=createRoot(document.getElementById('root'));
  const router=createMemoryRouter([{path:'/create',element:React.createElement(SessionProvider,null,React.createElement(CreationPage),React.createElement(Probe))},{path:'/song-search',element:React.createElement(SessionProvider,null,React.createElement(SongSearchPage),React.createElement(Probe))},{path:'/reading',element:React.createElement(StoryCard,{author:'听友',title:'这一晚',song,photos:[],text:'一起合唱',musicSelection:music})},{path:'/memories/88',element:React.createElement('p',null,'保存成功')}],{initialEntries:['/create?event=night']});
  const act=React.act;
  const click=async label=>act(async()=>{const button=[...document.querySelectorAll('button,input')].find(button=>button.textContent.trim()===label||button.getAttribute('aria-label')===label);assert.ok(button,`missing ${label}`);button.click();});
  const fill=async(element,value)=>act(async()=>{const setter=Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));});
  try{await act(async()=>root.render(React.createElement(RouterProvider,{router})));await work({act,click,fill,navigate:async path=>act(async()=>navigate(path)),sent:()=>sent});}
  finally{await act(async()=>root.unmount());await server.close();globalThis.fetch=previousFetch;dom.window.close();}
}

test('one concert composer chooses multiple tracks then posts one memory without a synthetic single-song requirement',async()=>{
  await harness(async({act,click,fill,sent})=>{
    await click('选择演出音乐');
    assert.match(document.querySelector('[aria-label="选择分享的音乐"]').textContent,/关联作品/);
    await click('选择泡沫');await click('选择光年之外');await click('完成音乐选择');
    await fill(document.getElementById('memory-story'),'一起听完整场。');
    await act(async()=>document.querySelector('.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(sent().music_selection,{mode:'tracks',track_titles:['泡沫','光年之外']});
    assert.equal(sent().event_id,'night');assert.equal(sent().song_id,undefined);assert.equal(sent().song_input,undefined);
  });
});

test('whole collection selection survives saving and restoring a draft',async()=>{
  await harness(async({click,navigate})=>{
    await click('选择演出音乐');await click('整份关联作品');await click('完成音乐选择');
    await click('存草稿');
    const key=Object.keys(window.localStorage).find(key=>key.startsWith('memory-draft:3:'));assert.ok(key);
    const draft=JSON.parse(window.localStorage.getItem(key));
    assert.equal(draft.concertMusic.mode,'playlist');assert.equal(draft.concertMusic.tracks.length,3);
    await navigate('/reading');await navigate('/create?event=night&draft='+draft._draftId);
    assert.match(document.querySelector('.composer-concert-music-trigger').textContent,/3 首/);
  });
});

test('card music keeps a single music area and exposes every real selected link without fake in-app playback',async()=>{
  await harness(async({click,navigate})=>{
    await navigate('/reading');
    assert.equal(document.querySelectorAll('.card-song-line').length,1);
    await click('查看分享的音乐');
    const links=[...document.querySelectorAll('.concert-music-track-list a')];
    assert.deepEqual(links.map(link=>link.textContent.trim()),['泡沫邓紫棋QQ 音乐查看 ↗','光年之外邓紫棋QQ 音乐查看 ↗']);
    assert.deepEqual(links.map(link=>link.href),tracks.slice(0,2).map(track=>track.url));
    assert.equal(document.querySelectorAll('audio').length,0);
  });
});

test('cancelling the ordinary song replacement preserves a whole concert music choice',async()=>{
  await harness(async({click})=>{
    await click('选择演出音乐');await click('整份关联作品');await click('完成音乐选择');
    await click('选择演出音乐');await click('选择其他歌曲');await click('返回填写记忆');
    assert.match(document.querySelector('.composer-concert-music-trigger').textContent,/整份关联作品 · 3 首/);
  });
});

test('confirming an ordinary replacement clears the prior concert choice only on confirmation',async()=>{
  await harness(async({click,fill,act,sent})=>{
    await click('选择演出音乐');await click('整份关联作品');await click('完成音乐选择');
    await click('选择演出音乐');await click('选择其他歌曲');await click('选用泡沫');
    await fill(document.getElementById('memory-story'),'换成这首歌，保留整场故事。');
    await act(async()=>document.querySelector('.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(sent().song_id,8);assert.equal(sent().music_selection,undefined);
  });
});
