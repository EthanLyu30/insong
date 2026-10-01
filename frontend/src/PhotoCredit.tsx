import {photoSourceInfo,photoSources,type PhotoSource} from './photoSources';

function Credit({photo}:{photo:PhotoSource}) {
  return <div><a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.description} · {photo.author} ↗</a>{photo.captured&&<span>实拍日期 {photo.captured}</span>}{photo.context&&<span>{photo.context}</span>}<small><a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> · {photo.kind==='concert'?'保留原始图片，页面适配裁切':'本地格式压缩，展示时裁切'}</small></div>;
}

export function PhotoCredit({url}:{url?:string}) {
  const photo=photoSourceInfo(url);if(!photo)return null;
  return <details className="photo-credit"><summary>{photo.kind==='concert'?'现场实拍 · 查看来源':photo.kind==='archive'?'历史实拍 · 摄影来源':'摄影配图 · 查看来源'}</summary>{!photo.kind&&<p>真实摄影配图，不代表这位歌手的具体场次，也不是官方专辑封面。</p>}<Credit photo={photo}/></details>;
}

export function PhotoSources() {
  return <details className="photo-credit photo-sources"><summary>页面摄影配图与来源</summary><p>样例故事使用真实摄影配图，不代表实际投稿、到场或歌手的具体场次。上传自己的照片后，会优先使用自己的照片。</p>{photoSources.map(photo=><Credit key={photo.url} photo={photo}/>)}</details>;
}
