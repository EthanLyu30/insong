import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

async function runEntry(initialPath,check){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react');
  const {createRoot}=await import('react-dom/client');
  const {MemoryRouter,useLocation,useNavigate}=await import('react-router');
  const {LaunchGate}=await import('../src/LaunchGate.ts');
  function Screen(){
    const location=useLocation(),navigate=useNavigate();
    return React.createElement('main',null,location.pathname==='/'?
      React.createElement('button',{id:'intro',onClick:()=>navigate('/discover')},'进入'):
      React.createElement('div',{id:'inside','data-path':location.pathname,'data-search':location.search},'应用内页面'));
  }
  const root=createRoot(document.getElementById('root'));
  try{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[initialPath]},React.createElement(LaunchGate,null,React.createElement(Screen)))));
    for(let attempt=0;attempt<10&&!document.querySelector('#intro,#inside');attempt++)await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
    await check(React);
  }finally{
    await React.act(async()=>root.unmount());
    globalThis.window=previous.window;globalThis.document=previous.document;globalThis.HTMLElement=previous.HTMLElement;
    dom.window.close();
  }
}

test('the root entry shows the intro and allows entering discovery',async()=>{
  await runEntry('/',async React=>{
    assert.ok(document.getElementById('intro'),document.body.innerHTML);
    await React.act(async()=>document.getElementById('intro').click());
    assert.equal(document.getElementById('inside')?.dataset.path,'/discover','normal in-app navigation must not reopen the intro');
  });
});

for(const path of ['/discover','/memories','/create','/footprints','/playlists']){
  test(`a fresh document preserves the requested ${path} page`,async()=>{
    await runEntry(path,async()=>assert.equal(document.getElementById('inside')?.dataset.path,path));
  });
}

test('a filtered deep link opens its requested content directly',async()=>{
  await runEntry('/discover?tag=散场',async()=>{
    assert.equal(document.getElementById('inside')?.dataset.path,'/discover');
    assert.equal(document.getElementById('inside')?.dataset.search,'?tag=散场');
  });
});
