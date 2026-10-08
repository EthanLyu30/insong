import type {MarkerPhoto} from './mapMarkerPhotos';

// Verified through QQ Music's public song-detail metadata on 2026-10-08.
// These are official artist profile pictures, not photographs of any concert.
const profile=(artist:string,mid:string,file:string):MarkerPhoto=>({
  url:`/artist-official/${file}.jpg`,author:'QQ 音乐歌手资料页',
  source:`https://y.qq.com/n/ryqq/singer/${mid}`,
  license:'资料图版权归原权利人',licenseUrl:`https://y.qq.com/n/ryqq/singer/${mid}`,
  context:`${artist} · QQ 音乐官方歌手资料图；不代表本场演出照片`,
});
export const officialArtistPhotos:Record<string,MarkerPhoto>={
  gem:profile('邓紫棋','001fNHEf1SFEFN','gem'),
  'liu-yuxin':profile('刘雨昕','001uGW6E0C9wva','liu-yuxin'),
};
officialArtistPhotos.liu=officialArtistPhotos['liu-yuxin'];
