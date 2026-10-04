export function insertAtCursor(text:string,token:string,start:number,end:number){
  const before=text.slice(0,start),after=text.slice(end);
  const spacer=after&&!/^\s/.test(after)?' ':'';
  return {text:before+token+spacer+after,cursor:before.length+token.length+spacer.length};
}
export function extractHashtags(text:string):string[]{
  return [...new Set([...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(match=>match[1]))];
}
export function selectDraftSong<T extends {song?:{id:number}|null}>(draft:T,song:{id:number}){
  return draft.song?.id===song.id?{...draft,song}:{...draft,song,position:null,timeText:'',endText:'',lyricId:null};
}
export function currentLocalMark(now:Date){
  const pad=(value:number)=>String(value).padStart(2,'0');
  return {date:`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`,clock:`${pad(now.getHours())}:${pad(now.getMinutes())}`};
}
type Interest={tags?:string[];song:{title:string;artist:string}};
export function rankRecommendedStories<T extends Interest>(stories:T[],mine:Interest[]):T[]{
  const tags=new Set(mine.flatMap(card=>card.tags??[]));
  const artists=new Set(mine.map(card=>card.song.artist));
  const titles=new Set(mine.map(card=>card.song.title));
  const score=(story:T)=>((story.tags??[]).filter(tag=>tags.has(tag)).length*3)+(artists.has(story.song.artist)?2:0)+(titles.has(story.song.title)?2:0);
  return stories.map((story,index)=>({story,index})).sort((a,b)=>score(b.story)-score(a.story)||a.index-b.index).map(item=>item.story);
}
