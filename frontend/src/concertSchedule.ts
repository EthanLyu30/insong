import type {AtlasEvent,CatalogChange} from './footprintAtlas';

export type SchedulePeriod='upcoming'|'past';
export type FutureRange='week'|'month'|'two-months';
export const futureRangeLabels:Record<FutureRange,string>={week:'未来 7 天',month:'未来 1 个月','two-months':'未来 2 个月'};
type Dated={id:string;date:string;event_status?:string;event_status_note?:string};
export function futureRangeEnd(today:string,range:FutureRange):string{
  if(range==='week')return new Date(Date.parse(`${today}T00:00:00Z`)+7*86400000).toISOString().slice(0,10);
  const [year,month,day]=today.split('-').map(Number),offset=range==='two-months'?2:1;
  const lastDay=new Date(Date.UTC(year,month+offset,0)).getUTCDate();
  return new Date(Date.UTC(year,month-1+offset,Math.min(day,lastDay))).toISOString().slice(0,10);
}
export function selectSchedule<T extends Dated>(events:T[],period:SchedulePeriod,month:string,today:string,range:FutureRange='week'):T[]{
  const end=futureRangeEnd(today,range);
  return events.filter(event=>(period==='past'?event.date<today:event.date>=today&&event.date<end)&&(!month||event.date.startsWith(month+'-')))
    .sort((a,b)=>(period==='past'?b.date.localeCompare(a.date):a.date.localeCompare(b.date))||a.id.localeCompare(b.id));
}
export function scheduleMonths(events:Dated[],period:SchedulePeriod,today:string):string[]{
  const months=[...new Set(selectSchedule(events,period,'',today).map(event=>event.date.slice(0,7)))].sort();
  return period==='past'?months.reverse():months;
}
type RunEvent=Dated&{activity_id?:string;artist_id:string;city:string;venue:string;title:string};
export type ConcertRun<T extends RunEvent=RunEvent>={id:string;events:T[]};

// Complete dates are exact calendar matches, so 9/1 cannot open a 9/11 show.
// Partial dates and singer/title queries remain useful text searches.
export function matchesConcertSearch(event:Pick<RunEvent,'date'|'title'>,query:string,artist?:{name:string;aliases?:string[]}):boolean{
  const normalized=query.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s/g,'');
  const date=normalized.match(/^(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?$/);
  const [year,month,day]=event.date.split('-').map(Number);
  if(date)return (!date[1]||Number(date[1])===year)&&Number(date[2])===month&&Number(date[3])===day;
  const text=`${event.date} ${event.date.replaceAll('-','.')} ${month}.${day} ${month}/${day} ${month}月${day}日 ${event.title} ${artist?.name??''} ${artist?.aliases?.join(' ')??''}`;
  return text.normalize('NFKC').toLocaleLowerCase().replace(/\s/g,'').includes(normalized);
}

// A reliable activity ID wins. Without one, matching station dates may include
// a one-day rest; larger breaks remain separate rounds, as do different tours/years.
export function groupConcertRuns<T extends RunEvent>(events:T[]):ConcertRun<T>[] {
  const buckets=new Map<string,T[]>(),runs:ConcertRun<T>[]=[];
  for(const event of events){
    const title=event.title.normalize('NFKC').replace(/\s|[·•]/g,'').toLocaleLowerCase();
    const date=Date.parse(event.date),known=!!event.artist_id&&!!event.city&&!!event.venue&&!!title&&Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===event.date;
    const key=JSON.stringify([event.artist_id,event.city,event.date.slice(0,4),event.venue,title,known?event.activity_id??'inferred':event.id]);
    const bucket=buckets.get(key)??[];bucket.push(event);buckets.set(key,bucket);
  }
  for(const bucket of buckets.values()){
    const sorted=[...bucket].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    let run:ConcertRun<T>|undefined;
    for(const event of sorted){
      const previous=run?.events.at(-1);
      if(!previous||!event.activity_id&&Date.parse(event.date)-Date.parse(previous.date)>2*86400000){run={id:event.id,events:[]};runs.push(run);}
      run!.events.push(event);
    }
  }
  return runs;
}
/** Filtering chooses activities; it must not erase the other nights in them. */
export function selectConcertRuns<T extends RunEvent>(catalog:T[],visible:T[]):ConcertRun<T>[] {
  const identities=new Set(visible.map(event=>event.id));
  return groupConcertRuns(catalog).filter(run=>run.events.some(event=>identities.has(event.id)));
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
