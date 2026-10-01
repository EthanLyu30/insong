import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectSchedule,scheduleMonths,eventChangeNote} from '../src/concertSchedule.ts';

const events=[
  {id:'old',date:'2025-10-01'}, {id:'today',date:'2026-10-01'},
  {id:'next',date:'2026-11-03'}, {id:'cancel',date:'2026-10-05',event_status:'cancelled'},
  {id:'recent',date:'2026-09-29'},
];
test('period and year-month filters keep upcoming, past and cancelled records distinct',()=>{
  assert.deepEqual(selectSchedule(events,'upcoming','','2026-10-01').map(e=>e.id),['today','cancel','next']);
  assert.deepEqual(selectSchedule(events,'past','','2026-10-01').map(e=>e.id),['recent','old']);
  assert.deepEqual(selectSchedule(events,'upcoming','2026-10','2026-10-01').map(e=>e.id),['today','cancel']);
  assert.deepEqual(scheduleMonths(events,'past','2026-10-01'),['2026-09','2025-10']);
  assert.deepEqual(selectSchedule(events,'past','2026-10','2026-10-01'),[]);
});
test('status notes use the latest reviewed change and keep cancellation visible without inventing history',()=>{
  const history=[{reviewed_on:'2026-09-29',changes:[{id:'next',kinds:['改期'],fields:{date:{before:'2026-11-01',after:'2026-11-03'}}}]}];
  assert.match(eventChangeNote({id:'next',date:'2026-11-03'},history),/改期.*2026.11.01.*2026.11.03/);
  assert.equal(eventChangeNote({id:'old',date:'2025-10-01'},history),'');
  assert.equal(eventChangeNote({id:'cancel',date:'2026-10-05',event_status:'cancelled',event_status_note:'场馆维修，取消'},history),'场馆维修，取消');
});
