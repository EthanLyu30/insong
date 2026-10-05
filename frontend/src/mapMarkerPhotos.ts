export type MarkerPhoto={url:string;author:string;source:string;license:string;licenseUrl:string;context:string;contain?:boolean};
const commons='https://commons.wikimedia.org/wiki/File:';
const cc='https://creativecommons.org/licenses/by-sa/4.0/';
export const mapMarkerPhotos:Record<string,MarkerPhoto>={
  gem:{url:'/artist-map/1.png',author:'原有设计素材',source:'',license:'原有素材',licenseUrl:'',context:'邓紫棋原有歌手照片'},
  'liu-yuxin':{url:'/artist-map/11.png',author:'原有设计素材',source:'',license:'原有素材',licenseUrl:'',context:'刘雨昕原有歌手照片'},
  phoenix:{url:'/artist-map/phoenix.jpg',author:'Fumikas Sagisavas',source:commons+'Phoenix_Legend_Concert_at_Changzhou_Olympic_Sports_Center.jpg',license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',context:'凤凰传奇2024年常州演出配图；不代表当前场次'},
  tnt:{url:'/artist-map/tnt.jpg',author:'Sunny Anroi',source:commons+encodeURIComponent('Thời_Đại_Thiếu_Niên_Đoàn.jpg'),license:'CC BY-SA 4.0',licenseUrl:cc,context:'时代少年团2022年歌手照片；不代表当前场次',contain:true},
  'zhang-jie':{url:'/artist-map/zhang-jie.jpg',author:'IZhangjiei5',source:commons+'Zhangjie.jpg',license:'Public domain',licenseUrl:'https://creativecommons.org/publicdomain/mark/1.0/',context:'张杰2007年歌手照片；不代表当前场次'},
  'xue-zhiqian':{url:'/artist-map/xue-zhiqian.png',author:'就让祂_',source:commons+encodeURIComponent('薛之谦_天外来物世界巡回演唱会_20230401.png'),license:'CC BY-SA 4.0',licenseUrl:cc,context:'薛之谦2023年演出配图；不代表当前场次'},
  'luo-tianyi':{url:'/artist-map/luo-tianyi.jpg',author:'幽隐敏兔',source:commons+encodeURIComponent('虚拟歌手洛天依&郎朗全息演唱会.jpg'),license:'CC BY-SA 4.0',licenseUrl:cc,context:'洛天依2019年全息演唱会配图；不代表当前场次',contain:true},
};
mapMarkerPhotos.liu=mapMarkerPhotos['liu-yuxin'];

export function mapMarkerOffset(city:string,artistId:string,events:{city:string;artist_id:string;event_status?:string}[]):[number,number]{
  const ids=[...new Set(events.filter(event=>event.city===city&&event.event_status!=='cancelled'&&mapMarkerPhotos[event.artist_id]).map(event=>event.artist_id))].sort();
  const index=ids.indexOf(artistId);
  if(index<0||ids.length<2)return [0,0];
  if(ids.length===2)return [index===0?-33:33,0];
  const angle=index*2*Math.PI/ids.length-Math.PI/2,radius=Math.max(38,ids.length*11);
  return [Math.round(Math.cos(angle)*radius),Math.round(Math.sin(angle)*radius)];
}
