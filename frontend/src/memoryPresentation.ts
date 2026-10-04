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

export function filterMemories<T extends Card>(cards:T[],filters:{category?:string;city?:string;query?:string}):T[] {
  const query=filters.query?.trim().toLocaleLowerCase()??'';
  return cards.filter(card=>(!filters.category||memoryCategory(card)===filters.category)
    &&(!filters.city||memoryCity(card)===filters.city)
    &&(!query||[card.title,card.story,card.song.title,card.song.artist,card.location_name,...card.tags].some(value=>value?.toLocaleLowerCase().includes(query))));
}
