export type DiscoverySearchMode='keyword'|'semantic';

export function discoverySearchMode(query:string,legacyMode?:string|null):DiscoverySearchMode {
  const text=query.trim();
  if(/^[#@]/.test(text))return 'keyword';
  if(legacyMode==='keyword'||legacyMode==='semantic')return legacyMode;
  const narrative=/(?:[，。！？!?]|我(?:们)?(?:在|和|想|听|去|记|曾|的|第一次)|(?:那|这)(?:年|晚|天|时候)|的时候|听完|舍不得|第一次|一起.+(?:听|唱)|毕业.+(?:晚|天|时)|\b(?:i|we|my|when|after|remember)\b)/iu;
  return narrative.test(text)||text.length>16?'semantic':'keyword';
}
