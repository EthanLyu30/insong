export class MapResourceStatus {
  private errors=new Map<string,Set<string>>();
  failed(source:string,key:string){if(!this.errors.has(source))this.errors.set(source,new Set());this.errors.get(source)!.add(key);}
  loaded(source:string,key:string){this.errors.get(source)?.delete(key);}
  unavailable(zoom:number){return !!this.errors.get(zoom>=7.5?'openmaptiles':'satellite')?.size;}
}
export function resourceTileKey(event:unknown){
  const value=event as {tile?:{tileID?:{key?:string|number}};sourceDataType?:string};
  return value.tile?.tileID?.key===undefined?'source':String(value.tile.tileID.key);
}
