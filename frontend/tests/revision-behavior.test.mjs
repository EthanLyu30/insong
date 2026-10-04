import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insertAtCursor,extractHashtags,currentLocalMark,rankRecommendedStories,selectDraftSong} from '../src/revisionBehavior.ts';

test('recommended topic inserts at the writing cursor and preserves surrounding text',()=>{
  assert.deepEqual(insertAtCursor('前面后面','#散场以后',2,2),{text:'前面#散场以后 后面',cursor:8});
  assert.deepEqual(extractHashtags('那一晚 #散场以后 和 #深圳站 #散场以后'),['散场以后','深圳站']);
});

test('time sheet defaults to the local date and time, without a UTC date shift',()=>{
  assert.deepEqual(currentLocalMark(new Date(2026,9,4,23,7)),{date:'2026-10-04',clock:'23:07'});
});

test('recommendations prioritize matching interests, then preserve the original order',()=>{
  const stories=[{id:1,tags:['旅行'],song:{title:'晴天',artist:'甲'}},{id:2,tags:['演唱会'],song:{title:'稻香',artist:'乙'}},{id:3,tags:['演唱会'],song:{title:'别的歌',artist:'甲'}}];
  const mine=[{tags:['演唱会'],song:{title:'稻香',artist:'乙'}}];
  assert.deepEqual(rankRecommendedStories(stories,mine).map(story=>story.id),[2,3,1]);
});

test('reselecting the same song preserves a marked clip; changing songs clears it',()=>{
  const draft={song:{id:1},position:10000,timeText:'00:10',endText:'00:14',lyricId:'line-1'};
  assert.deepEqual(selectDraftSong(draft,{id:1}),draft);
  assert.deepEqual(selectDraftSong(draft,{id:2}),{...draft,song:{id:2},position:null,timeText:'',endText:'',lyricId:null});
});

test('hashtag extraction never silently drops visible tags',()=>{
  assert.equal(extractHashtags(Array.from({length:9},(_,i)=>`#标签${i+1}`).join(' ')).length,9);
  assert.equal(extractHashtags(`#${'词'.repeat(25)}`)[0].length,25);
});
