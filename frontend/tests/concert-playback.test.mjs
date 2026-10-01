import {test} from 'node:test';
import assert from 'node:assert/strict';

class Media extends EventTarget {
  src='';currentSrc='';paused=true;currentTime=0;duration=48;plays=[];
  play(){this.paused=false;this.currentSrc=this.src;return new Promise((resolve,reject)=>this.plays.push({resolve,reject,src:this.src}));}
  pause(){const wasPlaying=!this.paused;this.paused=true;if(wasPlaying)queueMicrotask(()=>this.dispatchEvent(new Event('pause')));}
  load(){this.currentSrc=this.src;this.currentTime=0;}
  removeAttribute(name){if(name==='src')this.src='';}
}
const song=(title,url)=>({title,artist:'原创测试曲',url:'https://y.qq.com/',audio_url:url,audio_label:'原创器乐样例'});

test('a star or song selection starts its actual media immediately, repeats toggle pause, and disposal stops it',async()=>{
  const {ConcertPlayback}=await import('../src/concertPlayback.ts');
  const media=new Media(),states=[];const player=new ConcertPlayback(media,state=>states.push(state),'http://localhost:8000');
  player.select(song('散场以后','/api/audio/song-1-v1.wav'));
  assert.equal(media.plays.length,1,'play must be called in the user click, not after a render or fetch');
  assert.equal(media.src,'http://localhost:8000/api/audio/song-1-v1.wav');
  media.dispatchEvent(new Event('playing'));media.plays[0].resolve();await Promise.resolve();
  assert.equal(states.at(-1).phase,'playing');
  player.select(song('散场以后','/api/audio/song-1-v1.wav'));assert.equal(media.paused,true);assert.equal(states.at(-1).phase,'paused');
  player.select(song('散场以后','/api/audio/song-1-v1.wav'));assert.equal(media.plays.length,2);
  media.currentTime=12;media.dispatchEvent(new Event('timeupdate'));assert.equal(states.at(-1).currentTime,12);
  player.destroy();assert.equal(media.paused,true);assert.equal(media.src,'');
  const count=states.length;media.dispatchEvent(new Event('playing'));media.plays[1].resolve();await Promise.resolve();assert.equal(states.length,count);
});

test('late play promises and events cannot revive a replaced, paused or unavailable song',async()=>{
  const {ConcertPlayback}=await import('../src/concertPlayback.ts');
  const media=new Media(),states=[];const player=new ConcertPlayback(media,state=>states.push(state),'http://localhost:8000');
  player.select(song('一','/api/audio/song-1-v1.wav'));player.select(song('二','/api/audio/song-2-v1.wav'));
  media.plays[0].reject(new Error('old failure'));await Promise.resolve();assert.equal(states.at(-1).song.title,'二');assert.equal(states.at(-1).phase,'loading');
  player.select(song('二','/api/audio/song-2-v1.wav'));media.dispatchEvent(new Event('playing'));media.plays[1].resolve();await Promise.resolve();assert.equal(states.at(-1).phase,'paused');assert.equal(media.paused,true);
  player.select(song('泡沫',undefined));assert.equal(states.at(-1).phase,'unavailable');assert.equal(media.src,'');assert.equal(media.plays.length,2);assert.match(states.at(-1).message,/音源/);
  player.destroy();
});

test('playback handles browser rejection, seek, ended and failure without a fake playing indicator',async()=>{
  const {ConcertPlayback}=await import('../src/concertPlayback.ts');
  const media=new Media(),states=[];const player=new ConcertPlayback(media,state=>states.push(state),'http://localhost:8000');
  player.select(song('散场以后','/api/audio/song-1-v1.wav'));media.paused=true;media.plays[0].reject(new Error('autoplay blocked'));await Promise.resolve();assert.equal(states.at(-1).phase,'error');
  player.select(song('散场以后','/api/audio/song-1-v1.wav'));media.dispatchEvent(new Event('playing'));player.seek(80);assert.equal(media.currentTime,48);
  media.dispatchEvent(new Event('ended'));assert.equal(states.at(-1).phase,'ended');
  player.select(song('散场以后','/api/audio/song-1-v1.wav'));assert.equal(media.currentTime,0);
  media.dispatchEvent(new Event('error'));assert.equal(states.at(-1).phase,'error');assert.equal(media.paused,true);
  player.destroy();
});

test('a queued pause from the preceding click cannot cancel a fast resume',async()=>{
  const {ConcertPlayback}=await import('../src/concertPlayback.ts');
  const media=new Media(),states=[];const player=new ConcertPlayback(media,state=>states.push(state),'http://localhost:8000');
  const track=song('散场以后','/api/audio/song-1-v1.wav');
  player.select(track);media.plays[0].resolve();await Promise.resolve();
  player.select(track);player.select(track);media.plays[1].resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(states.at(-1).phase,'playing');assert.equal(media.paused,false);
  media.dispatchEvent(new Event('playing'));assert.equal(media.paused,false);
  player.destroy();
});
