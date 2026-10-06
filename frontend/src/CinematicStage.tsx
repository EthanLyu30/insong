import {useRef,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {type AtlasEvent,type AtlasSong} from './footprintAtlas';
import {type SceneController} from './sceneInteraction';
import {SongConstellation} from './SongConstellation';

type Props={scene:string;controller:RefObject<SceneController|null>;event?:AtlasEvent;venueName?:string;city?:string;artistName?:string;selected:AtlasSong|null;playing?:string;onSong:(song:AtlasSong)=>void};

// Bounded depth gestures stay within the concert artwork; there is no exterior step.
export function CinematicStage({scene,controller,event,venueName,city,artistName,selected,playing,onSong}:Props){
  const points=useRef(new Map<number,[number,number]>());
  function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if((e.target as HTMLElement).closest('.atlas-song-stars')||e.button!==0)return;
    points.current.set(e.pointerId,[e.clientX,e.clientY]);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const previous=points.current.get(e.pointerId);if(!previous)return;
    const before=[...points.current.values()];points.current.set(e.pointerId,[e.clientX,e.clientY]);
    if(points.current.size===2){const after=[...points.current.values()];controller.current?.pinch(Math.hypot(before[0][0]-before[1][0],before[0][1]-before[1][1]),Math.hypot(after[0][0]-after[1][0],after[0][1]-after[1][1]));}
    else controller.current?.orbit(e.clientX-previous[0],e.clientY-previous[1]);
  }
  function pointerUp(e:ReactPointerEvent<HTMLDivElement>){
    points.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }
  return <div className={'cinematic-stage '+(scene==='map'?'is-hidden':'')+(scene==='sky'?' is-night':'')} aria-hidden={scene==='map'} inert={scene==='map'} role="region" tabIndex={scene==='map'?-1:0} aria-label="可拖动调整视角的夜空" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>points.current.clear()} onWheel={e=>{if(!(e.target as HTMLElement).closest('.atlas-song-stars'))controller.current?.zoom(-e.deltaY*.002);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const moves:Record<string,[number,number]>={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(moves[e.key]){e.preventDefault();controller.current?.orbit(...moves[e.key]);}}}>
    <div className="cinematic-gesture-surface" aria-hidden="true"/>
    {scene==='sky'&&event&&<>
      <div className="cinematic-night-title"><h1>{artistName??'我们'} · 这一晚</h1><p>{event.date.replaceAll('-','.')} · {venueName??city}</p>{event.event_status==='cancelled'?<span>这场演出已取消 · 仅保留记录</span>:<span>把歌声，留在星光里。</span>}</div>
      <SongConstellation eventId={event.id} songs={event.songs} selected={selected} playing={playing} onSong={onSong}/>
    </>}
    {scene!=='map'&&<span className="cinematic-demo-label">场景示意</span>}
  </div>;
}
