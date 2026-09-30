import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { eventPhase, qqMusicUrl, groupVenues, filterArtists } from '../src/footprintAtlas.ts';

test('itineraries distinguish China dates, keep venue dates distinct and only link QQ Music', () => {
  assert.equal(eventPhase({date:'2026-10-01'},'2026-09-30'),'upcoming');
  assert.equal(eventPhase({date:'2026-09-30'},'2026-09-30'),'today');
  assert.equal(eventPhase({date:'2026-09-11'},'2026-09-30'),'past');
  assert.equal(new URL(qqMusicUrl('泡沫','邓紫棋')).hostname,'y.qq.com');
  assert.match(new URL(qqMusicUrl('泡沫','邓紫棋')).searchParams.get('w'),/泡沫/);
  assert.deepEqual(filterArtists([{id:'gem',name:'邓紫棋',aliases:['GEM']},{id:'liu',name:'刘雨昕',aliases:['刘雨欣']}],'gem').map(x=>x.id),['gem']);
  assert.equal(filterArtists([{id:'liu',name:'刘雨昕',aliases:['刘雨欣']}],'刘雨欣').length,1);
  assert.equal(groupVenues([{id:'a',city:'深圳',venue:'大运',date:'2026-09-11'},{id:'b',city:'深圳',venue:'大运',date:'2026-10-01'}]).length,1);
});

test('national catalog preserves old links and publishes provenance without foreign music links', async () => {
  const catalog=JSON.parse(await readFile(new URL('../../backend/app/footprint_catalog.json',import.meta.url),'utf8'));
  assert.ok(catalog.events.some(e=>e.id==='gem-sanya-20251207'));
  assert.ok(catalog.events.some(e=>e.artist_id==='gem' && e.date>'2026-09-30'));
  assert.ok(catalog.cities.length>=40);
  assert.ok(['乌鲁木齐','拉萨','哈尔滨','台北','香港','澳门','三亚','深圳'].every(name=>catalog.cities.some(c=>c.name===name)));
  assert.equal(new Set(catalog.events.map(e=>e.id)).size,catalog.events.length);
  for(const event of catalog.events){
    assert.ok(catalog.artists.some(a=>a.id===event.artist_id));
    assert.ok(catalog.cities.some(c=>c.name===event.city));
    assert.ok(event.source_url && event.source_title && event.venue);
    assert.ok(['confirmed','artist_collection','partial'].includes(event.setlist_kind));
    for(const song of event.songs) assert.equal(new URL(song.url).hostname,'y.qq.com');
  }
  const geography=JSON.parse(await readFile(new URL('../src/china-provinces.json',import.meta.url),'utf8'));
  assert.ok(geography.features.some(f=>f.properties.adcode===710000));
  assert.ok(geography.features.some(f=>f.properties.adcode==='100000_JD'));
});

test('atlas searches artists, opens venues and stars, saves attendance and ignores obsolete writes', async () => {
  const ActualDate=globalThis.Date;const fixedTime=ActualDate.parse('2026-09-30T10:00:00Z');
  globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[fixedTime]));}static now(){return fixedTime;}};
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'); const {createRoot}=await import('react-dom/client'); const {MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {FootprintsPage}=await server.ssrLoadModule('/src/FootprintsPage.tsx');const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  const root=createRoot(document.getElementById('root')); const previousFetch=globalThis.fetch;
  let user={id:3,display_name:'听友',is_demo:false},saved=[],writes=0,finishWrite,expired=false;
  const catalog={verified_on:'2026-09-30',today:'2026-09-30',artists:[{id:'gem',name:'邓紫棋',aliases:['GEM']},{id:'liu',name:'刘雨昕',aliases:['刘雨欣']}],cities:[{id:'shenzhen',name:'深圳',lng:114.06,lat:22.54},{id:'beijing',name:'北京',lng:116.4,lat:39.9},{id:'lhasa',name:'拉萨',lng:91.1,lat:29.6}],events:[
    {id:'gem-test',artist_id:'gem',title:'测试演唱会',city:'深圳',venue:'大运体育场',date:'2026-09-11',source_url:'https://www.lg.gov.cn/',source_title:'官方公告',source_kind:'announcement',setlist_kind:'artist_collection',songs:[{title:'泡沫',artist:'邓紫棋',url:'https://y.qq.com/n/ryqq_v2/search?w=泡沫'}]},
    {id:'gem-future',artist_id:'gem',title:'下一晚',city:'深圳',venue:'大运体育场',date:'2026-10-01',source_url:'https://www.lg.gov.cn/',source_title:'官方公告',source_kind:'announcement',setlist_kind:'artist_collection',songs:[]},
    {id:'liu-test',artist_id:'liu',title:'仙那度',city:'北京',venue:'五棵松',date:'2025-09-20',source_url:'https://www.beijing.gov.cn/',source_title:'官方公告',source_kind:'announcement',setlist_kind:'artist_collection',songs:[]}
  ]};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user});if(url==='/api/footprints/catalog')return Response.json(catalog);if(url==='/api/footprints')return expired?Response.json({detail:'请先登录，再操作你的记忆。'},{status:401}):Response.json(saved);
    if(String(url).startsWith('/api/stories?'))return Response.json([]);
    if(url==='/api/footprints/gem-test' && options.method==='PUT'){writes++;return new Promise(resolve=>{finishWrite=()=>{saved=JSON.parse(options.body).attended?['gem-test']:[];resolve(Response.json(saved));};});}
    throw new Error('Unexpected request '+url);
  };
  const click=async label=>React.act(async()=>{const button=[...document.querySelectorAll('button,[role="button"]')].find(el=>el.getAttribute('aria-label')===label || el.textContent.includes(label));assert.ok(button,label);button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
  try{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(SessionProvider,null,React.createElement(FootprintsPage)))));
    assert.ok(document.querySelector('[aria-label="中国演唱会地图"]'));
    await click('拉萨'); assert.match(document.body.textContent,/暂无已核实/); assert.match(document.querySelector('.atlas-map-camera').getAttribute('style'),/scale\(1.85\)/); await click('返回全国'); assert.match(document.querySelector('.atlas-map-camera').getAttribute('style'),/scale\(1\)/);
    await click('邓紫棋'); assert.equal(writes,0);
    await click('深圳'); await click('进入大运体育场');
    assert.ok(document.querySelector('[data-scene="venue"]'));
    await click('2026.10.01'); assert.ok(document.querySelector('[data-scene="sky"]'));
    assert.ok([...document.querySelectorAll('button')].some(b=>b.disabled && b.textContent.includes('演出后')));
    await click('返回场馆'); await click('2026.09.11');
    await click('泡沫'); const qq=document.querySelector('a[data-qq-song]');assert.ok(qq);assert.equal(new URL(qq.href).hostname,'y.qq.com');
    await click('我去过'); await click('保存中'); assert.equal(writes,1);
    await React.act(async()=>finishWrite());assert.match(document.body.textContent,/取消到场/);
    await click('取消到场'); await React.act(async()=>finishWrite());
    await click('我去过'); await click('返回场馆');await click('返回全国'); await click('刘雨昕'); await React.act(async()=>finishWrite());
    assert.ok(!document.body.textContent.includes('取消到场'));
    await click('北京');await click('进入五棵松');await click('2025.09.20');assert.ok(!document.body.textContent.includes('取消到场'));
    await React.act(async()=>{user=null;window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change'}));});
    assert.ok([...document.querySelectorAll('a')].some(a=>a.textContent.includes('登录') && decodeURIComponent(a.href).includes('liu-test')));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'event',initialEntries:['/footprints?event=gem-test']},React.createElement(SessionProvider,null,React.createElement(FootprintsPage)))));
    assert.ok(document.querySelector('[data-scene="sky"]'));assert.match(document.body.textContent,/测试演唱会/);
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'city-link',initialEntries:['/footprints?artist=gem&city=shenzhen']},React.createElement(SessionProvider,null,React.createElement(FootprintsPage)))));
    assert.match(document.querySelector('.atlas-map-camera').getAttribute('style'),/scale\(1.85\)/);
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'inconsistent-link',initialEntries:['/footprints?artist=liu&city=beijing&event=gem-test']},React.createElement(SessionProvider,null,React.createElement(FootprintsPage)))));
    await click('返回场馆');assert.ok(document.querySelector('[data-scene="venue"]'));assert.match(document.body.textContent,/大运体育场/);
    catalog.events[0].songs=Array.from({length:16},(_,i)=>({title:'曲目'+(i+1),artist:'邓紫棋',url:'https://y.qq.com/n/ryqq_v2/search?w='+i}));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'long-setlist',initialEntries:['/footprints?event=gem-test']},React.createElement(SessionProvider,null,React.createElement(FootprintsPage)))));
    assert.equal(document.querySelectorAll('.atlas-song-star').length,16);
    expired=true;user={id:3,display_name:'听友',is_demo:false};
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'expired',initialEntries:['/footprints?event=gem-test']},React.createElement(SessionProvider,null,React.createElement(FootprintsPage)))));
    assert.ok([...document.querySelectorAll('.atlas-attendance a')].some(a=>decodeURIComponent(a.href).includes('gem-test')));


  }finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=previousFetch;globalThis.Date=ActualDate;dom.window.close();}
});
