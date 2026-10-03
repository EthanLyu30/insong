import {useRef,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {ArrowRight} from '@phosphor-icons/react';
import {eventPhase,type AtlasEvent,type AtlasSong} from './footprintAtlas';
import {isSceneTap,type SceneController} from './sceneInteraction';
import {SongConstellation} from './SongConstellation';

type Props={scene:string;controller:RefObject<SceneController|null>;event?:AtlasEvent;venueName?:string;city?:string;artistName?:string;selected:AtlasSong|null;playing?:string;onSong:(song:AtlasSong)=>void;onEnter:()=>void};

// Shared input: map approach, architectural drone orbit, then concert sky.
export function CinematicStage({scene,controller,event,venueName,city,artistName,selected,playing,onSong,onEnter}:Props){
  const located=Number.isFinite(event?.venue_lng)&&Number.isFinite(event?.venue_lat);
  const points=useRef(new Map<number,[number,number]>());
  const gesture=useRef<{start:[number,number];enter:boolean;hint:boolean;moved:boolean;handled:boolean}|null>(null);
  function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if((e.target as HTMLElement).closest('.atlas-song-stars')||e.button!==0)return;
    points.current.set(e.pointerId,[e.clientX,e.clientY]);
    if(points.current.size===1)gesture.current={start:[e.clientX,e.clientY],enter:!!(e.target as HTMLElement).closest('.cinematic-enter'),hint:!!(e.target as HTMLElement).closest('.cinematic-orbit-hint'),handled:false,moved:false};
    else if(gesture.current)gesture.current.moved=true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const previous=points.current.get(e.pointerId),g=gesture.current;if(!previous||!g||g.handled)return;
    g.moved=g.moved||!isSceneTap(g.start,[e.clientX,e.clientY]);
    const before=[...points.current.values()];points.current.set(e.pointerId,[e.clientX,e.clientY]);
    if(points.current.size===2){const after=[...points.current.values()];controller.current?.pinch(Math.hypot(before[0][0]-before[1][0],before[0][1]-before[1][1]),Math.hypot(after[0][0]-after[1][0],after[0][1]-after[1][1]));}
    else controller.current?.orbit(e.clientX-previous[0],e.clientY-previous[1]);
  }
  function pointerUp(e:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;points.current.delete(e.pointerId);
    if(g&&points.current.size===0){g.handled=true;if(scene==='venue'&&isSceneTap(g.start,[e.clientX,e.clientY],g.moved)){if(g.hint)controller.current?.orbit(0,0);else if(g.enter)onEnter();}}
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }
  return <div className={'cinematic-stage '+(scene==='map'?'is-hidden':'')+(scene==='sky'?' is-night':'')} aria-hidden={scene==='map'} inert={scene==='map'} role="region" tabIndex={scene==='map'?-1:0} aria-label={scene==='venue'?'可拖动360度环绕的场馆':'可拖动调整视角的夜空'} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{points.current.clear();gesture.current=null;}} onWheel={e=>{if(!(e.target as HTMLElement).closest('.atlas-song-stars'))controller.current?.zoom(-e.deltaY*.002);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const moves:Record<string,[number,number]>={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(moves[e.key]){e.preventDefault();controller.current?.orbit(...moves[e.key]);}}}>
    <div className="cinematic-gesture-surface" aria-hidden="true"/>
    {scene==='venue'&&<>
      <div className="cinematic-location"><h1>{venueName?.match(/体育[场馆]$/)?<>{venueName.slice(0,-3)}<br/>{venueName.slice(-3)}</>:venueName}</h1><p>{!located?'场馆位置待核实 · 先看看这座城':event&&eventPhase(event)==='past'?'歌声曾在这里停靠':event?.event_status==='cancelled'?'此场次已取消':'歌声即将抵达'}</p></div>
      {event?.event_status!=='cancelled'&&<button className="cinematic-enter" type="button" aria-label="进入这座场馆" onClick={e=>{if(e.detail===0||!gesture.current?.handled)onEnter();}}><span>点击场馆，走进这一晚 <ArrowRight size={16}/></span></button>}
      <button className="cinematic-orbit-hint" type="button" aria-label="开启无人机360度视角" onClick={e=>{e.stopPropagation();if(e.detail===0||(!gesture.current?.handled&&!gesture.current?.moved))controller.current?.orbit(0,0);}}><span aria-hidden="true"/>拖动，环绕现场 · 360°</button>
    </>}
    {scene==='sky'&&event&&<>
      <div className="cinematic-night-title"><h1>{artistName??'我们'} · 这一晚</h1><p>{event.date.replaceAll('-','.')} · {venueName??city}</p>{event.event_status==='cancelled'?<span>这场演出已取消 · 仅保留记录</span>:<span>把歌声，留在星光里。</span>}</div>
      <SongConstellation eventId={event.id} songs={event.songs} selected={selected} playing={playing} onSong={onSong}/>
    </>}
    {scene!=='map'&&<span className="cinematic-demo-label">场景示意</span>}
  </div>;
}
