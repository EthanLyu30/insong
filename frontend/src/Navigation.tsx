import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation,useNavigate,useNavigationType} from 'react-router';
import {advanceTrail,concertStoryOrigin,localPath,previousVisit,restoreTrail,type Trail} from './navigationTrail';

const STORAGE='music-navigation-v1';
const Context=createContext<Trail|null>(null);

/** Only POP to entries actually observed in this app, never to an external referrer. */
export function NavigationProvider({children}:{children:ReactNode}) {
  const location=useLocation(),action=useNavigationType();
  const visit={key:location.key,url:location.pathname+location.search+location.hash};
  const [trail,setTrail]=useState<Trail>(()=>{
    try{return restoreTrail(window.sessionStorage.getItem(STORAGE),visit);}catch{return {entries:[visit],index:0};}
  });
  const current=advanceTrail(trail,visit,action);
  useLayoutEffect(()=>{if(current!==trail)setTrail(current);},[current,trail]);
  useEffect(()=>{try{window.sessionStorage.setItem(STORAGE,JSON.stringify(current));}catch{/* Navigation still works with storage disabled. */}},[current]);
  const positions=useRef(new Map<string,number>());
  const previousPath=useRef(location.pathname);
  // Detach the old scroll listener in the commit phase: a shorter destination
  // can emit its clamped scroll before passive-effect cleanup would run.
  useLayoutEffect(()=>{
    const y=action==='POP'?positions.current.get(location.key)??0:action==='REPLACE'&&previousPath.current===location.pathname?window.scrollY:0;
    previousPath.current=location.pathname;
    let pending=y>0;
    let observer:MutationObserver|null=null,resize:ResizeObserver|null=null;
    const stop=()=>{pending=false;observer?.disconnect();resize?.disconnect();};
    const restore=()=>{
      if(!pending)return;
      window.scrollTo(0,y);
      if(document.documentElement.scrollHeight>=y+window.innerHeight-1&&Math.abs(window.scrollY-y)<1)stop();
    };
    window.scrollTo(0,y);
    restore();
    // Wait for the actual content height, including later cursor pages and
    // image/font layout. A fixed timeout can abandon a slow but valid return.
    if(pending){
      observer=typeof MutationObserver!=='undefined'?new MutationObserver(restore):null;
      observer?.observe(document.body,{childList:true,subtree:true});
      resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(restore):null;
      resize?.observe(document.documentElement);
    }
    const remember=()=>{if(!pending)positions.current.set(location.key,window.scrollY);};
    const interrupt=()=>{if(pending){stop();remember();}};
    const keyboard=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Tab'].includes(event.key))interrupt();};
    window.addEventListener('scroll',remember,{passive:true});
    window.addEventListener('wheel',interrupt,{passive:true});
    window.addEventListener('touchmove',interrupt,{passive:true});
    window.addEventListener('pointerdown',interrupt,{passive:true});
    window.addEventListener('keydown',keyboard);
    // The route DOM has already changed by passive-effect cleanup. Reading y
    // here would replace the old position with the shorter new page's clamp.
    return()=>{
      stop();window.removeEventListener('scroll',remember);
      window.removeEventListener('wheel',interrupt);window.removeEventListener('touchmove',interrupt);
      window.removeEventListener('pointerdown',interrupt);window.removeEventListener('keydown',keyboard);
    };
  },[location.key]);
  return <Context.Provider value={current}>{children}</Context.Provider>;
}

export function useBackNavigation(fallback='/',returnToConcert=false) {
  const trail=useContext(Context),navigate=useNavigate();
  const previous=trail?(returnToConcert?concertStoryOrigin(trail):previousVisit(trail)):null;
  const destination=previous?.url??(localPath(fallback)?fallback:'/');
  return {previous,destination,back:()=>{if(previous)navigate(previous.delta);else navigate(destination,{replace:true});}};
}

export function BackLink({fallback='/',className='back-link',children='返回',returnToConcert=false}:{fallback?:string;className?:string;children?:ReactNode;returnToConcert?:boolean}) {
  const {destination,back}=useBackNavigation(fallback,returnToConcert);
  return <Link className={className} to={destination} onClick={event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();back();
  }}><span aria-hidden="true">←</span> {children}</Link>;
}
