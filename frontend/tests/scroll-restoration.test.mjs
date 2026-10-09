import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const source='/footprints?artist=liu-yuxin&city=shanghai&event=one&scene=sky';
const song={id:1,title:'REALITY',artist:'刘雨昕',is_demo:false,audio_available:false,audio_url:null,duration_ms:0,qq_music_url:null,cover_url:'/song.jpg'};
const story=id=>({id,song_id:1,song,title:'上海现场'+id,excerpt:'公开记忆'+id,author_name:'同担'+id,
  tags:[],photos:[],life_time:null,life_year:null,offset_ms:null,end_ms:null,lyric:null,lyric_id:null,
  theme_id:null,is_demo_sample:false,published_at:'2026-10-09T00:00:00Z',event_id:'one',is_mine:false});

async function harness(work){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const originals={fetch:globalThis.fetch,MutationObserver:globalThis.MutationObserver,ResizeObserver:globalThis.ResizeObserver,IntersectionObserver:globalThis.IntersectionObserver};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.MutationObserver=window.MutationObserver;
  window.HTMLMediaElement.prototype.pause=function(){};window.HTMLMediaElement.prototype.load=function(){};
  const resizeObservers=new Set(),intersectionObservers=new Set(),timers=new Map();let nextTimer=0;
  globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;resizeObservers.add(this);}observe(){}disconnect(){resizeObservers.delete(this);}};
  globalThis.IntersectionObserver=class {constructor(callback){this.callback=callback;intersectionObservers.add(this);}observe(target){this.target=target;}disconnect(){intersectionObservers.delete(this);}};
  window.setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;};
  window.clearTimeout=id=>timers.delete(id);
  let y=0,cardHeight=500;
  const height=()=>document.querySelector('[data-page="concert"]')?1000+document.querySelectorAll('.story-card').length*cardHeight:738;
  Object.defineProperty(window,'scrollY',{configurable:true,get:()=>y});
  Object.defineProperty(window,'innerHeight',{configurable:true,value:720});
  Object.defineProperty(document.documentElement,'scrollHeight',{configurable:true,get:height});
  // JSDOM has no layout. Model the browser's real clamping to a shorter route;
  // all navigation, API loading, card rendering and restoration code stay real.
  window.scrollTo=(_x,top)=>{y=Math.max(0,Math.min(top,height()-720));};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter,Routes,Route,useLocation}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {NavigationProvider}=await server.ssrLoadModule('/src/Navigation.tsx'),{SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx'),{EventRecords}=await server.ssrLoadModule('/src/EventRecords.tsx'),{StoryPage}=await server.ssrLoadModule('/src/PublicPages.tsx');
  let feedPages=1,delayNextPage=false,finishNextPage,current;
  globalThis.fetch=async url=>{
    if(url==='/api/me')return Response.json({user:{id:1,display_name:'我',is_demo:false}});
    if(String(url).startsWith('/api/memories?'))return Response.json([]);
    if(url==='/api/footprints/catalog')return Response.json({artists:[],events:[],cities:[]});
    if(String(url).startsWith('/api/public-feed?')){
      const cursor=new URL(url,'http://localhost').searchParams.get('cursor');
      const page={items:Array.from({length:12},(_,i)=>story((cursor?33:21)+i)),next_cursor:!cursor&&feedPages===2?'next':null};
      if(cursor&&delayNextPage)return new Promise(resolve=>{finishNextPage=()=>resolve(Response.json(page));});
      return Response.json(page);
    }
    if(/^\/api\/stories\/\d+$/.test(String(url)))return Response.json(story(Number(String(url).split('/').at(-1))));
    if(String(url).startsWith('/api/stories?'))return Response.json(String(url).includes('event_id=one')?[story(21),story(22),story(23)]:[]);
    throw Error('Unexpected request '+url);
  };
  function Pages(){
    const location=useLocation();current=location;
    React.useLayoutEffect(()=>{
      y=Math.min(y,Math.max(0,height()-720));
      // The browser can report this clamp before passive-effect cleanup.
      window.dispatchEvent(new window.Event('scroll'));
    },[location.key]);
    return React.createElement('div',{'data-page':location.pathname==='/footprints'?'concert':'story'},React.createElement(Routes,null,
      React.createElement(Route,{path:'/footprints',element:React.createElement(EventRecords,{eventId:'one',next:source})}),
      React.createElement(Route,{path:'/stories/:storyId',element:React.createElement(StoryPage)})));
  }
  const root=createRoot(document.getElementById('root')),act=React.act;
  const click=async selector=>act(async()=>document.querySelector(selector).click());
  const scroll=async top=>act(async()=>{window.scrollTo(0,top);window.dispatchEvent(new window.Event('scroll'));});
  const intersect=async()=>act(async()=>{for(const observer of [...intersectionObservers])observer.callback([{isIntersecting:true,target:observer.target}]);});
  try{
    await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[source]},React.createElement(NavigationProvider,null,React.createElement(SessionProvider,null,React.createElement(Pages))))));
    await work({act,click,scroll,intersect,y:()=>y,location:()=>current,
      twoPages:()=>{feedPages=2;},delayPage:()=>{delayNextPage=true;},finishPage:async()=>act(async()=>finishNextPage()),
      expireEarlyTimeout:()=>{for(const [id,timer] of [...timers])if(timer.delay<=2000){timers.delete(id);timer.callback();}},
      resize:async nextHeight=>act(async()=>{cardHeight=nextHeight;for(const observer of [...resizeObservers])observer.callback([]);}),
      shortImages:()=>{cardHeight=100;}});
  }finally{
    await act(async()=>root.unmount());await server.close();Object.assign(globalThis,originals);dom.window.close();
  }
}

// Catches saving the already-clamped new route's y during the old effect cleanup.
test('concert → public story → Back returns to the clicked-card position and preserves its query',async()=>harness(async({click,scroll,y,location})=>{
  await scroll(2800);
  await click('a[href="/stories/32"]');assert.equal(y(),0,'a new story starts at its top');
  await click('.back-link');
  assert.equal(location().pathname+location().search,source);
  assert.equal(y(),2800,'the old concert position must not be overwritten by the short loading page');
}));

// Catches the related-story shortcut discarding the actual concert-list origin.
test('concert → story → related stories → Back returns directly to the original concert position',async()=>harness(async({click,scroll,y,location})=>{
  await scroll(2800);
  await click('a[href="/stories/32"]');
  await click('.story-trail-link[href="/stories/21"]');
  await click('.story-trail-link[href="/stories/22"]');
  assert.equal(location().pathname,'/stories/22');
  assert.equal(document.querySelector('.back-link').getAttribute('href'),source,'the link itself keeps the original concert filters');
  await click('.back-link');
  assert.equal(location().pathname+location().search,source,'Back skips the intermediate story details, not the concert list');
  assert.equal(y(),2800,'the original clicked-card position is still restored');
}));

// Catches prematurely abandoning a position while real cursor pages are pending.
test('Back keeps restoring the old position when a previously loaded cursor page arrives later',async()=>harness(async({act,click,scroll,intersect,y,twoPages,delayPage,finishPage,expireEarlyTimeout})=>{
  // Enable a second cursor for a fresh visit without replacing the provider.
  twoPages();
  await click('a[href="/stories/32"]');await click('.back-link');
  await intersect();assert.equal(document.querySelectorAll('.story-card').length,24);
  await scroll(10000);await click('a[href="/stories/44"]');
  delayPage();await click('.back-link');await intersect();
  assert.equal(document.querySelectorAll('.story-card').length,12);
  await act(async()=>expireEarlyTimeout());
  await finishPage();
  assert.equal(document.querySelectorAll('.story-card').length,24);
  assert.equal(y(),10000,'restoration waits for enough content rather than resetting after two seconds');
}));

// Catches layout growth from images/fonts without a new child-list mutation.
test('Back completes restoration when image layout grows after the card DOM is already present',async()=>harness(async({click,scroll,resize,shortImages,y})=>{
  await scroll(4200);await click('a[href="/stories/32"]');shortImages();await click('.back-link');
  assert.equal(document.querySelectorAll('.story-card').length,12);
  await resize(500);
  assert.equal(y(),4200,'image resize alone must resume the saved scroll');
}));

test('a user scroll interrupts pending restoration instead of being pulled back after loading',async()=>harness(async({act,click,scroll,resize,shortImages,y})=>{
  await scroll(4200);await click('a[href="/stories/32"]');shortImages();await click('.back-link');
  await act(async()=>window.dispatchEvent(new window.WheelEvent('wheel',{deltaY:-100})));
  await scroll(80);await resize(500);
  assert.equal(y(),80,'user intent wins over the pending old position');
}));
