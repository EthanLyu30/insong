import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';

const cities=[{id:'sz',name:'深圳',lng:114.06,lat:22.54},{id:'gz',name:'广州',lng:113.26,lat:23.13},{id:'bj',name:'北京',lng:116.4,lat:39.9}];
const shows=[
  {id:'sz',city:'深圳',date:'2026-10-01',venue:'深圳场馆'},
  {id:'gz',city:'广州',date:'2026-10-02',venue:'广州场馆'},
  {id:'bj',city:'北京',date:'2026-10-03',venue:'北京场馆'},
  {id:'old',city:'北京',date:'2024-01-01',venue:'旧北京场馆'},
  {id:'cancelled',city:'北京',date:'2026-10-04',event_status:'cancelled',venue:'取消场馆'},
].map(event=>({...event,artist_id:'gem',title:'演唱会',source_url:'https://example.com/official',source_title:'公告',setlist_kind:'artist_collection',songs:[]}));

test('recent regional fallback excludes cancelled and stale nights, counts genuine nearby dates',async()=>{
  const {recentConcertOverview}=await import('../src/concertMapFocus.ts').catch(()=>({}));
  assert.equal(typeof recentConcertOverview,'function');
  assert.deepEqual(recentConcertOverview(shows,cities,'2026-10-08').eventIds,['gz','sz']);
  assert.equal(recentConcertOverview([shows[3]],cities,'2026-10-08'),null);
  assert.equal(recentConcertOverview([],cities,'2026-10-08'),null);
});

test('authorized nearby view only uses known valid cities near the supplied coordinate',async()=>{
  const {nearbyConcertOverview}=await import('../src/concertMapFocus.ts').catch(()=>({}));
  assert.equal(typeof nearbyConcertOverview,'function');
  assert.deepEqual(nearbyConcertOverview(shows,cities,{longitude:114.06,latitude:22.54}).eventIds,['gz','sz']);
  assert.equal(nearbyConcertOverview(shows,cities,{longitude:-73,latitude:40}),null);
  assert.equal(nearbyConcertOverview(shows,cities,{longitude:NaN,latitude:22}),null);
  assert.equal(nearbyConcertOverview([shows[4]],cities,{longitude:116.4,latitude:39.9}),null);
});

async function harness(run,geolocation={getCurrentPosition(){}},data={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldFetch=globalThis.fetch,oldFormData=globalThis.FormData;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:geolocation});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.FormData=dom.window.FormData;
  window.scrollTo=()=>{};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router');
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {FootprintsPage}=await server.ssrLoadModule('/src/FootprintsPage.tsx'),{SessionProvider}=await server.ssrLoadModule('/src/SessionContext.tsx'),{NavigationProvider}=await server.ssrLoadModule('/src/Navigation.tsx');
  const catalog={today:'2026-10-08',verified_on:'2026-10-08',cities,artists:[{id:'gem',name:'邓紫棋',aliases:[]}],events:shows,...data.catalog};
  globalThis.fetch=async(url,options={})=>{
    assert.ok(!options.method||options.method==='GET','viewing/locating must not write attendance or collections');
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'小林',is_demo:false}});
    if(url==='/api/footprints/catalog')return Response.json(catalog);
    if(url==='/api/footprints/photos')return data.photos?data.photos(options):Response.json({photos:[]});
    if(url==='/api/footprints'||url==='/api/playlists')return Response.json([]);
    if(url==='/api/memories')return data.memories?data.memories(options):Response.json([{id:1,event_id:'sz'}]);
    if(url==='/api/footprints/interests')return Response.json({artist_ids:[],wish_event_ids:[]});
    throw Error('Unexpected request '+url);
  };
  const root=createRoot(document.getElementById('root'));
  const render=async(entry='/footprints',key='start')=>React.act(async()=>root.render(React.createElement(MemoryRouter,{key,initialEntries:[entry]},React.createElement(NavigationProvider,null,React.createElement(SessionProvider,null,React.createElement(FootprintsPage))))));
  const click=async label=>React.act(async()=>{const button=[...document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')===label||button.textContent===label);assert.ok(button,label);button.click();});
  try{await render();await run({React,render,click,dom});}
  finally{await React.act(async()=>root.unmount());await server.close();globalThis.fetch=oldFetch;globalThis.FormData=oldFormData;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;dom.window.close();}
}

test('map entry starts with All and never requests a device position until the locate click',async()=>{
  let calls=0;
  await harness(async({click})=>{
    const tabs=[...document.querySelectorAll('.atlas-artist-pills button')];
    assert.equal(tabs[0].textContent,'全部');
    assert.equal(tabs[0].getAttribute('aria-pressed'),'true');
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/北京场馆/,'All is not silently limited to linked memories');
    assert.equal(calls,0,'no automatic location permission on entry');
    await click('查看附近演唱会');assert.equal(calls,1);
    assert.equal(document.querySelector('[aria-label="查看附近演唱会"]').disabled,true);
  },{getCurrentPosition(){calls++;}});
});

test('explicit personal links remain personal and do not infer attendance from the default All view',async()=>{
  await harness(async({render})=>{
    await render('/footprints?scope=mine&month=all','personal');
    assert.equal([...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='我的经历').getAttribute('aria-pressed'),'true');
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/深圳场馆/);
    assert.ok(!document.querySelector('.atlas-schedule-list').textContent.includes('北京场馆'));
  });
});

test('denied location uses a recent concert-rich regional fallback with an honest status',async()=>{
  let denied;
  await harness(async({React,click})=>{
    await click('查看附近演唱会');await React.act(async()=>denied({code:1}));
    const camera=JSON.parse(document.querySelector('.real-map-canvas').dataset.camera);
    assert.ok(camera.center[0]>113&&camera.center[0]<115);
    assert.match(document.querySelector('.atlas-location-status').textContent,/未允许定位/);
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/广州场馆/);
    assert.ok(!document.querySelector('.atlas-schedule-list').textContent.includes('北京场馆'));
  },{getCurrentPosition(success,error){denied=error;}});
});

test('authorized location displays genuine nearby concerts rather than the default distant regional list',async()=>{
  let resolved;
  await harness(async({React,click})=>{
    await click('查看附近演唱会');await React.act(async()=>resolved({coords:{longitude:116.4,latitude:39.9}}));
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/北京场馆/);
    assert.ok(!document.querySelector('.atlas-schedule-list').textContent.includes('深圳场馆'));
    assert.deepEqual(JSON.parse(document.querySelector('.real-map-canvas').dataset.camera).center,[116.4,39.9]);
  },{getCurrentPosition(success){resolved=success;}});
});

test('a late location response cannot replace a personal filter chosen while permission was pending',async()=>{
  let resolved;
  await harness(async({React,click})=>{
    await click('查看附近演唱会');await click('我的经历');
    await React.act(async()=>resolved({coords:{longitude:116.4,latitude:39.9}}));
    assert.equal([...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='我的经历').getAttribute('aria-pressed'),'true');
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/深圳场馆/);
    assert.ok(!document.querySelector('.atlas-schedule-list').textContent.includes('北京场馆'));
  },{getCurrentPosition(success){resolved=success;}});
});

test('manual month selection leaves location discovery and shows matching historical records without a stale region status',async()=>{
  let denied;
  await harness(async({React,click})=>{
    await click('查看附近演唱会');await React.act(async()=>denied({code:1}));
    await click('筛选演出月份');
    await React.act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      for(const [id,value] of [['schedule-year','2024'],['schedule-month','1']]){const input=document.getElementById(id);setter.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));}
    });
    await click('确定');
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/旧北京场馆/);
    assert.equal(document.querySelector('.atlas-location-status'),null,'manual filters supersede discovery status');
    assert.ok(document.querySelector('.atlas-scroll-hint'));
  },{getCurrentPosition(success,error){denied=error;}});
});

test('zooming while location is pending cancels its late response instead of jumping to the resolved region',async()=>{
  let resolved;
  await harness(async({React,click})=>{
    await click('查看附近演唱会');await click('放大地图');
    await React.act(async()=>resolved({coords:{longitude:116.4,latitude:39.9}}));
    assert.equal(document.querySelector('.atlas-location-status'),null);
    assert.match(document.querySelector('.atlas-schedule-list').textContent,/深圳场馆/);
    assert.deepEqual(JSON.parse(document.querySelector('.real-map-canvas').dataset.camera).center,[113.66,22.835]);
  },{getCurrentPosition(success){resolved=success;}});
});

test('period selection cancels pending location synchronously before a queued result can restore old filters',async()=>{
  let resolved;
  await harness(async({React,click})=>{
    await click('查看附近演唱会');
    await React.act(async()=>{
      [...document.querySelectorAll('.atlas-schedule-filters button')].find(button=>button.textContent==='未来').click();
      resolved({coords:{longitude:116.4,latitude:39.9}});
    });
    assert.equal([...document.querySelectorAll('.atlas-schedule-filters button')].find(button=>button.textContent==='未来').getAttribute('aria-pressed'),'true');
    assert.equal(document.querySelector('.atlas-location-status'),null);
  },{getCurrentPosition(success){resolved=success;}});
});

test('unavailable and malformed device location fall back without inventing nearby concerts',async()=>{
  for(const geolocation of [undefined,{getCurrentPosition(){throw new Error('blocked');}},{getCurrentPosition(resolve){resolve({coords:{longitude:NaN,latitude:39.9}});}}]){
    await harness(async({click})=>{
      await click('查看附近演唱会');
      assert.match(document.querySelector('.atlas-location-status').textContent,/定位暂不可用/);
      assert.ok(!document.querySelector('.atlas-location-status').textContent.includes('已展示附近'));
      assert.match(document.querySelector('.atlas-schedule-list').textContent,/广州场馆/);
    },geolocation===undefined?null:geolocation);
  }
});

test('source details are collapsed on arrival while a compact required attribution remains accessible',async()=>{
  await harness(async({click})=>{
    assert.equal(document.querySelector('.map-source-brief'),null,'no expanded arrival banner');
    assert.ok(document.querySelector('.map-source-attribution a[href="https://www.openstreetmap.org/copyright"]'));
    assert.equal(document.querySelector('[role="dialog"]'),null);
    await click('地图信息');assert.ok(document.querySelector('[role="dialog"][aria-label="地图与照片来源"]'));
  });
});

test('compact header places its subtitle beside the return action, not below the wordmark',async()=>{
  await harness(async()=>{
    const css=(await Promise.all(['footprints.css','personalMap.css','designSync.css'].map(file=>readFile(new URL('../src/'+file,import.meta.url),'utf8')))).join('\n');
    const style=document.createElement('style');style.textContent=css;document.head.append(style);
    const line=document.querySelector('.atlas-topline');
    assert.ok(line.querySelector('.atlas-return-mine'));
    assert.equal(line.querySelector('small').textContent,'听见城市，走过山海。');
    assert.equal(window.getComputedStyle(line).display,'flex');
    assert.equal(window.getComputedStyle(line).justifyContent,'space-between');
    assert.equal(window.getComputedStyle(line.querySelector('small')).whiteSpace,'nowrap');
    assert.equal(document.querySelector('.atlas-wordmark small'),null);
  });
});

test('first map frame waits for photo sources instead of painting fallback portraits then switching them',async()=>{
  const replies=[];
  await harness(async({React})=>{
    assert.equal(document.querySelector('.real-map-canvas').getAttribute('aria-busy'),'true');
    assert.equal(document.querySelector('.atlas-map-fallback'),null,'no intermediate photo layout before source resolution');
    await React.act(async()=>replies.forEach(reply=>reply(Response.json({photos:[{event_id:'sz',url:'/api/photos/my-photo',source:'mine',memory_id:1}]}))));
    assert.equal(document.querySelector('.real-map-canvas').getAttribute('aria-busy'),'false');
    assert.ok(document.querySelector('.atlas-map-fallback img[src="/api/photos/my-photo"]'));
  },undefined,{photos:options=>new Promise(resolve=>{replies.push(resolve);options.signal?.addEventListener('abort',()=>resolve(Response.json({photos:[]})),{once:true});})});
});

test('entering My waits for its actual records before exposing the initial geographic frame',async()=>{
  let finish;
  await harness(async({React,render})=>{
    await render('/footprints?scope=mine&month=all','pending-personal');
    assert.equal(document.querySelector('.real-map-canvas').getAttribute('aria-busy'),'true');
    assert.equal(document.querySelector('.atlas-map-fallback'),null);
    await React.act(async()=>finish());
    assert.equal(document.querySelector('.real-map-canvas').getAttribute('aria-busy'),'false');
    assert.deepEqual(JSON.parse(document.querySelector('.real-map-canvas').dataset.camera).center,[114.06,22.54]);
  },undefined,{memories:options=>new Promise(resolve=>{finish=()=>resolve(Response.json([{id:1,event_id:'sz'}]));options.signal?.addEventListener('abort',()=>resolve(Response.json([])),{once:true});})});
});

test('fallback visibility refreshes after Locate and keeps partially overlapping photos',async()=>{
  let resolved;
  const extendedCities=[...cities,{id:'tj',name:'天津',lng:117.2,lat:39.1}];
  const events=[...shows,{...shows[0],id:'tj',city:'天津',date:'2026-10-02',venue:'天津场馆'},{...shows[0],id:'sz-extra',date:'2026-10-02'},{...shows[1],id:'gz-extra',date:'2026-10-03'}];
  const photos=[{event_id:'bj',url:'/api/photos/bj',source:'mine',memory_id:1},{event_id:'tj',url:'/api/photos/tj',source:'mine',memory_id:2}];
  await harness(async({React,render,click})=>{
    const original=window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect=function(){
      if(this.classList.contains('atlas-map-fallback'))return new window.DOMRect(12,197,366,271);
      if(this.classList.contains('real-city-pin')&&this.closest('.atlas-map-fallback')){
        const fraction=value=>Number(value.match(/calc\(([-\d.]+)%/)?.[1]??0)/100;
        const size=Number.parseFloat(this.style.getPropertyValue('--map-photo-size'))||58;
        return new window.DOMRect(12+366*fraction(this.style.left)-size/2,197+271*fraction(this.style.top)-size/2,size,size);
      }
      return original.call(this);
    };
    try{
      await render('/footprints?scope=all&period=past&month=all','projection');
      const visibleNeighbors=()=>[...document.querySelectorAll('.atlas-map-fallback button')].filter(button=>['bj','tj'].includes(button.dataset.photoEvent)&&button.style.visibility!=='hidden');
      assert.equal(visibleNeighbors().length,0,'northern photos are outside the original southern frame');
      await click('查看附近演唱会');await React.act(async()=>resolved({coords:{longitude:116.4,latitude:39.9}}));
      const neighboring=visibleNeighbors();
      assert.deepEqual(neighboring.map(button=>button.dataset.photoEvent),['bj','tj'],
        'both nearby photos should appear after projection changes, even with partial overlap');
    }finally{window.HTMLElement.prototype.getBoundingClientRect=original;}
  },{getCurrentPosition(success){resolved=success;}},{catalog:{cities:extendedCities,events},photos:()=>Response.json({photos})});
});
