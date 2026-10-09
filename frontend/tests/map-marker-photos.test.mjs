import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapMarkerOffset} from '../src/mapMarkerPhotos.ts';
import * as markerPhotos from '../src/mapMarkerPhotos.ts';

test('city photo layout exposes an offset and diameter',()=>{
  assert.equal(typeof markerPhotos.mapMarkerLayout,'function');
  const layout=markerPhotos.mapMarkerLayout('上海','gem',[{city:'上海',artist_id:'gem'}]);
  assert.deepEqual(layout.offset,[0,0]);
  assert.ok(layout.diameter>=40&&layout.diameter<=60);
});

test('city photo size and spread respond to map zoom',()=>{
  const rows=['gem','liu-yuxin','phoenix','tnt','zhang-jie'].map(artist_id=>({city:'深圳',artist_id}));
  const far=markerPhotos.mapMarkerLayout('深圳','phoenix',rows,3);
  const near=markerPhotos.mapMarkerLayout('深圳','phoenix',rows,9);
  assert.ok(far.diameter<near.diameter,'zooming in should enlarge the photo');
  assert.ok(Math.hypot(...far.offset)<Math.hypot(...near.offset),'the cluster should open as the map zooms in');
});

test('two through eight city photos allow partial overlap without complete occlusion',()=>{
  const ids=['gem','liu-yuxin','phoenix','tnt','zhang-jie','xue-zhiqian','luo-tianyi','liu'];
  for(let count=2;count<=8;count++){
    const rows=ids.slice(0,count).map(artist_id=>({city:'上海',artist_id}));
    const layouts=rows.map(row=>markerPhotos.mapMarkerLayout('上海',row.artist_id,rows,6));
    assert.ok(new Set(layouts.map(layout=>layout.diameter)).size>1,`${count} markers need varied sizes`);
    for(const layout of layouts){
      assert.ok(layout.diameter>=38&&layout.diameter<=68,`${count} marker diameter`);
      assert.ok(Math.hypot(...layout.offset)+layout.diameter/2<=115,`${count} markers must stay near the city`);
    }
    for(let i=0;i<layouts.length;i++)for(let j=i+1;j<layouts.length;j++){
      const a=layouts[i],b=layouts[j];
      assert.ok(Math.hypot(a.offset[0]-b.offset[0],a.offset[1]-b.offset[1])>=(a.diameter+b.diameter)*.25,
        `${count} markers ${i} and ${j} cannot fully hide each other`);
    }
  }
  const rows=ids.slice(0,5).map(artist_id=>({city:'深圳',artist_id}));
  const layouts=rows.map(row=>markerPhotos.mapMarkerLayout('深圳',row.artist_id,rows,6));
  assert.ok(layouts.some((a,i)=>layouts.some((b,j)=>j>i&&Math.hypot(a.offset[0]-b.offset[0],a.offset[1]-b.offset[1])<(a.diameter+b.diameter)/2)),
    'a five-photo city should feel like overlapping images, not a rigid separated ring');
});

test('city layout ignores duplicates, row order, unrelated cities, cancelled rows, and missing photos',()=>{
  const rows=[{city:'上海',artist_id:'tnt'},{city:'上海',artist_id:'gem'},
    {city:'上海',artist_id:'tnt'},{city:'上海',artist_id:'unknown'},
    {city:'上海',artist_id:'phoenix',event_status:'cancelled'},
    {city:'北京',artist_id:'zhang-jie'}];
  const plain=[{city:'上海',artist_id:'gem'},{city:'上海',artist_id:'tnt'}];
  for(const id of ['gem','tnt']){
    assert.deepEqual(markerPhotos.mapMarkerLayout('上海',id,rows),markerPhotos.mapMarkerLayout('上海',id,plain));
    assert.deepEqual(markerPhotos.mapMarkerLayout('上海',id,[...rows].reverse()),markerPhotos.mapMarkerLayout('上海',id,plain));
  }
  for(const id of ['unknown','phoenix']){
    assert.deepEqual(markerPhotos.mapMarkerLayout('上海',id,rows).offset,[0,0]);
  }
});

test('associated photos sharing one city occupy separate slots without inventing city markers',()=>{
  const events=[{city:'上海',artist_id:'gem'},{city:'上海',artist_id:'tnt'},
    {city:'上海',artist_id:'gem'},{city:'上海',artist_id:'unknown'},
    {city:'上海',artist_id:'phoenix',event_status:'cancelled'}, {city:'北京',artist_id:'gem'}];
  const a=mapMarkerOffset('上海','gem',events),b=mapMarkerOffset('上海','tnt',events);
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>=30,'both real photos must remain separately targetable');
  assert.deepEqual(mapMarkerOffset('北京','gem',events),[0,0]);
  assert.deepEqual(mapMarkerOffset('上海','unknown',events),[0,0]);
  assert.deepEqual(mapMarkerOffset('上海','phoenix',events),[0,0]);
});
