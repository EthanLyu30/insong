import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapMarkerOffset} from '../src/mapMarkerPhotos.ts';

test('associated photos sharing one city occupy separate slots without inventing city markers',()=>{
  const events=[{city:'上海',artist_id:'gem'},{city:'上海',artist_id:'tnt'},
    {city:'上海',artist_id:'gem'},{city:'上海',artist_id:'unknown'},
    {city:'上海',artist_id:'phoenix',event_status:'cancelled'}, {city:'北京',artist_id:'gem'}];
  const a=mapMarkerOffset('上海','gem',events),b=mapMarkerOffset('上海','tnt',events);
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>=62,'both real photos must remain separately visible');
  assert.deepEqual(mapMarkerOffset('北京','gem',events),[0,0]);
  assert.deepEqual(mapMarkerOffset('上海','unknown',events),[0,0]);
  assert.deepEqual(mapMarkerOffset('上海','phoenix',events),[0,0]);
});
