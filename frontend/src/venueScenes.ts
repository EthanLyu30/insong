import type {AtlasEvent} from './footprintAtlas';

export type VenueScene = {
  id:string; covered:boolean; exterior:string; interior:string;
};
const profiles:[string,boolean,string[]][] = [
  ['shenzhen-stadium',false,['深圳大运中心体育场','大运体育场']],
  ['shenzhen-arena',true,['深圳大运中心体育馆']],
  ['guangzhou-arena',true,['宝能广州国际体育演艺中心','广州宝能观致文化中心']],
  ['beijing-wukesong',true,['华熙LIVE·五棵松','华熙LIVE·五棵松·场馆','五棵松体育馆']],
  ['hangzhou-lotus',false,['杭州奥体中心体育场']],
  ['tianjin-waterdrop',false,['天津奥林匹克中心体育场']],
  ['nanchang-olympic',false,['南昌国际体育中心体育场']],
  ['chongqing-olympic',false,['重庆奥体中心体育场']],
  ['shanghai-stadium',false,['上海体育场']],
  ['shanghai-oriental-arena',true,['浦发银行东方体育中心','浦发银行东方体育中心体育馆']],
  ['suzhou-arena',true,['苏州奥体中心体育馆']],
  ['ganzhou-stadium',false,['赣州市全民健身中心体育场']],
  ['jinan-stadium',false,['济南奥体中心体育场']],
  ['jinan-arena',true,['济南奥体中心体育馆']],
  ['sanya-egret',false,['三亚市体育中心白鹭体育场']],
  ['xiamen-egret',false,['厦门奥林匹克体育中心体育场','厦门白鹭体育场']],
];
const scenes=new Map<string,VenueScene>();
for(const [id,covered,names] of profiles){
  const scene:VenueScene=id==='shenzhen-stadium'
    ?{id,covered,exterior:'/scenes/stadium-exterior-detail.webp',interior:'/scenes/stadium-interior-detail.webp'}
    :{id,covered,exterior:`/scenes/venues/${id}-exterior.webp`,interior:`/scenes/venues/${id}-interior.webp`};
  for(const name of names)scenes.set(name,scene);
}

// Never substitute a different city's architecture for an unknown venue.
export function venueScene(event?:Pick<AtlasEvent,'venue'>&Partial<Pick<AtlasEvent,'artist_id'>>):VenueScene|undefined{
  // Small editorial photos must never replace the full-screen depth texture.
  return event?scenes.get(event.venue):undefined;
}
