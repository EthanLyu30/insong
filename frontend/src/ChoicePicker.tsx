import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown} from '@phosphor-icons/react';
import './choicePicker.css';

type Choice={value:string;label:string};
type Props={label:string;value:string;options:Choice[];onChange:(value:string)=>void;disabled?:boolean;id?:string};

/** Keep the list in the document, anchored to its control rather than an OS popup. */
export function ChoicePicker({label,value,options,onChange,disabled=false,id}:Props){
  const generatedId=useId(),listId=`${id??generatedId}-choices`;
  const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(0);
  const [position,setPosition]=useState({left:12,top:12,width:0,maxHeight:280});
  const selectedIndex=options.findIndex(option=>option.value===value);
  const selected=options[selectedIndex]?.label??'已选条件';
  function close(restore=false){setOpen(false);if(restore)trigger.current?.focus();}
  function show(){setActive(Math.max(0,selectedIndex));setOpen(true);}
  function choose(option:Choice){onChange(option.value);close(true);}

  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useLayoutEffect(()=>{
    if(!open||disabled)return;
    function place(event?:Event){
      if(event?.target instanceof window.Node&&panel.current?.contains(event.target))return;
      const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
      const viewport=window.visualViewport;
      const leftEdge=viewport?.offsetLeft??0,topEdge=viewport?.offsetTop??0;
      const width=viewport?.width??window.innerWidth,height=viewport?.height??window.innerHeight;
      if(rect.bottom<=topEdge+12||rect.top>=topEdge+height-12||rect.right<=leftEdge+12||rect.left>=leftEdge+width-12){close();return;}
      const listWidth=Math.min(rect.width,width-24);
      const below=Math.max(0,topEdge+height-rect.bottom-20),above=Math.max(0,rect.top-topEdge-20);
      const desired=Math.min(panel.current?.scrollHeight?panel.current.scrollHeight+2:options.length*46+16,300,height-24);
      const opensAbove=below<desired&&above>below;
      const maxHeight=Math.min(opensAbove?above:below,300,height-24);
      const rawTop=opensAbove?rect.top-8-Math.min(desired,maxHeight):rect.bottom+8;
      const top=Math.max(topEdge+12,Math.min(rawTop,topEdge+height-12-Math.min(desired,maxHeight)));
      const next={left:Math.max(leftEdge+12,Math.min(rect.left,leftEdge+width-listWidth-12)),top,width:listWidth,maxHeight};
      setPosition(previous=>Object.entries(next).every(([key,value])=>previous[key as keyof typeof previous]===value)?previous:next);
    }
    function outside(event:PointerEvent){if(event.target instanceof window.Node&&!trigger.current?.contains(event.target)&&!panel.current?.contains(event.target))close();}
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
    document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);document.removeEventListener('pointerdown',outside);};
  },[open,disabled,options,position.width]);
  useEffect(()=>{
    if(!open)return;
    const option=panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[active];
    option?.focus({preventScroll:true});option?.scrollIntoView?.({block:'nearest'});
  },[open,active]);

  return <>
    <button ref={trigger} id={id} type="button" className="choice-trigger" aria-label={label} aria-describedby={`${listId}-value`} aria-haspopup="listbox" aria-controls={open?listId:undefined} aria-expanded={open&&!disabled} disabled={disabled} onClick={()=>open?close():show()} onKeyDown={event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show();}
    }}><span id={`${listId}-value`}>{selected}</span><CaretDown size={15} aria-hidden="true"/></button>
    {open&&!disabled&&createPortal(<div ref={panel} id={listId} className="choice-panel" role="listbox" aria-label={label} style={position} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
      else if(event.key==='Tab'){close(true);}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();setActive(event.key==='Home'?0:event.key==='End'?options.length-1:(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);
      }
    }}>{options.map((option,index)=><button key={option.value} type="button" role="option" data-value={option.value} aria-selected={option.value===value} tabIndex={index===active?0:-1} className="choice-option" onClick={()=>choose(option)}><span>{option.label}</span></button>)}</div>,document.body)}
  </>;
}
