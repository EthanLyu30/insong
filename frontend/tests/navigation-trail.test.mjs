import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advanceTrail,previousVisit,restoreTrail,localPath} from '../src/navigationTrail.ts';

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
