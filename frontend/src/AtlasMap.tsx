import { useEffect, useRef, useState, type PointerEvent } from 'react';
import provinces from './china-provinces.json';
import { eventPhase, projectChina, type AtlasCity, type AtlasEvent } from './footprintAtlas';

type Camera = { x: number; y: number; scale: number };
type Geometry = { type: string; coordinates: number[][][] | number[][][][] };
const shapes = provinces.features.map(feature => {
  const geometry = feature.geometry as Geometry;
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as number[][][][];
  const path = polygons.map(polygon => polygon.map(ring => ring.map(([lng, lat], i) => {
    const [x, y] = projectChina(lng, lat); return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z').join(' ')).join(' ');
  return { name: feature.properties.name, code: feature.properties.adcode, path };
});
const major = new Set(['北京','上海','广州','深圳','成都','重庆','武汉','西安','杭州','济南','天津','南京','哈尔滨','乌鲁木齐','拉萨','昆明','三亚','台北','香港','澳门','厦门','南昌','贵阳','南宁','海口']);
const offsets: Record<string, [number, number]> = {上海:[32,18],杭州:[-58,26],南京:[-65,-12],苏州:[-10,-37],广州:[-56,-27],深圳:[25,-18],香港:[46,32],澳门:[-34,52],佛山:[-66,15],台北:[35,0],天津:[38,10],北京:[-46,-17],海口:[38,-16],三亚:[-16,39],厦门:[50,6],南昌:[-57,-14]};

export function AtlasMap({ cities, events, today, selectedCity, artistSelected, onCity }: {
  cities: AtlasCity[]; events: AtlasEvent[]; today: string; selectedCity?: AtlasCity; artistSelected: boolean; onCity: (city: AtlasCity) => void;
}) {
  const [camera, setCamera] = useState<Camera>({x:0,y:0,scale:1});
  const [dragging, setDragging] = useState(false);
  const surface = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, {x:number;y:number}>());
  const moved = useRef(false);
  const pinch = useRef(0);
  function zoom(ratio: number) {
    setCamera(previous => {const scale=Math.min(4,Math.max(1,previous.scale*ratio));const actual=scale/previous.scale;return {scale,x:500-(500-previous.x)*actual,y:480-(480-previous.y)*actual};});
  }
  useEffect(() => {
    if (!selectedCity) {setCamera({x:0,y:0,scale:1});return;}
    const [x,y]=projectChina(selectedCity.lng,selectedCity.lat);setCamera({scale:1.85,x:500-x*1.85,y:390-y*1.85});
  }, [selectedCity?.id, artistSelected, events]);
  useEffect(() => {
    const element=surface.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{event.preventDefault();zoom(event.deltaY>0?.9:1.1);};
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
  }, []);
  function point(event:PointerEvent<SVGSVGElement>) {return {x:event.clientX,y:event.clientY};}
  function start(event:PointerEvent<SVGSVGElement>) {
    if (pointers.current.size===0)moved.current=false;
    pointers.current.set(event.pointerId,point(event));
    if (!(event.target as Element).closest('[data-city]')) event.currentTarget.setPointerCapture?.(event.pointerId);
    if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current=Math.hypot(a.x-b.x,a.y-b.y);}
  }
  function move(event:PointerEvent<SVGSVGElement>) {
    const previous=pointers.current.get(event.pointerId);if(!previous)return;
    const next=point(event);pointers.current.set(event.pointerId,next);
    if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch.current>0)zoom(distance/pinch.current);pinch.current=distance;moved.current=true;setDragging(true);return;}
    const dx=next.x-previous.x,dy=next.y-previous.y;
    if(Math.abs(dx)+Math.abs(dy)>2){moved.current=true;setDragging(true);const rect=event.currentTarget.getBoundingClientRect();const factor=1/Math.min(rect.width/1000,rect.height/1050);setCamera(value=>({...value,x:value.x+dx*factor,y:value.y+dy*factor}));}
  }
  function end(event:PointerEvent<SVGSVGElement>) {pointers.current.delete(event.pointerId);pinch.current=0;if(!pointers.current.size)setDragging(false);}
  const eventCities = new Map<string,AtlasEvent[]>();
  for(const event of events){if(!eventCities.has(event.city))eventCities.set(event.city,[]);eventCities.get(event.city)!.push(event);}
  const route = [...new Set([...events].sort((a,b)=>a.date.localeCompare(b.date)).map(event=>event.city))].map(name=>cities.find(city=>city.name===name)).filter((city):city is AtlasCity=>!!city);
  return <div className="atlas-map-stage">
    <svg ref={surface} className={`atlas-china${dragging?' is-dragging':''}`} viewBox="0 0 1000 1050" aria-label="中国演唱会地图" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <defs><filter id="land-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#879b88" floodOpacity=".22"/></filter><linearGradient id="land-color" x2=".6" y2="1"><stop stopColor="#eff0d8"/><stop offset="1" stopColor="#d8e0c4"/></linearGradient><radialGradient id="city-light"><stop stopColor="#ffcd82" stopOpacity=".6"/><stop offset="1" stopColor="#efb579" stopOpacity="0"/></radialGradient></defs>
      <g className="atlas-map-camera" style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}}>
        <g filter="url(#land-shadow)">{shapes.map((shape,i)=><path key={shape.code} d={shape.path} fill={shape.code==='100000_JD'?'none':i%5===0?'#e8e8cc':i%5===2?'#e0e7cb':'url(#land-color)'} fillRule="evenodd" stroke={shape.code==='100000_JD'?'#839c92':'#b2bca0'} strokeWidth={shape.code==='100000_JD'?1.8:1.2}><title>{shape.name || '南海诸岛'}</title></path>)}</g>
        <g className="atlas-terrain" aria-hidden="true"><path d="m220 435 38-61 35 61m-38-33 14 24 10-15m53 38 28-43 26 43m-185-105 28-46 30 46m245-83 21-33 22 33" fill="#c6d4b8" stroke="#b0c1a5" strokeWidth="2"/><path d="M414 578q70-27 113-14t70-10 94 16" stroke="#a8c8c4" strokeWidth="7" fill="none" strokeLinecap="round"/><text x="361" y="511" fill="#9aaa90" fontSize="26" letterSpacing="11" transform="rotate(-9 361 511)">山河之间</text><text x="820" y="760" fill="#8ca4a2" fontSize="22" letterSpacing="8">南海</text></g>
        {artistSelected && route.length>1 && <path className="atlas-route" d={route.map((city,i)=>{const [x,y]=projectChina(city.lng,city.lat);return `${i?'L':'M'}${x},${y}`;}).join(' ')} fill="none" stroke="#b88561" strokeWidth="2.5" strokeDasharray="7 10" opacity=".65"/>}
        {cities.map(city=>{
          const [x,y]=projectChina(city.lng,city.lat);const shows=eventCities.get(city.name)??[];const upcoming=shows.some(event=>eventPhase(event,today)!=='past');const active=shows.length>0;const [ox,oy]=offsets[city.name]??[18,-16];const showName=active || major.has(city.name) || camera.scale>1.45;
          return <g key={city.id} data-city={city.id} className={`atlas-city ${active?'is-lit':''} ${upcoming?'is-upcoming':''} ${selectedCity?.id===city.id?'is-selected':''}`} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`${city.name}${active?` · ${shows.length} 场${upcoming?' · 有待演':''}`:''}`} onClick={event=>{event.stopPropagation();if(!moved.current)onCity(city);}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onCity(city);}}}>
            <circle r="33" fill="transparent"/>{active && <circle className="atlas-city-glow" r="39" fill="url(#city-light)"/>}
            {active ? <g className="atlas-tiny-stadium"><ellipse cy="4" rx="17" ry="7" fill={upcoming?'#bba174':'#9baa8d'}/><path d="M-17-5v9c0 9 34 9 34 0V-5" fill={upcoming?'#d6b88e':'#c0c8a9'}/><ellipse cy="-5" rx="17" ry="8" fill="#faf5db" stroke="#87997d" strokeWidth="1.4"/><ellipse cy="-5" rx="10" ry="4" fill={upcoming?'#e0b462':'#9dad8d'}/><path d="M-13-8v-10m26 10v-10" stroke="#988976" strokeWidth="2"/><path d="M-17-18h8m18 0h8" stroke={upcoming?'#d6a454':'#aabe92'} strokeWidth="3" strokeLinecap="round"/></g> : <><circle r="5" fill="#9ba58d"/><circle r="10" stroke="#a6b199" strokeWidth="1" fill="none" opacity=".5"/></>}
            {showName && <text x={ox} y={oy} fontSize={(active?29:26)/camera.scale} textAnchor={ox<0?'end':'start'} paintOrder="stroke" stroke="#e7ebd7" strokeWidth="5" strokeLinejoin="round" fill={active?'#70543e':'#6e7c69'}>{city.name}</text>}
          </g>;
        })}
      </g>
    </svg>
    <div className="atlas-map-controls"><button type="button" aria-label="放大地图" onClick={()=>zoom(1.35)}>＋</button><button type="button" aria-label="缩小地图" onClick={()=>zoom(1/1.35)}>−</button><button type="button" aria-label="全国复位" onClick={()=>setCamera({x:0,y:0,scale:1})}>⌖</button></div>
  </div>;
}
