import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const song={id:1,title:'散场以后',artist:'Demo Artist',is_demo:true,audio_available:true,audio_url:'/api/audio/song-1-v1.wav',duration_ms:48000,recording_label:'原创器乐样例',lyrics:[]};
const photos=[{id:'a',url:'/api/photos/a'},{id:'b',url:'/api/photos/b'}];
const card={id:88,owner_id:3,song_id:1,song,title:'把这一晚带回家',story:'第一行。\n最后一行也必须完整。',life_time:'散场的晚上',life_year:2025,revision:1,reflections:[],tags:['演唱会','散场'],photos,photo_id:'a',photo_url:'/api/photos/a',created_at:'2026-01-01',updated_at:'2026-01-01',offset_ms:10000,end_ms:14000};

async function harness(path,respond,work,fixtures={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});
  const priorFormData=globalThis.FormData;globalThis.FormData=dom.window.FormData;
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{};
  window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  const originalRect=window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('choice-trigger')?{left:200,top:100,right:320,bottom:144,width:120,height:44}:originalRect.call(this);};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  window.HTMLMediaElement.prototype.play=async function(){this.dispatchEvent(new window.Event('play'));};
  window.HTMLMediaElement.prototype.pause=function(){this.dispatchEvent(new window.Event('pause'));};
  window.HTMLMediaElement.prototype.load=function(){};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter,useNavigate,useLocation}=await import('react-router');
  let navigate,current;function Probe(){navigate=useNavigate();current=useLocation();return null;}
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');const prior=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user:fixtures.guest?null:{id:3,display_name:'我',is_demo:false}});
    if(url==='/api/themes')return fixtures.themesError?Response.json({detail:'主题服务不可用'},{status:503}):Response.json(fixtures.themes??[]);
    if(url==='/api/songs/1')return Response.json(song);
    if(url==='/api/memories/88'&&!options.method)return Response.json(fixtures.memory?fixtures.memory():card);
    if(url==='/api/memories'&&!options.method)return fixtures.memoriesError?Response.json({detail:'个人记忆暂不可用'},{status:503}):Response.json(fixtures.memories??[card]);
    if(url.startsWith('/api/stories?'))return Response.json(fixtures.stories??[]);
    return respond(url,options);
  };
  const root=createRoot(document.getElementById('root'));
  const act=React.act;
  const until=async selector=>{const deadline=Date.now()+15000;while(!document.querySelector(selector)&&Date.now()<deadline)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});assert.ok(document.querySelector(selector),selector);};
  const fill=async(id,text)=>act(async()=>{const input=document.getElementById(id);assert.ok(input,`missing ${id}`);const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  try{await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(App),React.createElement(Probe))));await work({act,fill,until,go:async to=>act(async()=>navigate(to)),location:()=>current});}
  finally{await act(async()=>root.unmount());await server.close();globalThis.fetch=prior;globalThis.FormData=priorFormData;delete globalThis.ResizeObserver;dom.window.close();}
}

test('launch home keeps its full collage and is not a persistent navigation tab',async()=>{
  await harness('/',async url=>{
    if(url==='/api/songs')return Response.json(Array.from({length:5},(_,i)=>({...song,id:i+1,title:`原版歌曲${i+1}`,cover_url:'/photos/memory-concert-20261002.webp'})));
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-01',artists:[],events:[]});
    throw new Error(url);
  },async({act})=>{
    assert.ok(document.querySelector('.intro-shell .collage-intro'));
    const projection=[...document.querySelectorAll('.collage-card')].map(card=>card.style.transform);
    await act(async()=>document.querySelector('.intro-copy button').click());
    assert.ok(document.querySelector('.discover-page'),'story entry opens the discovery route');
    assert.equal(document.querySelector('.bottom-nav a[href="/"]'),null,'the startup home is not a navigation tab');
    await act(async()=>document.querySelector('.brand').click());
    assert.ok(document.querySelector('.discover-page'),'brand stays within the normal three-tab application');
    assert.equal(document.querySelector('.intro-shell'),null);
    assert.equal(projection.length,5);
  });
});

test('editing keeps the cover and title, uses inline topics, and removes supplemental fields',async()=>{
  let sent,hasSupplemental,hasSampleBanner;
  await harness('/memories/88/edit',async(url,options)=>{if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    await fill('memory-title','第一次跨城，值得了');
    hasSupplemental=Boolean(document.querySelector('.composer-extra'));
    hasSampleBanner=Boolean(document.querySelector('.memory-composer .sample-notice'));
    await act(async()=>document.querySelector('.composer-recommendations button:not(.composer-existing-tag)').click());
    const cover=document.querySelector('[aria-label="将第2张照片设为封面"]');assert.ok(cover);
    await act(async()=>cover.click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(hasSupplemental,false,'the removed supplemental section must not reappear when editing');
  assert.equal(hasSampleBanner,false,'the sample banner is not part of the composer');
  assert.equal(sent.title,'第一次跨城，值得了');assert.deepEqual(sent.tags,['演唱会','散场','散场以后']);assert.deepEqual(sent.photo_ids,['a','b']);assert.equal(sent.photo_id,'b');
});

test('editing can remove an existing tag without the deleted tag input',async()=>{
  let sent;
  await harness('/memories/88/edit',async(url,options)=>{if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act})=>{
    await act(async()=>document.querySelector('[aria-label="移除标签演唱会"]').click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.deepEqual(sent.tags,['散场']);
});

test('music scene from My opens the existing map and returns to the same My view',async()=>{
  await harness('/memories?view=cards',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-04',artists:[],cities:[],events:[]});
    if(url==='/api/playlists')return Response.json([]);
    throw new Error(url);
  },async({act,until,location})=>{
    await act(async()=>[...document.querySelectorAll('.collection-categories button')].find(button=>button.textContent==='音乐现场').click());
    assert.equal(location().pathname,'/footprints');
    await until('.atlas-searchbar');
    const back=document.querySelector('.atlas-return-mine');
    assert.ok(back,'the map needs an explicit way back to My');
    await act(async()=>document.querySelector('.atlas-artist-pills button').click());
    assert.ok(document.querySelector('.atlas-return-mine'),'the return action persists when map filters change');
    await act(async()=>document.querySelector('.atlas-return-mine').click());
    assert.equal(location().pathname,'/memories');
    assert.equal(location().search,'?view=cards');
  });
});

test('the music scene still returns to My when its map data cannot load',async()=>{
  let backHref;
  await harness('/footprints?from=mine&return=%2Fmemories%3Fview%3Dcards',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({detail:'地图暂不可用'},{status:503});
    if(url==='/api/playlists')return Response.json([]);
    throw new Error(url);
  },async({until})=>{
    await until('.atlas-loading .back-link');
    backHref=document.querySelector('.atlas-loading .back-link').getAttribute('href');
  });
  assert.equal(backHref,'/memories?view=cards');
});

test('publication preview discloses complete gallery, title and tags without sharing private time',async()=>{
  await harness('/memories/88',async url=>{throw new Error(url);},async({act})=>{
    await act(async()=>document.querySelector('.visibility-trigger').click());
    await act(async()=>document.querySelector('.visibility-options button:last-child').click());
    const preview=document.querySelector('[aria-label="公开卡片预览"]');
    assert.ok(preview.textContent.includes(card.title));assert.ok(preview.textContent.includes('#演唱会'));assert.equal(preview.querySelectorAll('img').length,2);
    assert.ok(!preview.textContent.includes('2025'));assert.ok(!preview.textContent.includes(card.life_time));
  });
});

test('public and private detail titles use the same card typography',async()=>{
  const css=(await readFile(new URL('../src/fanCards.css',import.meta.url),'utf8'))+(await readFile(new URL('../src/designSync.css',import.meta.url),'utf8'));
  const dom=new JSDOM(`<style>${css}</style><section class="public-detail"><article class="public-moment unified-story-card"><h1 class="moment-title">公开标题</h1></article></section><section class="memory-detail"><article class="unified-story-card"><h1 class="moment-title">我的标题</h1></article></section>`);
  const [publicTitle,myTitle]=dom.window.document.querySelectorAll('.moment-title');
  const actual=dom.window.getComputedStyle(myTitle).fontFamily,expected=dom.window.getComputedStyle(publicTitle).fontFamily;
  dom.window.close();
  assert.equal(actual,expected);
});

test('detail song region owns playback and song navigation without duplicate outside players',async()=>{
  const story={...card,excerpt:card.story,author_name:'听友',is_demo_sample:false};
  let songLineHasLink,hasSongAction,songLineText;
  await harness('/stories/88',async url=>{if(url==='/api/stories/88')return Response.json(story);throw new Error(url);},async({act,location})=>{
    const songLine=document.querySelector('.public-detail .unified-story-card .card-song-line');
    songLineHasLink=Boolean(songLine.querySelector('a'));
    songLineText=songLine.textContent;
    hasSongAction=[...document.querySelectorAll('.public-detail a')].some(link=>link.textContent==='查看歌曲 →');
    const play=songLine.querySelector('button[aria-label="播放散场以后"]');
    assert.ok(play,'playback belongs inside the bordered song region');
    assert.equal(document.querySelectorAll('.public-detail audio').length,1);
    assert.ok(songLine.contains(document.querySelector('audio')));
    await act(async()=>play.click());
    assert.ok(songLine.querySelector('button[aria-label="暂停散场以后"]'));
    assert.equal(location().pathname,'/stories/88','play is separate from song navigation');
    await act(async()=>songLine.querySelector('button').click());
    assert.ok(songLine.querySelector('button[aria-label="播放散场以后"]'));
  });
  assert.equal(songLineHasLink,true);
  assert.match(songLineText,/散场以后.*Demo Artist/);
  assert.equal(hasSongAction,false,'no duplicate song action outside the card');
});

const revisionCatalog={today:'2026-10-04',artists:[{id:'gem',name:'邓紫棋'},{id:'liu-yuxin',name:'刘雨昕'}],cities:[{id:'shanghai',name:'上海',lng:121.47,lat:31.23},{id:'beijing',name:'北京',lng:116.4,lat:39.9}],events:[
  {id:'sh',artist_id:'gem',title:'邓紫棋上海站',city:'上海',venue:'上海体育场',date:'2026-10-02',source_url:'https://example.com',source_title:'公告',songs:[{title:'光年之外',artist:'邓紫棋',url:'https://y.qq.com/'}]},
  {id:'bj',artist_id:'liu-yuxin',title:'刘雨昕北京站',city:'北京',venue:'五棵松',date:'2026-10-03',source_url:'https://example.com',source_title:'公告',songs:[]},
]};

test('selected singer removes unrelated map markers and All restores them',async()=>{
  await harness('/footprints',async url=>{if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);if(url==='/api/playlists')return Response.json([]);throw new Error(url);},async({act,until})=>{
    await until('.atlas-map-fallback');
    assert.equal(document.querySelectorAll('.atlas-map-fallback button').length,2);
    await act(async()=>[...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='邓紫棋').click());
    assert.deepEqual([...document.querySelectorAll('.atlas-map-fallback button')].map(button=>button.textContent),['上海']);
    await act(async()=>[...document.querySelectorAll('.atlas-artist-pills button')].find(button=>button.textContent==='全部').click());
    assert.equal(document.querySelectorAll('.atlas-map-fallback button').length,2);
  });
});

test('a singer without a verified portrait has an explicitly named map fallback',async()=>{
  const catalog={...revisionCatalog,artists:[{id:'phoenix',name:'凤凰传奇'}],events:[{...revisionCatalog.events[0],artist_id:'phoenix'}]};
  await harness('/footprints?artist=phoenix',async url=>{if(url==='/api/footprints/catalog')return Response.json(catalog);if(url==='/api/playlists')return Response.json([]);throw new Error(url);},async({until})=>{
    await until('.atlas-map-fallback');
    const marker=document.querySelector('.atlas-map-fallback button');
    assert.match(marker.getAttribute('aria-label'),/凤凰传奇/);
    assert.equal(marker.querySelector('.map-artist-fallback').textContent,'凤凰传奇');
    assert.equal(marker.querySelector('img'),null,'a concert image is never represented as this singer’s portrait');
  });
});

test('month filter defaults to this month and applies numeric year/month only on confirmation',async()=>{
  await harness('/footprints',async url=>{if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);if(url==='/api/playlists')return Response.json([]);throw new Error(url);},async({act,fill,until,location})=>{
    await until('.atlas-month-filter button');
    await act(async()=>document.querySelector('.atlas-month-filter button').click());
    assert.equal(document.body.style.overflow,'hidden','the month sheet prevents background scrolling');
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    assert.equal(document.getElementById('schedule-year').value,parts.find(part=>part.type==='year').value);
    assert.equal(document.getElementById('schedule-month').value,parts.find(part=>part.type==='month').value);
    await fill('schedule-year','2025');await fill('schedule-month','9');
    assert.equal(new URLSearchParams(location().search).has('month'),false);
    await act(async()=>document.querySelector('.atlas-month-sheet button[type="submit"]').click());
    assert.equal(new URLSearchParams(location().search).get('month'),'2025-09');
    assert.equal(document.querySelector('.atlas-month-sheet'),null);
    assert.equal(document.body.style.overflow,'');
    assert.match(document.querySelector('.atlas-itinerary').textContent,/暂无/);
  });
});

test('saved schedule heart toggles off and can be collected again',async()=>{
  let saved=true;
  await harness('/footprints?month=2026-10',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);
    if(url==='/api/playlists')return Response.json(saved?[{id:7,event_id:'sh'}]:[]);
    if(url==='/api/playlists/concerts/sh'&&options.method==='DELETE'){saved=false;return new Response(null,{status:204});}
    if(url==='/api/playlists/concerts/sh'&&options.method==='PUT'){saved=true;return Response.json({id:8,event_id:'sh'});}
    throw new Error(url);
  },async({act,until})=>{
    await until('.atlas-schedule-heart.is-saved');
    const heart=document.querySelector('.atlas-schedule-heart.is-saved');
    assert.equal(heart.disabled,false,'a saved heart is still actionable');
    await act(async()=>heart.click());
    assert.equal(saved,false);
    assert.equal(document.querySelector('.atlas-schedule-heart').getAttribute('aria-pressed'),'false');
    await act(async()=>document.querySelector('.atlas-schedule-heart').click());
    assert.equal(saved,true);
    assert.equal(document.querySelector('.atlas-schedule-heart').getAttribute('aria-pressed'),'true');
  });
});

test('real-song names open the exact QQ homepage with playback independently available',async()=>{
  const real={...song,id:104,title:'REALITY',artist:'刘雨昕',is_demo:false,audio_available:false,audio_url:null,qq_music_url:'https://y.qq.com/n/ryqq/songDetail/000h6xTe1LRGfl'};
  await harness('/stories/104',async url=>{if(url==='/api/stories/104')return Response.json({...card,song:real,song_id:104,excerpt:card.story,author_name:'听友'});throw new Error(url);},async()=>{
    const region=document.querySelector('.card-song-line');
    assert.equal(region.querySelector('.card-song-name').getAttribute('href'),'https://y.qq.com/n/ryqq/songDetail/000h6xTe1LRGfl');
    assert.equal(region.querySelector('.card-song-name').target,'_blank');
    assert.ok(region.querySelector('[aria-label="在QQ音乐播放REALITY"]'));
    assert.equal(document.querySelector('.public-detail>.audio-unavailable'),null);
  });
});

test('saved concert panel supports cancel and synchronizes the schedule when returning',async()=>{
  const event=revisionCatalog.events[0];let saved=[{id:7,event_id:event.id,songs:event.songs}];
  await harness('/footprints?month=2026-10',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);
    if(url==='/api/playlists')return Response.json(saved);
    if(url==='/api/footprints')return Response.json([]);
    if(url==='/api/playlists/concerts/sh'&&options.method==='DELETE'){saved=[];return new Response(null,{status:204});}
    throw new Error(url);
  },async({act,go,until})=>{
    await until('.atlas-schedule-heart.is-saved');
    await go('/footprints?event=sh&scene=sky&month=2026-10');
    await until('.concert-collect .is-saved');
    const cancel=document.querySelector('.concert-collect button[aria-label="取消收藏歌单"]');
    assert.ok(cancel);
    await act(async()=>cancel.click());
    await go('/footprints?month=2026-10');
    assert.equal(document.querySelector('.atlas-schedule-heart').getAttribute('aria-pressed'),'false');
  });
});

test('cancelling a saved concert cannot start a conflicting snapshot refresh',async()=>{
  const event=revisionCatalog.events[0];let finishDelete,refreshes=0;
  const saved={id:7,event_id:event.id,songs:event.songs,update_available:true,snapshot_version:'old',current_version:'new'};
  await harness('/footprints?event=sh&scene=sky&month=2026-10',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);
    if(url==='/api/playlists')return Response.json([saved]);
    if(url==='/api/footprints')return Response.json([]);
    if(url==='/api/playlists/concerts/sh'&&options.method==='DELETE')return new Promise(resolve=>{finishDelete=()=>resolve(new Response(null,{status:204}));});
    if(url==='/api/playlists/7/refresh'){refreshes++;return Response.json(saved);}
    throw new Error(url);
  },async({act,until})=>{
    await until('.concert-collect .is-saved');
    await act(async()=>document.querySelector('.concert-collect button[aria-label="取消收藏歌单"]').click());
    const update=document.querySelector('.concert-collect .playlist-update-button');
    assert.equal(update.disabled,true,'a cancellation in progress blocks a conflicting refresh');
    await act(async()=>update.click());
    assert.equal(refreshes,0);
    await act(async()=>finishDelete());
    assert.equal(document.querySelector('.concert-collect .is-saved'),null);
  });
});

test('one shared playlist read gates cancellation and preserves other favorites across panels',async()=>{
  let reads=0,finishInitial;
  const saved=[{id:7,event_id:'sh',songs:revisionCatalog.events[0].songs},{id:8,event_id:'bj',songs:revisionCatalog.events[1].songs}];
  await harness('/footprints?event=sh&scene=sky&month=2026-10',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);
    if(url==='/api/playlists')return ++reads===1?new Promise(resolve=>{finishInitial=()=>resolve(Response.json(saved));}):Response.json(saved);
    if(url==='/api/footprints')return Response.json([]);
    if(url==='/api/playlists/concerts/sh'&&options.method==='DELETE')return new Response(null,{status:204});
    throw new Error(url);
  },async({act,go,until})=>{
    await until('.concert-collect button');
    assert.equal(document.querySelector('.concert-collect button').disabled,true,'no independent panel snapshot permits mutations before the shared read');
    assert.equal(reads,1,'the page and its concert panel use one owner-scoped read');
    await act(async()=>finishInitial());
    await until('.concert-collect .is-saved');
    await act(async()=>document.querySelector('.concert-collect button[aria-label="取消收藏歌单"]').click());
    await go('/footprints?month=2026-10');
    const sh=document.querySelector('[aria-label="收藏 上海 邓紫棋"]');
    assert.ok(sh,'the cancelled heart stays unfilled after the obsolete read');
    assert.equal(sh.getAttribute('aria-pressed'),'false');
    await go('/footprints?month=2026-10&city=beijing&venue=北京:北京五棵松&event=bj&scene=venue');
    assert.equal(document.querySelector('[aria-label="取消收藏 北京 刘雨昕"]').getAttribute('aria-pressed'),'true','unrelated saved events remain available');
  });
});

for(const origin of ['schedule','concert'])test(`pending ${origin} cancellation stays locked and reconciles after changing panels`,async()=>{
  let finishDelete,refreshes=0;
  const saved={id:7,event_id:'sh',songs:revisionCatalog.events[0].songs,update_available:true,snapshot_version:'old',current_version:'new'};
  await harness(origin==='schedule'?'/footprints?month=2026-10':'/footprints?event=sh&scene=sky&month=2026-10',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);
    if(url==='/api/playlists')return Response.json([saved]);
    if(url==='/api/footprints')return Response.json([]);
    if(url==='/api/playlists/concerts/sh'&&options.method==='DELETE')return new Promise(resolve=>{finishDelete=()=>resolve(new Response(null,{status:204}));});
    if(url==='/api/playlists/7/refresh'){refreshes++;return Response.json(saved);}
    throw new Error(url);
  },async({act,go,until})=>{
    await until(origin==='schedule'?'.atlas-schedule-heart.is-saved':'.concert-collect .is-saved');
    await act(async()=>document.querySelector(origin==='schedule'?'.atlas-schedule-heart.is-saved':'.concert-collect button[aria-label="取消收藏歌单"]').click());
    if(origin==='schedule'){
      await go('/footprints?event=sh&scene=sky&month=2026-10');
      await until('.playlist-update-button');
      assert.equal(document.querySelector('.playlist-update-button').disabled,true);
      await act(async()=>document.querySelector('.playlist-update-button').click());
    }else{
      await go('/footprints?month=2026-10');
      assert.equal(document.querySelector('.atlas-schedule-heart').disabled,true);
    }
    assert.equal(refreshes,0,'refresh cannot compete with a cancellation started in another panel');
    await act(async()=>finishDelete());
    await go('/footprints?month=2026-10');
    assert.equal(document.querySelector('.atlas-schedule-heart').getAttribute('aria-pressed'),'false');
    assert.equal(document.querySelector('.atlas-schedule-heart').disabled,false);
  });
});

test('a failed shared favorite read can retry without leaving the music scene',async()=>{
  let reads=0;
  await harness('/footprints?event=sh&scene=sky&month=2026-10',async url=>{
    if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);
    if(url==='/api/playlists')return ++reads===1?Response.json({detail:'连接暂时中断'},{status:503}):Response.json([{id:7,event_id:'sh',songs:revisionCatalog.events[0].songs}]);
    if(url==='/api/footprints')return Response.json([]);
    throw new Error(url);
  },async({act,until})=>{
    await until('.concert-collect [role="alert"]');
    assert.equal(document.querySelector('.concert-collect .collect-button').disabled,true,'unknown favorite state must not permit writes');
    const retry=[...document.querySelectorAll('.concert-collect button')].find(button=>button.textContent==='重试读取收藏');
    assert.ok(retry,'transient failure has a local recovery entry');
    await act(async()=>retry.click());
    await until('.concert-collect .is-saved');
    assert.equal(reads,2);
    assert.equal(document.querySelector('.concert-collect .collect-button').disabled,false);
  });
});

test('My and public details share the full reading-card template with ownership controls outside',async()=>{
  const story={...card,excerpt:card.story,author_name:'我',is_demo_sample:false};
  await harness('/memories/88',async url=>{if(url==='/api/stories/88')return Response.json(story);throw new Error(url);},async({go})=>{
    const mine=document.querySelector('.unified-story-card');
    assert.ok(mine.querySelector('.story-byline'),'My detail has the same author header');
    assert.equal(mine.querySelector('.visibility-trigger'),null,'privacy operations are outside the reading card');
    const sections=[...mine.children].map(element=>element.className);
    await go('/stories/88');
    assert.deepEqual([...document.querySelector('.unified-story-card').children].map(element=>element.className),sections);
    assert.equal(document.querySelector('.unified-story-card h1').textContent,card.title);
    assert.equal(document.querySelector('.unified-story-card .original-story').textContent,card.story+' #演唱会#散场');
  });
});

test('place search follows catalog cities and venues rather than hardcoded choices',async()=>{
  const catalog={artists:[],cities:[{id:'shanghai',name:'上海'},{id:'shenzhen',name:'深圳'}],events:[{id:'sh',city:'上海',venue:'上海体育场'},{id:'sz',city:'深圳',venue:'深圳湾体育中心'}]};
  await harness('/memories/88/edit',async url=>{if(url==='/api/footprints/catalog')return Response.json(catalog);throw new Error(url);},async({act,fill,until})=>{
    assert.equal(document.querySelector('.composer-setting-rows button').textContent.includes('未标记'),true);
    await act(async()=>document.querySelector('.composer-setting-rows button').click());
    await until('#composer-location-query');
    assert.equal(document.body.style.overflow,'hidden','the location sheet prevents background scrolling');
    assert.equal(document.getElementById('memory-story').value,card.story);
    await fill('composer-location-query','上海');
    const options=document.querySelector('.composer-sheet-options');
    assert.match(options.textContent,/上海体育场/);
    assert.ok(!options.textContent.includes('深圳'),'unrelated Shenzhen places are not returned');
    assert.ok(!options.textContent.includes('不标记地点'),'unset is the default, not a standalone action');
    await act(async()=>[...options.querySelectorAll('button')].find(button=>button.textContent.includes('上海体育场')).click());
    assert.match(document.querySelector('.composer-setting-rows').textContent,/上海体育场/);
    assert.equal(document.querySelector('.composer-modal'),null);
    assert.equal(document.body.style.overflow,'');
    assert.equal(document.getElementById('memory-story').value,card.story);
  });
});

for(const name of ['标记地点','标记时间','可见范围'])test(`${name} sheet keeps keyboard focus inside and restores its trigger`,async()=>{
  await harness('/memories/88/edit',async url=>{if(url==='/api/footprints/catalog')return Response.json(revisionCatalog);throw new Error(url);},async({act,until})=>{
    const trigger=[...document.querySelectorAll('.composer-setting-rows button')].find(button=>button.textContent.includes(name));
    trigger.focus();
    await act(async()=>trigger.click());
    await until('.composer-sheet');
    const sheet=document.querySelector('.composer-sheet');
    assert.equal(sheet.contains(document.activeElement),true,'time and privacy also start inside the sheet');
    const controls=[...sheet.querySelectorAll('button:not(:disabled),input:not(:disabled)')],first=controls[0],last=controls.at(-1);
    await act(async()=>{last.focus();window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',cancelable:true}));});
    assert.equal(document.activeElement,first);
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true})));
    assert.equal(document.activeElement,last);
    await act(async()=>document.querySelector('.bottom-nav a').focus());
    assert.equal(sheet.contains(document.activeElement),true,'background navigation cannot receive focus while a sheet is open');
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',cancelable:true})));
    assert.equal(document.querySelector('.composer-sheet'),null);
    assert.equal(document.activeElement,trigger);
  });
});

test('timeline shows dated groups and compact cards without repeating the full story',async()=>{
  await harness('/memories',async url=>{throw new Error(url);},async()=>{
    assert.equal(document.querySelector('#memory-query'),null);
    const entry=document.querySelector('.memory-entry');assert.ok(entry);
    assert.ok(entry.querySelector('.snapshot-date').textContent.includes('2025'));
    assert.ok(entry.textContent.includes('散场以后'));
    assert.ok(!entry.textContent.includes('最后一行也必须完整。'));
    assert.ok(document.querySelector('.collection-search-trigger'),'search opens over the collection instead of navigating away');
  });
});

test('large music player keeps the selected clip beside a single memory-writing entry',async()=>{
  await harness('/songs/1?at=10000&end=14000',async url=>{throw new Error(url);},async({act})=>{
    const play=document.querySelector('[aria-label="播放散场以后"]');assert.ok(play);
    const audio=document.querySelector('audio');await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
    await act(async()=>play.click());assert.equal(audio.currentTime,10);
    assert.ok(document.querySelector('[aria-label="播放进度"]'));
    assert.ok(document.querySelector('.song-write-entry[href="/songs/1/write?at=10000&end=14000"]'));
  });
});

test('marking a new listening position preserves loaded controls and survives a compose/back round trip',async()=>{
  await harness('/songs/1',async url=>{throw new Error(url);},async({act,location})=>{
    const audio=document.querySelector('audio');
    await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
    audio.currentTime=12;
    await act(async()=>audio.dispatchEvent(new window.Event('timeupdate')));
    await act(async()=>document.querySelector('.player-actions button').click());
    assert.equal(document.querySelector('[aria-label="播放进度"]').disabled,false);
    assert.equal(document.querySelector('[aria-label="播放散场以后"]').disabled,false);
    await act(async()=>document.querySelector('[aria-label="播放散场以后"]').click());
    assert.equal(audio.currentTime,12);
    await act(async()=>document.querySelector('.song-write-entry').click());
    await act(async()=>document.querySelector('.memory-composer .back-link').click());
    assert.equal(location().pathname,'/songs/1');assert.equal(location().search,'?at=12000');
    const restored=document.querySelector('audio');await act(async()=>restored.dispatchEvent(new window.Event('loadedmetadata')));
    assert.equal(restored.currentTime,12,'return preserves the selected music position');
    await act(async()=>document.querySelector('[role="tab"][data-view="mine"]').click());
    assert.equal(location().hash,'','choosing a reading view never creates a scroll anchor');
    assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').dataset.view,'mine');
  });
});

test('artist search preserves the visible tag constraint',async()=>{
  let sent;
  await harness('/discover?tag=散场',async(url,options)=>{
    if(url==='/api/stories/search'){sent=JSON.parse(options.body);return Response.json({mode:'keyword',items:[]});}throw new Error(url);
  },async({act,fill})=>{
    await fill('public-query','周杰伦');
    await act(async()=>document.querySelector('form.public-search').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.tag,'散场');assert.equal(sent.query,'周杰伦');
});

test('discovery connects current catalog concerts and excludes cancelled dates',async()=>{
  await harness('/discover',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-01',artists:[{id:'gem',name:'邓紫棋'}],events:[{id:'cancelled',artist_id:'gem',city:'北京',venue:'五棵松体育馆',date:'2026-10-02',event_status:'cancelled'},{id:'shenzhen',artist_id:'gem',city:'深圳',venue:'深圳大运中心体育场',date:'2026-10-01',event_status:'scheduled'}]});
    throw new Error(url);
  },async()=>{
    const links=[...document.querySelectorAll('.recent-concerts > div > a')];assert.equal(links.length,1);
    assert.ok(links[0].textContent.includes('邓紫棋'));assert.ok(links[0].textContent.includes('10.01'));assert.ok(links[0].href.includes('event=shenzhen'));
  });
});

test('the recommendation area shows other people’s stories, not the signed-in author’s own card',async()=>{
  const mine={...card,excerpt:'我的公开内容',author_name:'我',is_demo_sample:false};
  const other={...mine,id:89,owner_id:4,excerpt:'另一位听友的现场',author_name:'听友'};
  await harness('/discover',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-04',artists:[],cities:[],events:[]});
    throw new Error(url);
  },async()=>{
    const cards=[...document.querySelectorAll('.public-story-list .story-card')];
    assert.equal(cards.length,1);
    assert.ok(cards[0].querySelector('a.card-read').getAttribute('href').endsWith('/stories/89'));
  },{stories:[mine,other]});
});

test('recommended cards alternate their vertical starting position for a staggered layout',async()=>{
  const css=await readFile(new URL('../src/fanCards.css',import.meta.url),'utf8');
  const stories=[89,90,91].map(id=>({...card,id,excerpt:`听友${id}的故事`,author_name:'听友',is_demo_sample:false}));
  let topOffsets;
  await harness('/discover',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-04',artists:[],cities:[],events:[]});
    throw new Error(url);
  },async()=>{
    const style=document.createElement('style');style.textContent=css;document.head.append(style);
    topOffsets=[...document.querySelectorAll('.public-story-list .story-card')].map(item=>parseFloat(window.getComputedStyle(item).paddingTop)||0);
    style.remove();
  },{stories});
  assert.equal(topOffsets.length,3);
  assert.ok(topOffsets[1]>topOffsets[0]);
  assert.equal(topOffsets[2],topOffsets[0]);
});

test('public recommendations remain readable when private interests cannot load',async()=>{
  const other={...card,id:89,excerpt:'听友的公开故事',author_name:'听友',is_demo_sample:false};
  const mine={...card,excerpt:'自己的公开故事',author_name:'匿名听友',is_demo_sample:false,is_mine:true};
  await harness('/discover',async url=>{
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-04',artists:[],cities:[],events:[]});
    throw new Error(url);
  },async({until})=>{
    await until('.public-story-list .story-card');
    assert.equal(document.querySelectorAll('.public-story-list .story-card').length,1);
    assert.equal(document.querySelector('.public-story-list [role="alert"]'),null);
  },{stories:[mine,other],memoriesError:true});
});

test('reading a searched story and returning restores the search; player keeps the entire clip',async()=>{
  const story={...card,excerpt:card.story,author_name:'听友',is_demo_sample:false};
  const searches=[];
  await harness('/discover?q=散场&mode=semantic',async(url,options)=>{
    if(url==='/api/stories/search'){searches.push(JSON.parse(options.body));return Response.json({mode:'semantic',items:[{story,match_label:'相近经历'}]});}
    if(url==='/api/stories/88')return Response.json(story);
    if(url==='/api/footprints/catalog')return Response.json({artists:[],events:[]});
    throw new Error(url);
  },async({act})=>{
    assert.equal(document.querySelector('#public-query').value,'散场');
    const read=document.querySelector('.card-read');assert.ok(read,'URL search loads matching cards');
    await act(async()=>read.click());
    assert.ok(document.querySelector('.public-detail .back-link').href.endsWith('/discover?q=%E6%95%A3%E5%9C%BA&mode=semantic') || document.querySelector('.public-detail .back-link').href.endsWith('/discover?q=散场&mode=semantic'));
    const player=document.querySelector('.card-song-name');
    assert.ok(player.href.includes('at=10000&end=14000'));
    await act(async()=>player.click());
    await act(async()=>document.querySelector('.listening-page .back-link').click());
    await act(async()=>document.querySelector('.public-detail .back-link').click());
    assert.equal(document.querySelector('#public-query').value,'散场');
    assert.equal(searches.at(-1).mode,'semantic');
    assert.ok(document.querySelector('.story-card').textContent.includes(card.title));
  });
});

test('central creation opens a separate music search and returns without losing its draft',async()=>{
  await harness('/memories?song=1&view=cards',async url=>{if(url==='/api/songs')return Response.json([song,{...song,id:2,title:'另一首歌',artist:'另一位歌手'}]);throw new Error(url);},async({act,fill,location})=>{
    assert.equal(document.querySelector('.collection-page .round-action'),null,'reading has no competing add button');
    const create=document.querySelector('.bottom-nav a[aria-label="创建记忆"]');assert.ok(create);
    assert.equal([...document.querySelectorAll('.bottom-nav a')].indexOf(create),1,'creation is the center of three navigation items');
    await act(async()=>create.click());assert.equal(location().pathname,'/create');
    assert.ok(document.querySelector('form.memory-form'),'creation opens the writing page directly');
    await fill('memory-title','我的那个夏天');await fill('memory-story','已经写下的经历不能被选歌清空。');
    await act(async()=>document.querySelector('[aria-label="添加配乐"]').click());assert.equal(location().pathname,'/song-search');
    await fill('create-song-query','Demo Artist');
    assert.equal(document.querySelectorAll('.song-search-list button').length,1);
    await act(async()=>document.querySelector('[aria-label="选用散场以后"]').click());assert.equal(location().pathname,'/create');
    assert.equal(document.querySelector('#memory-title').value,'我的那个夏天');
    assert.equal(document.querySelector('#memory-story').value,'已经写下的经历不能被选歌清空。');
    assert.equal(document.querySelector('.composer-song-trigger strong').textContent,song.title);
    await act(async()=>document.querySelector('.memory-composer .back-link').click());
    assert.equal(location().pathname,'/memories');assert.equal(location().search,'?song=1&view=cards');
  });
});

test('music selection keeps the writing when temporary browser storage is unavailable',async()=>{
  await harness('/create',async url=>{if(url==='/api/songs')return Response.json([song]);throw new Error(url);},async({act,fill,location})=>{
    await fill('memory-story','临时存储不能挡住这一段经历。');
    Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new Error('storage disabled');}});
    await act(async()=>document.querySelector('[aria-label="添加配乐"]').click());
    assert.equal(location().pathname,'/song-search');
    await act(async()=>document.querySelector('[aria-label="选用散场以后"]').click());
    assert.equal(location().pathname,'/create');
    assert.equal(document.querySelector('#memory-story').value,'临时存储不能挡住这一段经历。');
    assert.equal(document.querySelector('.composer-song-trigger strong').textContent,song.title);
  });
});

test('a saved local draft restores even when session storage is disabled',async()=>{
  await harness('/create',async url=>{throw new Error(url);},async({act,go})=>{
    window.localStorage.setItem('memory-draft:3',JSON.stringify({version:1,story:'已保存的本地草稿',song}));
    Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new Error('storage disabled');}});
    await go('/memories');
    await go('/create');
    assert.equal(document.querySelector('#memory-story').value,'已保存的本地草稿');
  });
});

test('too many inline hashtags are rejected instead of silently truncated',async()=>{
  let submitted=false;
  await harness('/songs/1/write',async(url,options)=>{if(url==='/api/memories'&&options.method==='POST'){submitted=true;return Response.json(card);}throw new Error(url);},async({act,fill,until})=>{
    await until('.memory-form');
    await fill('memory-story',Array.from({length:9},(_,index)=>`#标签${index+1}`).join(' '));
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.match(document.querySelector('.memory-composer .form-error').textContent,/最多.*8/);
  });
  assert.equal(submitted,false);
});

test('an overlong inline hashtag is rejected without silently shortening it',async()=>{
  let submitted=false;
  await harness('/songs/1/write',async(url,options)=>{if(url==='/api/memories'&&options.method==='POST'){submitted=true;return Response.json(card);}throw new Error(url);},async({act,fill,until})=>{
    await until('.memory-form');
    await fill('memory-story',`有一晚 #${'词'.repeat(25)}`);
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.match(document.querySelector('.memory-composer .form-error').textContent,/不超过24字/);
  });
  assert.equal(submitted,false);
});

test('writing first requires a chosen song before saving and changing music preserves the story and context',async()=>{
  let catalogs=0,sent;
  await harness('/create?theme=summer',async(url,options)=>{
    if(url==='/api/songs'){catalogs++;return Response.json([song,{...song,id:2,title:'另一首歌',artist:'别人的歌手'}]);}
    if(url==='/api/memories'&&options.method==='POST'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);
  },async({act,fill,location})=>{
    assert.equal(catalogs,0);assert.ok(document.querySelector('form.memory-form'));
    await fill('memory-story','先写经历，再决定用哪首歌。');
    assert.equal(document.querySelector('.composer-save button[type="submit"]').disabled,true,'there is no arbitrarily preselected song');
    await act(async()=>document.querySelector('[aria-label="添加配乐"]').click());
    await fill('create-song-query','Demo Artist');assert.equal(catalogs,1);
    await act(async()=>document.querySelector('[aria-label="选用散场以后"]').click());
    await act(async()=>document.querySelector('.composer-recommendations button').click());
    assert.equal(document.querySelector('[aria-label="音乐里的位置"]'),null,'music-range entry was removed from the create page');
    await act(async()=>document.querySelector('[aria-label="更换配乐"]').click());
    assert.equal(location().pathname,'/song-search');
    await fill('create-song-query','别人的歌手');
    assert.equal(document.querySelector('form.memory-form'),null,'search is its own page, not a form dropdown');
    assert.equal(sent,undefined);
    await act(async()=>document.querySelector('[aria-label="选用另一首歌"]').click());
    assert.equal(document.querySelector('[aria-label="音乐里的位置"]'),null,'changing songs does not reintroduce music-range entry');
    assert.equal(document.querySelector('#memory-story').value,'先写经历，再决定用哪首歌。#散场以后');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(location().pathname,'/memories/88');
  });
  assert.equal(sent.song_id,2);assert.equal(sent.offset_ms,null);assert.equal(sent.lyric_id,null);assert.equal(sent.theme_id,'summer');assert.deepEqual(sent.tags,['散场以后']);
});

test('a locally saved creation draft restores its writing and selected song',async()=>{
  await harness('/create',async url=>{if(url==='/api/songs')return Response.json([song]);throw new Error(url);},async({act,fill,go})=>{
    await fill('memory-title','留给明天');
    await fill('memory-story','草稿中的正文仍在。');
    await act(async()=>document.querySelector('[aria-label="添加配乐"]').click());
    await fill('create-song-query','散场以后');
    await act(async()=>document.querySelector('[aria-label="选用散场以后"]').click());
    await act(async()=>document.querySelector('.composer-draft').click());
    assert.match(document.querySelector('.composer-draft').textContent,/已存草稿/);
    await go('/memories');
    await go('/create');
    assert.equal(document.querySelector('#memory-title').value,'留给明天');
    assert.equal(document.querySelector('#memory-story').value,'草稿中的正文仍在。');
    assert.equal(document.querySelector('.composer-song-trigger strong').textContent,song.title);
  });
});

test('creation visibility stays private by default and publishes only after the explicit public save',async()=>{
  let sent,writes=0;
  await harness('/songs/1/write',async(url,options)=>{
    if(url==='/api/memories'&&options.method==='POST'){sent=JSON.parse(options.body);writes++;return Response.json({...card,publication:{published:true}});}throw new Error(url);
  },async({act,fill,location})=>{
    const picker=document.querySelector('.composer-setting-rows > button:last-child');assert.ok(picker);
    assert.match(picker.textContent,/仅自己可见/);
    await fill('memory-story','想与听友分享的这一晚。');
    await act(async()=>picker.click());
    await act(async()=>[...document.querySelectorAll('.composer-sheet-options button')].find(button=>button.textContent.includes('公开可见')).click());
    assert.match(document.querySelector('.composer-save button[type="submit"]').textContent,/发布/);
    assert.equal(writes,0,'choosing public must not publish an unfinished draft');
    assert.equal(document.querySelector('[aria-label="匿名发布"]').checked,true);
    assert.equal(document.querySelector('[aria-label="公开年份和时间"]').checked,false);
    assert.equal(document.querySelector('[aria-label="匿名发布"]').closest('.composer-extra'),null,'removed extra-details block does not contain public settings');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(location().pathname,'/memories/88');
  });
  assert.equal(writes,1);assert.deepEqual(sent.publication,{confirmed:true,anonymous:true,share_life_time:false});
  assert.equal(sent.story,'想与听友分享的这一晚。');
});

test('switching public creation back to private preserves the draft and does not send publication consent',async()=>{
  let sent;
  await harness('/songs/1/write',async(url,options)=>{
    if(url==='/api/memories'&&options.method==='POST'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);
  },async({act,fill})=>{
    await fill('memory-story','这一段最后还是只留给自己。');
    await act(async()=>document.querySelector('.composer-setting-rows > button:last-child').click());
    await act(async()=>[...document.querySelectorAll('.composer-sheet-options button')].find(button=>button.textContent.includes('公开可见')).click());
    await act(async()=>document.querySelector('[aria-label="匿名发布"]').click());
    await act(async()=>document.querySelector('.composer-setting-rows > button:last-child').click());
    await act(async()=>[...document.querySelectorAll('.composer-sheet-options button')].find(button=>button.textContent.includes('仅自己可见')).click());
    assert.equal(document.querySelector('[aria-label="匿名发布"]'),null);
    assert.equal(document.querySelector('#memory-story').value,'这一段最后还是只留给自己。');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.publication,undefined);
});

test('failed public creation keeps both the visibility choice and writing for retry',async()=>{
  await harness('/songs/1/write',async(url)=>{
    if(url==='/api/memories')return Response.json({detail:'发布暂时没有完成，请重试。'},{status:503});throw new Error(url);
  },async({act,fill,location})=>{
    await fill('memory-story','失败后仍然保留的正文。');
    await act(async()=>document.querySelector('.composer-setting-rows > button:last-child').click());
    await act(async()=>[...document.querySelectorAll('.composer-sheet-options button')].find(button=>button.textContent.includes('公开可见')).click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(location().pathname,'/songs/1/write');
    assert.equal(document.querySelector('#memory-story').value,'失败后仍然保留的正文。');
    assert.match(document.querySelector('.composer-setting-rows > button:last-child').textContent,/公开/);
    assert.match(document.querySelector('[role="alert"]').textContent,/发布暂时没有完成/);
  });
});

test('choice list measures wrapped content and closes when its anchor leaves the mobile viewport',async()=>{
  await harness('/memories',async url=>{throw new Error(url);},async({act})=>{
    const trigger=document.querySelector('.collection-tag-filter .choice-trigger');
    trigger.getBoundingClientRect=()=>({left:230,top:650,right:340,bottom:694,width:110,height:44});
    Object.defineProperty(window.HTMLElement.prototype,'scrollHeight',{configurable:true,get(){return this.classList.contains('choice-panel')?280:0;}});
    Object.defineProperty(window,'innerHeight',{configurable:true,value:844});
    Object.defineProperty(window,'innerWidth',{configurable:true,value:360});
    await act(async()=>trigger.click());
    const list=document.querySelector('[role="listbox"]');assert.ok(list);
    assert.equal(Number.parseFloat(list.style.width),110,'the option panel matches the trigger width');
    assert.ok(Number.parseFloat(list.style.top)<=360,'wrapped options are measured before opening above the control');
    assert.ok(Number.parseFloat(list.style.left)+Number.parseFloat(list.style.width)<=348);
    Object.defineProperty(window,'innerHeight',{configurable:true,value:390});
    await act(async()=>window.dispatchEvent(new window.Event('resize')));
    assert.equal(document.querySelector('[role="listbox"]'),null,'rotation closes an off-screen anchor');
    assert.equal(trigger.getAttribute('aria-expanded'),'false');
  });
});

test('memory experience filter opens an in-page choice list, preserves the view and supports keyboard dismissal',async()=>{
  await harness('/memories?view=cards',async url=>{if(url==='/api/playlists')return Response.json([]);throw new Error(url);},async({act,location})=>{
    const trigger=document.querySelector('.collection-tag-filter .choice-trigger');assert.ok(trigger,'the legacy tag filter remains available below category and city');
    await act(async()=>trigger.click());
    assert.equal(trigger.getAttribute('aria-expanded'),'true');
    assert.equal(document.querySelectorAll('[role="listbox"] [role="option"]').length,3);
    await act(async()=>document.querySelector('[role="option"][data-value="tag:演唱会"]').click());
    assert.equal(new URLSearchParams(location().search).get('tag'),'演唱会');
    assert.equal(new URLSearchParams(location().search).has('song'),false);
    assert.equal(new URLSearchParams(location().search).get('view'),'cards');
    assert.equal(document.querySelector('[role="listbox"]'),null);
    assert.equal(document.activeElement,trigger);
    await act(async()=>trigger.click());
    await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('[role="listbox"]'),null);assert.equal(document.activeElement,trigger);
    await act(async()=>trigger.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    assert.equal(document.activeElement.dataset.value,'tag:演唱会','keyboard opening starts on the current selection');
    await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true})));
    assert.equal(document.activeElement.dataset.value,'');
    await act(async()=>document.querySelector('.collection-page h1').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true})));
    assert.equal(document.querySelector('[role="listbox"]'),null,'outside interactions dismiss the list without changing the filter');
    assert.equal(new URLSearchParams(location().search).get('tag'),'演唱会');
  });
});

test('experience tags find memories across different songs and survive detail navigation',async()=>{
  const other={...card,id:89,song_id:2,song:{...song,id:2,title:'另一首歌'},tags:['演唱会','朋友']};
  const third={...card,id:90,tags:['音乐节']};
  await harness('/memories?tag=演唱会&view=cards',async url=>{throw new Error(url);},async({act,location})=>{
    assert.deepEqual([...document.querySelectorAll('.memory-entry')].map(entry=>new URL(entry.href).pathname),['/memories/88','/memories/89']);
    assert.equal(document.querySelector('.collection-tag-filter .choice-trigger').textContent,'演唱会');
    await act(async()=>document.querySelector('.memory-entry').click());
    await act(async()=>document.querySelector('.memory-detail .back-link').click());
    assert.equal(new URLSearchParams(location().search).get('tag'),'演唱会');
    assert.equal(new URLSearchParams(location().search).get('view'),'cards');
    await act(async()=>document.querySelector('.collection-tag-filter .choice-trigger').click());
    const labels=[...document.querySelectorAll('[role="option"]')].map(option=>option.textContent);
    assert.equal(labels.filter(label=>label==='演唱会').length,1,'shared tags appear once');
    assert.ok(!labels.includes(song.title)&&!labels.includes(other.song.title),'songs are context rather than memory categories');
  },{memories:[card,other,third]});
});

test('untagged memories stay retrievable without inferring categories from their text or song',async()=>{
  const untagged={...card,id:89,tags:[],story:'演唱会之后，想念那个夏天。'};
  await harness('/memories?withoutTags=1&view=cards',async url=>{throw new Error(url);},async({act,location})=>{
    assert.equal(document.querySelector('.collection-tag-filter .choice-trigger').textContent,'未加标签');
    assert.equal(document.querySelectorAll('.memory-entry').length,1);
    assert.ok(document.querySelector('.memory-entry').href.endsWith('/memories/89'));
    await act(async()=>document.querySelector('.collection-tag-filter .choice-trigger').click());
    await act(async()=>document.querySelector('[role="option"][data-value="tag:演唱会"]').click());
    assert.equal(new URLSearchParams(location().search).has('withoutTags'),false);
    assert.equal(document.querySelectorAll('.memory-entry').length,1);
    assert.ok(document.querySelector('.memory-entry').href.endsWith('/memories/88'),'only explicit tags determine a match');
  },{memories:[card,untagged]});
});

test('unmatched experience links show the chosen label and recover to all memories without losing the view',async()=>{
  await harness('/memories?tag=旅行&view=cards',async url=>{throw new Error(url);},async({act,location})=>{
    assert.equal(document.querySelector('.collection-tag-filter .choice-trigger').textContent,'旅行');
    assert.equal(document.querySelectorAll('.memory-entry').length,0);
    assert.ok(document.querySelector('.empty-paper').textContent.includes('没有符合筛选的记忆'));
    assert.equal(document.querySelector('.empty-paper a[href="/create"]'),null,'a filter miss is not a first-use empty state');
    await act(async()=>document.querySelector('.empty-paper button').click());
    assert.equal(location().search,'?view=cards');
    assert.equal(document.querySelectorAll('.memory-entry').length,1);
  });
});

test('legacy song links remain visibly constrained and switching experiences clears that constraint',async()=>{
  const other={...card,id:89,song_id:2,song:{...song,id:2,title:'另一首歌'}};
  await harness('/memories?song=1&view=cards',async url=>{throw new Error(url);},async({act,location})=>{
    assert.equal(document.querySelectorAll('.memory-entry').length,1);
    assert.ok(document.querySelector('[aria-label="清除歌曲筛选"]').textContent.includes(song.title));
    await act(async()=>document.querySelector('.collection-tag-filter .choice-trigger').click());
    await act(async()=>document.querySelector('[role="option"][data-value="tag:演唱会"]').click());
    assert.equal(new URLSearchParams(location().search).has('song'),false);
    assert.equal(document.querySelectorAll('.memory-entry').length,2);
    assert.equal(document.querySelector('[aria-label="清除歌曲筛选"]'),null);
  },{memories:[card,other]});
});

test('private memory tags retrieve personal experiences while public story tags discover shared stories',async()=>{
  const story={...card,excerpt:card.story,author_name:'听友'};
  await harness('/memories/88',async url=>{if(url==='/api/stories/88')return Response.json(story);throw new Error(url);},async({act,go,location})=>{
    const tag=document.querySelector('.memory-detail .story-tags a');
    assert.equal(new URL(tag.href).pathname,'/memories');
    await act(async()=>tag.click());
    assert.equal(new URLSearchParams(location().search).get('tag'),'演唱会');
    assert.equal(document.querySelectorAll('.memory-entry').length,1);
    await act(async()=>document.querySelector('.memory-entry').click());
    await act(async()=>document.querySelector('.memory-detail .back-link').click());
    assert.equal(new URLSearchParams(location().search).get('tag'),'演唱会');
    await go('/stories/88');
    assert.equal(new URL(document.querySelector('.public-detail .story-tags a').href).pathname,'/discover');
  });
});

test('a hashtag written in the body is linked once, without a duplicate tag after the text',async()=>{
  const story={...card,excerpt:'那一晚 #演唱会 结束了。',author_name:'听友'};
  await harness('/stories/88',async url=>{if(url==='/api/stories/88')return Response.json(story);throw new Error(url);},async()=>{
    const body=document.querySelector('.public-detail .original-story');
    assert.equal(body.textContent.match(/#演唱会/g)?.length,1);
    assert.equal(body.querySelectorAll('.story-tags a').length,2);
  });
});

test('guest creation requests login for this exact creation entry',async()=>{
  await harness('/create?event=concert',async url=>{throw new Error(url);},async()=>{
    assert.equal(document.querySelector('form.memory-form'),null);
    const login=document.querySelector('a[href^="/account?next="]');assert.ok(login);
    assert.equal(new URL(login.href).searchParams.get('next'),'/create?event=concert');
  },{guest:true});
});

test('night creation shows its exact city, venue and date immediately and saves the selected night with user-chosen music',async()=>{
  const concert={id:'concert-second-night',title:'邓紫棋 · 深圳站',city:'深圳',venue:'深圳大运中心体育场',date:'2026-09-12'};
  let sent,songCatalogs=0;
  await harness('/create?event=concert-second-night',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json({events:[{...concert,id:'concert-first-night',date:'2026-09-11'},concert]});
    if(url==='/api/songs'){songCatalogs++;return Response.json([song]);}
    if(url==='/api/memories'&&options.method==='POST'){sent=JSON.parse(options.body);return Response.json({...card,event_id:concert.id});}
    throw new Error(url);
  },async({act,fill,location})=>{
    assert.ok(document.querySelector('form.memory-form'),'the entry opens the writing form, not a separate song list');
    const context=document.querySelector('.composer-event-context');assert.ok(context);
    assert.equal(context.closest('details'),null,'the selected night is visible before expanding optional fields');
    for(const text of ['深圳','深圳大运中心体育场','2026-09-12'])assert.ok(context.textContent.includes(text));
    assert.ok(!context.textContent.includes('2026-09-11'));
    assert.equal(songCatalogs,0,'no arbitrary music recommendations are requested');
    assert.equal(document.querySelector('.composer-song-trigger').getAttribute('aria-label'),'添加配乐');
    assert.equal(new URL(document.querySelector('.memory-composer .back-link').href).searchParams.get('scene'),'sky','direct links return safely to their own night');
    await fill('memory-story','这一晚在深圳，和朋友一起合唱。');
    await act(async()=>document.querySelector('[aria-label="添加配乐"]').click());
    await fill('create-song-query','散场以后');
    await act(async()=>document.querySelector('[aria-label="选用散场以后"]').click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(location().pathname,'/memories/88');
  });
  assert.equal(sent.event_id,concert.id);assert.equal(sent.song_id,1);assert.equal(sent.story,'这一晚在深圳，和朋友一起合唱。');
});

test('removing an unavailable concert association keeps the writing and permits an ordinary memory save',async()=>{
  let sent;
  await harness('/create?event=removed-night',async(url,options)=>{
    if(url==='/api/footprints/catalog')return Response.json({events:[]});
    if(url==='/api/songs')return Response.json([song]);
    if(url==='/api/memories'&&options.method==='POST'){sent=JSON.parse(options.body);return Response.json(card);}
    throw new Error(url);
  },async({act,fill})=>{
    assert.ok(document.querySelector('.composer-event-context').textContent.includes('找不到这场演出'));
    await fill('memory-title','留下的喜欢');await fill('memory-story','已经写下的记忆。');
    await act(async()=>document.querySelector('[aria-label="取消关联这场演出"]').click());
    assert.equal(document.querySelector('.composer-event-context'),null);
    assert.equal(document.querySelector('#memory-title').value,'留下的喜欢');
    assert.equal(document.querySelector('#memory-story').value,'已经写下的记忆。');
    await act(async()=>document.querySelector('[aria-label="添加配乐"]').click());await fill('create-song-query','散场以后');
    await act(async()=>document.querySelector('[aria-label="选用散场以后"]').click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.event_id,null);assert.equal(sent.title,'留下的喜欢');
});

test('failed concert metadata can retry without clearing the memory draft',async()=>{
  let loads=0;
  await harness('/create?event=concert',async url=>{
    if(url==='/api/footprints/catalog')return ++loads===1?Response.json({detail:'场次服务暂时不可用'},{status:503}):Response.json({events:[{id:'concert',title:'这一晚',city:'广州',venue:'广州体育馆',date:'2026-09-20'}]});
    throw new Error(url);
  },async({act,fill})=>{
    await fill('memory-story','加载场次时也可以先写下故事。');
    await act(async()=>document.querySelector('[aria-label="重新加载场次信息"]').click());
    assert.ok(document.querySelector('.composer-event-context').textContent.includes('2026-09-20'));
    assert.equal(document.querySelector('#memory-story').value,'加载场次时也可以先写下故事。');
  });
});

test('memory detail groups explicit edit and delete immediately after the card without a redundant menu',async()=>{
  let deletions=0;
  await harness('/memories/88',async(url,options)=>{if(url==='/api/memories/88?revision=1'&&options.method==='DELETE'){deletions++;return new Response(null,{status:204});}throw new Error(url);},async({act})=>{
    const edit=document.querySelector('.memory-detail a[href="/memories/88/edit"]');assert.equal(edit?.textContent.trim(),'编辑');
    assert.ok(!document.querySelector('.memory-detail').textContent.includes('这首歌里的其他时刻'));
    assert.ok(!document.querySelector('.memory-detail .delete-trigger'));
    assert.ok(!document.querySelector('[aria-label="更多记忆操作"]'));
    assert.ok(!document.querySelector('.memory-toolbar a[href$="/edit"]'),'the reading header stays focused on navigation');
    const remove=document.querySelector('[aria-label="删除这段记忆"]');assert.ok(remove);
    assert.equal(edit.parentElement,remove.parentElement,'both actions belong to the same visible operation row');
    assert.equal(document.querySelector('.memory-detail > article').nextElementSibling,edit.parentElement,'management belongs to the card, before music and reflections');
    await act(async()=>remove.click());
    const dialog=document.querySelector('[role="alertdialog"]');assert.ok(dialog);assert.equal(deletions,0,'opening the dialog never deletes');
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})));
    assert.equal(document.querySelector('[role="alertdialog"]'),null);assert.equal(deletions,0);
    assert.equal(document.activeElement,remove,'closing returns focus to the explicit delete button');
  });
});

test('delete conflict reloads the latest version and requires a fresh confirmation',async()=>{
  const requests=[];let loads=0;
  await harness('/memories/88',async(url,options)=>{
    if(options.method==='DELETE'){requests.push(url);return requests.length===1?Response.json({detail:'记忆已更新，请重新打开。'},{status:409}):new Response(null,{status:204});}throw new Error(url);
  },async({act,location})=>{
    const open=async()=>act(async()=>document.querySelector('[aria-label="删除这段记忆"]').click());
    await open();await act(async()=>document.querySelector('.memory-delete-dialog .danger-button').click());
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('记忆已更新'));
    const reload=document.querySelector('.memory-delete-dialog .reload-memory');assert.ok(reload,'a conflict must allow fetching the current revision');
    await act(async()=>reload.click());
    assert.equal(document.querySelector('[role="alertdialog"]'),null,'new content is shown before reconfirming');
    assert.equal(requests.length,1,'refresh never deletes automatically');assert.ok(loads>=2);
    await open();await act(async()=>document.querySelector('.memory-delete-dialog .danger-button').click());
    assert.deepEqual(requests,['/api/memories/88?revision=1','/api/memories/88?revision=2']);assert.equal(location().pathname,'/memories');
  },{memory:()=>({...card,revision:++loads===1?1:2})});
});

test('six-photo story uses a three-column gallery and supports keyboard exit to the opener',async()=>{
  const story={...card,excerpt:card.story,author_name:'听友',photos:Array.from({length:6},(_,i)=>({id:String(i),url:`/api/photos/${i}`}))};
  await harness('/stories/88',async url=>{if(url==='/api/stories/88')return Response.json(story);throw new Error(url);},async({act})=>{
    const gallery=document.querySelector('.moment-gallery');
    assert.ok(!gallery.classList.contains('moment-gallery-4'),'5–9 photos must not use the four-photo layout');
    assert.equal(gallery.querySelectorAll('button').length,6);
    const opener=gallery.querySelectorAll('button')[2];opener.focus();
    await act(async()=>opener.click());
    assert.equal(document.body.style.overflow,'hidden');
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight'})));
    assert.equal(document.querySelector('.photo-lightbox img').getAttribute('alt'),'第4张照片大图');
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})));
    assert.equal(document.querySelector('.photo-lightbox'),null);
    assert.equal(document.activeElement,opener);
    assert.equal(document.body.style.overflow,'');
  });
});

test('song without a recording retains a clearly disabled conventional player',async()=>{
  await harness('/songs/102',async url=>{if(url==='/api/songs/102')return Response.json({...song,id:102,title:'光年之外',audio_url:null,audio_available:false,duration_ms:null,is_demo:false});throw new Error(url);},async()=>{
    const play=document.querySelector('[aria-label="播放光年之外"]');
    assert.ok(play);assert.equal(play.disabled,true);
    assert.ok(document.querySelector('.missing-audio').textContent.includes('暂未接入'));
    assert.equal(document.querySelector('audio'),null,'never substitute another recording');
    assert.ok(document.querySelector('.song-write-entry[href="/songs/102/write"]'));
  });
});

test('composer keeps existing metadata on save without restoring the removed supplemental section',async()=>{
  let sent;
  await harness('/memories/88/edit',async(url,options)=>{if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    const composer=document.querySelector('.memory-composer');assert.ok(composer);
    assert.equal(composer.querySelectorAll('details[open]').length,0);
    assert.ok(document.querySelector('#memory-story').closest('details')===null,'story stays immediately available');
    assert.ok(document.querySelector('#memory-title').closest('details')===null,'short title remains optional and visible');
    assert.equal(document.querySelector('#memory-tags'),null);
    assert.equal(document.querySelector('[aria-label="年份"]'),null);
    assert.ok(document.querySelector('[aria-label="音乐里的位置"]').closest('details'),'music controls remain disclosed on demand');
    await fill('memory-story','修改正文后，原有时间和标签不会丢失。');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.life_year,2025);assert.equal(sent.life_time,card.life_time);assert.deepEqual(sent.tags,card.tags);assert.equal(sent.offset_ms,10000);assert.equal(sent.end_ms,14000);
});

test('song separates public stories from personal memories and restores the selected view after reading and writing',async()=>{
  const story={...card,excerpt:card.story,author_name:'听友'};
  await harness('/songs/1?at=10000&end=14000',async url=>{
    if(url==='/api/stories/88')return Response.json(story);
    if(url==='/api/memories?song_id=1')return Response.json([card]);
    throw new Error(url);
  },async({act,location})=>{
    assert.equal(document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.view,'stories');
    assert.equal(document.querySelectorAll('.listening-page .memory-entry').length,0,'private records must not duplicate public stories in the same reading view');
    await act(async()=>document.querySelector('.listening-page .card-read').click());
    assert.equal(location().pathname,'/stories/88');
    await act(async()=>document.querySelector('.public-detail .back-link').click());
    assert.equal(location().pathname,'/songs/1');assert.equal(location().search,'?at=10000&end=14000');
    await act(async()=>document.querySelector('[role="tab"][data-view="mine"]').click());
    assert.equal(document.querySelectorAll('.listening-page .memory-entry').length,1);
    assert.equal(document.querySelector('.listening-page .public-story-list'),null);
    const origin=location().search;
    await act(async()=>document.querySelector('.song-write-entry').click());
    assert.equal(location().pathname,'/songs/1/write');assert.equal(location().search,'?at=10000&end=14000');
    await act(async()=>document.querySelector('.memory-composer .back-link').click());
    assert.equal(location().search,origin);assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').dataset.view,'mine');
  },{stories:[story]});
});

test('a filtered discovery page can return to its actual song entry without clearing the selected clip',async()=>{
  await harness('/songs/1?at=10000&end=14000',async url=>{throw new Error(url);},async({act,go,location})=>{
    await go('/discover?song=1');
    const back=document.querySelector('.discover-page > .back-link');assert.ok(back,'legacy filtered links need an in-app return');
    await act(async()=>back.click());
    assert.equal(location().pathname,'/songs/1');assert.equal(location().search,'?at=10000&end=14000');
  });
});

test('guest personal view offers contextual login without requesting private memories',async()=>{
  const requests=[];
  await harness('/songs/1?at=10000&end=14000',async url=>{requests.push(url);throw new Error(url);},async({act,location})=>{
    await act(async()=>document.querySelector('[role="tab"][data-view="mine"]').click());
    assert.equal(document.querySelectorAll('.song-reading-panel .memory-entry').length,0);
    const login=document.querySelector('.song-reading-panel a[href^="/account?"]');assert.ok(login);
    assert.equal(new URL(login.href).searchParams.get('next'),location().pathname+location().search);
    assert.ok(!requests.some(path=>path.startsWith('/api/memories')));
  },{guest:true});
});

test('memory editing does not depend on the theme catalog and preserves an existing association when saving',async()=>{
  let sent;
  await harness('/memories/88/edit',async(url,options)=>{
    if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);
  },async({act,fill})=>{
    await fill('memory-story','整理正文时保留原有数据。');
    const save=document.querySelector('.composer-save button[type="submit"]');assert.equal(save.disabled,false);
    assert.ok(!document.querySelector('.composer-extra select'),'there is no competing theme picker');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(sent.theme_id,'summer');
  },{memory:()=>({...card,theme_id:'summer'}),themesError:true});
});

test('playlist back returns to the actual filtered memory collection, including browser forward/back',async()=>{
  await harness('/memories?song=1&view=cards',async url=>{if(url==='/api/playlists')return Response.json([]);throw new Error(url);},async({act,go,location,until})=>{
    await act(async()=>document.querySelector('.memory-playlist-link').click());
    await until('.saved-playlists .back-link');
    await act(async()=>document.querySelector('.saved-playlists .back-link').click());
    assert.equal(location().pathname,'/memories');assert.equal(location().search,'?song=1&view=cards');
    assert.ok(document.querySelector('[aria-label="清除歌曲筛选"]').textContent.includes('散场以后'));
    assert.equal(document.querySelector('.timeline-toggle button:last-child').getAttribute('aria-pressed'),'true');
    await go(1);await until('.saved-playlists .back-link');assert.equal(location().pathname,'/playlists','back must POP, not push another memory page');
    await go(-1);assert.equal(location().pathname,'/memories');
  });
});

test('story → compose → cancel and save return to the story rather than an unrelated song or collection',async()=>{
  const story={...card,excerpt:card.story,author_name:'听友'};
  await harness('/discover?q=散场',async(url,options)=>{
    if(url==='/api/stories/search')return Response.json({mode:'keyword',items:[{story}]});
    if(url==='/api/stories/88')return Response.json(story);
    if(url==='/api/memories'&&options.method==='POST')return Response.json(card);
    throw new Error(url);
  },async({act,fill,location})=>{
    await act(async()=>document.querySelector('.card-read').click());
    const compose=()=>document.querySelector('.public-detail > .primary-button');
    await act(async()=>compose().click());
    await act(async()=>document.querySelector('.memory-composer .back-link').click());
    assert.equal(location().pathname,'/stories/88');
    await act(async()=>compose().click());await fill('memory-story','测试用的虚构故事');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(location().pathname,'/memories/88');
    await act(async()=>document.querySelector('.memory-detail .back-link').click());
    assert.equal(location().pathname,'/stories/88','saving replaces the form entry');
    await act(async()=>document.querySelector('.public-detail .back-link').click());
    assert.equal(location().search,'?q=散场');
  });
});

test('editing then saving does not add a duplicate detail page or return to the editor',async()=>{
  await harness('/memories',async(url,options)=>{if(url==='/api/memories/88'&&options.method==='PATCH')return Response.json(card);throw new Error(url);},async({act,location})=>{
    await act(async()=>document.querySelector('.memory-entry').click());
    const detailKey=location().key;
    await act(async()=>document.querySelector('a[href="/memories/88/edit"]').click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(location().pathname,'/memories/88');
    assert.equal(location().key,detailKey,'save returns to the existing detail visit');
    await act(async()=>document.querySelector('.memory-detail .back-link').click());
    assert.equal(location().pathname,'/memories');
  });
});

test('direct opening of the composer has a safe in-app song fallback',async()=>{
  await harness('/songs/1/write?at=10000&end=14000',async url=>{throw new Error(url);},async({act,location})=>{
    await act(async()=>document.querySelector('.back-link').click());
    assert.equal(location().pathname,'/songs/1');assert.ok(location().search.includes('at=10000'));
  });
});

test('theme → song chooser → compose returns through the actual pages, and account back keeps the entry query',async()=>{
  const theme={id:'summer',title:'音乐节的夏天',prompt:'留下夏天的一刻',description:'一起听过的歌'};
  await harness('/themes/summer',async url=>{if(url==='/api/songs')return Response.json([song]);throw new Error(url);},async({act,location})=>{
    await act(async()=>document.querySelector('.theme-page .primary-button').click());
    await act(async()=>document.querySelector('.song-selection a').click());
    assert.equal(new URLSearchParams(location().search).get('theme'),'summer');
    await act(async()=>document.querySelector('.memory-composer .back-link').click());
    assert.equal(location().pathname,'/');assert.equal(location().search,'?theme=summer');
    await act(async()=>document.querySelector('.home-page > .back-link').click());
    assert.equal(location().pathname,'/themes/summer');
  },{themes:[theme]});
  await harness('/memories?song=1&view=cards',async url=>{throw new Error(url);},async({act,go,location})=>{
    await go('/account');
    await act(async()=>document.querySelector('.account-page .back-link').click());
    assert.equal(location().pathname,'/memories');assert.equal(location().search,'?song=1&view=cards');
  });
});

test('creation keeps the clip chosen upstream without asking for it again',async()=>{
  let sent;
  await harness('/songs/1/write?at=10000&end=14000',async(url,options)=>{if(options.method){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    assert.equal(document.querySelector('.music-range'),null);
    assert.equal(document.querySelector('[aria-label="播放区间终点"]'),null);
    await fill('memory-story','测试正文');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.offset_ms,10000);
  assert.equal(sent.end_ms,14000);
});
