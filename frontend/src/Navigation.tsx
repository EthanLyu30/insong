import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation,useNavigate,useNavigationType} from 'react-router';
import {advanceTrail,localPath,previousVisit,restoreTrail,type Trail} from './navigationTrail';

const STORAGE='music-navigation-v1';
const Context=createContext<ReturnType<typeof previousVisit>>(null);

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
  useEffect(()=>{
    const y=action==='POP'?positions.current.get(location.key)??0:action==='REPLACE'&&previousPath.current===location.pathname?window.scrollY:0;
    previousPath.current=location.pathname;
    let pending=y>0;
    const restore=()=>{if(pending){window.scrollTo(0,y);if(document.documentElement.scrollHeight>=y+window.innerHeight)pending=false;}};
    window.scrollTo(0,y);
    const observer=pending&&typeof MutationObserver!=='undefined'?new MutationObserver(restore):null;
    observer?.observe(document.body,{childList:true,subtree:true});
    const timer=window.setTimeout(()=>{pending=false;observer?.disconnect();},2000);
    const remember=()=>{if(!pending)positions.current.set(location.key,window.scrollY);};
    window.addEventListener('scroll',remember,{passive:true});
    return()=>{window.clearTimeout(timer);observer?.disconnect();window.removeEventListener('scroll',remember);if(!pending)positions.current.set(location.key,window.scrollY);};
  },[location.key]);
  return <Context.Provider value={previousVisit(current)}>{children}</Context.Provider>;
}

export function useBackNavigation(fallback='/') {
  const previous=useContext(Context),navigate=useNavigate();
  const destination=previous?.url??(localPath(fallback)?fallback:'/');
  return {previous,destination,back:()=>{if(previous)navigate(previous.delta);else navigate(destination,{replace:true});}};
}

export function BackLink({fallback='/',className='back-link',children='返回'}:{fallback?:string;className?:string;children?:ReactNode}) {
  const {destination,back}=useBackNavigation(fallback);
  return <Link className={className} to={destination} onClick={event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();back();
  }}><span aria-hidden="true">←</span> {children}</Link>;
}
