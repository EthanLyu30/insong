import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scatterSongs} from '../src/songStars.ts';

const titles=['原来那个人','看着月亮想你','REALITY','WALLS','飓','Boom Tick Boom','Of Course','练习曲','Baby I Know','Look Into The Mirror'];

test('song stars are stable per concert, irregular, and keep labels and touch targets apart',()=>{
  for(const width of [326,356,396,600])for(const count of [1,8,10,24]){
    const songs=Array.from({length:count},(_,i)=>titles[i%titles.length]);
    const layout=scatterSongs(songs,'beijing-20250920',width);
    assert.deepEqual(layout,scatterSongs(songs,'beijing-20250920',width),'selection and rerenders cannot reshuffle stars');
    assert.equal(layout.stars.length,count);
    for(const [i,a] of layout.stars.entries()){
      assert.ok(a.width>=44&&a.height>=44,'touch target');
      assert.ok(a.x-a.width/2>=0&&a.x+a.width/2<=width,'horizontal bounds');
      assert.ok(a.y-a.height/2>=0&&a.y+a.height/2<=layout.height,'vertical bounds');
      for(const b of layout.stars.slice(i+1))assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2+6||Math.abs(a.y-b.y)>=(a.height+b.height)/2+6,'song labels cannot overlap');
    }
    if(count>=8){assert.ok(new Set(layout.stars.map(s=>Math.round(s.y))).size>count/2,'not repeated rows');assert.ok(new Set(layout.stars.map(s=>Math.round(s.x))).size>count/2,'not repeated columns');}
  }
  assert.notDeepEqual(scatterSongs(titles,'beijing',356),scatterSongs(titles,'guangzhou',356),'each concert has its own arrangement');
});

test('empty song lists create no decorative song entries',()=>{
  assert.deepEqual(scatterSongs([],'empty',356).stars,[]);
});
