import {useEffect,useRef,useState,type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown,X} from '@phosphor-icons/react';
import {chinaToday} from './footprintAtlas';
import {lockPageScroll,trapDialogFocus} from './dialogScroll';

export function MonthFilter({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const [open,setOpen]=useState(false),[year,setYear]=useState(''),[month,setMonth]=useState('');
  const trigger=useRef<HTMLButtonElement>(null),sheet=useRef<HTMLFormElement>(null);
  function show(){const date=value||chinaToday().slice(0,7);setYear(date.slice(0,4));setMonth(date.slice(5,7));setOpen(true);}
  useEffect(()=>{
    if(!open)return;
    const unlock=lockPageScroll();
    const release=sheet.current?trapDialogFocus(sheet.current,()=>setOpen(false),trigger.current):()=>{};
    return()=>{release();unlock();};
  },[open]);
  const valid=/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=9999&&/^\d{1,2}$/.test(month)&&Number(month)>=1&&Number(month)<=12;
  function confirm(event:FormEvent){event.preventDefault();if(!valid)return;onChange(`${year}-${month.padStart(2,'0')}`);setOpen(false);}
  return <><button ref={trigger} type="button" className="choice-trigger" aria-label="筛选演出月份" aria-haspopup="dialog" aria-expanded={open} onClick={show}>{value?`${value.slice(0,4)}年${Number(value.slice(5))}月`:'全部月份'}<CaretDown size={14}/></button>{open&&createPortal(<div className="composer-modal" role="dialog" aria-modal="true" aria-label="筛选演出月份"><button type="button" className="composer-modal-scrim" aria-label="关闭月份筛选" onClick={()=>setOpen(false)}/><form ref={sheet} className="composer-sheet atlas-month-sheet" onSubmit={confirm}><div className="composer-sheet-handle"/><header><button type="button" aria-label="关闭月份筛选" onClick={()=>setOpen(false)}><X size={20}/></button><h2>选择演出年月</h2></header><div className="schedule-month-parts"><label><input id="schedule-year" aria-label="演出年份" inputMode="numeric" maxLength={4} value={year} onChange={event=>setYear(event.target.value.replace(/\D/g,''))}/><span>年</span></label><label><input id="schedule-month" aria-label="演出月份" inputMode="numeric" maxLength={2} value={month} onChange={event=>setMonth(event.target.value.replace(/\D/g,''))}/><span>月</span></label></div><button type="submit" className="primary-button" disabled={!valid}>确定</button><button type="button" className="month-show-all" onClick={()=>{onChange('all');setOpen(false);}}>全部月份</button></form></div>,document.body)}</>;
}
