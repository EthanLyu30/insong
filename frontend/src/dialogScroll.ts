// Keep an overlaid sheet from moving the page, including on browsers with scrollbars.
export function lockPageScroll(){
  const body=document.body;
  const previousOverflow=body.style.overflow,previousPadding=body.style.paddingRight;
  const width=document.documentElement.clientWidth;
  const scrollbar=width?Math.max(0,window.innerWidth-width):0;
  if(scrollbar)body.style.paddingRight=`${(parseFloat(window.getComputedStyle(body).paddingRight)||0)+scrollbar}px`;
  body.style.overflow='hidden';
  return()=>{body.style.overflow=previousOverflow;body.style.paddingRight=previousPadding;};
}

// Keep all sheet controls in the dialog's keyboard scope without reflowing its page.
export function trapDialogFocus(sheet:HTMLElement,onClose:()=>void,restoreTo:HTMLElement|null){
  const controls=()=>[...sheet.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(element=>!element.closest('[hidden]'));
  const focusFirst=()=>{const first=controls()[0];first?.focus({preventScroll:true});};
  if(!sheet.contains(document.activeElement)){
    const input=sheet.querySelector<HTMLInputElement>('input:not(:disabled)');
    if(input)input.focus({preventScroll:true});else focusFirst();
  }
  const focus=(event:FocusEvent)=>{if(!sheet.contains(event.target as Node))focusFirst();};
  const key=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key!=='Tab')return;
    const items=controls();if(!items.length)return;
    const first=items[0],last=items.at(-1)!;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus({preventScroll:true});}
    else if(!event.shiftKey&&document.activeElement===last||!sheet.contains(document.activeElement)){event.preventDefault();first.focus({preventScroll:true});}
  };
  document.addEventListener('focusin',focus);
  window.addEventListener('keydown',key);
  return()=>{document.removeEventListener('focusin',focus);window.removeEventListener('keydown',key);if(restoreTo?.isConnected)restoreTo.focus({preventScroll:true});};
}
