import assert from 'node:assert/strict';
import {test} from 'node:test';
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
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  window.HTMLMediaElement.prototype.play=async function(){this.dispatchEvent(new window.Event('play'));};
  window.HTMLMediaElement.prototype.pause=function(){this.dispatchEvent(new window.Event('pause'));};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter,useNavigate,useLocation}=await import('react-router');
  let navigate,current;function Probe(){navigate=useNavigate();current=useLocation();return null;}
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');const prior=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/me')return Response.json({user:{id:3,display_name:'我',is_demo:false}});
    if(url==='/api/themes')return Response.json(fixtures.themes??[]);
    if(url==='/api/songs/1')return Response.json(song);
    if(url==='/api/memories/88'&&!options.method)return Response.json(fixtures.memory?fixtures.memory():card);
    if(url==='/api/memories'&&!options.method)return Response.json([card]);
    if(url.startsWith('/api/stories?'))return Response.json([]);
    return respond(url,options);
  };
  const root=createRoot(document.getElementById('root'));
  const act=React.act;
  const until=async selector=>{for(let i=0;i<40&&!document.querySelector(selector);i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});assert.ok(document.querySelector(selector),selector);};
  const fill=async(id,text)=>act(async()=>{const input=document.getElementById(id);assert.ok(input,`missing ${id}`);const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  try{await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(App),React.createElement(Probe))));await work({act,fill,until,go:async to=>act(async()=>navigate(to)),location:()=>current});}
  finally{await act(async()=>root.unmount());await server.close();globalThis.fetch=prior;globalThis.FormData=priorFormData;delete globalThis.ResizeObserver;dom.window.close();}
}

test('Hear keeps its full collage after story entry and navigation back from discovery',async()=>{
  await harness('/',async url=>{
    if(url==='/api/songs')return Response.json(Array.from({length:5},(_,i)=>({...song,id:i+1,title:`原版歌曲${i+1}`,cover_url:'/photos/memory-concert-20261002.webp'})));
    if(url==='/api/footprints/catalog')return Response.json({today:'2026-10-01',artists:[],events:[]});
    throw new Error(url);
  },async({act})=>{
    assert.ok(document.querySelector('.intro-shell .collage-intro'));
    const projection=[...document.querySelectorAll('.collage-card')].map(card=>card.style.transform);
    await act(async()=>document.querySelector('.intro-copy button').click());
    assert.ok(document.querySelector('.discover-page'),'story entry opens the discovery route');
    await act(async()=>document.querySelector('.bottom-nav a[href="/"]').click());
    assert.ok(document.querySelector('.intro-shell .collage-intro'),'returning to Hear keeps the full-size home');
    assert.equal(document.querySelector('.collage-copy'),null,'the compact alternative copy never replaces home');
    assert.equal(document.querySelector('.intro-copy h1').textContent,'追过的光，留在歌里。');
    assert.deepEqual([...document.querySelectorAll('.collage-card')].map(card=>card.style.transform),projection);
    assert.deepEqual([...document.querySelectorAll('.collage-card-art img.is-visible')].map(img=>img.getAttribute('src')),Array.from({length:5},(_,i)=>`/covers/song-${i+1}.webp`));
    await act(async()=>document.querySelector('.scene-enter').click());
    assert.ok(document.querySelector('.discover-page'),'background entry also opens discovery');
    await act(async()=>document.querySelector('.brand').click());
    assert.ok(document.querySelector('.intro-shell .collage-intro'),'brand return shares the same full-size home');
  });
});

test('gallery cover, title and tags remain editable and are sent together',async()=>{
  let sent;
  await harness('/memories/88/edit',async(url,options)=>{if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    await fill('memory-title','第一次跨城，值得了');
    await fill('memory-tags','#跨城追星，演唱会');
    const cover=document.querySelector('[aria-label="将第2张照片设为封面"]');assert.ok(cover);
    await act(async()=>cover.click());
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.title,'第一次跨城，值得了');assert.deepEqual(sent.tags,['跨城追星','演唱会']);assert.deepEqual(sent.photo_ids,['a','b']);assert.equal(sent.photo_id,'b');
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

test('timeline removes private recall search and places complete date above memory text',async()=>{
  await harness('/memories',async url=>{throw new Error(url);},async()=>{
    assert.equal(document.querySelector('#memory-query'),null);
    const entry=document.querySelector('.memory-entry');assert.ok(entry);
    assert.ok(entry.querySelector('.snapshot-date').textContent.includes('2025'));
    assert.ok(entry.textContent.includes('最后一行也必须完整。'));
  });
});

test('large music player and song cards entrance are available on the regular song route',async()=>{
  await harness('/songs/1?at=10000&end=14000',async url=>{throw new Error(url);},async({act})=>{
    const play=document.querySelector('[aria-label="播放散场以后"]');assert.ok(play);
    const audio=document.querySelector('audio');await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
    await act(async()=>play.click());assert.equal(audio.currentTime,10);
    assert.ok(document.querySelector('[aria-label="播放进度"]'));
    assert.ok(document.querySelector('a[href="/discover?song=1"]'));
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
    await act(async()=>document.querySelector('.song-community-actions a:last-child').click());
    await act(async()=>document.querySelector('.memory-composer .back-link').click());
    assert.equal(location().pathname,'/songs/1');assert.equal(location().search,'?at=12000');
    const restored=document.querySelector('audio');await act(async()=>restored.dispatchEvent(new window.Event('loadedmetadata')));
    assert.equal(restored.currentTime,12,'return preserves the selected music position');
    const visitKey=location().key;
    await act(async()=>document.querySelector('.song-community-actions > button').click());
    assert.equal(location().key,visitKey,'scrolling to listeners must not add a native hash history entry');
    assert.equal(document.activeElement.id,'song-conversation');
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
    const player=[...document.querySelectorAll('a')].find(link=>link.textContent==='走进这首歌 →');
    assert.ok(player.href.includes('at=10000&end=14000'));
    await act(async()=>player.click());
    await act(async()=>document.querySelector('.listening-page .back-link').click());
    await act(async()=>document.querySelector('.public-detail .back-link').click());
    assert.equal(document.querySelector('#public-query').value,'散场');
    assert.equal(searches.at(-1).mode,'semantic');
    assert.ok(document.querySelector('.story-card').textContent.includes(card.title));
  });
});

test('central creation has its own route and returns to the filtered reading collection',async()=>{
  await harness('/memories?song=1&view=cards',async url=>{if(url==='/api/songs')return Response.json([song,{...song,id:2,title:'另一首歌',artist:'另一位歌手'}]);throw new Error(url);},async({act,fill,location})=>{
    assert.equal(document.querySelector('.collection-page .round-action'),null,'reading has no competing add button');
    const create=document.querySelector('.bottom-nav a[aria-label="创建记忆"]');assert.ok(create);
    assert.equal([...document.querySelectorAll('.bottom-nav a')].indexOf(create),2,'creation is the center navigation item');
    await act(async()=>create.click());assert.equal(location().pathname,'/create');
    await fill('create-song-query','Demo Artist');
    assert.equal(document.querySelectorAll('.creation-song-list a').length,1);
    await act(async()=>document.querySelector('.creation-song-list a').click());assert.equal(location().pathname,'/songs/1/write');
    await act(async()=>document.querySelector('.memory-composer .back-link').click());assert.equal(location().pathname,'/create');
    assert.equal(document.querySelector('#create-song-query').value,'Demo Artist','return restores the song search');
    await act(async()=>document.querySelector('.creation-page .back-link').click());
    assert.equal(location().pathname,'/memories');assert.equal(location().search,'?song=1&view=cards');
  });
});

test('memory detail has clear edit and an isolated, cancellable delete confirmation',async()=>{
  let deletions=0;
  await harness('/memories/88',async(url,options)=>{if(url==='/api/memories/88?revision=1'&&options.method==='DELETE'){deletions++;return new Response(null,{status:204});}throw new Error(url);},async({act})=>{
    const edit=document.querySelector('.memory-toolbar a[href="/memories/88/edit"]');assert.equal(edit?.textContent.trim(),'编辑');
    assert.ok(!document.querySelector('.memory-detail').textContent.includes('这首歌里的其他时刻'));
    assert.ok(!document.querySelector('.memory-detail .delete-trigger'));
    const more=document.querySelector('[aria-label="更多记忆操作"]');assert.ok(more);
    await act(async()=>more.click());await act(async()=>document.querySelector('[aria-label="删除这段记忆"]').click());
    const dialog=document.querySelector('[role="alertdialog"]');assert.ok(dialog);assert.equal(deletions,0,'opening the dialog never deletes');
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})));
    assert.equal(document.querySelector('[role="alertdialog"]'),null);assert.equal(deletions,0);
    assert.equal(document.activeElement,more,'closing returns focus to the menu');
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
    assert.ok(document.querySelector('a[href="/discover?song=102"]'));
  });
});

test('composer is concise while collapsed options preserve existing metadata on save',async()=>{
  let sent;
  await harness('/memories/88/edit',async(url,options)=>{if(url==='/api/memories/88'){sent=JSON.parse(options.body);return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    const composer=document.querySelector('.memory-composer');assert.ok(composer);
    assert.equal(composer.querySelectorAll('details[open]').length,0);
    assert.ok(document.querySelector('#memory-story').closest('details')===null,'story stays immediately available');
    assert.ok(document.querySelector('#memory-title').closest('details')===null,'short title remains optional and visible');
    for(const selector of ['#memory-tags','[aria-label="人生里的年份"]','[aria-label="音乐里的位置"]'])assert.ok(document.querySelector(selector).closest('details'),'optional controls are disclosed on demand');
    await fill('memory-story','修改正文，折叠的时间与标签不丢失。');
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  });
  assert.equal(sent.life_year,2025);assert.equal(sent.life_time,card.life_time);assert.deepEqual(sent.tags,card.tags);assert.equal(sent.offset_ms,10000);assert.equal(sent.end_ms,14000);
});

test('playlist back returns to the actual filtered memory collection, including browser forward/back',async()=>{
  await harness('/memories?song=1&view=cards',async url=>{if(url==='/api/playlists')return Response.json([]);throw new Error(url);},async({act,go,location,until})=>{
    await act(async()=>document.querySelector('.memory-playlist-link').click());
    await until('.saved-playlists .back-link');
    await act(async()=>document.querySelector('.saved-playlists .back-link').click());
    assert.equal(location().pathname,'/memories');assert.equal(location().search,'?song=1&view=cards');
    assert.equal(document.querySelector('.song-filter select').value,'1');
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
    assert.equal(document.querySelector('.composer-extra select').value,'summer');
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

test('invalid optional music range reopens its controls and blocks a save',async()=>{
  let writes=0;
  await harness('/songs/1/write?at=10000&end=14000',async(url,options)=>{if(options.method){writes++;return Response.json(card);}throw new Error(url);},async({act,fill})=>{
    await fill('memory-story','测试正文');
    const end=document.querySelector('[aria-label="播放区间终点"]');
    await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(end,'00:05');end.dispatchEvent(new window.Event('input',{bubbles:true}));});
    await act(async()=>document.querySelector('form.memory-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(document.querySelector('.composer-music').open,true);
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('结束时间要晚于起点'));
  });
  assert.equal(writes,0);
});
