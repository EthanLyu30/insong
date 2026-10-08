import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {timelineGroups} from '../src/memoryClient.ts';
import {filterMemories,matchesMemoryTime} from '../src/memoryPresentation.ts';

const song={id:1,title:'散场以后',artist:'Demo Artist',is_demo:true,audio_available:false,audio_url:null,duration_ms:48000,recording_label:'原创器乐样例',lyrics:[]};
const card={id:88,owner_id:3,song_id:1,song,title:'把这一晚带回家',story:'一起听完现场。',life_time:'2026-10-05',life_year:2026,life_precision:'day',visibility:'private',is_demo_sample:false,revision:1,reflections:[],tags:['散场'],photos:[],created_at:'2026-10-05',updated_at:'2026-10-05',offset_ms:null,end_ms:null};

test('a valid full life date supplies its missing timeline year without inventing one for imprecise dates',()=>{
  const cards=[{...card,life_year:null},{...card,id:89,life_year:null,life_time:'2026-02-30'},{...card,id:90,life_year:null,life_time:'去年夏天'},{...card,id:91,life_year:2025,life_time:'毕业那年'}];
  assert.deepEqual(timelineGroups(cards).map(group=>({year:group.year,ids:group.cards.map(item=>item.id)})),[
    {year:2026,ids:[88]},{year:2025,ids:[91]},{year:null,ids:[89,90]},
  ]);
});

test('date-only memories participate in inclusive month filtering and year search',()=>{
  const range={startYear:'2026',startMonth:'10',endYear:'2026',endMonth:'10'};
  assert.equal(matchesMemoryTime({...card,life_year:null},range),true);
  assert.equal(matchesMemoryTime({...card,life_year:null,life_time:'2026-02-30'},range),false);
  assert.equal(matchesMemoryTime({...card,life_year:2026,life_time:'那年秋天'},{...range,startMonth:'',endMonth:''}),true);
  assert.deepEqual(filterMemories([{...card,life_time:'毕业那年',life_year:2025}],{query:'2025'}).map(item=>item.id),[88]);
});

test('the reading card keeps its author and nonredundant date in one header and can use a section heading',async()=>{
  await harness('/reading',{},async({modules,React,render})=>{
    await render(React.createElement(modules.StoryCard,{author:'听友',title:card.title,year:2026,time:'2026-10-05',song,photos:[],text:card.story,headingLevel:'h2'}));
    const header=document.querySelector('.story-card-header');assert.ok(header);
    assert.equal(header.querySelector('.story-byline strong').textContent,'听友');
    assert.equal(header.querySelector('.story-life').textContent,'2026-10-05');
    assert.equal(document.querySelector('.moment-title').tagName,'H2');
    await render(React.createElement(modules.StoryCard,{author:'听友',year:2025,time:'毕业那年',song,photos:[],text:card.story,title:'默认主标题'}));
    assert.equal(document.querySelector('.story-life').textContent,'2025 · 毕业那年');
    assert.equal(document.querySelector('.moment-title').tagName,'H1');
  });
});

test('private body and trailing tags open the same public discovery destination as public tags',async()=>{
  await harness('/reading',{},async({modules,React,render})=>{
    await render(React.createElement(modules.StoryBody,{text:'一起听完 #散场',tags:['散场','朋友'],scope:'mine'}));
    assert.deepEqual([...document.querySelectorAll('.story-tags a')].map(link=>link.getAttribute('href')),['/discover?tag=%E6%95%A3%E5%9C%BA','/discover?tag=%E6%9C%8B%E5%8F%8B']);
  });
});

test('My search leaves result counts and full-width timeline cards outside its input focus surface',async()=>{
  await harness('/memories',{memories:[card]},async({act})=>{
    await act(async()=>document.querySelector('.collection-search-trigger').click());
    const panel=document.querySelector('.collection-search-panel');
    assert.ok(panel.querySelector('input'));assert.ok(panel.querySelector('button'));
    assert.equal(panel.contains(document.querySelector('.collection-search-preview')),false);
    assert.equal(document.querySelector('.collection-search-surface').contains(document.querySelector('.collection-results')),false);
    assert.equal(document.querySelector('.snapshot-date').textContent,'2026-10-05');
  });
});

test('Chinese composition leaves My route, result cards and input identity stable until it ends',async()=>{
  await harness('/memories',{memories:[card,{...card,id:89,story:'旅行途中',title:'旅途'}]},async({act,fill,location})=>{
    await act(async()=>document.querySelector('.collection-search-trigger').click());
    const input=document.querySelector('[aria-label="搜索我的记忆"]');
    await act(async()=>input.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true,data:''})));
    await fill(input,'旅行');
    assert.equal(location().search,'');assert.equal(document.querySelectorAll('.collection-card').length,2);
    await act(async()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{bubbles:true,key:'Enter',isComposing:true,keyCode:229})));
    assert.equal(document.querySelector('[aria-label="搜索我的记忆"]'),input);assert.equal(input.value,'旅行');
    await act(async()=>input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'旅行'})));
    assert.equal(new URLSearchParams(location().search).get('q'),'旅行');
    assert.deepEqual([...document.querySelectorAll('.collection-card')].map(link=>link.getAttribute('href')),['/memories/89']);
    assert.equal(document.querySelector('[aria-label="搜索我的记忆"]'),input);
  });
});

test('My local search draft follows external query changes and does not overwrite Back during composition',async()=>{
  await harness('/memories?q=旧词',{memories:[card]},async({act,fill,go,location})=>{
    await act(async()=>document.querySelector('.collection-search-trigger').click());
    const input=document.querySelector('[aria-label="搜索我的记忆"]');
    await go('/memories?q=新词');assert.equal(input.value,'新词');
    await act(async()=>input.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true})));
    await fill(input,'旅行');
    await go(-1);
    await act(async()=>input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'旅行'})));
    assert.equal(new URLSearchParams(location().search).get('q'),'旧词');assert.equal(input.value,'旧词');
  });
});

for(const [query,mode] of [['周杰伦','keyword'],['#散场','keyword'],['毕业的那晚','semantic'],['第一次听完现场后，舍不得回家','semantic']])test(`Discover infers ${mode} matching for ${query}`,async()=>{
  let sent;
  await harness('/discover',{respond:async(url,options)=>{
    if(url==='/api/stories/search'){sent=JSON.parse(options.body);return Response.json({items:[],mode:sent.mode,notice:''});}
    throw new Error(url);
  }},async({act,fill})=>{
    await fill(document.getElementById('public-query'),query);
    await act(async()=>document.querySelector('.public-search').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(sent.mode,mode);
  });
});

test('Discover retains valid legacy deep-link modes while removing the manual toggle and tag banner',async()=>{
  let sent;
  await harness('/discover?q=散场&mode=semantic&tag=朋友',{respond:async(url,options)=>{
    if(url==='/api/stories/search'){sent=JSON.parse(options.body);return Response.json({items:[],mode:sent.mode,notice:''});}
    throw new Error(url);
  }},async()=>{
    assert.equal(sent.mode,'semantic');assert.equal(sent.tag,'朋友');
    assert.equal(document.querySelector('.public-search .segmented-control'),null);
    assert.equal(document.querySelector('.active-filter'),null);
    assert.equal(document.getElementById('public-query').getAttribute('autocomplete'),'off');
  });
});

test('Discover provides an input-anchored suggestion list that fills a usable search',async()=>{
  await harness('/discover',{},async({act})=>{
    const input=document.getElementById('public-query');
    await act(async()=>input.focus());
    const popup=document.querySelector('.public-search-suggestions');assert.ok(popup);
    assert.ok(input.closest('.public-search-field').contains(popup));
    const option=[...popup.querySelectorAll('button')].find(button=>button.textContent.includes('#散场'));assert.ok(option);
    await act(async()=>option.click());assert.equal(input.value,'#散场');
  });
});

test('typing a new public search replaces a previous tag instead of retaining an invisible restriction',async()=>{
  let sent;
  await harness('/discover?tag=朋友',{respond:async(url,options)=>{
    if(url==='/api/stories/search'){sent=JSON.parse(options.body);return Response.json({items:[],mode:sent.mode,notice:''});}
    throw Error(url);
  }},async({act,fill,location})=>{
    await fill(document.getElementById('public-query'),'周杰伦');
    await act(async()=>document.querySelector('.public-search').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(new URLSearchParams(location().search).get('tag'),null);
    assert.equal(sent.tag,undefined);assert.equal(sent.query,'周杰伦');
  });
});

async function harness(path,fixtures,work){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const priorFormData=globalThis.FormData;globalThis.FormData=dom.window.FormData;
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  window.HTMLMediaElement.prototype.play=async function(){};window.HTMLMediaElement.prototype.pause=function(){};window.HTMLMediaElement.prototype.load=function(){};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{createMemoryRouter,RouterProvider,useNavigate,useLocation}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const memory=await server.ssrLoadModule('/src/MemoryPages.tsx'),publicPages=await server.ssrLoadModule('/src/PublicPages.tsx'),story=await server.ssrLoadModule('/src/StoryCard.tsx'),content=await server.ssrLoadModule('/src/StoryContent.tsx'),session=await server.ssrLoadModule('/src/SessionContext.tsx');
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'我',is_demo:false}});
    if(url==='/api/memories')return Response.json(fixtures.memories??[card]);
    if(url==='/api/themes')return Response.json([]);
    if(url.startsWith('/api/stories?'))return Response.json([]);
    if(url==='/api/footprints/catalog')return Response.json({artists:[],events:[],cities:[]});
    return fixtures.respond?fixtures.respond(url,options):Promise.reject(new Error(url));
  };
  let current,navigate;function Probe(){current=useLocation();navigate=useNavigate();return null;}
  let reading=React.createElement('div');function Reading(){return reading;}
  const element=path.startsWith('/memories')?React.createElement(memory.MemoryCollection):path.startsWith('/discover')?React.createElement(publicPages.DiscoverPage):React.createElement(Reading);
  const router=createMemoryRouter([{path:'*',element:React.createElement(session.SessionProvider,null,element,React.createElement(Probe))}],{initialEntries:[path]});
  const root=createRoot(document.getElementById('root')),act=React.act;
  const fill=async(input,text)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  try{
    await act(async()=>root.render(React.createElement(RouterProvider,{router})));
    await work({act,React,fill,go:async to=>act(async()=>navigate(to)),location:()=>current,modules:{...story,...content},render:async next=>{reading=next;await act(async()=>root.render(React.createElement(RouterProvider,{router,key:Math.random()})));}});
  }finally{
    await act(async()=>root.unmount());await server.close();globalThis.fetch=priorFetch;globalThis.FormData=priorFormData;delete globalThis.ResizeObserver;dom.window.close();
  }
}
