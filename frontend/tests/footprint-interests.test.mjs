import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('interests persist through the API, block duplicate writes and discard another account’s late results',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  const {useFootprintInterests}=await server.ssrLoadModule('/src/FootprintInterests.tsx');
  let user={id:3,display_name:'测试甲',is_demo:false},writes=0,finish;
  const previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user});
    if(url==='/api/footprints/interests')return Response.json({artist_ids:[],wish_event_ids:[]});
    if(url==='/api/footprints/follows/gem'){
      writes++;assert.deepEqual(JSON.parse(options.body),{followed:true});
      return new Promise(resolve=>{finish=()=>resolve(Response.json({artist_ids:['gem'],wish_event_ids:[]}));});
    }
    throw Error('Unexpected '+url);
  };
  function Probe(){const data=useFootprintInterests();return React.createElement('div',null,
    React.createElement('output',null,JSON.stringify(data.value)),React.createElement('button',{onClick:()=>data.toggleArtist('gem')},'关注'))}
  const root=createRoot(document.getElementById('root'));
  try{
    await React.act(async()=>root.render(React.createElement(SessionProvider,null,React.createElement(Probe))));
    const click=()=>document.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
    await React.act(async()=>{click();click();});assert.equal(writes,1);
    await React.act(async()=>{user={...user,id:4};window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change'}));});
    await React.act(async()=>finish());assert.equal(document.querySelector('output').textContent,'{"artist_ids":[],"wish_event_ids":[]}');
  }finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=previous;dom.window.close();}
});
