export type PhotoSource={url:string;author:string;source:string;license:string;licenseUrl:string;description:string;captured?:string;kind?:'concert'|'archive';context?:string};

// Local, optimized camera photographs. Generic stock photos never identify an
// artist, venue, album cover or attendee; architectural archives match by venue.
export const photoSources:PhotoSource[]=[
  {url:'/photos/gem-shenzhen-20260926-bowl.webp',author:'徽楠',source:'https://www.xiaohongshu.com/explore/6aba0b4d000000001203ef02',license:'原作者保留权利',licenseUrl:'https://www.xiaohongshu.com/explore/6aba0b4d000000001203ef02',description:'邓紫棋 · 深圳大运体育场观众视角',captured:'2026.09.26',kind:'concert',context:'现场视频的原始封面，作为同场馆视角参考；不代表其他日期的演出。'},
  {url:'/photos/gem-shenzhen-20260926-stage.webp',author:'Hu、',source:'https://www.xiaohongshu.com/explore/6ab92e340000000014001aaf',license:'原作者保留权利',licenseUrl:'https://www.xiaohongshu.com/explore/6ab92e340000000014001aaf',description:'邓紫棋 · 深圳场舞台实拍',captured:'2026.09.26',kind:'concert',context:'歌手现场摄影配图，不是专辑封面，也不证明该曲目在照片时刻演唱。'},
  {url:'/photos/gem-shenzhen-20260926-detail.webp',author:'Hu、',source:'https://www.xiaohongshu.com/explore/6ab92e340000000014001aaf',license:'原作者保留权利',licenseUrl:'https://www.xiaohongshu.com/explore/6ab92e340000000014001aaf',description:'邓紫棋 · 深圳场舞台近景',captured:'2026.09.26',kind:'concert',context:'歌手现场摄影配图，不是专辑封面，也不证明该曲目在照片时刻演唱。'},
  {url:'/photos/liu-yuxin-2026-lightstick.webp',author:'UmbreLllllla_',source:'https://www.xiaohongshu.com/explore/6a70278b0000000028001c87',license:'原作者保留权利',licenseUrl:'https://www.xiaohongshu.com/explore/6a70278b0000000028001c87',description:'刘雨昕 · 2026 XANADU 2.0 现场实拍',kind:'concert',context:'应援棒可确认 2026 巡演；笔记显示 08-03 发布，未确认具体演出日期与场馆。仅作对应歌手配图。'},
  {url:'/photos/live-lights.webp',author:'Josh Sorenson',source:'https://www.pexels.com/photo/people-gathering-at-concert-894566/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'观众与舞台灯光 · 摄影配图'},
  {url:'/photos/concert-flags.webp',author:'Wendy Wei',source:'https://www.pexels.com/photo/photo-of-crowd-during-concert-1190295/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'现场观众 · 摄影配图'},
  {url:'/photos/concert-phone.webp',author:'Caleb Oquendo',source:'https://www.pexels.com/photo/person-holding-smartphone-during-concert-14364701/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'用手机记录现场 · 摄影配图'},
  {url:'/photos/festival-day.webp',author:'Milo Deckert',source:'https://www.pexels.com/photo/people-on-a-festival-17842575/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'白天的音乐节 · 摄影配图'},
  {url:'/photos/journey-sunset.webp',author:'Ali Ramazan Çiftçi',source:'https://www.pexels.com/photo/sunset-sunlight-over-train-windows-13742971/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'夕阳中的旅途 · 摄影配图'},
];

export function photoSourceInfo(url?:string){return photoSources.find(photo=>photo.url===url);}

export function venuePhotograph(venue:string,artistId?:string){
  // The open-air stadium and the adjacent indoor arena are different buildings.
  return (!artistId||artistId==='gem')&&['深圳大运中心体育场','大运体育场'].includes(venue)
    ?photoSourceInfo('/photos/gem-shenzhen-20260926-bowl.webp'):undefined;
}
