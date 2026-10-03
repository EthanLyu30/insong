import type {AtlasEvent,CatalogChange} from './footprintAtlas';

export type SchedulePeriod='upcoming'|'past';
type Dated={id:string;date:string;event_status?:string;event_status_note?:string};
export function selectSchedule<T extends Dated>(events:T[],period:SchedulePeriod,month:string,today:string):T[]{
  const lastDay=new Date(Date.parse(`${today}T00:00:00Z`)+6*86400000).toISOString().slice(0,10);
  return events.filter(event=>(period==='past'?event.date<today:event.date>=today&&event.date<=lastDay)&&(!month||event.date.startsWith(month+'-')))
    .sort((a,b)=>(period==='past'?b.date.localeCompare(a.date):a.date.localeCompare(b.date))||a.id.localeCompare(b.id));
}
export function scheduleMonths(events:Dated[],period:SchedulePeriod,today:string):string[]{
  const months=[...new Set(selectSchedule(events,period,'',today).map(event=>event.date.slice(0,7)))].sort();
  return period==='past'?months.reverse():months;
}
type RunEvent=Dated&{artist_id:string;city:string;venue:string;title:string};
export type ConcertRun<T extends RunEvent=RunEvent>={id:string;events:T[]};

// Multi-weekend residencies share a row. A break longer than a week starts a
// new visit. Each night retains its original ID for songs and personal records.
export function groupConcertRuns<T extends RunEvent>(events:T[]):ConcertRun<T>[] {
  const buckets=new Map<string,T[]>(),runs:ConcertRun<T>[]=[];
  for(const event of events){
    const title=event.title.normalize('NFKC').replace(/\s|[·•]/g,'').toLocaleLowerCase();
    const key=JSON.stringify([event.artist_id,event.city,event.venue,title]);
    const bucket=buckets.get(key)??[];bucket.push(event);buckets.set(key,bucket);
  }
  for(const bucket of buckets.values()){
    const sorted=[...bucket].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    let run:ConcertRun<T>|undefined;
    for(const event of sorted){
      const previous=run?.events.at(-1);
      if(!previous||Date.parse(event.date)-Date.parse(previous.date)>7*86400000){run={id:event.id,events:[]};runs.push(run);}
      run!.events.push(event);
    }
  }
  return runs;
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
