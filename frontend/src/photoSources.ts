export type PhotoSource={url:string;author:string;source:string;license:string;licenseUrl:string;description:string;captured?:string};

// Local, optimized camera photographs. Generic stock photos never identify an
// artist, venue, album cover or attendee; architectural archives match by venue.
export const photoSources:PhotoSource[]=[
  {url:'/photos/live-lights.webp',author:'Josh Sorenson',source:'https://www.pexels.com/photo/people-gathering-at-concert-894566/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'观众与舞台灯光 · 摄影配图'},
  {url:'/photos/concert-flags.webp',author:'Wendy Wei',source:'https://www.pexels.com/photo/photo-of-crowd-during-concert-1190295/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'现场观众 · 摄影配图'},
  {url:'/photos/concert-phone.webp',author:'Caleb Oquendo',source:'https://www.pexels.com/photo/person-holding-smartphone-during-concert-14364701/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'用手机记录现场 · 摄影配图'},
  {url:'/photos/festival-day.webp',author:'Milo Deckert',source:'https://www.pexels.com/photo/people-on-a-festival-17842575/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'白天的音乐节 · 摄影配图'},
  {url:'/photos/journey-sunset.webp',author:'Ali Ramazan Çiftçi',source:'https://www.pexels.com/photo/sunset-sunlight-over-train-windows-13742971/',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',description:'夕阳中的旅途 · 摄影配图'},
  {url:'/photos/shenzhen-dayun-aerial.webp',author:'Windmemories',source:'https://commons.wikimedia.org/wiki/File:Shenzhen_Universiade_Sports_Centre_20170730.jpg',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',description:'深圳大运中心全景 · 历史实拍',captured:'2017.07.30'},
];

export function photoSourceInfo(url?:string){return photoSources.find(photo=>photo.url===url);}

export function venuePhotograph(venue:string){
  // This archive depicts the entire Universiade complex (stadium + arena).
  // It must never stand in for Shenzhen Bay, Shenzhen Stadium or another city.
  return ['深圳大运中心体育场','大运体育场','深圳大运中心体育馆'].includes(venue)
    ?photoSourceInfo('/photos/shenzhen-dayun-aerial.webp'):undefined;
}
