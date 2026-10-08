import {useEffect,useRef,useState} from 'react';
import {apiBaseUrl} from './api';
import {apiRequest,type Memory} from './memoryClient';

type PersonalConcerts={memories:Memory[];attendedIds:string[]};

export function usePersonalConcerts(owner:number|null,enabled=true){
  const activeOwner=useRef(owner);activeOwner.current=owner;
  const [retry,setRetry]=useState(0);
  const [state,setState]=useState<{owner:number|null;value:PersonalConcerts|null;error:string}>({owner,value:null,error:''});
  useEffect(()=>{
    const control=new AbortController();setState({owner,value:null,error:''});
    if(owner!==null&&enabled)void Promise.all([
      apiRequest<Memory[]>(apiBaseUrl,'/api/memories',{signal:control.signal}),
      apiRequest<string[]>(apiBaseUrl,'/api/footprints',{signal:control.signal}),
    ]).then(([memories,attendedIds])=>{
      if(!control.signal.aborted&&activeOwner.current===owner)setState({owner,value:{memories,attendedIds},error:''});
    }).catch(reason=>{
      if(!control.signal.aborted&&activeOwner.current===owner)setState({owner,value:null,error:reason instanceof Error?reason.message:'个人经历暂未读到，请重试。'});
    });
    return()=>control.abort();
  },[owner,enabled,retry]);
  return {value:enabled&&state.owner===owner?state.value:null,error:enabled&&state.owner===owner?state.error:'',reload:()=>setRetry(value=>value+1)};
}
