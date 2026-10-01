import type {AtlasSong} from './footprintAtlas';

export type PlaybackPhase='idle'|'loading'|'playing'|'paused'|'ended'|'unavailable'|'error';
export type ConcertPlaybackState={song:AtlasSong|null;phase:PlaybackPhase;currentTime:number;duration:number;message:string};
export const EMPTY_PLAYBACK:ConcertPlaybackState={song:null,phase:'idle',currentTime:0,duration:0,message:''};

// Both the constellation and setlist use this one media element. play() is called
// inside the user's click, keeping the browser's transient activation available.
export class ConcertPlayback {
  private audio:HTMLAudioElement;
  private changed:(state:ConcertPlaybackState)=>void;
  private base:string;
  private state:ConcertPlaybackState={...EMPTY_PLAYBACK};
  private revision=0;
  private wantsPlay=false;
  private disposed=false;
  private changing=false;
  private timeout:ReturnType<typeof setTimeout>|undefined;
  private events:Record<string,()=>void>;

  constructor(audio:HTMLAudioElement,changed:(state:ConcertPlaybackState)=>void,base:string){
    this.audio=audio;this.changed=changed;this.base=base;
    this.events={
      playing:()=>{if(!this.wantsPlay){this.pauseMedia();return;}if(this.validMedia())this.update({phase:'playing',message:''});},
      waiting:()=>{if(this.wantsPlay&&this.validMedia())this.update({phase:'loading'});},
      pause:()=>{if(this.changing||!this.wantsPlay||!this.audio.paused||!this.validMedia())return;this.revision++;this.wantsPlay=false;this.update({phase:'paused'});},
      timeupdate:()=>{if(this.validMedia())this.update({currentTime:this.audio.currentTime});},
      loadedmetadata:()=>{if(this.validMedia())this.update({duration:Number.isFinite(this.audio.duration)?this.audio.duration:0});},
      ended:()=>{if(this.validMedia()){this.wantsPlay=false;this.update({phase:'ended'});}},
      error:()=>{if(this.validMedia())this.fail('音频暂时无法加载，轻点重试。');},
    };
    Object.entries(this.events).forEach(([name,handler])=>audio.addEventListener(name,handler));
  }
  private validMedia(){return !this.disposed&&!this.changing&&!!this.state.song?.audio_url&&(!this.audio.currentSrc||this.audio.currentSrc===this.audio.src);}
  private update(patch:Partial<ConcertPlaybackState>){
    if(this.disposed)return;
    this.state={...this.state,...patch};
    if(this.state.phase!=='loading')clearTimeout(this.timeout);
    this.changed(this.state);
  }
  private pauseMedia(){this.changing=true;this.audio.pause();this.changing=false;}
  private clearMedia(){this.changing=true;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.changing=false;}
  private fail(message:string){this.revision++;this.wantsPlay=false;this.pauseMedia();this.update({phase:'error',message});}
  select(song:AtlasSong){
    if(this.disposed)return;
    const same=this.state.song?.title===song.title&&this.state.song?.artist===song.artist&&this.state.song?.audio_url===song.audio_url;
    const token=++this.revision;clearTimeout(this.timeout);
    if(same&&this.wantsPlay){this.wantsPlay=false;this.pauseMedia();this.update({phase:'paused'});return;}
    if(!song.audio_url){this.wantsPlay=false;this.clearMedia();this.update({song,phase:'unavailable',currentTime:0,duration:0,message:`《${song.title}》暂缺音源`});return;}
    let source:URL;
    try{source=new URL(song.audio_url,this.base);if(!['http:','https:'].includes(source.protocol))throw new Error();}
    catch{this.wantsPlay=false;this.clearMedia();this.update({song,phase:'error',currentTime:0,duration:0,message:'音源地址不可用'});return;}
    if(!same||this.state.phase==='error'){
      this.clearMedia();this.audio.src=source.href;this.audio.load();
      this.state={...EMPTY_PLAYBACK,song};
    }else if(this.state.phase==='ended')this.audio.currentTime=0;
    this.wantsPlay=true;this.update({song,phase:'loading',message:''});
    this.timeout=setTimeout(()=>{if(token===this.revision&&this.wantsPlay)this.fail('音频加载较慢，轻点重试。');},15000);
    try{
      void this.audio.play().then(()=>{
        if(!this.disposed&&token===this.revision&&this.wantsPlay&&!this.audio.paused)this.update({phase:'playing',message:''});
      },()=>{if(!this.disposed&&token===this.revision&&this.wantsPlay)this.fail('播放没有成功，轻点重试。');});
    }catch{this.fail('播放没有成功，轻点重试。');}
  }
  seek(seconds:number){if(this.validMedia()){this.audio.currentTime=Math.max(0,Math.min(this.audio.duration||0,seconds));this.update({currentTime:this.audio.currentTime});}}
  pause(){if(this.disposed||!this.wantsPlay)return;this.revision++;this.wantsPlay=false;this.pauseMedia();this.update({phase:'paused'});}
  destroy(){
    if(this.disposed)return;this.disposed=true;this.revision++;this.wantsPlay=false;clearTimeout(this.timeout);
    Object.entries(this.events).forEach(([name,handler])=>this.audio.removeEventListener(name,handler));
    this.clearMedia();
  }
}
