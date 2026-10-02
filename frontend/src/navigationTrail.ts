export type Visit = {key:string; url:string};
export type Trail = {entries:Visit[]; index:number};
export function localPath(value:unknown):value is string {
  return typeof value==='string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value);
}
export function advanceTrail(trail:Trail, visit:Visit, action:string):Trail {
  const current=trail.entries[trail.index];
  if(current?.key===visit.key&&current.url===visit.url)return trail;
  if(action==='POP'){
    const index=trail.entries.findIndex(entry=>entry.key===visit.key);
    return index<0?{entries:[visit],index:0}:{entries:trail.entries.map((entry,i)=>i===index?visit:entry),index};
  }
  if(action==='REPLACE')return {entries:trail.entries.map((entry,i)=>i===trail.index?visit:entry),index:trail.index};
  const entries=[...trail.entries.slice(0,trail.index+1),visit].slice(-100);
  return {entries,index:entries.length-1};
}
export function previousVisit(trail:Trail) {
  const current=trail.entries[trail.index];
  for(let index=trail.index-1;index>=0;index--)if(trail.entries[index].url!==current.url)return {...trail.entries[index],delta:index-trail.index};
  return null;
}
export function restoreTrail(raw:string|null,visit:Visit):Trail {
  try {
    const saved=JSON.parse(raw??'null') as Trail|null;
    if(saved&&Array.isArray(saved.entries)&&saved.entries.length<=100&&Number.isInteger(saved.index)&&saved.index>=0&&saved.index<saved.entries.length&&saved.entries.every(entry=>typeof entry.key==='string'&&localPath(entry.url))){
      const index=saved.entries.findIndex(entry=>entry.key===visit.key&&entry.url===visit.url);
      if(index>=0)return {entries:saved.entries,index};
    }
  }catch{/* A new or cleared browser session starts without an observed predecessor. */}
  return {entries:[visit],index:0};
}
