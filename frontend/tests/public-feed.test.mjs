import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const song={id:1,title:'真实歌曲',artist:'歌手',is_demo:false,audio_url:null,duration_ms:0,qq_music_url:null,cover_url:'/song.jpg'};
const story=id=>({id,excerpt:'公开文字'+id,song_id:1,song,author_name:'另一位听友',title:'这一晚'+id,tags:[],photos:[],life_time:null,life_year:null,offset_ms:null,lyric:null,lyric_id:null,theme_id:'concert',is_demo_sample:false,published_at:'2026-08-02T00:00:00Z',event_id:'one',is_mine:false,views:0});
const memory={id:11,owner_id:3,owner_display_name:'晚风小岚',song_id:1,song,story:'私密文字',title:'我的这一晚',photos:[],life_time:null,life_year:null,life_precision:'unknown',offset_ms:null,visibility:'private',is_demo_sample:false,revision:1,created_at:'2026-08-02T00:00:00Z',updated_at:'2026-08-02T00:00:00Z',reflections:[],tags:[],event_id:'one'};

async function harness(run){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};dom.window.HTMLMediaElement.prototype.pause=function(){};dom.window.HTMLMediaElement.prototype.load=function(){};
  const observers=new Set();
  globalThis.IntersectionObserver=class {constructor(callback){this.callback=callback;observers.add(this);}observe(target){this.target=target;}disconnect(){observers.delete(this);}};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter,Routes,Route}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {EventRecords}=await server.ssrLoadModule('/src/EventRecords.tsx'),{ThemePage}=await server.ssrLoadModule('/src/PublicPages.tsx'),{SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  const root=createRoot(document.getElementById('root')),originalFetch=globalThis.fetch;
  const render=async(path='/events/one',key=path)=>React.act(async()=>root.render(React.createElement(MemoryRouter,{key,initialEntries:[path]},React.createElement(SessionProvider,null,React.createElement(Routes,null,React.createElement(Route,{path:'/events/:id',element:React.createElement(EventRecords,{eventId:path.split('/').at(-1),next:path},React.createElement('div',null,'补充资料'))}),React.createElement(Route,{path:'/themes/:themeId',element:React.createElement(ThemePage)}))))));
  const intersect=async()=>React.act(async()=>{for(const observer of [...observers])observer.callback([{isIntersecting:true,target:observer.target}]);});
  try{await run({React,render,intersect});}finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=originalFetch;delete globalThis.IntersectionObserver;dom.window.close();}
}

// Catches resurrected empty private modules, client-only scope filtering,
// duplicate rows, missing error recovery and pretend infinite looping.
test('empty event prioritizes public feed, auto-appends unique real pages and ends after retry',async()=>harness(async({React,render,intersect})=>{
  let failures=0,feedRequests=0;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'我',is_demo:false}});
    if(String(url).startsWith('/api/memories?'))return Response.json([]);
    if(String(url).startsWith('/api/stories?'))return Response.json([story(21)]);
    if(String(url).startsWith('/api/public-feed?')){
      feedRequests++;const params=new URL(url,'http://localhost').searchParams;
      assert.equal(params.get('event_id'),'one');assert.equal(params.get('exclude_mine'),'true');
      if(!params.get('cursor'))return Response.json({items:[story(21),story(22)],next_cursor:'second'});
      assert.equal(params.get('cursor'),'second');
      if(!failures++)return Response.json({detail:'这页暂时加载失败'},{status:503});
      return Response.json({items:[story(22),story(23)],next_cursor:null});
    }
    throw Error('Unexpected '+url);
  };
  await render();
  assert.ok(!document.querySelector('.concert-my-memories'),'an empty My heading must not push actual content down');
  assert.equal(document.querySelector('.concert-write-link').getAttribute('href'),'/create?event=one');
  assert.ok(document.querySelector('.concert-write-link').classList.contains('primary-button'));
  const feed=document.querySelector('.concert-public-memories');
  assert.equal(feed.querySelector('h2').textContent,'这一场的瞬间');assert.ok(!feed.querySelector('.concert-section-heading small'));
  const supplement=document.querySelector('.concert-supplement');
  assert.ok(supplement.compareDocumentPosition(feed)&window.Node.DOCUMENT_POSITION_FOLLOWING,'folded event information precedes the public feed');
  assert.match(supplement.textContent,/补充资料/);
  assert.match(feed.textContent,/公开文字21/);
  await intersect();assert.match(feed.querySelector('[role="alert"]').textContent,/加载失败/);
  assert.match(feed.textContent,/公开文字21/,'failed continuation preserves already loaded content');
  await React.act(async()=>[...feed.querySelectorAll('button')].find(button=>button.textContent==='重试').click());
  assert.equal(feed.querySelectorAll('a[href="/stories/22"]').length,1,'cursor overlap never repeats a card');
  assert.equal(feed.querySelectorAll('a[href="/stories/23"]').length,1);
  assert.match(feed.textContent,/已经看完/);
  const requests=feedRequests;await intersect();await intersect();assert.equal(feedRequests,requests,'true exhaustion never cycles pages');
}));

test('record errors do not offer duplicate creation, existing records keep a single edit and older data',async()=>harness(async({render})=>{
  let error=true;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'我',is_demo:false}});
    if(String(url).startsWith('/api/memories?'))return error?Response.json({detail:'读取失败'},{status:503}):Response.json([memory,{...memory,id:12,story:'旧记录'}]);
    if(String(url).startsWith('/api/public-feed?'))return Response.json({items:[],next_cursor:null});
    if(String(url).startsWith('/api/stories?'))return Response.json([]);
    throw Error('Unexpected '+url);
  };
  await render();assert.match(document.querySelector('[role="alert"]').textContent,/读取失败/);
  assert.ok(!document.querySelector('.concert-write-link'));
  error=false;await render('/events/one','existing');
  assert.equal(document.querySelector('.concert-memory-edit').textContent,'编辑');
  assert.equal(document.querySelector('.concert-memory-edit').getAttribute('href'),'/memories/11/edit');
  assert.ok(document.querySelector('.concert-memory-edit').classList.contains('memory-edit-link'));
  assert.ok(!document.querySelector('.concert-memory-details'));
  assert.match(document.querySelector('.concert-older-memories').textContent,/旧记录/);
  assert.match(document.querySelector('.concert-my-memories .unified-story-card').textContent,/私密文字/);
  assert.match(document.querySelector('.concert-my-memories .story-byline').textContent,/晚风小岚/,'the approved author name survives the concert entry');
  const supplement=document.querySelector('.concert-supplement'),mine=document.querySelector('.concert-my-memories'),feed=document.querySelector('.concert-public-memories');
  assert.ok(supplement.compareDocumentPosition(mine)&window.Node.DOCUMENT_POSITION_FOLLOWING,'event information comes before private cards');
  assert.ok(mine.compareDocumentPosition(feed)&window.Node.DOCUMENT_POSITION_FOLLOWING,'private cards still come before public cards');
}));

test('identity failure can retry authentication before offering event creation or loading scoped public data',async()=>harness(async({React,render})=>{
  let identityCalls=0,feedCalls=0;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return ++identityCalls===1?Response.json({detail:'账号暂时无法确认'},{status:503}):Response.json({user:null});
    if(String(url).startsWith('/api/public-feed?')){feedCalls++;return Response.json({items:[],next_cursor:null});}
    throw Error('Unexpected '+url);
  };
  await render();
  assert.match(document.querySelector('.public-feed [role="alert"]').textContent,/账号暂时无法确认/);
  assert.ok(!document.querySelector('.concert-write-link'));assert.equal(feedCalls,0);
  await React.act(async()=>document.querySelector('.public-feed [role="alert"] button').click());
  assert.equal(identityCalls,2,'retry actually checks the identity instead of silently doing nothing');
  assert.equal(feedCalls,1);assert.ok(document.querySelector('.concert-write-link'));
}));

test('guest opens real public content and current theme cards immediately below its CTA',async()=>harness(async({render})=>{
  let privateRequests=0;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user:null});
    if(String(url).startsWith('/api/memories')){privateRequests++;return Response.json([]);}
    if(url==='/api/themes')return Response.json([{id:'concert',title:'跨城去见你',prompt:'哪一晚？'}]);
    if(String(url).startsWith('/api/public-feed?')){
      const params=new URL(url,'http://localhost').searchParams;
      if(params.get('theme_id')){assert.equal(params.get('theme_id'),'concert');assert.equal(params.get('sort'),'popular');}
      return Response.json({items:[story(21)],next_cursor:null});
    }
    if(String(url).startsWith('/api/stories?'))return Response.json([story(21)]);
    throw Error('Unexpected '+url);
  };
  await render();assert.equal(privateRequests,0);assert.ok(!document.querySelector('.concert-my-memories'));
  assert.equal(document.querySelector('.concert-write-link').getAttribute('href'),'/create?event=one');
  await render('/themes/concert');
  assert.equal(document.querySelector('.theme-page .primary-button').nextElementSibling.querySelector('a[href="/stories/21"]')!==null,true);
  assert.ok(!document.querySelector('.theme-page .list-heading'),'topic cards start immediately without redundant heading or count');
}));

test('event and account switches discard late public pages instead of exposing old scoped results',async()=>harness(async({React,render})=>{
  let user={id:3,display_name:'甲',is_demo:false},finishLate,oldSignal;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user});
    if(String(url).startsWith('/api/memories?'))return Response.json([]);
    if(String(url).startsWith('/api/public-feed?')){
      const event=new URL(url,'http://localhost').searchParams.get('event_id');
      if(event==='late'){oldSignal=options.signal;return new Promise(resolve=>{finishLate=()=>resolve(Response.json({items:[{...story(99),excerpt:'旧账号晚到内容'}],next_cursor:null}));});}
      return Response.json({items:[{...story(21),event_id:event}],next_cursor:null});
    }
    if(String(url).startsWith('/api/stories?'))return Response.json([]);
    throw Error('Unexpected '+url);
  };
  await render('/events/late');assert.equal(typeof finishLate,'function');
  user={id:4,display_name:'乙',is_demo:false};
  await React.act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change'})));
  await render('/events/two');
  await React.act(async()=>finishLate());
  assert.equal(oldSignal.aborted,true);assert.ok(!document.body.textContent.includes('旧账号晚到内容'));
  assert.match(document.querySelector('.concert-public-memories').textContent,/公开文字21/);
}));

test('expired popularity pages retry from a fresh scoped ranking instead of repeating a dead cursor',async()=>harness(async({React,render,intersect})=>{
  const cursors=[];
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user:null});
    if(url==='/api/themes')return Response.json([{id:'concert',title:'当前话题',prompt:'这一晚'}]);
    if(String(url).startsWith('/api/public-feed?')){
      const cursor=new URL(url,'http://localhost').searchParams.get('cursor');cursors.push(cursor);
      if(cursor)return Response.json({detail:'浏览已过期，请重新加载当前话题。'},{status:410});
      return Response.json({items:[story(cursors.length===1?21:23)],next_cursor:cursors.length===1?'old-ranking':null});
    }
    throw Error('Unexpected '+url);
  };
  await render('/themes/concert');await intersect();
  assert.match(document.querySelector('.public-feed [role="alert"]').textContent,/过期/);
  await React.act(async()=>document.querySelector('.public-feed [role="alert"] button').click());
  assert.deepEqual(cursors,[null,'old-ranking',null]);
  assert.ok(document.querySelector('a[href="/stories/23"]'));
  assert.ok(!document.querySelector('a[href="/stories/21"]'));
}));
