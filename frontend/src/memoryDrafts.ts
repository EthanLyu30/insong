import type {Song} from './api';
import type {EventSnapshot,Photo} from './memoryClient';

export type ManualSong={title:string;artist:string};
export type ManualEvent={title:string;artist:string;date:string;city:string;venue:string};
export type MemoryDraftData={version:number;story:string;title?:string;tagText?:string;lifeTime?:string;lifeYear?:string;locationName?:string;markedDate?:string;song?:Song|null;photos?:Photo[];cover?:string|null;position?:number|null;timeText?:string;endText?:string;lyricId?:string|null;visibility?:string;eventId?:string|null;eventSnapshot?:EventSnapshot|null;autoEventFields?:string[];themeId?:string|null;anonymous?:boolean;shareLife?:boolean;manualSong?:ManualSong|null;manualEvent?:ManualEvent|null;pendingSong?:ManualSong|null;pendingEvent?:ManualEvent|null;[key:string]:unknown};
export type MemoryDraft={id:string;ownerId:number;storageKey:string;serialized:string;data:MemoryDraftData;updatedAt:string|null};
const legacyKey=(owner:number)=>`memory-draft:${owner}`;
const key=(owner:number,id:string)=>id==='legacy'?legacyKey(owner):`${legacyKey(owner)}:${id}`;
const fields=['version','story','title','tagText','lifeTime','lifeYear','locationName','markedDate','song','photos','cover','position','timeText','endText','lyricId','visibility','eventId','eventSnapshot','autoEventFields','themeId','anonymous','shareLife','manualSong','manualEvent','pendingSong','pendingEvent'];
function fingerprint(text:string){let value=14695981039346656037n;for(let index=0;index<text.length;index++)value=BigInt.asUintN(64,(value^BigInt(text.charCodeAt(index)))*1099511628211n);return value.toString(16);}
export function validPending(value:unknown,names:string[]):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value)&&names.every(name=>typeof (value as Record<string,unknown>)[name]==='string');}

export function validDraftSong(value:unknown):value is Song{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const song=value as Record<string,unknown>;
  return Number.isInteger(song.id)&&Number(song.id)>0&&typeof song.title==='string'&&typeof song.artist==='string'
    &&['version','source_label','recording_label','cover_url','lyrics_note','qq_music_url','audio_url'].every(name=>song[name]==null||typeof song[name]==='string')
    &&(song.duration_ms==null||(typeof song.duration_ms==='number'&&Number.isFinite(song.duration_ms)&&song.duration_ms>=0))
    &&['is_demo','audio_available'].every(name=>song[name]===undefined||typeof song[name]==='boolean')
    &&(song.lyrics===undefined||(Array.isArray(song.lyrics)&&song.lyrics.every(line=>line&&typeof line==='object'&&typeof line.id==='string'&&typeof line.text==='string'&&typeof line.start_ms==='number'&&Number.isFinite(line.start_ms)&&line.start_ms>=0)));
}
export function validEventSnapshot(value:unknown,eventId:unknown):value is EventSnapshot{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  return (record.id===eventId||eventId==null&&record.id===''&&record.manual===true)&&['id','title','artist','date','city','venue'].every(name=>typeof record[name]==='string');
}
export function validManualSong(value:unknown):value is ManualSong{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  return ['title','artist'].every(name=>typeof record[name]==='string'&&record[name].trim().length>0&&record[name].length<=160);
}
export function validManualEvent(value:unknown):value is ManualEvent{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  return ['title','artist','date','city','venue'].every(name=>typeof record[name]==='string')
    &&typeof record.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(record.date)
    &&['artist','city','venue'].every(name=>(record[name] as string).trim());
}
export function hasDraftContent(data:Record<string,unknown>){
  const automatic=Array.isArray(data.autoEventFields)?data.autoEventFields:[];
  return ['title','story','tagText','lifeTime','lifeYear','locationName'].some(name=>!automatic.includes(name)&&typeof data[name]==='string'&&data[name].trim())
    ||Array.isArray(data.photos)&&data.photos.length>0
    ||['manualSong','manualEvent','pendingSong','pendingEvent'].some(name=>!!data[name]&&typeof data[name]==='object'&&Object.values(data[name]).some(value=>typeof value==='string'&&value.trim()));
}
function parse(raw:string|null):MemoryDraftData|null{
  try{
    const data=raw?JSON.parse(raw):null;
    if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==1||typeof data.story!=='string')return null;
    if(['title','tagText','lifeTime','lifeYear','locationName','markedDate','cover','timeText','endText','lyricId','visibility','eventId','themeId'].some(name=>data[name]!=null&&typeof data[name]!=='string'))return null;
    if(data.song!=null&&!validDraftSong(data.song))return null;
    if(data.eventSnapshot!=null&&!validEventSnapshot(data.eventSnapshot,data.eventId))return null;
    if(data.manualSong!=null&&!validManualSong(data.manualSong))return null;
    if(data.manualEvent!=null&&!validManualEvent(data.manualEvent))return null;
    if(data.pendingSong!=null&&!validPending(data.pendingSong,['title','artist']))return null;
    if(data.pendingEvent!=null&&!validPending(data.pendingEvent,['title','artist','date','city','venue']))return null;
    if(data.photos!==undefined&&(!Array.isArray(data.photos)||data.photos.some((photo:Photo|null)=>!photo||typeof photo.id!=='string'||typeof photo.url!=='string')))return null;
    return hasDraftContent(data)?data:null;
  }catch{return null;}
}
export function readMemoryDrafts(owner:number,storage?:Storage):MemoryDraft[]{
  try{
    const store=storage??window.localStorage,ids=new Set(['legacy']);
    for(let index=0;index<store.length;index++){
      const name=store.key(index),prefix=legacyKey(owner)+':';
      if(name?.startsWith(prefix)&&/^[a-zA-Z0-9_-]{1,80}$/.test(name.slice(prefix.length)))ids.add(name.slice(prefix.length));
    }
    const hidden=new Map<string,Set<string>>(),records:MemoryDraft[]=[];
    const hide=(name:string,hash:string)=>{const hashes=hidden.get(name)??new Set();hashes.add(hash);hidden.set(name,hashes);};
    for(const suffix of ids){
      const name=key(owner,suffix),raw=store.getItem(name);if(!raw)continue;
      let metadata:Record<string,unknown>;try{metadata=JSON.parse(raw);}catch{continue;}
      if(metadata&&typeof metadata._draftDeletedKey==='string'&&typeof metadata._draftDeletedFingerprint==='string'){hide(metadata._draftDeletedKey,metadata._draftDeletedFingerprint);continue;}
      const data=parse(raw);if(!data)continue;
      if(typeof data._draftParent==='string'&&typeof data._draftParentFingerprint==='string')hide(data._draftParent,data._draftParentFingerprint);
      if(Array.isArray(data._draftRetired))for(const item of data._draftRetired){if(item&&typeof item.key==='string'&&typeof item.hash==='string')hide(item.key,item.hash);}
      records.push({id:typeof data._draftId==='string'?data._draftId:suffix,ownerId:owner,storageKey:name,serialized:raw,data,updatedAt:typeof data._draftSavedAt==='string'?data._draftSavedAt:null});
    }
    return records.filter(record=>!hidden.get(record.storageKey)?.has(fingerprint(record.serialized)))
      .sort((a,b)=>(b.updatedAt??'').localeCompare(a.updatedAt??'')||b.storageKey.localeCompare(a.storageKey));
  }catch{return [];}
}
export function saveMemoryDraft(owner:number,data:Record<string,unknown>,owned:MemoryDraft|null=null,storage?:Storage):MemoryDraft{
  if(!hasDraftContent(data))throw new Error('填写内容后才能存草稿。');
  if(owned&&owned.ownerId!==owner)throw new Error('这不是当前账号的草稿。');
  const store=storage??window.localStorage;
  const current=owned&&readMemoryDrafts(owner,store).find(item=>item.storageKey===owned.storageKey&&item.serialized===owned.serialized);
  const id=current?current.id:crypto.randomUUID(),revision=crypto.randomUUID(),name=key(owner,`${id}-${revision}`);
  const retired=current&&Array.isArray(current.data._draftRetired)?[...current.data._draftRetired]:[];
  if(current&&typeof current.data._draftRevision!=='string')retired.push({key:current.storageKey,hash:fingerprint(current.serialized)});
  const updatedAt=new Date().toISOString(),payload=Object.fromEntries(fields.filter(name=>Object.hasOwn(data,name)).map(name=>[name,data[name]]));
  const serialized=JSON.stringify({...payload,_draftId:id,_draftRevision:revision,_draftSavedAt:updatedAt,_draftRetired:retired,...(current?{_draftParent:current.storageKey,_draftParentFingerprint:fingerprint(current.serialized)}:{})});
  const checked=parse(serialized);if(!checked)throw new Error('草稿资料不完整，请保留当前内容。');
  // Every commit has a new key: competing writers never replace each other's text.
  store.setItem(name,serialized);
  if(current&&typeof current.data._draftRevision==='string')store.removeItem(current.storageKey);
  return {id,ownerId:owner,storageKey:name,serialized,data:checked,updatedAt};
}
export function removeMemoryDraft(owner:number,draft:MemoryDraft,storage?:Storage){
  if(draft.ownerId!==owner)return false;
  const store=storage??window.localStorage;
  if(!readMemoryDrafts(owner,store).some(item=>item.storageKey===draft.storageKey&&item.serialized===draft.serialized))return false;
  if(typeof draft.data._draftRevision!=='string'){
    // Older tabs may still write the legacy key. Hide only the exact deleted version.
    store.setItem(key(owner,`delete-${crypto.randomUUID()}`),JSON.stringify({_draftDeletedKey:draft.storageKey,_draftDeletedFingerprint:fingerprint(draft.serialized)}));
  }else{
    if(Array.isArray(draft.data._draftRetired))for(const item of draft.data._draftRetired){
      if(item&&typeof item.key==='string'&&typeof item.hash==='string')store.setItem(key(owner,`delete-${crypto.randomUUID()}`),JSON.stringify({_draftDeletedKey:item.key,_draftDeletedFingerprint:item.hash}));
    }
    if(typeof draft.data._draftParent==='string'&&typeof draft.data._draftParentFingerprint==='string'){
      store.setItem(key(owner,`delete-${crypto.randomUUID()}`),JSON.stringify({_draftDeletedKey:draft.data._draftParent,_draftDeletedFingerprint:draft.data._draftParentFingerprint}));
    }
    store.removeItem(draft.storageKey);
  }
  return true;
}
