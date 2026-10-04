import type {AtlasCatalog} from './footprintAtlas';

export type LocationOption={value:string;city:string;kind:'city'|'venue'};

export function locationSuggestions(catalog:AtlasCatalog|null,query:string,contextCity=''):LocationOption[]{
  if(!catalog)return [];
  const options:LocationOption[]=[
    ...catalog.cities.map(city=>({value:city.name,city:city.name,kind:'city' as const})),
    ...catalog.events.map(event=>({value:event.venue,city:event.city,kind:'venue' as const})),
  ];
  const normalized=query.trim().toLocaleLowerCase().replace(/\s/g,'');
  const seen=new Set<string>();
  return options.filter(option=>{
    const key=option.city+':'+option.value;
    if(seen.has(key)||!option.value.trim())return false;
    seen.add(key);
    return normalized?[option.value,option.city].some(value=>value.toLocaleLowerCase().replace(/\s/g,'').includes(normalized)):!contextCity||option.city===contextCity;
  }).sort((a,b)=>Number(b.city===contextCity)-Number(a.city===contextCity)||Number(b.kind==='venue')-Number(a.kind==='venue')).slice(0,40);
}
