import type {AtlasEvent,CatalogChange} from './footprintAtlas';

export type SchedulePeriod='upcoming'|'past';
type Dated={id:string;date:string;event_status?:string;event_status_note?:string};
export function selectSchedule<T extends Dated>(events:T[],period:SchedulePeriod,month:string,today:string):T[]{
  return events.filter(event=>(period==='past'?event.date<today:event.date>=today)&&(!month||event.date.startsWith(month+'-')))
    .sort((a,b)=>(period==='past'?b.date.localeCompare(a.date):a.date.localeCompare(b.date))||a.id.localeCompare(b.id));
}
export function scheduleMonths(events:Dated[],period:SchedulePeriod,today:string):string[]{
  const months=[...new Set(selectSchedule(events,period,'',today).map(event=>event.date.slice(0,7)))].sort();
  return period==='past'?months.reverse():months;
}
export function eventChangeNote(event:Dated,history:CatalogChange[]=[]):string{
  if(event.event_status==='cancelled')return event.event_status_note||'演出已取消，请留意后续公告。';
  const change=[...history].reverse().flatMap(record=>record.changes??[]).find(item=>item.id===event.id&&item.kinds.some(kind=>['改期','换场馆','恢复'].includes(kind)));
  if(!change)return '';
  const date=change.fields.date;
  if(change.kinds.includes('改期')&&typeof date?.before==='string'&&typeof date.after==='string')return `已改期 · ${date.before.replaceAll('-','.')} → ${date.after.replaceAll('-','.')}`;
  if(change.kinds.includes('换场馆'))return '场馆已调整，请以当前场馆为准。';
  if(change.kinds.includes('恢复'))return '已恢复演出，请核对当前日期。';
  return '演出时间已调整，请核对当前时间。';
}
export function eventCheckedOn(event:AtlasEvent):string|undefined{
  return event.event_status==='cancelled'?event.cancellation_verified_on??event.verified_on:event.verified_on;
}
