import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

async function withComponents(run){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {EventNote}=await server.ssrLoadModule('/src/EventNote.tsx');
  const {MemoryExitDialog}=await server.ssrLoadModule('/src/MemoryExitGuard.tsx');
  const root=createRoot(document.getElementById('root'));
  try{await run({React,root,MemoryRouter,EventNote,MemoryExitDialog,dom});}
  finally{await React.act(async()=>root.unmount());await server.close();dom.window.close();}
}

test('composer presents artist, concert with an intact station, and full date with venue without rewriting its snapshot',async()=>{
  await withComponents(async({React,root,MemoryRouter,EventNote})=>{
    const cases=[
      ['邓紫棋I AM GLORIA世界巡回演唱会 · 上海站','邓紫棋','上海','I AM GLORIA世界巡回演唱会 · 上海站'],
      ['邓紫棋 I AM GLORIA世界巡回演唱会 · 上海站','邓紫棋','上海','I AM GLORIA世界巡回演唱会 · 上海站'],
      ['邓紫棋2025巡回演唱会 · 上海站','邓紫棋','上海','2025巡回演唱会 · 上海站'],
      ['凤凰传奇「吉祥如意」2026巡回演唱会 · 上海站','凤凰传奇','上海','「吉祥如意」2026巡回演唱会 · 上海站'],
      ['I AM GLORIA世界巡回演唱会 · 上海站 · 上海','邓紫棋','上海','I AM GLORIA世界巡回演唱会 · 上海站'],
      ['世界巡回演唱会','邓紫棋','上海','世界巡回演唱会 · 上海站'],
      ['邓紫棋迹音乐节','邓紫棋','上海','邓紫棋迹音乐节 · 上海站'],
    ];
    for(const [title,artist,city,concert] of cases){
      const snapshot=Object.freeze({id:'show',title,artist,city,date:'2024-05-28',venue:'上海体育馆'});
      await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement('div',{className:'composer-event-context'},React.createElement(EventNote,{id:'show',label:'关联现场',linked:false,snapshot})))));
      const lines=[...document.querySelector('.event-note > div').children].map(element=>element.textContent);
      assert.deepEqual(lines,['关联现场',artist,concert,'2024-05-28 上海体育馆']);
      assert.equal(document.querySelector('.event-note-station').textContent,' · 上海站','the city/station is one wrappable unit');
      assert.equal(document.querySelector('.event-note a'),null);
      assert.equal(snapshot.title,title,'formatting must never alter stored event data');
    }
  });
});

test('linked snapshot cards show distinct concert lines and open the footprint from the whole block',async()=>{
  await withComponents(async({React,root,MemoryRouter,EventNote})=>{
    const snapshot=Object.freeze({id:'show',title:'邓紫棋 I AM GLORIA世界巡回演唱会 · 上海站 · 上海',artist:'邓紫棋',city:'上海',date:'2024-05-28',venue:'上海体育馆'});
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(EventNote,{id:'show',snapshot}))));
    const link=document.querySelector('a.event-note');
    assert.equal(link.getAttribute('href'),'/footprints?event=show');
    assert.deepEqual([...link.querySelector('div').children].map(element=>element.textContent),['现场足迹','邓紫棋','I AM GLORIA世界巡回演唱会 · 上海站','2024-05-28 上海体育馆']);
    assert.equal(link.querySelector('.event-note-station').textContent,' · 上海站');
    assert.ok(!link.textContent.includes('足迹 ↗'),'there is no second arrow label');
    assert.equal(snapshot.title,'邓紫棋 I AM GLORIA世界巡回演唱会 · 上海站 · 上海');
  });
});

test('year-prefixed catalog title keeps its year and tour while showing the artist only once',async()=>{
  await withComponents(async({React,root,MemoryRouter,EventNote})=>{
    const snapshot=Object.freeze({id:'liu-yuxin-beijing-20250920',title:'2025刘雨昕仙那度2.0演唱会 · 北京站',artist:'刘雨昕',city:'北京',date:'2025-09-20',venue:'华熙LIVE·五棵松'});
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(EventNote,{id:snapshot.id,snapshot}))));
    const note=document.querySelector('a.event-note');
    assert.equal(note.getAttribute('href'),'/footprints?event=liu-yuxin-beijing-20250920');
    assert.deepEqual([...note.querySelector('div').children].map(element=>element.textContent),['现场足迹','刘雨昕','2025仙那度2.0演唱会 · 北京站','2025-09-20 华熙LIVE·五棵松']);
    assert.equal(snapshot.title,'2025刘雨昕仙那度2.0演唱会 · 北京站','display formatting must not rewrite the saved title');
  });
});

test('unavailable linked event keeps its retry and footprint route without invented event details',async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({detail:'目录暂时无法读取'},{status:503});
  try{await withComponents(async({React,root,MemoryRouter,EventNote})=>{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(EventNote,{id:'unavailable'}))));
    const note=document.querySelector('.event-note');
    assert.equal(note.querySelector('small').textContent,'现场足迹');
    assert.match(note.querySelector('[role="alert"]').textContent,/暂时无法加载/);
    assert.equal(note.querySelector('a[aria-label="查看现场足迹"]').getAttribute('href'),'/footprints?event=unavailable');
    assert.equal(note.querySelector('button').getAttribute('aria-label'),'重新加载场次信息');
    assert.ok(!note.textContent.includes('上海体育馆'));
  });}finally{globalThis.fetch=previousFetch;}
});

test('live composer formatting resolves the original catalog snapshot for saving',async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({artists:[{id:'gem',name:'邓紫棋'}],events:[{id:'show',artist_id:'gem',title:'邓紫棋 I AM GLORIA · 上海站',city:'上海',date:'2024-05-28',venue:'上海体育馆'}]});
  try{await withComponents(async({React,root,MemoryRouter,EventNote})=>{
    let resolved;
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(EventNote,{id:'show',linked:false,onResolved:value=>{resolved=value;}}))));
    assert.equal(document.querySelector('.event-note strong').textContent,'I AM GLORIA · 上海站');
    assert.deepEqual(resolved,{id:'show',artist:'邓紫棋',title:'邓紫棋 I AM GLORIA · 上海站',city:'上海',date:'2024-05-28',venue:'上海体育馆'});
  });}finally{globalThis.fetch=previousFetch;}
});

test('all sheet headings reserve equal sides; event titles wrap while station names stay intact',async()=>{
  const files=['styles.css','redesign.css','composer.css','designSync.css'];
  const css=(await Promise.all(files.map(file=>readFile(new URL('../src/'+file,import.meta.url),'utf8')))).join('\n');
  const dom=new JSDOM(`<style>${css}</style><div class="composer-modal"><div class="composer-sheet"><div class="composer-sheet-handle"></div><header><button>×</button><h2>草稿箱</h2></header></div></div><div class="composer-event-context"><aside class="event-note"><div><strong class="event-note-concert">很长的演出名称<span class="event-note-station"> · 上海站</span></strong></div></aside></div>`);
  try{
    const style=selector=>dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(style('.composer-sheet header').display,'grid');
    assert.equal(style('.composer-sheet header').gridTemplateColumns,'44px minmax(0,1fr) 44px','equal side reserves keep the title on the handle center axis');
    assert.equal(style('.composer-sheet h2').gridColumn,'2');
    assert.equal(style('.composer-sheet h2').textAlign,'center');
    assert.equal(style('.composer-sheet header button').width,'44px');
    assert.equal(style('.composer-sheet header button').height,'44px');
    assert.equal(style('.event-note-concert').whiteSpace,'normal');
    assert.equal(style('.event-note-station').display,'inline-block');
    assert.equal(style('.event-note-station').whiteSpace,'nowrap');
    assert.equal(style('.event-note-station').overflowWrap,'normal');
  }finally{dom.window.close();}
});

test('unsaved dialog keeps continue, draft, discard and keyboard focus behavior with its scoped button styles',async()=>{
  await withComponents(async({React,root,MemoryExitDialog,dom})=>{
    const css=(await Promise.all(['styles.css','composer.css','designSync.css'].map(file=>readFile(new URL('../src/'+file,import.meta.url),'utf8')))).join('\n');
    // jsdom has no platform button theme; include the browser's raised fallback
    // before app styles so this catches a missing, scoped primary-button reset.
    const style=document.createElement('style');style.textContent='button{border:2px outset #767676;}\n'+css;document.head.append(style);
    let resets=0,proceeds=0,saves=0,discards=0,canSave=false;
    const blocker={state:'blocked',reset(){resets++;},proceed(){proceeds++;}};
    const render=async(overrides={})=>React.act(async()=>root.render(React.createElement(MemoryExitDialog,{blocker,save(){saves++;return canSave;},busy:false,uploading:false,editing:false,error:'',onDiscard(){discards++;},...overrides})));
    await render();
    const current=selector=>document.querySelector(selector),computed=selector=>dom.window.getComputedStyle(current(selector));
    assert.equal(computed('.unsaved-continue').boxShadow,'none');
    assert.equal(computed('.unsaved-continue').borderTopStyle,'none','a primary exit button must not retain the browser\'s raised border');
    assert.equal(computed('.unsaved-discard').borderTopStyle,'solid');
    assert.equal(computed('.unsaved-discard').borderTopWidth,'1px');
    assert.equal(computed('.unsaved-discard').borderTopColor,'rgb(228, 215, 197)');
    assert.equal(document.activeElement,current('.unsaved-continue'));
    assert.ok(computed('.unsaved-continue').outline.includes('2px'),'focused buttons retain a visible focus indicator');
    current('.unsaved-discard').focus();
    await React.act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',cancelable:true})));
    assert.equal(document.activeElement,current('.unsaved-continue'));
    await React.act(async()=>current('.unsaved-continue').click());assert.equal(resets,1);assert.equal(proceeds,0);
    await React.act(async()=>current('.unsaved-save').click());assert.equal(saves,1);assert.equal(proceeds,0,'failed draft saving must keep the content open');
    canSave=true;await React.act(async()=>current('.unsaved-save').click());assert.equal(proceeds,1);
    await React.act(async()=>current('.unsaved-discard').click());assert.equal(discards,1);assert.equal(proceeds,2);
    await render({busy:true});assert.equal(current('.unsaved-save').disabled,true);assert.equal(current('.unsaved-discard').disabled,true);
    await render({uploading:true});assert.equal(current('.unsaved-save').disabled,true);
    await React.act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',cancelable:true})));assert.equal(resets,2);
  });
});
