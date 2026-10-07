import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('a rejected route import preserves navigation and offers reload and home recovery',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://insong.me'});
  const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,fetch:globalThis.fetch,ResizeObserver:globalThis.ResizeObserver};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{createMemoryRouter,RouterProvider}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',plugins:[{
    name:'rejected-route-import',enforce:'pre',
    transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/PublicPages.tsx'))return "throw new Error('simulated route download failure'); export const DiscoverPage=()=>null;";}
  }]});
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');
  globalThis.fetch=async(url)=>url==='/api/me'?Response.json({user:null}):Response.json([{id:1,title:'散场以后',artist:'Demo Artist',is_demo:true,audio_url:null,audio_available:false}]);
  const root=createRoot(document.getElementById('root'));
  const originalError=console.error;console.error=()=>{};
  try{
    const router=createMemoryRouter([{path:'*',element:React.createElement(App)}],{initialEntries:['/discover']});
    await React.act(async()=>root.render(React.createElement(RouterProvider,{router})));
    for(let attempt=0;attempt<100&&!document.body.textContent.includes('页面暂时未能打开')&&!document.body.textContent.includes('Unexpected Application Error');attempt++)await React.act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
    const reload=[...document.querySelectorAll('button')].find(button=>button.textContent==='重新加载页面');
    assert.ok(reload,'failed code download needs a reload action');
    assert.ok(document.querySelector('[aria-label="主导航"]'),'route failure must not remove app navigation');
    const home=[...document.querySelectorAll('a')].find(link=>link.textContent==='返回首页');assert.ok(home);
    await React.act(async()=>home.click());
    assert.ok(document.querySelector('[aria-label="从演示歌曲中选一首"]'));
  }finally{
    await React.act(async()=>root.unmount());await server.close();console.error=originalError;dom.window.close();Object.assign(globalThis,previous);
  }
});
