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

test('only consecutive dates form a run; artists, tours, venues and breaks remain separate',async()=>{
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
test('September 25–27 and October 1–2 are two consecutive runs at the same venue',async()=>{
  const {groupConcertRuns}=await import('../src/concertSchedule.ts');
  const dates=['2026-09-25','2026-09-26','2026-09-27','2026-10-01','2026-10-02'];
  const shows=dates.map(date=>({id:date,date,artist_id:'gem',city:'深圳',venue:'大运体育场',title:'GLORIA 深圳站'}));
  assert.deepEqual(groupConcertRuns(shows).map(run=>run.events.map(event=>event.date)),[dates.slice(0,3),dates.slice(3)]);
});
test('status notes use the latest reviewed change and keep cancellation visible without inventing history',()=>{
  const history=[{reviewed_on:'2026-09-29',changes:[{id:'next',kinds:['改期'],fields:{date:{before:'2026-11-01',after:'2026-11-03'}}}]}];
  assert.match(eventChangeNote({id:'next',date:'2026-11-03'},history),/改期.*2026.11.01.*2026.11.03/);
  assert.equal(eventChangeNote({id:'old',date:'2025-10-01'},history),'');
  assert.equal(eventChangeNote({id:'cancel',date:'2026-10-05',event_status:'cancelled',event_status_note:'场馆维修，取消'},history),'场馆维修，取消');
});
