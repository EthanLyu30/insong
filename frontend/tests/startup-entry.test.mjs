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

test('opening a top-level app page starts with the intro, then stays inside after entering',async()=>{
  await runEntry('/discover',async React=>{
    assert.ok(document.getElementById('intro'),`first document load must show the launch page: ${document.body.innerHTML}`);
    await React.act(async()=>document.getElementById('intro').click());
    assert.equal(document.getElementById('inside')?.dataset.path,'/discover','normal in-app navigation must not reopen the intro');
  });
});

test('a fresh mount from another top-level page shows the intro again',async()=>{
  await runEntry('/memories',async()=>assert.ok(document.getElementById('intro'),document.body.innerHTML));
});

test('a filtered deep link opens its requested content directly',async()=>{
  await runEntry('/discover?tag=散场',async()=>{
    assert.equal(document.getElementById('inside')?.dataset.path,'/discover');
    assert.equal(document.getElementById('inside')?.dataset.search,'?tag=散场');
  });
});
