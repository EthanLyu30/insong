import {photoSourceInfo,photoSources,type PhotoSource} from './photoSources';

function Credit({photo}:{photo:PhotoSource}) {
  if(photo.kind==='generated')return <div><span>{photo.description} · AI 生成</span></div>;
  return <div><a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.description} · {photo.author} ↗</a>{photo.captured&&<span>实拍日期 {photo.captured}</span>}{photo.context&&<span>{photo.context}</span>}<small><a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> · {photo.kind==='concert'?'保留原始图片，页面适配裁切':'本地格式压缩，展示时裁切'}</small></div>;
}

export function PhotoCredit({url}:{url?:string}) {
  const photo=photoSourceInfo(url);if(!photo)return null;
  if(photo.kind==='generated')return <small className="resource-note">AI 场景配图</small>;
  return <details className="photo-credit"><summary>实拍来源</summary><Credit photo={photo}/></details>;
}

export function PhotoSources() {
  return <details className="photo-credit photo-sources"><summary>配图来源</summary><p>虚构样例相册使用 AI 场景；歌手配图的实拍来源如下。</p>{photoSources.filter(photo=>photo.kind==='concert').map(photo=><Credit key={photo.url} photo={photo}/>)}</details>;
}
