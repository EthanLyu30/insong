import {useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown,X} from '@phosphor-icons/react';
import type {MemoryTimeRange} from './memoryPresentation';
import {TimeWheel} from './TimeWheel';

export function MemoryTimeFilter({value,years,onChange,disabled=false}:{value:MemoryTimeRange;years:number[];onChange:(value:MemoryTimeRange)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(value);
  const trigger=useRef<HTMLButtonElement>(null),sheet=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:12,top:12,width:320,maxHeight:480});
  function close(restore=false){setOpen(false);if(restore)trigger.current?.focus();}
  useEffect(()=>{
    if(disabled)close();
  },[disabled]);
  useEffect(()=>{
    if(open)sheet.current?.querySelector<HTMLButtonElement>('[aria-label="开始年份"]')?.focus({preventScroll:true});
  },[open]);
  useLayoutEffect(()=>{
    if(!open)return;
    function place(event?:Event){
      if(event?.target instanceof window.Node&&sheet.current?.contains(event.target))return;
      const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
      const viewport=window.visualViewport,leftEdge=viewport?.offsetLeft??0,topEdge=viewport?.offsetTop??0;
      const width=viewport?.width??window.innerWidth,height=viewport?.height??window.innerHeight;
      if(rect.bottom<=topEdge+12||rect.top>=topEdge+height-12){close();return;}
      const panelWidth=Math.min(340,width-24),top=rect.bottom+8;
      setPosition({left:Math.max(leftEdge+12,Math.min(rect.left,leftEdge+width-panelWidth-12)),top,width:panelWidth,maxHeight:Math.max(80,Math.min(480,topEdge+height-top-82))});
    }
    function outside(event:PointerEvent){if(event.target instanceof window.Node&&!trigger.current?.contains(event.target)&&!sheet.current?.contains(event.target))close();}
    function escape(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();close(true);}}
    function focus(event:FocusEvent){if(event.target instanceof window.Node&&!trigger.current?.contains(event.target)&&!sheet.current?.contains(event.target))close();}
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',focus);window.addEventListener('keydown',escape);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',focus);window.removeEventListener('keydown',escape);};
  },[open]);
  const start=draft.startYear?Number(draft.startYear)*12+Number(draft.startMonth||1):-Infinity;
  const end=draft.endYear?Number(draft.endYear)*12+Number(draft.endMonth||12):Infinity;
  const valid=start<=end;
  const label=(year:string,month:string)=>year?`${year}年${month?`${month}月`:''}`:'';
  const selected=value.startYear||value.endYear?`${label(value.startYear,value.startMonth)||'最早'}—${label(value.endYear,value.endMonth)||'至今'}`:'全部时间';
  function confirm(event:FormEvent){event.preventDefault();if(valid){onChange(draft);close(true);}}
  return <><button ref={trigger} type="button" className="choice-trigger" aria-label="按时间筛选" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>{if(open)close();else{setDraft(value);setOpen(true);}}}><span>{selected}</span><CaretDown size={15}/></button>{open&&createPortal(<div ref={sheet} className="choice-panel memory-time-sheet" role="dialog" aria-label="设置记忆时间范围" style={position}><header><h2>选择时间范围</h2><button type="button" aria-label="关闭时间筛选" onClick={()=>close(true)}><X size={18}/></button></header><form onSubmit={confirm}>{(['start','end'] as const).map(side=>{
    const yearKey=side==='start'?'startYear':'endYear',monthKey=side==='start'?'startMonth':'endMonth',name=side==='start'?'开始':'结束';
    return <fieldset key={side}><legend>{name}时间</legend><div className="memory-time-parts"><div><span>年份</span><TimeWheel label={`${name}年份`} value={draft[yearKey]} options={[{value:'',label:'不限年份'},...years.map(year=>({value:String(year),label:`${year}年`}))]} onChange={value=>setDraft(old=>({...old,[yearKey]:value,...(!value?{[monthKey]:''}:{})}))}/></div><div><span>月份（选填）</span><TimeWheel label={`${name}月份`} value={draft[monthKey]} disabled={!draft[yearKey]} options={[{value:'',label:'全年'},...Array.from({length:12},(_,index)=>({value:String(index+1),label:`${index+1}月`}))]} onChange={value=>setDraft(old=>({...old,[monthKey]:value}))}/></div></div></fieldset>;
  })}{!valid&&<p className="form-error" role="alert">结束时间不能早于开始时间。</p>}<button type="submit" className="primary-button" disabled={!valid}>确定</button><button type="button" className="memory-time-clear" onClick={()=>{onChange({startYear:'',startMonth:'',endYear:'',endMonth:''});close(true);}}>全部时间</button></form></div>,document.body)}</>;
}
