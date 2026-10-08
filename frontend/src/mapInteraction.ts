/** Only input events count: a map's programmatic fit/move must not suppress
 * initial personal framing, while wheel/keyboard deserve the same protection
 * as pointer dragging and pinch gestures. */
export function observeMapInteraction(target:EventTarget,onInteraction:()=>void){
  const pointer=()=>onInteraction(),wheel=()=>onInteraction();
  const keys=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','PageUp','PageDown','Home','End']);
  const keyboard=(event:Event)=>{if('key' in event&&typeof event.key==='string'&&keys.has(event.key))onInteraction();};
  target.addEventListener('pointerdown',pointer,{passive:true});
  target.addEventListener('wheel',wheel,{passive:true});
  target.addEventListener('keydown',keyboard);
  return()=>{target.removeEventListener('pointerdown',pointer);target.removeEventListener('wheel',wheel);target.removeEventListener('keydown',keyboard);};
}
