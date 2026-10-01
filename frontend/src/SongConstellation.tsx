import {useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {ArrowDown,StarFour} from '@phosphor-icons/react';
import type {AtlasSong} from './footprintAtlas';
import {scatterSongs} from './songStars';

type Props={eventId:string;songs:AtlasSong[];selected:AtlasSong|null;playing?:string;onSong:(song:AtlasSong)=>void};

export function SongConstellation({eventId,songs,selected,playing,onSong}:Props){
  const field=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:320,height:210}),[atEnd,setAtEnd]=useState(false);
  useLayoutEffect(()=>{
    const element=field.current;if(!element)return;
    const measure=()=>{const {width,height}=element.getBoundingClientRect();if(width>0&&height>0)setSize(old=>old.width===width&&old.height===height?old:{width,height});};
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{field.current?.scrollTo?.({top:0});setAtEnd(false);},[eventId]);
  const layout=useMemo(()=>scatterSongs(songs.map(song=>song.title),eventId,size.width),[eventId,songs,size.width]);
  const scrollable=layout.height>size.height+2;
  return <div className="atlas-star-field">
    <div ref={field} className="atlas-song-stars" aria-label="歌曲星空" onScroll={e=>{const node=e.currentTarget;setAtEnd(node.scrollTop+node.clientHeight>=node.scrollHeight-3);}}>
      <div className="atlas-star-space" style={{height:layout.height}}>
        {layout.stars.map(point=>{
          const song=songs[point.index];
          const style={left:point.x,top:point.y,width:point.width,height:point.height,'--star-delay':`${point.delay}s`,'--star-duration':`${point.duration}s`} as CSSProperties;
          return <button key={`${eventId}:${point.index}`} type="button" className={'atlas-song-star '+(selected?.title===song.title?'is-selected':'')+(playing===song.title?' is-playing':'')} style={style} aria-label={`第${point.index+1}颗星 · ${song.title} · ${playing===song.title?'暂停':'播放'}`} aria-pressed={playing===song.title} onClick={()=>onSong(song)}><StarFour size={point.size} weight="fill"/><span>{song.title}</span></button>;
        })}
      </div>
    </div>
    {scrollable&&!atEnd&&<span className="atlas-stars-browse-hint">轻滑，还有星光 <ArrowDown size={12}/></span>}
  </div>;
}
