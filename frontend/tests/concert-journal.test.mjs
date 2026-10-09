import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

// Catches private reads for guests, duplicate own publications, replacing the
// existing summary with a custom event card, and stale event/account responses.
test('concert journal directly shows the complete memory while preserving private/public records and edit routes',async()=>{
  const dom=new JSDOM('<div id="root"></div><div id="comparison"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};
  dom.window.HTMLMediaElement.prototype.pause=function(){};
  dom.window.HTMLMediaElement.prototype.load=function(){};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {FootprintsPage}=await server.ssrLoadModule('/src/FootprintsPage.tsx');
  const {StoryCard}=await server.ssrLoadModule('/src/StoryCard.tsx');
  const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  const {NavigationProvider}=await server.ssrLoadModule('/src/Navigation.tsx');
  let user={id:3,display_name:'真实昵称',is_demo:false},privateRequests=0,finishLate;
  const song={id:1,title:'真实歌曲',artist:'歌手',is_demo:false,audio_url:null,duration_ms:0,qq_music_url:'https://y.qq.com/n/ryqq/songDetail/real',cover_url:'/song.jpg'};
  const memory={id:11,owner_id:3,song_id:1,song,story:'只属于我的文字',title:'我的这一晚',photo_id:'a',photo_url:'/private-a.jpg',photos:[{id:'a',url:'/private-a.jpg'},{id:'b',url:'/private-b.jpg'}],life_time:'2026-08-01',life_year:2026,life_precision:'day',offset_ms:null,visibility:'private',is_demo_sample:false,revision:1,created_at:'2026-08-02T00:00:00Z',updated_at:'2026-08-02T00:00:00Z',reflections:[],tags:['演唱会'],event_id:'one',publication:null};
  const publicStory={id:21,excerpt:'公开文字',song_id:1,song,author_name:'另一位真实听友',title:'公开的这一晚',tags:['演唱会'],photos:[{id:'p',url:'/public.jpg'}],life_time:null,life_year:null,offset_ms:null,lyric:null,lyric_id:null,theme_id:null,is_demo_sample:false,published_at:'2026-08-02T00:00:00Z',event_id:'one',is_mine:false};
  const catalog={today:'2026-10-07',verified_on:'2026-10-01',artists:[{id:'singer',name:'歌手',aliases:[]}],cities:[{id:'shenzhen',name:'深圳',lng:114,lat:22}],events:['one','two','late'].map((id,index)=>({id,artist_id:'singer',title:'演出'+id,city:'深圳',venue:'真实场馆',date:index?'2026-09-01':'2026-08-01',source_url:'https://example.com/official',source_title:'已收录公告',setlist_kind:'artist_collection',songs:[]}))};
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user});
    if(url==='/api/footprints/catalog')return Response.json(catalog);
    if(url==='/api/playlists'||url==='/api/footprints')return Response.json([]);
    if(url==='/api/footprints/interests')return Response.json({artist_ids:[],wish_event_ids:[]});
    if(url==='/api/memories'){privateRequests++;return Response.json([memory]);}
    if(String(url).startsWith('/api/memories?event_id=')){
      privateRequests++;const eventId=new URL(url,'http://localhost').searchParams.get('event_id');
      if(eventId==='late')return new Promise(resolve=>{finishLate=()=>resolve(Response.json([{...memory,event_id:'late',story:'过时的私密内容'}]));});
      return Response.json(eventId==='one'?[memory]:[]);
    }
    if(String(url).startsWith('/api/public-feed?')){
      const eventId=new URL(url,'http://localhost').searchParams.get('event_id');
      return Response.json({items:[
        {...publicStory,event_id:eventId,is_mine:true,id:22,author_name:'我'},
        {...publicStory,event_id:eventId},
        ...Array.from({length:4},(_,i)=>({...publicStory,event_id:eventId,id:30+i,author_name:'听友'+i})),
      ],next_cursor:null});
    }
    throw Error('Unexpected request '+url+' '+options.method);
  };
  const root=createRoot(document.getElementById('root')),comparison=createRoot(document.getElementById('comparison'));
  const render=async(entry,key)=>React.act(async()=>root.render(React.createElement(MemoryRouter,{key,initialEntries:[entry]},React.createElement(NavigationProvider,null,React.createElement(SessionProvider,null,React.createElement(FootprintsPage))))));
  try{
    await render('/footprints?event=one&scene=sky','one');
    const mine=document.querySelector('.concert-my-memories');
    assert.ok(mine,'My and public memories must be directly visible, without switching a drawer tab');
    assert.match(mine.textContent,/只属于我的文字/,'the entire note must be readable on entering, without another card click');
    assert.equal(mine.querySelectorAll('.unified-story-card').length,1);
    assert.equal(mine.querySelector('.concert-memory-edit').getAttribute('href'),'/memories/11/edit');
    assert.ok(!mine.querySelector('.concert-memory-details'),'the concert exposes one existing edit action');
    assert.equal(mine.querySelector('.concert-memory-edit').textContent,'编辑');
    assert.equal(document.querySelector('.concert-public-memories .story-card-main').getAttribute('href'),'/stories/21');
    assert.ok(!document.querySelector('.concert-public-memories').textContent.includes('只属于我的文字'));
    assert.equal(document.querySelectorAll('.concert-public-memories .story-card').length,5,'all records in the real page remain browsable, excluding my own publication');
    assert.equal(document.querySelectorAll('.cinematic-stage,.atlas-song-star,.event-record-card').length,0,'no scene, floating titles or replacement memory cards');
    assert.equal(document.querySelectorAll('.concert-journal img[src="/private-a.jpg"]').length,1,'the summary image is not duplicated as a cover');
    await React.act(async()=>comparison.render(React.createElement(MemoryRouter,null,React.createElement(StoryCard,{author:'真实昵称',sample:false,title:memory.title,year:memory.life_year,time:memory.life_time,song,photos:memory.photos,text:memory.story,tags:memory.tags,scope:'mine',headingLevel:'h2'}))));
    assert.equal(mine.querySelector('.unified-story-card').outerHTML,document.querySelector('#comparison .unified-story-card').outerHTML,'reuse the existing full card/gallery/player rather than invent another notebook model');
    assert.equal(mine.querySelectorAll('.collection-card').length,0,'do not turn the event back into a song-summary list');
    assert.ok(!document.querySelector('.concert-my-memories [aria-label*="轮播"]'));
    assert.ok(!document.querySelector('.concert-public-more'),'true paging replaces expand/collapse of a fixed preview');
    assert.ok(!document.querySelector('.concert-write-link'),'an existing concert note offers edit/continuation rather than encouraging another per-song note');

    await render('/footprints?event=two','empty');
    assert.equal(document.querySelectorAll('.concert-my-memories .unified-story-card').length,0);
    assert.match(document.querySelector('.concert-my-memories').textContent,/还没有.*个人记忆/,'an empty private state is distinct from the public collection');
    assert.equal(document.querySelector('.concert-write-link').getAttribute('href'),'/create?event=two');
    assert.ok(document.querySelector('.concert-public-memories .story-card'),'non-attended performances still show public memories');
    assert.ok(document.querySelector('.concert-public-memories a[href="/stories/21"]'),'without My notes all public memories still use the existing music cards');
    assert.equal(document.querySelectorAll('.concert-public-memories .unified-story-card').length,0);

    await render('/footprints?event=late','late');
    await render('/footprints?event=two','switch');
    await React.act(async()=>finishLate());
    assert.ok(!document.body.textContent.includes('过时的私密内容'));
    user=null;const before=privateRequests;
    await render('/footprints?event=one','guest');
    assert.equal(privateRequests,before,'guests never request the private memory endpoint');
    assert.ok(!document.querySelector('.concert-my-memories'),'guests read public content directly');
    assert.equal(document.querySelector('.concert-write-link').getAttribute('href'),'/create?event=one');
    assert.ok(document.querySelector('.concert-public-memories .story-card'));
  }finally{
    await React.act(async()=>{root.unmount();comparison.unmount();});await server.close();globalThis.fetch=previousFetch;dom.window.close();
  }
});

// Catches treating collection/following as attendance, or making personal
// experiences a cosmetic filter over an unchanged public schedule.
test('My shows linked memories and explicit attendance, while All and artist deep links remain browsable',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {FootprintsPage}=await server.ssrLoadModule('/src/FootprintsPage.tsx');
  const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  const {NavigationProvider}=await server.ssrLoadModule('/src/Navigation.tsx');
  let user={id:3,display_name:'甲',is_demo:false},lateResolve;
  const catalog={today:'2026-10-07',artists:[{id:'gem',name:'邓紫棋',aliases:[]}],cities:[{id:'shenzhen',name:'深圳',lng:114,lat:22}],events:[
    {id:'memory',date:'2025-09-01',venue:'记忆场馆'},
    {id:'attended',date:'2025-09-03',venue:'到场场馆'},
    {id:'saved',date:'2026-10-01',venue:'只收藏场馆'},
  ].map(event=>({...event,city:'深圳',artist_id:'gem',title:'演唱会',source_url:'https://example.com',source_title:'公告',setlist_kind:'artist_collection',songs:[]}))};
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user});
    if(url==='/api/footprints/catalog')return Response.json(catalog);
    if(url==='/api/footprints')return Response.json(user.id===3?['attended']:[]);
    if(url==='/api/memories'){
      if(user.id===4)return new Promise(resolve=>{lateResolve=()=>resolve(Response.json([{id:11,event_id:'memory'}]));});
      return Response.json(user.id===3?[{id:11,event_id:'memory'}]:[]);
    }
    if(url==='/api/playlists')return Response.json([{id:4,event_id:'saved'}]);
    if(url==='/api/footprints/interests')return Response.json({artist_ids:['gem'],wish_event_ids:[]});
    throw Error('Unexpected '+url);
  };
  const root=createRoot(document.getElementById('root'));
  const render=async(entry,key)=>React.act(async()=>root.render(React.createElement(MemoryRouter,{key,initialEntries:[entry]},React.createElement(NavigationProvider,null,React.createElement(SessionProvider,null,React.createElement(FootprintsPage))))));
  const itinerary=()=>document.querySelector('.atlas-schedule-list').textContent;
  try{
    await render('/footprints?scope=mine','mine');
    assert.equal([...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='我的经历')?.getAttribute('aria-pressed'),'true');
    assert.match(itinerary(),/记忆场馆/);assert.match(itinerary(),/到场场馆/);
    assert.ok(!itinerary().includes('只收藏场馆'),'saved and followed events are not inferred as personal experiences');
    assert.equal(document.querySelector('.atlas-personal-evidence'),null,'the compact list does not add memory counts');
    await React.act(async()=>[...document.querySelectorAll('.atlas-schedule-filters button')].find(button=>button.textContent==='未来').click());
    await React.act(async()=>[...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='我的经历').click());
    assert.equal([...document.querySelectorAll('.atlas-schedule-filters button')].find(button=>button.textContent==='往期').getAttribute('aria-pressed'),'true','entering My experiences defaults to past memories even after browsing future public itineraries');
    assert.match(itinerary(),/记忆场馆/);
    const all=[...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='全部');
    await React.act(async()=>all.click());assert.match(itinerary(),/只收藏场馆/);
    await render('/footprints?artist=gem&month=all','artist');
    assert.match(itinerary(),/只收藏场馆/,'an unvisited interesting artist can still be browsed');
    user={...user,id:4};await render('/footprints?scope=mine','late');
    user={...user,id:5};await React.act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change'})));
    await React.act(async()=>lateResolve());
    assert.ok(!itinerary().includes('记忆场馆'),'late private reads must not leak into another account’s map');
    assert.match(document.querySelector('.atlas-itinerary').textContent,/还没有/);
  }finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=previousFetch;dom.window.close();}
});

test('personal map restores its list after returning data loads, and city read failures offer retry rather than no-events copy',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};window.HTMLMediaElement.prototype.pause=function(){};window.HTMLMediaElement.prototype.load=function(){};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {FootprintsPage}=await server.ssrLoadModule('/src/FootprintsPage.tsx'),{SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx'),{NavigationProvider}=await server.ssrLoadModule('/src/Navigation.tsx');
  const event={id:'mine',artist_id:'gem',title:'我的演出',city:'深圳',venue:'我的场馆',date:'2026-08-01',source_url:'https://example.com',source_title:'公告',setlist_kind:'artist_collection',songs:[]};
  const catalog={today:'2026-10-07',artists:[{id:'gem',name:'邓紫棋',aliases:[]}],cities:[{id:'shenzhen',name:'深圳',lng:114,lat:22}],events:[event]};
  let reads=0,finishReturn,failCity=false,restorations=[];
  const scrollTops=new WeakMap();
  Object.defineProperty(window.HTMLElement.prototype,'scrollTop',{configurable:true,get(){return scrollTops.get(this)??0;},set(top){scrollTops.set(this,top);if(this.classList.contains('atlas-schedule-list'))restorations.push({top,rows:this.querySelectorAll('.atlas-schedule-item').length});}});
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'我',is_demo:false}});
    if(url==='/api/footprints/catalog')return Response.json(catalog);
    if(url==='/api/footprints'||url==='/api/playlists'||String(url).startsWith('/api/stories?')||String(url).startsWith('/api/memories?'))return Response.json([]);
    if(url==='/api/footprints/interests')return Response.json({artist_ids:[],wish_event_ids:[]});
    if(url==='/api/memories'){
      if(failCity)return Response.json({detail:'经历服务暂时中断'},{status:503});
      if(++reads===2)return new Promise(resolve=>{finishReturn=()=>resolve(Response.json([{id:1,event_id:'mine'}]));});
      return Response.json([{id:1,event_id:'mine'}]);
    }
    throw Error('Unexpected '+url);
  };
  const root=createRoot(document.getElementById('root'));
  const render=async(entry,key)=>React.act(async()=>root.render(React.createElement(MemoryRouter,{key,initialEntries:[entry]},React.createElement(NavigationProvider,null,React.createElement(SessionProvider,null,React.createElement(FootprintsPage))))));
  try{
    await render('/footprints?scope=mine','scroll');
    await React.act(async()=>{const list=document.querySelector('.atlas-schedule-list');list.scrollTop=72;list.dispatchEvent(new window.Event('scroll',{bubbles:true}));});
    await React.act(async()=>document.querySelector('.atlas-schedule-row').click());
    restorations=[];
    await React.act(async()=>document.querySelector('[aria-label="返回上一页"]').click());
    await React.act(async()=>finishReturn());
    assert.deepEqual(restorations.at(-1),{top:72,rows:1},'scroll restoration must occur after personal rows, not against an empty loading list');
    failCity=true;
    await render('/footprints?scope=mine&city=shenzhen','city-error');
    const sheet=document.querySelector('.atlas-city-sheet');
    assert.match(sheet.textContent,/个人经历暂未读到/);
    assert.ok(!sheet.textContent.includes('暂无已核实场次'),'an unavailable personal read is not an empty catalog');
    const retry=[...sheet.querySelectorAll('button')].find(button=>button.textContent==='重试读取经历');assert.ok(retry);
    failCity=false;await React.act(async()=>retry.click());
    assert.match(sheet.textContent,/我的场馆/);
  }finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=previousFetch;dom.window.close();}
});
