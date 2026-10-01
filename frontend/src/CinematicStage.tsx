import {useRef,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {ArrowClockwise,ArrowRight,Minus,Plus,StarFour} from '@phosphor-icons/react';
import type {AtlasEvent,AtlasSong} from './footprintAtlas';
import {isSceneTap,type SceneController} from './sceneInteraction';

type Props={scene:string;controller:RefObject<SceneController|null>;event?:AtlasEvent;venueName?:string;city?:string;artistName?:string;selected:AtlasSong|null;onSong:(song:AtlasSong)=>void;onEnter:()=>void};
const constellation=[[14,14],[39,24],[63,6],[88,22],[23,62],[48,80],[67,49],[88,70]];
const starLinks=[[0,1],[1,2],[2,3],[0,4],[4,5],[5,6],[6,7]];

// UI and gestures only. MapLibre and the georeferenced 3D layer share one camera and canvas.
export function CinematicStage({scene,controller,event,venueName,city,artistName,selected,onSong,onEnter}:Props){
  const located=Number.isFinite(event?.venue_lng)&&Number.isFinite(event?.venue_lat);
  const points=useRef(new Map<number,[number,number]>());
  const gesture=useRef<{start:[number,number];enter:boolean;moved:boolean;handled:boolean}|null>(null);
  function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if((e.target as HTMLElement).closest('.cinematic-controls,.atlas-song-stars')||e.button!==0)return;
    points.current.set(e.pointerId,[e.clientX,e.clientY]);
    if(points.current.size===1)gesture.current={start:[e.clientX,e.clientY],enter:!!(e.target as HTMLElement).closest('.cinematic-enter'),handled:false,moved:false};
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
    if(g&&points.current.size===0){g.handled=true;if(scene==='venue'&&g.enter&&isSceneTap(g.start,[e.clientX,e.clientY],g.moved))onEnter();}
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }
  return <div className={'cinematic-stage '+(scene==='map'?'is-hidden':'')+(scene==='sky'?' is-night':'')} aria-hidden={scene==='map'} inert={scene==='map'} role="region" tabIndex={scene==='map'?-1:0} aria-label="可拖动环绕的三维场馆" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{points.current.clear();gesture.current=null;}} onWheel={e=>{if(!(e.target as HTMLElement).closest('.atlas-song-stars'))controller.current?.zoom(-e.deltaY*.002);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const moves:Record<string,[number,number]>={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(moves[e.key]){e.preventDefault();controller.current?.orbit(...moves[e.key]);}}}>
    <div className="cinematic-gesture-surface" aria-hidden="true"/>
    {scene==='venue'&&<>
      <div className="cinematic-location"><h1>{venueName?.match(/体育[场馆]$/)?<>{venueName.slice(0,-3)}<br/>{venueName.slice(-3)}</>:venueName}</h1><p>{located?'歌声即将抵达':'场馆位置待核实 · 先看看这座城'}</p></div>
      <button className="cinematic-enter" type="button" aria-label="进入这座场馆" onClick={e=>{if(e.detail===0||!gesture.current?.handled)onEnter();}}><span>点击场馆，走进这一晚 <ArrowRight size={16}/></span></button>
    </>}
    {scene==='sky'&&event&&<>
      <div className="cinematic-night-title"><h1>{artistName??'我们'} · 这一晚</h1><p>{event.date.replaceAll('-','.')} · {venueName??city}</p><span>把歌声，留在星光里。</span></div>
      <div className={'atlas-song-stars '+(event.songs.length>constellation.length?'is-long':'')} aria-label="歌曲星空">
        {event.songs.length<=constellation.length&&<svg className="atlas-constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{starLinks.filter(([a,b])=>a<event.songs.length&&b<event.songs.length).map(([a,b])=><line key={`${a}-${b}`} x1={constellation[a][0]} y1={constellation[a][1]-7} x2={constellation[b][0]} y2={constellation[b][1]-7}/>)}</svg>}
        {event.songs.map((song,i)=>{
        const [x,y]=constellation[i%constellation.length];
        return <button key={i} type="button" className={'atlas-song-star '+(selected?.title===song.title?'is-selected':'')} style={{left:`${x}%`,top:`${y}%`}} aria-label={`第${i+1}颗星 · ${song.title}`} aria-pressed={selected?.title===song.title} onClick={()=>onSong(song)}><StarFour size={23} weight="thin"/><span>{song.title}</span></button>;
      })}</div>
    </>}
    {scene!=='map'&&<div className="cinematic-controls"><button type="button" onClick={()=>controller.current?.zoom(.3)} aria-label="拉近场馆"><Plus size={24} weight="light"/></button><button type="button" onClick={()=>controller.current?.zoom(-.3)} aria-label="拉远场馆"><Minus size={24} weight="light"/></button><button type="button" onClick={()=>controller.current?.home()} aria-label="重新运镜"><ArrowClockwise size={21} weight="light"/></button></div>}
    {scene!=='map'&&<span className="cinematic-demo-label">{located?'可环绕的场景示意':'城市位置 · 场内为概念全景'}</span>}
  </div>;
}
