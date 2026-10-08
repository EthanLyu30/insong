type LifeDate={life_year?:number|null;life_time?:string|null};

export function memoryLifeDate(card:LifeDate):{year:number;month:number;day:number}|null {
  const match=/^(\d{4})-(\d{2})-(\d{2})(?=$|[T\s])/.exec(card.life_time?.trim()??'');
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]?{year,month,day}:null;
}

export function memoryYear(card:LifeDate):number|null {
  return card.life_year??memoryLifeDate(card)?.year??null;
}

export function memoryDateLabel(card:LifeDate):string {
  const time=card.life_time?.trim()??'';
  const year=card.life_year;
  if(memoryLifeDate(card)||time===String(year))return time;
  return [year,time].filter(value=>value!==null&&value!==undefined&&value!=='').join(' · ');
}
