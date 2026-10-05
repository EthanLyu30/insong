import {extractHashtags} from './revisionBehavior';

export function recommendMemoryTags(title:string,story:string,song?:{title:string;artist:string}|null):string[]{
  const content=`${title} ${story}`.trim();
  if(!content)return [];
  const present=new Set(extractHashtags(story));
  const candidates=[
    ...(song?[song.title,song.artist].filter(value=>value&&content.includes(value)):[]),
    ...(['音乐节','演唱会','合唱','旅行','跨城','毕业','重逢','生日','日常'] as const).filter(value=>content.includes(value)),
    ...(content.includes('散场')?['散场以后']:[]),
    ...(content.includes('演出')?['演出现场']:[]),
  ];
  return [...new Set(candidates)].filter(value=>!present.has(value)).slice(0,5);
}
