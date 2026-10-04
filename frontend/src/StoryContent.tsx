import {Link} from 'react-router';
import {extractHashtags} from './revisionBehavior';

export function TagLinks({tags=[],scope='public',inline=false}:{tags?:string[];scope?:'public'|'mine';inline?:boolean}) {
  const destination=scope==='mine'?'/memories':'/discover';
  const links=tags.map(tag=><Link key={tag} to={`${destination}?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>);
  return tags.length?inline?<span className="story-tags inline-tags"> {links}</span>:<div className="story-tags">{links}</div>:null;
}

export function StoryBody({text,tags=[],scope='public'}:{text:string;tags?:string[];scope?:'public'|'mine'}){
  const present=new Set(extractHashtags(text));
  const destination=scope==='mine'?'/memories':'/discover';
  return <p className="original-story">{text.split(/(#[\p{L}\p{N}_]+)/u).map((part,index)=>part.startsWith('#')?<span className="story-tags inline-tags" key={index}><Link to={`${destination}?tag=${encodeURIComponent(part.slice(1))}`}>{part}</Link></span>:part)}<TagLinks tags={tags.filter(tag=>!present.has(tag))} scope={scope} inline/></p>;
}
