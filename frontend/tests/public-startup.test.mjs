import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {loadApp} from './support/loadApp.mjs';

const song={id:1,title:'散场以后',artist:'Demo Artist',version:'原创',source_label:'样例',is_demo:true,audio_available:false,audio_url:null,duration_ms:null,recording_label:'器乐'};
const story={id:1,song_id:1,song,excerpt:'公开的散场故事',author_name:'听友',life_time:null,life_year:null,offset_ms:null,lyric:null,is_demo_sample:true,tags:[]};

async function withStartup(path,check,{atomicIdentity=false,holdSongs=false}={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,fetch:globalThis.fetch,ResizeObserver:globalThis.ResizeObserver};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const {createMemoryRouter,RouterProvider}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',plugins:atomicIdentity?[{
    name:'confirmed-session-test-provider',enforce:'pre',
    transform(code,id){
      if(!id.replaceAll('\\','/').endsWith('/src/SessionContext.tsx'))return;
      return code.replace(/export function SessionProvider[\s\S]*?\nexport function AccountControl/,`
export let setStartupIdentity;
export function SessionProvider({children}) {
  const [user,setUser]=useState({id:3,display_name:'甲',is_demo:false});
  setStartupIdentity=setUser;
  return <Context.Provider value={{user,loading:false,error:'',refresh:async()=>{},logout:async()=>{},demo:async()=>{}}}>{children}</Context.Provider>;
}
export function AccountControl`);
    }
  }]:[]});
  const {default:App}=await loadApp(server);
  const sessionModule=await server.ssrLoadModule('/src/SessionContext.tsx');
  const {useSession}=sessionModule;
  const calls=[];const pending=[];const pendingSongs=[];const crossIdentityReads=[];let serverIdentity=atomicIdentity?3:null;
  globalThis.fetch=async(url)=>{
    calls.push(url);
    if(url==='/api/me')return new Promise(resolve=>pending.push(resolve));
    if(url==='/api/songs')return holdSongs?new Promise(resolve=>pendingSongs.push(resolve)):Response.json([song]);
    if(url==='/api/songs/1')return Response.json({...song,lyrics:[]});
    if(url==='/api/themes')return Response.json([]);
    if(url.startsWith('/api/stories?'))return Response.json([story]);
    if(url==='/api/footprints/catalog')return Response.json({artists:[],events:[],cities:[],today:'2026-10-07'});
    if(url==='/api/memories')return Response.json([]);
    if(url==='/api/memories?song_id=1'){
      const owner=serverIdentity;
      const memory={id:owner,owner_id:owner,song_id:1,song,story:'私人正文',created_at:'2026-10-01',life_year:null,life_time:null,tags:[],photos:[],reflections:[],is_demo_sample:false};
      Object.defineProperty(memory,'title',{get(){
        const reader=useSession().user?.id;
        if(reader!==owner)crossIdentityReads.push({owner,reader});
        return `账号${owner}的私密标题`;
      }});
      return {ok:true,status:200,json:async()=>[memory]};
    }
    throw new Error('Unexpected startup request '+url);
  };
  const root=createRoot(document.getElementById('root'));
  const reply=(user,error=false)=>{assert.ok(pending.length);serverIdentity=user?.id??null;pending.shift()(Response.json(error?{detail:'暂时未连接'}:{user},{status:error?503:200}));};
  const settle=async(user,error=false)=>React.act(async()=>reply(user,error));
  const atomicSwitch=async user=>React.act(async()=>{serverIdentity=user.id;sessionModule.setStartupIdentity(user);});
  const settleSongs=async songs=>React.act(async()=>{assert.ok(pendingSongs.length);pendingSongs.shift()(Response.json(songs));});
  try{
    const router=createMemoryRouter([{path:'*',element:React.createElement(App)}],{initialEntries:[path]});
    await React.act(async()=>root.render(React.createElement(RouterProvider,{router})));
    await check({React,calls,settle,settleSongs,atomicSwitch,crossIdentityReads});
  }finally{
    await React.act(async()=>{for(const resolve of pending.splice(0))resolve(Response.json({user:null}));for(const resolve of pendingSongs.splice(0))resolve(Response.json([song]));});
    await React.act(async()=>root.unmount());await server.close();dom.window.close();
    Object.assign(globalThis,previous);
  }
}

test('discovery renders while identity is pending and keeps its first public fetch after initial sign-in confirmation',async()=>{
  await withStartup('/discover',async({calls,settle})=>{
    assert.ok(document.body.textContent.includes(story.excerpt),'public stories must not wait for /api/me');
    assert.equal(calls.filter(url=>url.startsWith('/api/stories?')).length,1);
    await settle({id:3,display_name:'甲',is_demo:false});
    assert.equal(calls.filter(url=>url.startsWith('/api/stories?')).length,1,'first identity confirmation must not cancel and restart public data');
  });
});

test('home starts loading songs alongside the identity check',async()=>{
  await withStartup('/',async({calls})=>{
    assert.ok(calls.includes('/api/songs'),'song loading starts before identity completes');
    assert.ok(document.querySelector('[aria-label="从演示歌曲中选一首"]'));
  });
});

test('the intro displays five public samples before either API responds and adopts confirmed song metadata',async()=>{
  await withStartup('/',async({calls,settleSongs})=>{
    assert.ok(calls.includes('/api/songs'));
    assert.equal(document.querySelectorAll('.collage-card').length,5);
    assert.ok(document.body.textContent.includes('下一站再见'));
    await settleSongs([{...song,title:'后台核对后的样例标题'}]);
    assert.ok(document.body.textContent.includes('后台核对后的样例标题'));
    assert.equal(document.body.textContent.includes('下一站再见'),false,'successful server metadata replaces the bootstrap');
  },{holdSongs:true});
});

test('public discovery remains usable when identity checking fails',async()=>{
  await withStartup('/discover',async({settle})=>{
    await settle(null,true);
    assert.ok(document.body.textContent.includes(story.excerpt));
    assert.ok(document.querySelector('#public-query'));
    assert.ok(document.body.textContent.includes('暂时未连接'));
  });
});

for(const path of ['/memories','/create']){
  test(`${path} waits for confirmed identity before mounting private content`,async()=>{
    await withStartup(path,async({calls,settle})=>{
      assert.ok(document.body.textContent.includes('正在打开你的空间'));
      assert.equal(calls.some(url=>url.startsWith('/api/memories')),false);
      assert.equal(document.querySelector('textarea'),null);
      await settle({id:3,display_name:'甲',is_demo:false});
      assert.ok(document.querySelector('h1'));
    });
  });
}

test('switching a confirmed identity refreshes personalized public data',async()=>{
  await withStartup('/discover',async({React,calls,settle})=>{
    await settle({id:3,display_name:'甲',is_demo:false});
    const before=calls.filter(url=>url.startsWith('/api/stories?')).length;
    await React.act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change',newValue:'changed'})));
    await settle({id:4,display_name:'乙',is_demo:false});
    assert.equal(calls.filter(url=>url.startsWith('/api/stories?')).length,before+1);
    assert.ok(document.body.textContent.includes('乙'));
  });
});

test('refreshing a known session revalidates public publication data even for the same identity',async()=>{
  await withStartup('/discover',async({React,calls,settle})=>{
    const user={id:3,display_name:'甲',is_demo:false};
    await settle(user);
    const before=calls.filter(url=>url.startsWith('/api/stories?')).length;
    await React.act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change',newValue:'renewed'})));
    await settle(user);
    assert.equal(calls.filter(url=>url.startsWith('/api/stories?')).length,before+1,'a known-session refresh must not retain stale publication flags');
  });
});

test('a known-session refresh unmounts cached personalized route content until identity is confirmed',async()=>{
  await withStartup('/discover',async({React,settle})=>{
    await settle({id:3,display_name:'甲',is_demo:false});
    await React.act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change',newValue:'pending'})));
    assert.ok(document.querySelector('.main-content').textContent.includes('正在打开你的空间'));
    assert.equal(document.querySelector('.main-content').textContent.includes(story.excerpt),false);
    await settle({id:4,display_name:'乙',is_demo:false});
    assert.ok(document.body.textContent.includes(story.excerpt));
  });
});

test('an atomic confirmed-identity change never renders a cached private song card under the next account',async()=>{
  await withStartup('/songs/1?view=mine',async({atomicSwitch,crossIdentityReads})=>{
    assert.ok(document.body.textContent.includes('账号3的私密标题'));
    await atomicSwitch({id:4,display_name:'乙',is_demo:false});
    assert.deepEqual(crossIdentityReads,[],'cached private content cannot be read in the next identity render');
    assert.ok(document.body.textContent.includes('账号4的私密标题'));
  },{atomicIdentity:true});
});
