import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overviewFocus} from '../src/atlasCamera.ts';
import {memoryCategory,memoryCity,filterMemories,matchesMemoryTime} from '../src/memoryPresentation.ts';

test('map defaults to the Yangtze Delta and uses a valid nearby position when available',()=>{
  assert.deepEqual(overviewFocus(null),[120.75,31.3]);
  assert.deepEqual(overviewFocus({longitude:121.47,latitude:31.23}),[121.47,31.23]);
  assert.deepEqual(overviewFocus({longitude:0,latitude:0}),[120.75,31.3]);
});

test('a year-only memory matches a month range only when its whole year is inside the range',()=>{
  const card={life_year:2025,life_time:'夏天'};
  assert.equal(matchesMemoryTime(card,{startYear:'2024',startMonth:'5',endYear:'2026',endMonth:'6'}),true);
  assert.equal(matchesMemoryTime(card,{startYear:'2025',startMonth:'5',endYear:'2025',endMonth:'6'}),false);
  assert.equal(matchesMemoryTime({life_year:null,life_time:'2025-05-03'},{startYear:'2025',startMonth:'',endYear:'2025',endMonth:''}),false,'only explicit life years define the timeline');
});

test('memory category and city filters use saved metadata without confusing unknown years for dates',()=>{
  const memories=[
    {id:1,tags:['演唱会'],event_id:'show-1',location_name:'上海体育场',life_year:2026,song:{title:'泡沫',artist:'邓紫棋'},story:'散场以后'},
    {id:2,tags:['旅行'],event_id:null,location_name:'苏州',life_year:null,song:{title:'晴天',artist:'周杰伦'},story:'在路上'},
    {id:3,tags:[],event_id:null,location_name:null,life_year:null,song:{title:'光年之外',artist:'邓紫棋'},story:'在家听歌'},
    {id:4,tags:['音乐节'],event_id:null,location_name:'北京',life_year:null,song:{title:'夏天',artist:'样例'},story:'散场'},
  ];
  assert.equal(memoryCategory(memories[0]),'音乐现场');
  assert.equal(memoryCategory(memories[1]),'旅行');
  assert.equal(memoryCategory(memories[2]),'日常');
  assert.equal(memoryCategory(memories[3]),'音乐现场');
  assert.equal(memoryCity(memories[0]),'上海');
  assert.equal(memoryCity(memories[1]),'苏州');
  assert.deepEqual(filterMemories(memories,{category:'旅行',city:'苏州',query:'晴天'}).map(card=>card.id),[2]);
  assert.deepEqual(filterMemories(memories,{category:'音乐现场',city:'',query:'周杰伦'}),[]);
});
