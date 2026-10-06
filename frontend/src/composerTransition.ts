// Temporary editing state survives a chooser round trip when browser storage is off.
const values=new Map<string,Record<string,unknown>>(),discarded=new Set<string>();
const key=(owner:number,path:string,origin:string)=>`${owner}:${origin}:${path}`;
export function writeComposerTransition(owner:number,value:Record<string,unknown>){
  if(value.ownerId!==owner||typeof value.returnPath!=='string'||typeof value.originKey!=='string')return;
  const name=key(owner,value.returnPath,value.originKey);values.set(name,value);discarded.delete(name);
  if(values.size>20)values.delete(values.keys().next().value!);
  try{window.sessionStorage.setItem(`composer-transition:${owner}`,JSON.stringify(value));window.sessionStorage.removeItem(`composer-discarded:${owner}:${value.originKey}`);}catch{/* In-memory return remains available. */}
}
export function composerDiscarded(owner:number,path:string,origin:string){
  if(discarded.has(key(owner,path,origin)))return true;
  try{return window.sessionStorage.getItem(`composer-discarded:${owner}:${origin}`)===path;}catch{return false;}
}
export function readComposerTransition(owner:number,path:string,origin:string){
  if(composerDiscarded(owner,path,origin))return null;
  try{const stored=JSON.parse(window.sessionStorage.getItem(`composer-transition:${owner}`)??'null');if(stored?.ownerId===owner&&stored.returnPath===path&&stored.originKey===origin)return stored as Record<string,unknown>;}catch{/* Use the same-origin editing cache. */}
  return values.get(key(owner,path,origin))??null;
}
export function clearComposerTransition(owner:number,path:string,origin:string,abandon=false){
  values.delete(key(owner,path,origin));
  if(abandon)discarded.add(key(owner,path,origin));
  try{
    const stored=JSON.parse(window.sessionStorage.getItem(`composer-transition:${owner}`)??'null');
    if(stored?.ownerId===owner&&stored.returnPath===path&&stored.originKey===origin)window.sessionStorage.removeItem(`composer-transition:${owner}`);
    if(abandon)window.sessionStorage.setItem(`composer-discarded:${owner}:${origin}`,path);
  }catch{/* Other owners and drafts remain untouched. */}
}
