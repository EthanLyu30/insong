export type SongStar={index:number;x:number;y:number;width:number;height:number;size:number;delay:number;duration:number};

function randomFor(seed:string){
  let state=2166136261;
  for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619);
  return()=>{state+=0x6d2b79f5;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}

// A repeatable field, independent of playback and sheet height. Changing the
// player must never make the target that was just tapped jump elsewhere.
export function scatterSongs(titles:string[],seed:string,width:number):{stars:SongStar[];height:number}{
  const available=Math.max(112,width),gap=7,padding=8;
  const boxes=titles.map((title,index)=>({index,width:Math.min(104,Math.max(56,[...title].reduce((n,c)=>n+(c.charCodeAt(0)>255?12:6.3),0)+14)),height:64}));
  let height=Math.max(titles.length>6?270:210,Math.ceil(boxes.reduce((n,box)=>n+box.width*box.height,0)/(available*.56)));
  if(!titles.length)return {stars:[],height};
  const order=[...boxes].sort((a,b)=>b.width-a.width||a.index-b.index);
  for(let expansion=0;expansion<24;expansion++,height+=32){
    const random=randomFor(seed+'|'+titles.join('|')),stars:SongStar[]=[];
    for(const box of order){
      let found=false;
      for(let attempt=0;attempt<600;attempt++){
        const x=padding+box.width/2+random()*(available-box.width-padding*2);
        const y=padding+box.height/2+random()*(height-box.height-padding*2);
        if(stars.some(other=>Math.abs(x-other.x)<(box.width+other.width)/2+gap&&Math.abs(y-other.y)<(box.height+other.height)/2+gap))continue;
        stars.push({...box,x,y,size:14+random()*7,delay:-random()*6,duration:4+random()*4});found=true;break;
      }
      if(!found)break;
    }
    if(stars.length===boxes.length)return {stars:stars.sort((a,b)=>a.index-b.index),height};
  }
  // Extremely long or narrow fields still preserve every accessible song.
  const random=randomFor(seed);
  return {height:boxes.length*84+padding*2,stars:boxes.map(box=>({...box,x:padding+box.width/2+random()*(available-box.width-padding*2),y:padding+box.height/2+box.index*84+random()*8,size:14+random()*7,delay:-random()*6,duration:4+random()*4}))};
}
