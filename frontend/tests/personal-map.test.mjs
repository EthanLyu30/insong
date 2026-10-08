import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectSchedule} from '../src/concertSchedule.ts';

test('opening a future schedule frames known upcoming events without changing the past All overview',async()=>{
  const {scheduleOverview}=await import('../src/personalMap.ts').catch(()=>({}));
  assert.equal(typeof scheduleOverview,'function');
  const cities=[{id:'xm',name:'厦门',lng:118.08,lat:24.48},{id:'sz',name:'深圳',lng:114.06,lat:22.54}];
  const events=[{id:'future',city:'厦门',date:'2026-10-31'}];
  const future=scheduleOverview('all','upcoming',events,cities);
  assert.deepEqual(future.eventIds,['future']);
  assert.deepEqual(future.center,[118.08,24.48]);
  assert.equal(scheduleOverview('all','past',events,cities),null);
  assert.equal(scheduleOverview('all','upcoming',[],cities),null);
  assert.deepEqual(scheduleOverview('mine','past',events,cities).eventIds,['future']);
});

test('personal overview selects the densest nearby region, not the device location or a distant outlier',async()=>{
  const {personalOverview}=await import('../src/personalMap.ts').catch(()=>({}));
  assert.equal(typeof personalOverview,'function');
  const cities=[{id:'sz',name:'深圳',lng:114.06,lat:22.54},{id:'gz',name:'广州',lng:113.26,lat:23.13},{id:'bj',name:'北京',lng:116.4,lat:39.9}];
  const events=[{id:'one',city:'深圳',date:'2026-08-01'},{id:'two',city:'深圳',date:'2026-10-05'},{id:'three',city:'广州',date:'2026-09-01'},{id:'outlier',city:'北京',date:'2026-10-06'}];
  const region=personalOverview(events,cities);
  assert.deepEqual(region.eventIds,['one','three','two']);
  assert.ok(region.center[0]>113&&region.center[0]<115);
  assert.ok(region.center[1]>22&&region.center[1]<24);
  assert.ok(region.bounds[1][1]<25,'a distant Beijing memory must not shrink every photo into a national overview');
  assert.deepEqual(personalOverview([...events,...events.filter(event=>event.id==='outlier')],cities).eventIds,region.eventIds,'count distinct nights, not duplicated notes');
  assert.equal(personalOverview([] ,cities),null);
  assert.equal(personalOverview([{id:'unknown',city:'未知',date:'2026-10-07'}],cities),null);
});

test('personal region ties are stable, exclude cancelled dates and retain a useful one-city frame',async()=>{
  const {personalOverview}=await import('../src/personalMap.ts').catch(()=>({}));
  assert.equal(typeof personalOverview,'function');
  const cities=[{id:'sz',name:'深圳',lng:114.06,lat:22.54},{id:'bj',name:'北京',lng:116.4,lat:39.9}];
  const events=[{id:'old',city:'深圳',date:'2026-08-01'},{id:'new',city:'北京',date:'2026-10-01'},{id:'cancel',city:'深圳',date:'2026-10-06',event_status:'cancelled'}];
  assert.deepEqual(personalOverview(events,cities).eventIds,['new']);
  assert.deepEqual(personalOverview([...events].reverse(),cities),personalOverview(events,cities));
  const single=personalOverview([events[0]],cities);
  assert.ok(single.bounds[1][0]-single.bounds[0][0]>=.2,'one note should frame a region, not zoom into a roof');
});

test('map photo identity uses accessible My photos before real popular public photos and credited fallback',async()=>{
  const {mapPhotoIdentity}=await import('../src/personalMap.ts').catch(()=>({}));
  assert.equal(typeof mapPhotoIdentity,'function');
  const shows=[{id:'a',artist_id:'gem',city:'深圳',date:'2026-09-01'},{id:'b',artist_id:'gem',city:'深圳',date:'2026-10-01'}],artists=[{id:'gem',name:'邓紫棋'}];
  const photos=[{event_id:'a',url:'/api/photos/private',source:'mine',memory_id:1,views:0},{event_id:'b',url:'/api/photos/public',source:'public',memory_id:2,views:99}];
  assert.equal(mapPhotoIdentity('深圳',shows,artists,photos,'gem').photo.url,'/api/photos/private');
  assert.equal(mapPhotoIdentity('深圳',shows,artists,photos.slice(1),'gem').source,'public');
  assert.equal(mapPhotoIdentity('深圳',shows,artists,[],'gem').source,'official','a verified official profile is the third choice, not the first');
  assert.equal(mapPhotoIdentity('深圳',[{...shows[0],artist_id:'phoenix'}],[{id:'phoenix',name:'凤凰传奇'}],[],'phoenix').source,'reference','unverified existing artwork must not be labeled official');
  assert.equal(mapPhotoIdentity('北京',shows,artists,photos,'gem').photo,undefined);
  assert.equal(mapPhotoIdentity('深圳',[{...shows[0],event_status:'cancelled'}],artists,photos,'gem').photo,undefined);
});

test('future range selects calendar months rather than a fixed 30 or 60-day approximation',()=>{
  const shows=['2026-10-07','2026-10-13','2026-10-14','2026-11-06','2026-11-07','2026-12-06','2026-12-07'].map(date=>({id:date,date}));
  assert.deepEqual(selectSchedule(shows,'upcoming','','2026-10-07','week').map(event=>event.date),['2026-10-07','2026-10-13']);
  assert.deepEqual(selectSchedule(shows,'upcoming','','2026-10-07','month').map(event=>event.date),['2026-10-07','2026-10-13','2026-10-14','2026-11-06']);
  assert.deepEqual(selectSchedule(shows,'upcoming','','2026-10-07','two-months').map(event=>event.date),shows.slice(0,6).map(event=>event.date));
  const leap=['2028-02-28','2028-02-29','2028-03-27','2028-03-28'].map(date=>({id:date,date}));
  assert.deepEqual(selectSchedule(leap,'upcoming','','2028-02-28','month').map(event=>event.date),['2028-02-28','2028-02-29','2028-03-27']);
});

test('source credits describe selected fallback images, not reference art replaced by private/public photos',async()=>{
  const {mapPhotoCredits}=await import('../src/personalMap.ts');
  assert.equal(typeof mapPhotoCredits,'function');
  const shows=[{id:'a',artist_id:'gem',city:'深圳',date:'2026-09-01'}],artists=[{id:'gem',name:'邓紫棋'}];
  assert.deepEqual(mapPhotoCredits(shows,artists,[{event_id:'a',url:'/api/photos/my-photo',source:'mine',memory_id:1}]),[]);
  assert.deepEqual(mapPhotoCredits(shows,artists,[{event_id:'a',url:'/api/photos/public-photo',source:'public',memory_id:2}]),[]);
  assert.equal(mapPhotoCredits(shows,artists,[])[0].source,'https://y.qq.com/n/ryqq/singer/001fNHEf1SFEFN');
});
