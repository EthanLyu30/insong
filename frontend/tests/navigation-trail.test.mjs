import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advanceTrail,concertStoryOrigin,previousVisit,restoreTrail,localPath} from '../src/navigationTrail.ts';

test('visit tracking preserves source query state through PUSH, REPLACE, POP and forward',()=>{
  const map={key:'map',url:'/footprints?artist=gem&period=past&month=2026-09'};
  const city={key:'city',url:map.url+'&city=shenzhen&scene=map'};
  const venue={key:'venue',url:city.url.replace('scene=map','scene=venue')};
  const sky={key:'sky',url:city.url.replace('scene=map','scene=sky')};
  let trail=restoreTrail(null,map);
  for(const visit of [city,venue,sky])trail=advanceTrail(trail,visit,'PUSH');
  assert.deepEqual(previousVisit(trail),{...venue,delta:-1});
  trail=advanceTrail(trail,venue,'POP');assert.deepEqual(previousVisit(trail),{...city,delta:-1});
  trail=advanceTrail(trail,sky,'POP');assert.equal(previousVisit(trail).url,venue.url);
  trail=advanceTrail(trail,city,'POP');
  const revised={...city,key:'new-city',url:city.url+'&scope=mine'};
  trail=advanceTrail(trail,revised,'REPLACE');assert.equal(previousVisit(trail).url,map.url);
  trail=advanceTrail(trail,{key:'playlist',url:'/playlists'},'PUSH');
  assert.equal(trail.entries.some(entry=>entry.key==='sky'),false,'new navigation drops abandoned forward branch');
  assert.equal(previousVisit(trail).url,revised.url);
});

test('refresh restores only a matching app visit; external, malformed and unrelated sessions are ignored',()=>{
  const a={key:'a',url:'/discover?q=散场'},b={key:'b',url:'/stories/8'};
  const trail=advanceTrail(restoreTrail(null,a),b,'PUSH');
  assert.equal(previousVisit(restoreTrail(JSON.stringify(trail),b)).url,a.url);
  assert.equal(previousVisit(restoreTrail(JSON.stringify(trail),{...b,key:'fresh'})),null);
  assert.equal(previousVisit(restoreTrail('{oops',b)),null);
  const unsafe={entries:[{key:'x',url:'//other.example'},b],index:1};
  assert.equal(previousVisit(restoreTrail(JSON.stringify(unsafe),b)),null);
  for(const url of ['https://other.example','//other.example','/\\other.example','/\nunsafe'])assert.equal(localPath(url),false);
});

test('related-story return keeps the concert history entry through refresh, POP and forward',()=>{
  const source={key:'concert',url:'/footprints?artist=liu-yuxin&city=shanghai&event=one&scene=sky'};
  const first={key:'first',url:'/stories/21'},second={key:'second',url:'/stories/22'},third={key:'third',url:'/stories/23'};
  let trail=restoreTrail(null,source);
  for(const visit of [first,second,third])trail=advanceTrail(trail,visit,'PUSH');
  assert.deepEqual(concertStoryOrigin(trail),{key:'concert',url:source.url,delta:-3});
  trail=restoreTrail(JSON.stringify(trail),third);
  assert.deepEqual(concertStoryOrigin(trail),{key:'concert',url:source.url,delta:-3});
  trail=advanceTrail(trail,source,'POP');
  trail=advanceTrail(trail,second,'POP');
  assert.deepEqual(concertStoryOrigin(trail),{key:'concert',url:source.url,delta:-2});
});

test('related-story return never jumps across another list or into an unobserved concert',()=>{
  const concert={key:'concert',url:'/footprints?event=one&scene=sky'};
  const discovery={key:'discover',url:'/discover?q=REALITY'};
  const first={key:'first',url:'/stories/21'},second={key:'second',url:'/stories/22'};
  let trail=restoreTrail(null,concert);
  for(const visit of [discovery,first,second])trail=advanceTrail(trail,visit,'PUSH');
  assert.equal(concertStoryOrigin(trail),null,'an earlier concert is not the current reading origin');
  assert.equal(concertStoryOrigin(advanceTrail(restoreTrail(null,first),second,'PUSH')),null,'direct story entry still uses the safe discovery fallback');
});
