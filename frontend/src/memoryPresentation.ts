import type {Memory} from './memoryClient';

type Card = Pick<Memory,'tags'|'event_id'|'story'|'song'|'title'|'life_time'|'life_year'> & {location_name?:string|null};
export type MemoryCategory = '音乐现场'|'旅行'|'日常';
const cities=['北京','上海','天津','重庆','苏州','杭州','南京','宁波','常州','嘉兴','深圳','广州','成都','武汉','长沙','厦门','济南','青岛','西安','郑州','合肥'];

export function memoryCategory(card:Card):MemoryCategory {
  if(card.event_id || card.tags.some(tag=>/演唱会|演出|音乐现场|音乐节|live|现场/i.test(tag)))return '音乐现场';
  if(card.tags.some(tag=>/旅行|旅途|出游|跨城|路上/.test(tag)))return '旅行';
  return '日常';
}

export function memoryCity(card:Card):string {
  const place=card.location_name?.trim()??'';
  return cities.find(city=>place.includes(city))??place;
}

export type MemoryTimeRange={startYear:string;startMonth:string;endYear:string;endMonth:string};

export function matchesMemoryTime(card:Card,range:MemoryTimeRange):boolean {
  if(!range.startYear&&!range.endYear)return true;
  if(card.life_year==null)return false;
  const date=/^(\d{4})-(\d{1,2})(?:-|$|\s)/.exec(card.life_time??'');
  const month=date&&Number(date[1])===card.life_year&&Number(date[2])>=1&&Number(date[2])<=12?Number(date[2]):null;
  const earliest=card.life_year*12+(month??1),latest=card.life_year*12+(month??12);
  const start=range.startYear?Number(range.startYear)*12+Number(range.startMonth||1):-Infinity;
  const end=range.endYear?Number(range.endYear)*12+Number(range.endMonth||12):Infinity;
  return earliest>=start&&latest<=end;
}

export function filterMemories<T extends Card>(cards:T[],filters:{category?:string;city?:string;query?:string;timeRange?:MemoryTimeRange}):T[] {
  const query=filters.query?.trim().toLocaleLowerCase()??'';
  return cards.filter(card=>(!filters.category||memoryCategory(card)===filters.category)
    &&(!filters.city||memoryCity(card)===filters.city)
    &&(!filters.timeRange||matchesMemoryTime(card,filters.timeRange))
    &&(!query||[card.title,card.story,card.song.title,card.song.artist,card.location_name,...card.tags].some(value=>value?.toLocaleLowerCase().includes(query))));
}
