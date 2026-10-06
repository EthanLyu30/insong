import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {readMemoryDrafts,saveMemoryDraft,removeMemoryDraft} from '../src/memoryDrafts.ts';
const storage=()=>new JSDOM('',{url:'http://localhost'}).window.localStorage;

test('independent drafts coexist and remain account-scoped',()=>{
  const store=storage();
  const first=saveMemoryDraft(3,{version:1,story:'第一篇'},null,store);
  const second=saveMemoryDraft(3,{version:1,story:'第二篇'},null,store);
  saveMemoryDraft(4,{version:1,story:'另一个人'},null,store);
  assert.notEqual(first.id,second.id);
  assert.deepEqual(new Set(readMemoryDrafts(3,store).map(item=>item.data.story)),new Set(['第一篇','第二篇']));
  assert.equal(readMemoryDrafts(4,store).length,1);
});
test('editing updates only its owned draft and stale writes preserve the newer copy',()=>{
  const store=storage(),original=saveMemoryDraft(3,{version:1,story:'原稿'},null,store);
  const updated=saveMemoryDraft(3,{version:1,story:'另一页更新'},original,store);
  assert.equal(updated.id,original.id);
  const fork=saveMemoryDraft(3,{version:1,story:'旧页面的修改'},original,store);
  assert.notEqual(fork.id,original.id);
  assert.equal(readMemoryDrafts(3,store).length,2);
  assert.equal(removeMemoryDraft(3,original,store),false);
  assert.equal(removeMemoryDraft(3,updated,store),true);
  assert.equal(readMemoryDrafts(3,store)[0].data.story,'旧页面的修改');
});
test('legacy drafts are retained beside new drafts and malformed data is untouched',()=>{
  const store=storage(),raw=JSON.stringify({version:1,story:'以前的草稿'});
  store.setItem('memory-draft:3',raw);
  saveMemoryDraft(3,{version:1,story:'新的草稿'},null,store);
  assert.equal(store.getItem('memory-draft:3'),raw);
  assert.equal(readMemoryDrafts(3,store).length,2);
  store.setItem('memory-draft:4','{broken');
  assert.equal(readMemoryDrafts(4,store).length,0);
  assert.equal(store.getItem('memory-draft:4'),'{broken');
});
test('empty and automatic event-only payloads cannot create drafts',()=>{
  const store=storage();
  assert.throws(()=>saveMemoryDraft(3,{version:1,story:'  '},null,store));
  assert.throws(()=>saveMemoryDraft(3,{version:1,story:'',lifeTime:'2026-10-01',autoEventFields:['lifeTime']},null,store));
  assert.equal(store.length,0);
});
test('corrupt manual metadata is hidden without deleting its raw draft',()=>{
  const store=storage(),raw=JSON.stringify({version:1,story:'仍须保留',manualSong:{title:{broken:true},artist:'歌手'}});
  store.setItem('memory-draft:3',raw);
  assert.equal(readMemoryDrafts(3,store).length,0);
  assert.equal(store.getItem('memory-draft:3'),raw);
});
test('a legacy title object cannot crash the draft list',()=>{
  const store=storage(),raw=JSON.stringify({version:1,story:'原文仍保留',title:{broken:true}});
  store.setItem('memory-draft:3',raw);assert.equal(readMemoryDrafts(3,store).length,0);assert.equal(store.getItem('memory-draft:3'),raw);
});
test('saving from a picker does not recursively persist its previous draft or navigation state',()=>{
  const store=storage();
  const draft=saveMemoryDraft(3,{version:1,story:'要保留的内容',ownedLocalDraft:'previous serialized payload',returnPath:'/create',ownerId:3},null,store);
  assert.equal(Object.hasOwn(draft.data,'ownedLocalDraft'),false);
  assert.equal(Object.hasOwn(draft.data,'returnPath'),false);
  assert.equal(draft.data.story,'要保留的内容');
});
test('a concurrent writer committing between comparison and save retains both versions',()=>{
  const store=storage(),original=saveMemoryDraft(3,{version:1,story:'原稿'},null,store);let armed=true;
  const proxy={get length(){return store.length;},key:index=>store.key(index),getItem:name=>store.getItem(name),removeItem:name=>store.removeItem(name),setItem(name,value){if(armed){armed=false;saveMemoryDraft(3,{version:1,story:'另一个窗口的新稿'},original,proxy);}store.setItem(name,value);}};
  saveMemoryDraft(3,{version:1,story:'当前窗口的新稿'},original,proxy);
  assert.deepEqual(new Set(readMemoryDrafts(3,store).map(item=>item.data.story)),new Set(['另一个窗口的新稿','当前窗口的新稿']));
});
test('a concurrent revision survives deletion of the version that was originally selected',()=>{
  const store=storage(),original=saveMemoryDraft(3,{version:1,story:'原稿'},null,store);let armed=true;
  const proxy={get length(){return store.length;},key:index=>store.key(index),getItem:name=>store.getItem(name),setItem:(name,value)=>store.setItem(name,value),removeItem(name){if(armed){armed=false;saveMemoryDraft(3,{version:1,story:'不能被删的新稿'},original,proxy);}store.removeItem(name);}};
  removeMemoryDraft(3,original,proxy);
  assert.equal(readMemoryDrafts(3,store)[0].data.story,'不能被删的新稿');
});
test('deleting an upgraded legacy draft does not make its older text reappear',()=>{
  const store=storage();store.setItem('memory-draft:3',JSON.stringify({version:1,story:'旧稿'}));
  const updated=saveMemoryDraft(3,{version:1,story:'更新后的稿'},readMemoryDrafts(3,store)[0],store);
  assert.equal(removeMemoryDraft(3,updated,store),true);assert.equal(readMemoryDrafts(3,store).length,0);
});
test('repeated legacy updates never revive the original draft after the latest version is deleted',()=>{
  const store=storage();store.setItem('memory-draft:3',JSON.stringify({version:1,story:'最早的旧稿'}));
  const first=saveMemoryDraft(3,{version:1,story:'第一次更新'},readMemoryDrafts(3,store)[0],store);
  const second=saveMemoryDraft(3,{version:1,story:'第二次更新'},first,store);
  assert.deepEqual(readMemoryDrafts(3,store).map(item=>item.data.story),['第二次更新']);
  assert.equal(removeMemoryDraft(3,second,store),true);assert.equal(readMemoryDrafts(3,store).length,0);
});
