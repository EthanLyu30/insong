import {useEffect,useRef,useState} from 'react';
import {CaretDown} from '@phosphor-icons/react';

type Option={value:string;label:string};
const rowHeight=36;

/** A local wheel choice only changes the surrounding time sheet's draft. */
export function TimeWheel({label,value,options,onChange,disabled=false}:{label:string;value:string;options:Option[];onChange:(value:string)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),field=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),wheel=useRef<HTMLDivElement>(null);
  const selected=Math.max(0,options.findIndex(option=>option.value===value));
  useEffect(()=>{
    if(!open)return;
    if(wheel.current)wheel.current.scrollTop=selected*rowHeight;
    wheel.current?.focus();
    const leave=(event:FocusEvent)=>{if(!field.current?.contains(event.target as Node|null))setOpen(false);};
    document.addEventListener('focusin',leave);
    return()=>document.removeEventListener('focusin',leave);
    // Align once on opening; scrolling must not be pulled back by React updates.
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  function close(){setOpen(false);trigger.current?.focus();}
  return <div ref={field} className="time-wheel-field">
    <button ref={trigger} type="button" className="time-wheel-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(!open)}><span>{options[selected]?.label}</span><CaretDown size={16}/></button>
    {open&&<div className="time-wheel-popup"><div className="time-wheel-heading"><span>{label}</span><button type="button" onClick={close}>完成</button></div><div ref={wheel} className="time-wheel" role="listbox" aria-label={`选择${label}`} tabIndex={0} aria-activedescendant={`wheel-${label}-${selected}`} onKeyDown={event=>{
      if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();event.stopPropagation();close();return;}
      if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,selected+(event.key==='ArrowDown'?1:-1)));onChange(options[index].value);if(wheel.current)wheel.current.scrollTop=index*rowHeight;}
    }} onScroll={()=>{
      const index=Math.max(0,Math.min(options.length-1,Math.round((wheel.current?.scrollTop??0)/rowHeight)));onChange(options[index].value);
    }}>{options.map((option,index)=><button id={`wheel-${label}-${index}`} key={option.value} type="button" role="option" aria-selected={value===option.value} data-value={option.value} tabIndex={-1} onClick={()=>{onChange(option.value);close();}}>{option.label}</button>)}</div><span className="time-wheel-guide" aria-hidden="true"/></div>}
  </div>;
}
