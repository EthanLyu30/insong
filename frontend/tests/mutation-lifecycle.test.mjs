import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('late save/delete responses cannot replace drafts after route or identity changes', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost:5173'});
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => {};
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MemoryRouter, useNavigate, useLocation } = await import('react-router');
  const server = await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const { default: App } = await server.ssrLoadModule('/src/App.tsx');
  let navigate, currentPath, finishSave, finishDelete;
  let user = {id:3,display_name:'测试',is_demo:false};
  const song = id => ({id,title:'测试音源',artist:'测试',version:'v1',is_demo:true,source_label:'测试',audio_available:false,audio_url:null,duration_ms:null,recording_label:'测试'});
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options={}) => {
    if (url === '/api/me') return Response.json({user});
    if (url === '/api/themes') return Response.json([]);
    if (/^\/api\/songs\/\d+$/.test(url)) return Response.json(song(Number(url.split('/').at(-1))));
    if (url === '/api/memories' && options.method === 'POST') return new Promise(resolve => {finishSave = () => resolve(Response.json({id:99}));});
    if (url === '/api/memories/88?revision=1' && options.method === 'DELETE') return new Promise(resolve => {finishDelete = () => resolve(new Response(null,{status:204}));});
    if (url === '/api/memories/88') return Response.json({id:88,owner_id:4,song_id:1,song:song(1),story:'待删除的虚构记忆',life_time:null,life_precision:'unknown',offset_ms:null,visibility:'private',is_demo_sample:false,revision:1,created_at:'2026-09-29T00:00:00Z',updated_at:'2026-09-29T00:00:00Z',reflections:[],tags:[]});
    if (url.startsWith('/api/memories')) return Response.json([]);
    throw new Error('Unexpected URL '+url);
  };
  function Controls() {navigate = useNavigate();currentPath = useLocation().pathname;return null;}
  const root = createRoot(document.getElementById('root'));
  const input = async text => React.act(async () => {
    const el = document.getElementById('memory-story');
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(el,text);
    el.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
  try {
    await React.act(async () => {root.render(React.createElement(MemoryRouter,{initialEntries:['/songs/1/write']},React.createElement(App),React.createElement(Controls)));});
    await input('第一张记忆');
    await React.act(async () => {document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
    assert.equal(typeof finishSave,'function');
    await React.act(async () => {navigate('/songs/2/write');});
    await input('刚写下的新草稿');
    await React.act(async () => {finishSave();});
    assert.equal(currentPath,'/songs/2/write');
    assert.equal(document.getElementById('memory-story').value,'刚写下的新草稿');
    // A response from the previous identity must also be inert on the same URL.
    await React.act(async () => {document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
    await React.act(async () => {
      user = {id:4,display_name:'另一个人',is_demo:false};
      window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change',newValue:'changed'}));
    });
    await input('另一个账号的草稿');
    await React.act(async () => {finishSave();});
    assert.equal(currentPath,'/songs/2/write');
    assert.equal(document.getElementById('memory-story').value,'另一个账号的草稿');
    await React.act(async () => {navigate('/memories/88');});
    const click = async label => React.act(async () => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent === label);
      assert.ok(button);button.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
    });
    await React.act(async () => {document.querySelector('.memory-more').open=true;});
    await click('删除记忆');await click('确认删除');
    assert.equal(typeof finishDelete,'function');
    await React.act(async () => {navigate('/songs/2/write');});
    await input('删除另一张卡时写下的新草稿');
    await React.act(async () => {finishDelete();});
    assert.equal(currentPath,'/songs/2/write');
    assert.equal(document.getElementById('memory-story').value,'删除另一张卡时写下的新草稿');
  } finally {
    await React.act(async () => {root.unmount();});
    await server.close();globalThis.fetch = originalFetch;dom.window.close();
  }
});
