import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const snapshot = (changes = {}) => ({
  id:7,event_id:'night-a',name:'测试歌手 · 深圳 · 2026-09-01',artist:'测试歌手',city:'深圳',venue:'测试场馆',date:'2026-09-01',
  songs:[{title:'收藏时的作品',artist:'测试歌手'}],created_at:'2026-09-02T08:00:00Z',
  snapshot_version:'saved-v1',current_version:'catalog-v2',update_available:true,legacy_snapshot:false,
  setlist_kind:'artist_collection',setlist_note:'关联作品，现场曲目尚待核实。',setlist_verified_on:null,catalog_checked_on:'2026-09-01',
  current_setlist_kind:'confirmed',current_setlist_verified_on:'2026-10-01',event_status:'scheduled',...changes,
});
const updated = () => snapshot({snapshot_version:'catalog-v2',update_available:false,setlist_kind:'confirmed',setlist_note:'本场曲目已核实。',setlist_verified_on:'2026-10-01',catalog_checked_on:'2026-10-01',songs:[{title:'后来核实的现场曲目',artist:'测试歌手'}]});

async function mount({collector=false,request,initial='/playlists?list=7'} = {}) {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,fetch:globalThis.fetch,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react');const {createRoot}=await import('react-dom/client');const {MemoryRouter,useNavigate,useSearchParams}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {CollectConcert,PlaylistsPage}=await server.ssrLoadModule('/src/ConcertPlaylist.tsx');const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  let navigate,user={id:3,display_name:'听友',is_demo:false};
  globalThis.fetch=async(url,options={})=>url==='/api/me'?Response.json({user}):request(url,options);
  function Controls(){navigate=useNavigate();return null;}
  function Collector(){const [params]=useSearchParams();const id=params.get('event')??'night-a';return React.createElement(CollectConcert,{event:{id,artist_id:'test',title:'测试现场',city:'深圳',venue:'测试场馆',date:'2026-09-01',source_url:'https://example.com/',source_title:'演出信息',setlist_kind:'confirmed',songs:[{title:'后来核实的现场曲目',artist:'测试歌手',url:'https://y.qq.com/'}]},next:'/footprints?event='+id});}
  const root=createRoot(document.getElementById('root'));
  const act=operation=>React.act(operation);
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[initial]},React.createElement(SessionProvider,null,React.createElement(collector?Collector:PlaylistsPage),React.createElement(Controls)))));
  return {
    document:dom.window.document,act,
    click:async(label)=>act(async()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent===label);assert.ok(button,`Expected button: ${label}`);button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));}),
    navigate:async(path)=>act(async()=>navigate(path)),
    identity:async(next)=>act(async()=>{user=next;window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'memory-session-change'}));}),
    close:async()=>{await act(async()=>root.unmount());await server.close();dom.window.close();globalThis.window=previous.window;globalThis.document=previous.document;globalThis.HTMLElement=previous.HTMLElement;globalThis.fetch=previous.fetch;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;},
  };
}

test('saved detail explains its original snapshot and offers a catalog update without changing its songs',async()=>{
  const requests=[];const app=await mount({request:async(url,options)=>{requests.push([url,options.method]);assert.equal(url,'/api/playlists');return Response.json([snapshot()]);}});
  try{
    assert.match(app.document.body.textContent,/关联作品/);
    assert.match(app.document.body.textContent,/收藏于/);
    assert.match(app.document.body.textContent,/版本核对/);
    assert.match(app.document.body.textContent,/已有更新/);
    assert.ok([...app.document.querySelectorAll('button')].some(button=>button.textContent==='更新这张歌单'));
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'收藏时的作品');
    assert.doesNotMatch(app.document.body.textContent,/已核实现场歌单|saved-v1|catalog-v2/);
    assert.deepEqual(requests,[['/api/playlists',undefined]],'reading a playlist cannot send a refresh mutation');
  }finally{await app.close();}
});

test('manual refresh sends both expected versions and replaces songs only after a successful response',async()=>{
  let finish,refreshes=0,payload;const app=await mount({request:async(url,options)=>{
    if(url==='/api/playlists')return Response.json([snapshot()]);
    assert.equal(url,'/api/playlists/7/refresh');assert.equal(options.method,'POST');payload=JSON.parse(options.body);refreshes++;
    return new Promise(resolve=>{finish=()=>resolve(Response.json(updated()));});
  }});
  try{
    await app.click('更新这张歌单');
    assert.deepEqual(payload,{expected_snapshot_version:'saved-v1',expected_current_version:'catalog-v2'});
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'收藏时的作品');
    assert.ok([...app.document.querySelectorAll('button')].some(button=>button.disabled&&button.textContent.includes('更新中')));
    assert.equal(refreshes,1);
    await app.act(async()=>finish());
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'后来核实的现场曲目');
    assert.match(app.document.body.textContent,/已核实现场歌单/);
    assert.doesNotMatch(app.document.body.textContent,/已有更新/);
  }finally{await app.close();}
});

test('failed refresh keeps the saved songs and leaves the update available to retry',async()=>{
  let refreshes=0;const app=await mount({request:async(url)=>url==='/api/playlists'?Response.json([snapshot()]):(refreshes++,Response.json({detail:'暂时无法更新歌单，请重试。'},{status:503}))});
  try{
    await app.click('更新这张歌单');
    assert.match(app.document.querySelector('[role="alert"]').textContent,/无法更新/);
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'收藏时的作品');
    await app.click('更新这张歌单');assert.equal(refreshes,2);
  }finally{await app.close();}
});

test('a version conflict reloads available versions and needs another explicit update click',async()=>{
  let reads=0,refreshes=0,payload;const app=await mount({request:async(url,options)=>{
    if(url==='/api/playlists'){reads++;return Response.json([snapshot({current_version:reads===1?'catalog-v2':'catalog-v3'})]);}
    refreshes++;payload=JSON.parse(options.body);return Response.json({detail:'目录已有变化，请重新确认。'},{status:409});
  }});
  try{
    await app.click('更新这张歌单');
    assert.equal(reads,2);assert.equal(refreshes,1,'conflict recovery cannot resend a mutation');
    assert.match(app.document.querySelector('[role="alert"]').textContent,/变化|重新确认/);
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'收藏时的作品');
    await app.click('更新这张歌单');
    assert.equal(payload.expected_current_version,'catalog-v3');
  }finally{await app.close();}
});

test('conflict recovery adopts another saved snapshot and uses its version on the next explicit refresh',async()=>{
  let reads=0,refreshes=0,payload;
  const latest=snapshot({snapshot_version:'saved-in-another-tab',current_version:'catalog-v3',songs:[{title:'另一窗口已保存的曲目',artist:'测试歌手'}]});
  const app=await mount({request:async(url,options)=>{
    if(url==='/api/playlists')return Response.json([++reads===1?snapshot():latest]);
    payload=JSON.parse(options.body);return ++refreshes===1?Response.json({detail:'收藏版本已变化。'},{status:409}):Response.json(updated());
  }});
  try{
    await app.click('更新这张歌单');
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'另一窗口已保存的曲目');
    assert.equal(refreshes,1);
    await app.click('更新这张歌单');
    assert.deepEqual(payload,{expected_snapshot_version:'saved-in-another-tab',expected_current_version:'catalog-v3'});
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'后来核实的现场曲目');
  }finally{await app.close();}
});

test('changing the selected playlist aborts refresh and its late response cannot replace the next playlist',async()=>{
  let finish,signal;const other=snapshot({id:8,event_id:'night-b',songs:[{title:'另一晚的作品',artist:'另一位歌手'}],artist:'另一位歌手',update_available:false});
  const app=await mount({request:async(url,options)=>url==='/api/playlists'?Response.json([snapshot(),other]):new Promise(resolve=>{signal=options.signal;finish=()=>resolve(Response.json(updated()));})});
  try{
    await app.click('更新这张歌单');await app.navigate('/playlists?list=8');assert.equal(signal.aborted,true);
    await app.act(async()=>finish());
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'另一晚的作品');
    assert.doesNotMatch(app.document.body.textContent,/后来核实的现场曲目|更新中/);
  }finally{await app.close();}
});

test('changing identity aborts refresh and a late response cannot populate the other account',async()=>{
  let finish,signal,reads=0;const app=await mount({request:async(url,options)=>{
    if(url==='/api/playlists'){reads++;return Response.json(reads===1?[snapshot()]:[]);}
    return new Promise(resolve=>{signal=options.signal;finish=()=>resolve(Response.json(updated()));});
  }});
  try{
    await app.click('更新这张歌单');await app.identity({id:4,display_name:'另一个账号',is_demo:false});assert.equal(signal.aborted,true);
    await app.act(async()=>finish());
    assert.match(app.document.body.textContent,/还没有收藏歌单/);
    assert.doesNotMatch(app.document.body.textContent,/收藏时的作品|后来核实的现场曲目/);
  }finally{await app.close();}
});

test('saved concert control gives the same manual update and ignores a response after choosing another event',async()=>{
  let finish,signal,payload;const app=await mount({collector:true,initial:'/footprints?event=night-a',request:async(url,options)=>{
    if(url==='/api/playlists')return Response.json([snapshot()]);
    assert.equal(url,'/api/playlists/7/refresh');payload=JSON.parse(options.body);
    return new Promise(resolve=>{signal=options.signal;finish=()=>resolve(Response.json(updated()));});
  }});
  try{
    assert.match(app.document.querySelector('.concert-collect').textContent,/关联作品|已有更新/);
    await app.click('更新这张歌单');assert.deepEqual(payload,{expected_snapshot_version:'saved-v1',expected_current_version:'catalog-v2'});
    await app.navigate('/footprints?event=night-b');assert.equal(signal.aborted,true);await app.act(async()=>finish());
    assert.match(app.document.querySelector('.concert-collect').textContent,/收藏为歌单/);
    assert.doesNotMatch(app.document.querySelector('.concert-collect').textContent,/已收藏|已核实现场歌单/);
  }finally{await app.close();}
});

test('saved concert control retains its original type until an explicit refresh succeeds',async()=>{
  let finish;
  const app=await mount({collector:true,initial:'/footprints?event=night-a',request:async(url)=>url==='/api/playlists'?Response.json([snapshot()]):new Promise(resolve=>{finish=()=>resolve(Response.json(updated()));})});
  try{
    await app.click('更新这张歌单');
    assert.match(app.document.querySelector('.concert-collect').textContent,/关联作品/);
    assert.doesNotMatch(app.document.querySelector('.concert-collect').textContent,/已核实现场歌单/);
    await app.act(async()=>finish());
    assert.match(app.document.querySelector('.concert-collect').textContent,/已核实现场歌单/);
    assert.doesNotMatch(app.document.querySelector('.concert-collect').textContent,/关联作品|已有更新/);
    assert.equal(app.document.querySelector('.concert-collect a').getAttribute('href'),'/playlists?list=7');
  }finally{await app.close();}
});

test('legacy snapshots cannot inherit verified setlist wording from the current catalog',async()=>{
  const app=await mount({request:async()=>Response.json([snapshot({legacy_snapshot:true,setlist_kind:'confirmed',setlist_verified_on:'2026-10-01'})])});
  try{
    assert.match(app.document.body.textContent,/旧版收藏/);
    assert.doesNotMatch(app.document.body.textContent,/已核实现场歌单/);
    assert.equal(app.document.querySelector('.concert-song-list strong').textContent,'收藏时的作品');
  }finally{await app.close();}
});
