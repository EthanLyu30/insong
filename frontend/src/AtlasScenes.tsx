import type { CSSProperties } from 'react';
import { type AtlasEvent, type AtlasSong } from './footprintAtlas';

export function StadiumArt({night=false}:{night?:boolean}) {
  return <svg className={`atlas-stadium-art ${night?'is-night':''}`} viewBox="0 0 1000 850" fill="none" aria-hidden="true">
    <defs><linearGradient id="stadium-shell" x2="0" y2="1"><stop stopColor={night?'#858b9f':'#faf0d7'}/><stop offset="1" stopColor={night?'#353a56':'#c3b494'}/></linearGradient><radialGradient id="stadium-field"><stop stopColor={night?'#c9848e':'#a4b795'}/><stop offset="1" stopColor={night?'#433553':'#7c9d86'}/></radialGradient><filter id="stadium-glow"><feGaussianBlur stdDeviation="7"/></filter></defs>
    {!night && <g><ellipse cx="500" cy="530" rx="430" ry="240" fill="#dfe5d0"/><path d="M-30 700Q450 850 1040 544M95 350 868 808" stroke="#f9f1dc" strokeWidth="34"/><path d="M-30 700Q450 850 1040 544" stroke="#c6c5ad" strokeDasharray="8 16" strokeWidth="2"/><path d="M828 344q-70 115 24 186t40 205" stroke="#c0d8d2" strokeWidth="38"/>{[[130,428],[165,385],[207,647],[747,675],[791,617],[303,707],[103,575]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})`}><ellipse cy="29" rx="20" ry="7" fill="#bac7ab" opacity=".45"/><path d="M0 2v28" stroke="#9a997b" strokeWidth="4"/><ellipse cy="-12" rx="22" ry="30" fill={i%2?'#b8c59d':'#9eb48e'}/></g>)}</g>}
    <ellipse cx="500" cy="586" rx="286" ry="68" fill={night?'#0c1329':'#aeb697'} opacity=".3"/>
    {night && <ellipse cx="500" cy="436" rx="274" ry="110" fill="#ecba92" opacity=".16" filter="url(#stadium-glow)"/>}
    <path d="M233 420v107c0 105 534 105 534 0V420" fill="url(#stadium-shell)" stroke={night?'#707589':'#a89a7f'} strokeWidth="3"/>
    <path d="M253 464v90m30-74v90m30-76v96m30-78v94m30-86v98m30-88v98m30-94v104m30-96v104m30-104v108m30-104v102m30-110v105m30-106v104m30-112v103m30-106v92m30-102v83m30-94v78m30-81v61" stroke={night?'#4e506a':'#b29e7e'} strokeWidth="5"/>
    <ellipse cx="500" cy="420" rx="269" ry="122" fill={night?'#d9c8b0':'#fffbeb'} stroke={night?'#b2a191':'#b6a788'} strokeWidth="4"/>
    <ellipse cx="500" cy="420" rx="224" ry="96" fill={night?'#67566a':'#d4cfac'} stroke={night?'#af8d88':'#bfbc9a'} strokeWidth="3"/>
    <ellipse cx="500" cy="420" rx="159" ry="66" fill="url(#stadium-field)"/>
    <ellipse cx="500" cy="420" rx="185" ry="80" stroke={night?'#f6c9ac':'#faf3cf'} strokeWidth="7"/>
    <path d="M405 392h185v53H405z" stroke={night?'#dbb1c5':'#d7e3c5'} strokeWidth="2"/><ellipse cx="500" cy="418" rx="28" ry="12" stroke={night?'#dcb0c2':'#d7e3c5'} strokeWidth="2"/><path d="M500 392v53" stroke={night?'#dcb0c2':'#d7e3c5'} strokeWidth="2"/>
    <g stroke={night?'#aaa1a7':'#a08f75'} strokeWidth="7"><path d="M266 369V238m468 131V238M391 321V206m218 115V206"/></g>
    {[ [266,238],[734,238],[391,206],[609,206] ].map(([x,y],i)=><g key={i}><path d={`M${x-21} ${y}h42`} stroke={night?'#f4dbab':'#d8c89e'} strokeWidth="13" strokeLinecap="round"/>{night && <><path d={`M${x} ${y+5}l${x<500?150:-150} 160h${x<500?-90:90}Z`} fill="#f7d9a7" opacity=".065"/><circle cx={x} cy={y} r="20" fill="#e8c5b0" opacity=".5" filter="url(#stadium-glow)"/></>}</g>)}
    {night && <g>{Array.from({length:55},(_,i)=><circle key={i} cx={275+(i*67)%447} cy={433+(i*23)%109} r={i%3===0?2.8:1.8} fill={i%2?'#eed49f':'#e2b9c7'} opacity=".7"/>)}</g>}
    {!night && <g><path d="M471 565v43m60-43v43" stroke="#9d8a6d" strokeWidth="5"/><path d="M453 608h95" stroke="#e7d2ae" strokeWidth="8" strokeLinecap="round"/><text x="500" y="670" textAnchor="middle" fill="#929d84" fontSize="23" letterSpacing="14">走近这一晚</text></g>}
  </svg>;
}

const songPositions=[[22,15],[51,4],[79,26],[37,44],[67,54],[17,77],[49,89],[82,96],[33,65],[66,67],[12,34],[87,43]];
const dust=Array.from({length:110},(_,i)=>({x:(i*73+19)%100,y:(i*47+7)%73,size:i%5===0?2.2:1,delay:(i%9)*.5}));
export function SongSky({event,selected,onSong}:{event:AtlasEvent;selected:AtlasSong|null;onSong:(song:AtlasSong)=>void}) {
  return <div className="atlas-song-sky" aria-label="演唱会星空歌单">
    <div className="atlas-star-dust" aria-hidden="true">{dust.map((star,i)=><i key={i} style={{left:`${star.x}%`,top:`${star.y}%`,width:star.size,height:star.size,animationDelay:`${star.delay}s`}}/>)}</div>

    <span className="atlas-moon" aria-hidden="true"/>
    <div className="atlas-star-heading"><span>{event.city} · {event.date.replaceAll('-','.')}</span><h1>把这一晚，<br/><em>留在星星里。</em></h1><p>{event.setlist_kind==='confirmed'?'一颗星，一首这晚的歌。':event.setlist_kind==='partial'?'本场已核实曲目 · 部分歌单':'关联作品星空 · 本场歌单待核实'}</p></div>
    <div className={`atlas-song-field${event.songs.length>12?' is-many':''}`} aria-label="点选曲目星星">
    {event.songs.length<=12&&<svg className="atlas-constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={event.songs.slice(0,12).map((_,i)=>`${i?'L':'M'}${songPositions[i][0]} ${songPositions[i][1]}`).join(' ')} fill="none" stroke="#b8a8b0" strokeWidth=".12" strokeDasharray=".7 1.3" opacity=".38"/></svg>}
    {event.songs.map((song,i)=>{const [left,top]=songPositions[i]??[0,0];return <button key={`${song.title}:${i}`} className={`atlas-song-star ${selected?.title===song.title?'is-selected':''}`} type="button" aria-label={`点亮《${song.title}》`} aria-pressed={selected?.title===song.title} style={{left:`${left}%`,top:`${top}%`,'--star-delay':`${i*.34}s`} as CSSProperties} onClick={()=>onSong(song)}><span aria-hidden="true">✦</span><small>{song.title}</small></button>;})}
    </div>
    {!event.songs.length && <p className="atlas-empty-stars">这场的歌单还未公布。<br/>先把奔赴的心情留在这里。</p>}
    <div className="atlas-night-stadium"><StadiumArt night/></div>
  </div>;
}
