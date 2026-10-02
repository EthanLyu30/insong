import test from 'node:test';
import assert from 'node:assert/strict';
import {apiRequest} from '../src/memoryClient.ts';

function pending(signal) {
  return new Promise((_,reject)=>{
    const guard=setTimeout(()=>reject(new Error('test guard: request never stopped')),200);
    signal?.addEventListener('abort',()=>{clearTimeout(guard);reject(signal.reason);},{once:true});
  });
}

test('a stalled connection has a deadline and aborts the underlying request',async()=>{
  let signal,calls=0;
  await assert.rejects(apiRequest('','/api/me',{},(_url,options)=>{calls++;signal=options.signal;return pending(signal);},15),/响应超时/);
  assert.equal(signal.aborted,true);
  assert.equal(calls,1,'timeouts never retry mutations or reads automatically');
});

test('deadline includes reading the response body, not just receiving headers',async()=>{
  await assert.rejects(apiRequest('','/api/memories',{},async(_url,options)=>({ok:true,status:200,json:()=>pending(options.signal)}),15),/响应超时/);
});

test('a mutation timeout reports uncertainty rather than claiming it was not saved',async()=>{
  await assert.rejects(apiRequest('','/api/memories',{method:'POST'},(_url,options)=>pending(options.signal),15),/操作结果尚未确认/);
});

test('caller cancellation is preserved and a settled request leaves no deadline behind',async()=>{
  const caller=new AbortController();
  const request=apiRequest('','/api/me',{signal:caller.signal},(_url,options)=>pending(options.signal),100);
  caller.abort(new Error('left page'));
  await assert.rejects(request,/left page/);
  let completedSignal;
  assert.deepEqual(await apiRequest('','/api/me',{},async(_url,options)=>{completedSignal=options.signal;return Response.json({user:null});},10),{user:null});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(completedSignal.aborted,false);
});
