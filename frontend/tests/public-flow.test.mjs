import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('guest discovery and publication preview expose only consented fields', async () => {
  const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const originalFormData=globalThis.FormData;globalThis.FormData=dom.window.FormData;
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{};
  const React=await import('react');const {createRoot}=await import('react-dom/client');
  const {MemoryRouter,useNavigate}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');
  let user=null,navigate,publicationBody;
  const song={id:1,title:'原创样例',recording_label:'器乐',audio_url:null,audio_available:false,duration_ms:null,lyrics:[]};
  const card={id:88,owner_id:3,song_id:1,song,story:'愿意分享的原文。不公开的细节。',life_time:'不分享的人生阶段',life_year:2021,life_precision:'year',offset_ms:null,theme_id:'graduation',revision:1,reflections:[],tags:[],created_at:'2026-01-01',updated_at:'2026-01-01'};
  const story={id:1,song_id:1,song,excerpt:'毕业那天，我们唱到最后。',author_name:'匿名听友',life_time:null,life_year:null,offset_ms:null,lyric:null,is_demo_sample:true};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user});
    if(url==='/api/themes')return Response.json([{id:'graduation',title:'毕业那年',description:'那个夏天',prompt:'哪首歌陪你毕业？'}]);
    if(url.startsWith('/api/stories?'))return Response.json([story]);
    if(url==='/api/stories/search')return Response.json({items:[{story,evidence:story.excerpt,match_label:'经历语义相近'}],mode:'semantic',notice:''});
    if(url==='/api/memories/88')return Response.json(card);
    if(url==='/api/memories/88/publication'){publicationBody=JSON.parse(options.body);return Response.json(card);}
    throw new Error('Unexpected URL '+url);
  };
  function Controls(){navigate=useNavigate();return null;}
  const root=createRoot(document.getElementById('root'));
  const click=async(label)=>React.act(async()=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent===label);assert.ok(button,label);button.click();});
  const fill=async(id,text)=>React.act(async()=>{const el=document.getElementById(id);const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
  try{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/discover']},React.createElement(App),React.createElement(Controls))));
    assert.ok(document.body.textContent.includes(story.excerpt));
    assert.equal(document.querySelector('a[href="/stories/1"]')!==null,true);
    await fill('public-query','毕业的那晚');await click('找共鸣');
    assert.ok(document.body.textContent.includes('经历语义相近'));
    await React.act(async()=>navigate('/discover?song=2'));
    assert.ok(!document.body.textContent.includes('经历语义相近'), 'URL filter changes must clear previous results');
    await React.act(async()=>{user={id:3,display_name:'我的昵称',is_demo:false};window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change',newValue:'changed'}));});
    await React.act(async()=>navigate('/memories/88'));
    assert.equal(document.querySelector('#public-excerpt'),null);
    assert.ok(!document.body.textContent.includes('今天的我，想补一句'));
    await React.act(async()=>document.querySelector('.visibility-trigger').click());
    await React.act(async()=>document.querySelector('.visibility-options button:last-child').click());
    await fill('public-excerpt','愿意分享的原文。');
    const preview=document.querySelector('[aria-label="公开卡片预览"]');
    assert.ok(preview.textContent.includes('匿名听友'));
    assert.ok(!preview.textContent.includes('不公开的细节'));
    assert.ok(!preview.textContent.includes('不分享的人生阶段'));
    assert.ok(!preview.textContent.includes('2021'));
    assert.ok(preview.textContent.includes('毕业那年'),'preview discloses the theme that will receive this public story');
    const submit=[...document.querySelectorAll('button')].find(el=>el.textContent==='确认公开这张卡');
    assert.equal(submit.disabled,false);
    assert.equal(publicationBody,undefined,'opening and editing preview does not publish');
    await click('确认公开这张卡');
    assert.equal(publicationBody.excerpt,'愿意分享的原文。');
    assert.equal(publicationBody.share_life_time,false);assert.equal(publicationBody.anonymous,true);assert.equal(publicationBody.confirmed,true);
  }finally{
    await React.act(async()=>root.unmount());await server.close();globalThis.fetch=originalFetch;globalThis.FormData=originalFormData;dom.window.close();
  }
});
