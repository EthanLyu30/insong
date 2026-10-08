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
  assert.equal(eventPhase({date:'2026-07-10',event_status:'cancelled'},'2026-09-30'),'cancelled');
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

test('atlas searches artists, opens concert journals, collects songs and never infers attendance', async () => {
  const ActualDate=globalThis.Date;const fixedTime=ActualDate.parse('2026-09-30T10:00:00Z');
  globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[fixedTime]));}static now(){return fixedTime;}};
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};
  let playCalls=0;
  dom.window.HTMLMediaElement.prototype.play=function(){playCalls++;this.dispatchEvent(new dom.window.Event('playing'));return Promise.resolve();};
  dom.window.HTMLMediaElement.prototype.pause=function(){};
  dom.window.HTMLMediaElement.prototype.load=function(){};
  const React=await import('react'); const {createRoot}=await import('react-dom/client'); const {MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {FootprintsPage}=await server.ssrLoadModule('/src/FootprintsPage.tsx');const {SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx');
  const {NavigationProvider}=await server.ssrLoadModule('/src/Navigation.tsx');
  function AtlasWithNavigation(){return React.createElement(NavigationProvider,null,React.createElement(SessionProvider,null,React.createElement(FootprintsPage)));}
  const root=createRoot(document.getElementById('root')); const previousFetch=globalThis.fetch;
  let user={id:3,display_name:'听友',is_demo:false},saved=[],writes=0,finishWrite,expired=false,playlists=[],collections=0,finishCollection,interestValue={artist_ids:[],wish_event_ids:[]};
  const catalog={verified_on:'2026-09-30',today:'2026-09-30',artists:[{id:'gem',name:'邓紫棋',aliases:['GEM']},{id:'liu',name:'刘雨昕',aliases:['刘雨欣']}],cities:[{id:'shenzhen',name:'深圳',lng:114.06,lat:22.54},{id:'beijing',name:'北京',lng:116.4,lat:39.9},{id:'lhasa',name:'拉萨',lng:91.1,lat:29.6}],events:[
    {id:'gem-test',artist_id:'gem',title:'测试演唱会',city:'深圳',venue:'大运体育场',date:'2026-09-11',source_url:'https://www.lg.gov.cn/',source_title:'官方公告',source_kind:'announcement',setlist_kind:'artist_collection',songs:[{title:'泡沫',artist:'邓紫棋',url:'https://y.qq.com/n/ryqq_v2/search?w=泡沫',audio_url:'/api/audio/test.wav',audio_label:'测试音源'}]},
    {id:'gem-future',artist_id:'gem',title:'下一晚',city:'深圳',venue:'大运体育场',date:'2026-10-01',venue_lng:114.2123,venue_lat:22.697,source_url:'https://www.lg.gov.cn/',source_title:'官方公告',source_kind:'announcement',setlist_kind:'artist_collection',songs:[]},
    {id:'liu-test',artist_id:'liu',title:'仙那度',city:'北京',venue:'五棵松',date:'2025-09-20',source_url:'https://www.beijing.gov.cn/',source_title:'官方公告',source_kind:'announcement',setlist_kind:'artist_collection',songs:[]}
  ]};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user});if(url==='/api/footprints/catalog')return Response.json(catalog);if(url==='/api/footprints')return expired?Response.json({detail:'请先登录，再操作你的记忆。'},{status:401}):Response.json(saved);
    if(url==='/api/playlists')return expired?Response.json({detail:'请先登录，再操作你的记忆。'},{status:401}):Response.json(playlists);
    if(url==='/api/footprints/interests')return Response.json(interestValue);
    if(url==='/api/memories'||String(url).startsWith('/api/memories?'))return Response.json([]);
    if(url==='/api/playlists/concerts/gem-test' && options.method==='PUT'){collections++;return new Promise(resolve=>{finishCollection=()=>{const item={id:7,event_id:'gem-test',name:'深圳现场',songs:catalog.events[0].songs};playlists=[item];resolve(Response.json(item));};});}
    if(String(url).startsWith('/api/stories?'))return Response.json([]);
    if(String(url).startsWith('/api/public-feed?'))return Response.json({items:[],next_cursor:null});
    if(url==='/api/footprints/gem-test' && options.method==='PUT'){writes++;return new Promise(resolve=>{finishWrite=()=>{saved=JSON.parse(options.body).attended?['gem-test']:[];resolve(Response.json(saved));};});}
    throw new Error('Unexpected request '+url);
  };
  const click=async label=>React.act(async()=>{const buttons=[...document.querySelectorAll('button,[role="button"]')];const button=buttons.find(el=>el.getAttribute('aria-label')===label||el.textContent.trim()===label)??buttons.find(el=>el.getAttribute('aria-label')?.includes(label)||el.textContent.includes(label));assert.ok(button,label);button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
  const search=async label=>{
    await React.act(async()=>{const input=document.querySelector('.atlas-searchbar input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,label);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
    await React.act(async()=>{const result=[...document.querySelectorAll('.atlas-search-results button')].find(button=>button.textContent.startsWith(label));assert.ok(result,label);result.click();});
  };
  try{
    await React.act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(AtlasWithNavigation))));
    assert.ok(document.querySelector('[aria-label="中国演唱会地图"]'));
    await search('拉萨'); assert.match(document.body.textContent,/暂无已核实/); assert.ok(JSON.parse(document.querySelector('.real-map-canvas').dataset.camera).zoom<7,'an explicit city retains the approved province-scale overview'); await click('返回上一页'); assert.deepEqual(JSON.parse(document.querySelector('.real-map-canvas').dataset.camera).center,[114.06,22.54],'the default overview returns to a region with genuine recent concerts');
    await search('邓紫棋'); assert.equal(writes,0);
    assert.ok(!document.querySelector('.map-primary-action'),'the schedule row is the single approach action');
    assert.ok(document.querySelector('[aria-label="日程时期"]'));
    assert.equal([...document.querySelectorAll('.atlas-schedule-filters button')].find(button=>button.textContent==='往期').getAttribute('aria-pressed'),'true','history is the default');
    assert.ok(!document.body.textContent.includes('我关心'));
    assert.ok(!document.body.textContent.includes('标记想去'));
    await click('往期');assert.match(document.querySelector('.atlas-schedule-list').textContent,/大运体育场/);
    assert.equal(document.querySelector('.atlas-schedule-row time small').textContent,'2026','single-day shows also display the year without time or night count');
    assert.ok(!document.querySelector('.atlas-schedule-list').textContent.includes('10.01'),'past filter excludes the next show');
    await click('未来');
    await React.act(async()=>document.querySelector('.atlas-itinerary .atlas-schedule-row').click());
    assert.ok(document.querySelector('[data-scene="sky"]'),'a known concert opens the night directly');
    assert.match(document.querySelector('.concert-summary').textContent,/2026.10.01/,'the exact concert is shown without a decorative camera scene');
    assert.ok(!document.querySelector('.cinematic-enter'));
    assert.equal(document.querySelectorAll('.cinematic-controls button').length,0);
    assert.match(document.querySelector('.concert-info h3').textContent,/相关作品/);
    assert.equal(document.querySelector('.atlas-attendance'),null,'the removed attendance button must not return');
    await click('返回上一页');assert.ok(document.querySelector('.atlas-itinerary'),'one back returns to the original national itinerary');
    await click('往期'); await React.act(async()=>document.querySelector('.atlas-itinerary .atlas-schedule-row').click());
    await React.act(async()=>document.querySelector('.concert-info summary').click());
    await click('泡沫'); assert.ok(document.querySelector('.concert-song-list'));assert.equal(document.querySelector('a[data-qq-song]'),null);
    assert.equal(playCalls,1,'clicking the existing song row starts its audio');
    await React.act(async()=>document.querySelector('.concert-song-list button').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
    assert.match(document.querySelector('.concert-player').className,/is-paused/,'clicking the same row toggles the shared player');
    await React.act(async()=>document.querySelector('.concert-song-list button').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
    assert.equal(playCalls,2,'clicking the row resumes audio through the same player');
    await click('收藏为歌单');await click('保存中');assert.equal(collections,1);await React.act(async()=>finishCollection());assert.match(document.querySelector('.concert-collect').textContent,/已收藏/);assert.equal(document.querySelector('.concert-collect a'),null,'saving adds no view-list or metadata block');
    assert.equal(writes,0,'collecting a playlist must not mark attendance');
    await click('返回上一页'); await click('未来'); await search('刘雨昕');
    assert.match(document.querySelector('.atlas-itinerary').textContent,/暂无待演/,'past-only artists should offer the past tab without promising a future stop');
    await click('往期');
    await React.act(async()=>document.querySelector('.atlas-month-filter button').click());
    await click('全部月份');
    assert.equal(document.querySelector('.atlas-itinerary h2').textContent,'刘雨昕的行程');
    assert.ok(!document.body.textContent.includes('取消到场'));
    await search('北京');await click('2025.09.20');assert.ok(!document.body.textContent.includes('取消到场'));
    await React.act(async()=>{user=null;window.dispatchEvent(new window.StorageEvent('storage',{key:'memory-session-change'}));});
    assert.ok([...document.querySelectorAll('a')].some(a=>a.textContent.includes('登录') && decodeURIComponent(a.href).includes('liu-test')));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'event',initialEntries:['/footprints?event=gem-test']},React.createElement(AtlasWithNavigation))));
    assert.ok(document.querySelector('[data-scene="sky"]'));assert.match(document.body.textContent,/2026.09.11/);
    await click('返回上一页');
    if([...document.querySelectorAll('.atlas-city-sheet button')].some(button=>button.textContent.includes('全部场次')))await click('全部场次');
    assert.ok(!document.querySelector('.atlas-city-sheet').textContent.includes('10.01'),'a direct past-night link defaults to its own past period rather than mixing in upcoming shows');
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'city-link',initialEntries:['/footprints?artist=gem&city=shenzhen']},React.createElement(AtlasWithNavigation))));
    assert.ok(JSON.parse(document.querySelector('.real-map-canvas').dataset.camera).zoom<7,'city deep links open at a static regional scale rather than street level');
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'inconsistent-link',initialEntries:['/footprints?artist=liu&city=beijing&event=gem-test']},React.createElement(AtlasWithNavigation))));
    await click('返回上一页');assert.ok(document.querySelector('[data-scene="map"]'));assert.match(document.body.textContent,/大运体育场/);
    catalog.events[0].songs=Array.from({length:12},(_,i)=>({title:'曲目'+(i+1),artist:'邓紫棋',url:'https://y.qq.com/n/ryqq_v2/search?w='+i}));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'twelve-songs',initialEntries:['/footprints?event=gem-test']},React.createElement(AtlasWithNavigation))));
    assert.equal(document.querySelectorAll('.concert-song-list li').length,12,'all real songs remain in the optional list');
    assert.equal(document.querySelectorAll('.atlas-song-star').length,0,'floating song titles no longer displace memories');
    catalog.events[0].songs=Array.from({length:16},(_,i)=>({title:'曲目'+(i+1),artist:'邓紫棋',url:'https://y.qq.com/n/ryqq_v2/search?w='+i}));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'long-setlist',initialEntries:['/footprints?event=gem-test']},React.createElement(AtlasWithNavigation))));
    assert.equal(document.querySelectorAll('.concert-song-list li').length,16);
    expired=true;user={id:3,display_name:'听友',is_demo:false};
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'expired',initialEntries:['/footprints?event=gem-test']},React.createElement(AtlasWithNavigation))));
    assert.ok([...document.querySelectorAll('.concert-collect a')].some(a=>decodeURIComponent(a.href).includes('gem-test')));
    expired=false;saved=['gem-test'];catalog.events[0].event_status='cancelled';
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'cancelled',initialEntries:['/footprints?event=gem-test']},React.createElement(AtlasWithNavigation))));
    assert.equal(document.querySelector('.atlas-attendance'),null);
    assert.match(document.querySelector('.concert-summary').textContent,/已取消/);
    assert.equal(writes,0,'an existing attendance flag is not silently removed by opening a cancelled event');
    catalog.events[0].event_status='scheduled';
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'filtered-night',initialEntries:['/footprints?artist=gem&period=past&month=2026-09']},React.createElement(AtlasWithNavigation))));
    await React.act(async()=>document.querySelector('.atlas-itinerary .atlas-schedule-row').click());
    assert.match(document.querySelector('.concert-summary').textContent,/2026.09.11/,'the selected past night opens directly');
    await click('返回上一页');
    assert.ok(!document.querySelector('.atlas-itinerary').textContent.includes('10.01'),'month and period remain applied after returning');
    catalog.events.push({...catalog.events[1],id:'gem-other',venue:'另一座体育馆'});
    catalog.events.push({...catalog.events[1],id:'liu-future',artist_id:'liu',venue:'刘雨昕体育馆'});
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'all-map',initialEntries:['/footprints?scope=all']},React.createElement(AtlasWithNavigation))));
    await React.act(async()=>document.querySelector('.atlas-itinerary .atlas-schedule-row').click());
    await click('返回上一页');
    assert.deepEqual(new Set([...document.querySelectorAll('.atlas-map-fallback button img')].map(photo=>photo.alt)),new Set(['邓紫棋','刘雨昕']),'an approached event does not become an implicit artist filter');
    catalog.events.push({...catalog.events[0],id:'gem-second-night',date:'2026-09-12'});
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'grouped',initialEntries:['/footprints?artist=gem&period=past']},React.createElement(AtlasWithNavigation))));
    assert.equal(document.querySelectorAll('.atlas-schedule-item').length,1,'a run should occupy one itinerary row');
    assert.equal(document.querySelector('.atlas-schedule-row time small').textContent,'2026','a multi-night date has only its calendar year beneath it');
    assert.match(document.querySelector('.atlas-schedule-row').textContent,/09.11.*09.12/);
    await click('深圳 · 邓紫棋');
    assert.ok(!document.querySelector('.atlas-city-sheet .atlas-primary-action'),'the local concert list has no duplicate entry action');
    await click('搜索场次');
    await React.act(async()=>{const input=document.querySelector('input[aria-label="搜索当地场次"]');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,'09.12');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
    await click('2026.09.12');
    assert.ok(document.querySelector('[data-scene="sky"]'));assert.match(document.querySelector('.concert-summary').textContent,/2026.09.12/,'choosing a night must not silently open the first night');
    const recordEntry=new URL(document.querySelector('.concert-write-link').href);
    assert.equal(recordEntry.pathname,'/create','recording a night opens the composer directly');
    assert.equal(recordEntry.searchParams.get('event'),'gem-second-night','consecutive shows retain the exact selected night');
    assert.equal(document.querySelectorAll('.atlas-night-dates button,.atlas-run-dates button').length,0,'no horizontal date chips in the venue or night');
    assert.ok(!document.body.textContent.includes('核验'));
    assert.ok(!document.querySelector('.song-list-toggle'),'the top-right song count is not a disclosure');
    const supplement=document.querySelector('.concert-info');
    assert.equal(supplement.open,false,'supplemental songs do not crowd out the memory by default');
    await React.act(async()=>supplement.querySelector('summary').click());assert.equal(supplement.open,true);
    await React.act(async()=>supplement.querySelector('summary').click());assert.equal(supplement.open,false);
    assert.ok(document.querySelector('.concert-public-memories'),'collapsing song information does not hide the public content');
    assert.ok(!document.querySelector('.concert-my-memories'),'an empty personal record module remains absent');
    await click('返回上一页');
    await React.act(async()=>{const input=document.querySelector('input[aria-label="搜索当地场次"]');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,'9月11日');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
    await click('2026.09.11');assert.match(document.querySelector('.concert-summary').textContent,/2026.09.11/,'date search keeps an exact night without a date chip');
    catalog.events.push(...['2026-09-18','2026-09-24','2026-09-29','2026-10-01'].map(date=>({...catalog.events[0],id:`residency-${date}`,date})));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'filtered-residency',initialEntries:['/footprints?artist=gem&period=past&month=2026-09&event=gem-second-night']},React.createElement(AtlasWithNavigation))));
    assert.equal(document.querySelectorAll('.atlas-night-dates button').length,0,'night date strips remain removed after deep links');
    await click('返回上一页');
    assert.equal(document.querySelectorAll('.atlas-city-sheet .atlas-schedule-item').length,4,'separate weekends remain separate scrollable rows');
    assert.ok(!document.querySelector('.atlas-city-sheet').textContent.includes('10.01'),'month and period filtering remain in the venue list');
    assert.ok(!document.querySelector('.atlas-city-sheet').textContent.includes('全部场次'));
    await React.act(async()=>root.render(React.createElement(MemoryRouter,{key:'legacy-future-exterior',initialEntries:['/footprints?period=past&month=2026-09&event=gem-future&scene=venue']},React.createElement(AtlasWithNavigation))));
    assert.ok(document.querySelector('[data-scene="sky"]'),'legacy exterior links resolve to the selected night');
    await click('返回上一页');
    await click('搜索场次');
    await React.act(async()=>{const input=document.querySelector('input[aria-label="搜索当地场次"]');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,'10/1');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
    assert.match(document.querySelector('.atlas-city-sheet').textContent,/10.01/,'an explicitly linked night outside the filters remains searchable');
    await click('2026.10.01');assert.match(document.querySelector('.concert-summary').textContent,/2026.10.01/);
  }finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=previousFetch;globalThis.Date=ActualDate;dom.window.close();}
});
