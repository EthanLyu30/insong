/** Screen point where map controls should zoom while sheets cover the canvas. */
export function mapZoomFocus(view:{width:number;height:number;header:number;sheet:number;nav:number}):[number,number]{
  const bottom=Math.max(view.header,view.height-view.sheet-view.nav);
  return [view.width/2,(view.header+bottom)/2];
}
