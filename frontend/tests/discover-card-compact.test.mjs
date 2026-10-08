import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('discovery cards show story titles instead of tags and hide the fallback notice', async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  window.scrollTo=()=>{};
  const React=await import('react');
  const {createRoot}=await import('react-dom/client');
  const {MemoryRouter,createMemoryRouter,RouterProvider}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {StoryEntry,DiscoverPage}=await server.ssrLoadModule('/src/PublicPages.tsx');
  const song={id:1,title:'演员',artist:'薛之谦',version:'原版',source_label:'歌曲',is_demo:false,audio_available:false,audio_url:null,duration_ms:null,recording_label:'原版',cover_url:'/cover.webp',lyrics:[]};
  const story={id:41,excerpt:'散场以后，终于把那句话说出口。',title:'演唱会散场后',tags:['散场','朋友'],photos:[],song_id:1,song,author_name:'阿远',life_time:null,life_year:null,offset_ms:null,end_ms:null,photo_id:null,photo_url:null,event_id:null,event_snapshot:null,music_selection:null,lyric:null,lyric_id:null,theme_id:null,is_demo_sample:true,published_at:'2026-10-08T00:00:00',views:0,is_mine:false};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(url==='/api/stories/search')return Response.json({items:[{story,evidence:story.excerpt,match_label:'公开原文或分享信息包含相近关键词'}],mode:'keyword',notice:'经历匹配暂时不可用，已按关键词查找公开原文。'});
    throw new Error('Unexpected URL '+url);
  };
  const root=createRoot(document.getElementById('root'));
  try{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(StoryEntry,{story}))));
    const card=document.querySelector('.story-card');
    assert.equal(card.querySelector('.story-card-title')?.textContent,'演唱会散场后','缩略卡显示故事标题');
    assert.equal(card.querySelector('.story-tags'),null,'缩略卡不显示 tag');
    assert.equal(card.querySelector('.story-song-line h3')?.textContent,'演员');
    assert.equal(card.querySelector('.story-song-line .story-artist')?.textContent,'薛之谦');
    assert.equal(card.querySelector('.story-card-author')?.textContent.trim(),'阿','作者只显示头像首字');
    assert.equal(card.querySelector('.story-card-author')?.getAttribute('aria-label'),'作者：阿远');

    const router=createMemoryRouter([{path:'/discover',element:React.createElement(DiscoverPage)}],{initialEntries:['/discover?q=第一次']});
    await React.act(async()=>root.render(React.createElement(RouterProvider,{router})));
    assert.ok(!document.body.textContent.includes('经历匹配暂时不可用，已按关键词查找公开原文。'));
    assert.ok(document.body.textContent.includes('1 张相关卡片'));
  }finally{
    await React.act(async()=>root.unmount());
    await server.close();
    globalThis.fetch=originalFetch;
    delete globalThis.ResizeObserver;
    dom.window.close();
  }
});
