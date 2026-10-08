import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('collecting a concert changes only heart/status, adds no metadata and the same control can remove it',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx'),{CollectConcert}=await server.ssrLoadModule('/src/ConcertPlaylist.tsx');
  const prior=globalThis.fetch;globalThis.fetch=async url=>{assert.equal(url,'/api/me');return Response.json({user:{id:3,display_name:'我',is_demo:false}});};
  let removes=0;
  const event={id:'event',songs:[{title:'歌',artist:'歌手'}]};
  function Probe(){const [saved,setSaved]=React.useState(null);return React.createElement(CollectConcert,{event,next:'/footprints?event=event',collection:{saved,checking:false,busy:false,refreshing:false,error:'',onCollect:()=>setSaved({id:7,event_id:'event',created_at:'2026-10-07',catalog_checked_on:'2026-10-01',update_available:true,current_version:'new',snapshot_version:'old'}),onRemove:()=>{removes++;setSaved(null);},onUpdate:()=>{throw Error('no update control belongs in this concert panel');}}});}
  const root=createRoot(document.getElementById('root'));
  try{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(SessionProvider,null,React.createElement(Probe)))));
    await React.act(async()=>document.querySelector('.collect-button').click());
    assert.equal(document.querySelector('.collect-button').textContent,'已收藏');
    assert.equal(document.querySelectorAll('.playlist-version-summary,.playlist-update-notice,.concert-collect a').length,0);
    assert.ok(!document.querySelector('.concert-collect').textContent.includes('取消'));
    await React.act(async()=>document.querySelector('.collect-button').click());
    assert.equal(removes,1);assert.equal(document.querySelector('.collect-button').textContent,'收藏为歌单');
  }finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=prior;dom.window.close();}
});
