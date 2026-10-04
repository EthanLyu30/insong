import {useEffect,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router';

const startupSections=new Set(['/discover','/create','/memories','/footprints','/playlists']);

export function LaunchGate({children}:{children:ReactNode}){
  const location=useLocation(),navigate=useNavigate();
  const [pending,setPending]=useState(()=>startupSections.has(location.pathname)&&!location.search&&!location.hash);
  useEffect(()=>{
    if(!pending)return;
    if(location.pathname==='/')setPending(false);
    else navigate('/',{replace:true});
  },[pending,location.pathname,navigate]);
  return pending?null:children;
}
