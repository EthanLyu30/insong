import {useCallback,useEffect,useRef,useState} from 'react';
import {validMapPosition,type MapPosition} from './concertMapFocus';

type Result={position:MapPosition|null;reason:'denied'|'unavailable'|null};
type State=Result&{phase:'idle'|'locating'|'settled'};

/** Request only from an explicit button action; ignore callbacks after navigation or gestures. */
export function useMapLocation(){
  const [state,setState]=useState<State>({phase:'idle',position:null,reason:null});
  const generation=useRef(0),pending=useRef(false);
  const cancel=useCallback(()=>{
    generation.current++;if(pending.current){pending.current=false;setState(value=>({...value,phase:'idle'}));}
  },[]);
  useEffect(()=>()=>{generation.current++;pending.current=false;},[]);
  const request=useCallback((onResult:(value:Result)=>void)=>{
    if(pending.current)return;
    const id=++generation.current;pending.current=true;
    setState({phase:'locating',position:null,reason:null});
    const settle=(value:Result)=>{
      if(id!==generation.current||!pending.current)return;
      pending.current=false;setState({...value,phase:'settled'});onResult(value);
    };
    if(typeof navigator==='undefined'||!navigator.geolocation){settle({position:null,reason:'unavailable'});return;}
    try{
      navigator.geolocation.getCurrentPosition(value=>{
        const position={longitude:value.coords.longitude,latitude:value.coords.latitude};
        settle(validMapPosition(position)?{position,reason:null}:{position:null,reason:'unavailable'});
      },error=>settle({position:null,reason:error.code===1?'denied':'unavailable'}),{enableHighAccuracy:false,timeout:8000,maximumAge:10*60*1000});
    }catch{settle({position:null,reason:'unavailable'});}
  },[]);
  return {...state,request,cancel};
}
