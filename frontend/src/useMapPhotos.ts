import {useEffect,useRef,useState} from 'react';
import {apiBaseUrl} from './api';
import {apiRequest} from './memoryClient';
import {useSession} from './SessionContext';
import type {MapPhotoChoice} from './personalMap';

export function useMapPhotos(){
  const {user}=useSession(),owner=user?.id??null;
  const activeOwner=useRef(owner);activeOwner.current=owner;
  const [retry,setRetry]=useState(0),[state,setState]=useState<{owner:number|null;photos:MapPhotoChoice[];error:string;loading:boolean}>({owner,photos:[],error:'',loading:true});
  useEffect(()=>{
    const controller=new AbortController();setState({owner,photos:[],error:'',loading:true});
    void apiRequest<{photos:MapPhotoChoice[]}>(apiBaseUrl,'/api/footprints/photos',{signal:controller.signal}).then(result=>{
      if(!controller.signal.aborted&&activeOwner.current===owner)setState({owner,photos:result.photos.filter(photo=>owner!==null||photo.source!=='mine'),error:'',loading:false});
    }).catch(reason=>{if(!controller.signal.aborted&&activeOwner.current===owner)setState({owner,photos:[],error:reason instanceof Error?reason.message:'照片暂时未读到。',loading:false});});
    return()=>controller.abort();
  },[owner,retry]);
  return {photos:state.owner===owner?state.photos:[],error:state.owner===owner?state.error:'',loading:state.owner!==owner||state.loading,reload:()=>setRetry(value=>value+1)};
}
