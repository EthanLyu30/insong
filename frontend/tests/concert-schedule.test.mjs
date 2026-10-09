import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectSchedule,scheduleMonths,eventChangeNote,matchesConcertSearch} from '../src/concertSchedule.ts';

const events=[
  {id:'old',date:'2025-10-01'}, {id:'today',date:'2026-10-01'},
  {id:'next',date:'2026-11-03'}, {id:'cancel',date:'2026-10-05',event_status:'cancelled'},
  {id:'recent',date:'2026-09-29'},
];
test('complete date searches are exact and singer aliases remain searchable',()=>{
  const show={date:'2026-09-11',title:'I AM GLORIA · 深圳站'},artist={name:'邓紫棋',aliases:['G.E.M.']};
  for(const date of ['9/1','9.1','9月1日','2026-09-01','2025年9月11日','9/99'])assert.equal(matchesConcertSearch(show,date,artist),false,date);
  for(const date of ['9/11','09.11','9月11日','2026-9-11','2026.09.11','2026年9月11日'])assert.equal(matchesConcertSearch(show,date,artist),true,date);
  assert.equal(matchesConcertSearch(show,'G.E.M.',artist),true);
  assert.equal(matchesConcertSearch(show,'邓紫棋',artist),true);
  assert.equal(matchesConcertSearch(show,'2026-09',artist),true);
  assert.equal(matchesConcertSearch(show,'深圳',{name:'邓紫棋'}),true,'missing aliases do not break search');
});
test('period and year-month filters keep upcoming, past and cancelled records distinct',()=>{
  assert.deepEqual(selectSchedule(events,'upcoming','','2026-10-01').map(e=>e.id),['today','cancel']);
  assert.deepEqual(selectSchedule(events,'past','','2026-10-01').map(e=>e.id),['recent','old']);
  assert.deepEqual(selectSchedule(events,'upcoming','2026-10','2026-10-01').map(e=>e.id),['today','cancel']);
  assert.deepEqual(scheduleMonths(events,'past','2026-10-01'),['2026-09','2025-10']);
  assert.deepEqual(selectSchedule(events,'past','2026-10','2026-10-01'),[]);
});

test('upcoming is seven China calendar days including today, across months and years',()=>{
  const dates=['2026-12-30','2026-12-31','2027-01-06','2027-01-07'];
  const shows=dates.map(date=>({id:date,date}));
  assert.deepEqual(selectSchedule(shows,'upcoming','','2026-12-31').map(e=>e.date),['2026-12-31','2027-01-06']);
  assert.deepEqual(scheduleMonths(shows,'upcoming','2026-12-31'),['2026-12','2027-01']);
});

test('nearby station dates form a run; artists, tours, venues and separate rounds stay distinct',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  assert.equal(typeof groupConcertRuns,'function','concert runs are missing');
  const base={artist_id:'gem',city:'深圳',venue:'大运体育场',title:'I AM GLORIA 2.0 · 深圳站'};
  const input=[
    {...base,id:'a',date:'2026-09-11'}, {...base,id:'b',date:'2026-09-12'},
    {...base,id:'c',date:'2026-09-19',title:'I AM GLORIA2.0·深圳站'},
    {...base,id:'d',date:'2026-10-20'}, {...base,id:'other-tour',date:'2026-09-12',title:'I AM GLORIA · 深圳站'},
    {...base,id:'other-artist',date:'2026-09-12',artist_id:'liu'},
    {...base,id:'other-venue',date:'2026-09-12',venue:'大运体育馆'},
  ];
  const runs=groupConcertRuns(input);
  assert.equal(runs.length,6);
  assert.deepEqual(runs.find(run=>run.events.some(e=>e.id==='a')).events.map(e=>e.id),['a','b']);
  assert.equal(input[0].id,'a','grouping must not mutate catalog order');
  assert.deepEqual(runs.flatMap(run=>run.events.map(e=>e.id)).sort(),input.map(e=>e.id).sort(),'every individual night retains its identity');
});
test('a one-day rest inside the same station stays in one activity without losing any date',async()=>{
  const {groupConcertRuns,selectConcertRuns}=await import('../src/concertSchedule.ts');
  const base={artist_id:'tnt',city:'上海',venue:'上海体育场',title:'加冠礼收官场 · 上海站'};
  const dates=['2026-08-02','2026-08-03','2026-08-05','2026-08-06'];
  const rows=dates.map(date=>({...base,id:date,date}));
  assert.deepEqual(groupConcertRuns(rows).map(run=>run.events.map(event=>event.date)),[dates]);
  assert.deepEqual(selectConcertRuns(rows,[rows[3]]).map(run=>run.events.map(event=>event.id)),[dates],'selecting the last date retains memories from both sides of the rest day');
  assert.equal(groupConcertRuns([...rows,{...base,id:'another-round',date:'2026-08-13'}]).length,2,'the next separate round is not swallowed');
});
test('nearby station dates can cross a month, but never cross cities or years',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  const base={artist_id:'liu',city:'深圳',venue:'大运体育馆',title:'仙那度2.0'};
  const rows=[{...base,id:'aug',date:'2026-08-31'},{...base,id:'sep',date:'2026-09-02'},
    {...base,id:'city',date:'2026-09-01',city:'上海'},
    {...base,id:'dec',date:'2026-12-31'},{...base,id:'jan',date:'2027-01-02'}];
  assert.deepEqual(groupConcertRuns(rows).map(run=>run.events.map(event=>event.id)),[['aug','sep'],['dec'],['city'],['jan']]);
});
test('September 25–27 and October 1–2 are two consecutive runs at the same venue',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  const dates=['2026-09-25','2026-09-26','2026-09-27','2026-10-01','2026-10-02'];
  const shows=dates.map(date=>({id:date,date,artist_id:'gem',city:'深圳',venue:'大运体育场',title:'GLORIA 深圳站'}));
  assert.deepEqual(groupConcertRuns(shows).map(run=>run.events.map(event=>event.date)),[dates.slice(0,3),dates.slice(3)]);
});
test('reliable activity IDs join nonconsecutive nights but never cross cities or calendar years',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  const base={artist_id:'liu',city:'深圳',venue:'大运体育馆',title:'仙那度 · 深圳站',activity_id:'shenzhen-round-one'};
  const rows=[{...base,id:'a',date:'2026-08-01'},{...base,id:'b',date:'2026-08-03'},
    {...base,id:'c',date:'2026-08-03',city:'上海'},{...base,id:'d',date:'2027-08-01'},
    {...base,id:'e',date:'2026-08-04',activity_id:'shenzhen-round-two'}];
  assert.deepEqual(groupConcertRuns(rows).map(run=>run.events.map(event=>event.id)),[['a','b'],['c'],['d'],['e']]);
  const december={...base,activity_id:undefined,id:'dec',date:'2026-12-31'};
  assert.equal(groupConcertRuns([december,{...december,id:'jan',date:'2027-01-01'}]).length,2);
});
test('month or personal filtering selects whole concert activities instead of truncating their date ranges',async()=>{
  const schedule=await import('../src/concertSchedule.ts');assert.equal(typeof schedule.selectConcertRuns,'function');
  const base={artist_id:'liu',city:'深圳',venue:'大运体育馆',title:'仙那度 · 深圳站'};
  const rows=['2026-08-31','2026-09-01','2026-09-02'].map((date,i)=>({...base,date,id:String(i)}));
  assert.deepEqual(schedule.selectConcertRuns(rows,[rows[1]]).map(run=>run.events.map(event=>event.id)),[['0','1','2']]);
  assert.deepEqual(schedule.selectConcertRuns(rows,[]),[]);
});
test('unidentified tours and invalid dates are not forcibly merged',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  const base={artist_id:'liu',city:'深圳',venue:'大运体育馆',title:''};
  assert.equal(groupConcertRuns([{...base,id:'a',date:'2026-08-01'},{...base,id:'b',date:'2026-08-02'}]).length,2);
  assert.equal(groupConcertRuns([{...base,title:'巡演',id:'c',date:'unknown'},{...base,title:'巡演',id:'d',date:'unknown'}]).length,2);
});
test('conflicting tour or venue metadata cannot be merged merely because an activity ID repeats',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  const base={artist_id:'liu',city:'深圳',venue:'大运体育馆',title:'仙那度1.0',activity_id:'shared'};
  const a={...base,id:'a',date:'2026-01-01'};
  const b={...base,id:'b',date:'2026-09-01',title:'仙那度2.0',venue:'另一场馆'};
  assert.equal(groupConcertRuns([a,b]).length,2);
});
test('status notes use the latest reviewed change and keep cancellation visible without inventing history',()=>{
  const history=[{reviewed_on:'2026-09-29',changes:[{id:'next',kinds:['改期'],fields:{date:{before:'2026-11-01',after:'2026-11-03'}}}]}];
  assert.match(eventChangeNote({id:'next',date:'2026-11-03'},history),/改期.*2026.11.01.*2026.11.03/);
  assert.equal(eventChangeNote({id:'old',date:'2025-10-01'},history),'');
  assert.equal(eventChangeNote({id:'cancel',date:'2026-10-05',event_status:'cancelled',event_status_note:'场馆维修，取消'},history),'场馆维修，取消');
});
