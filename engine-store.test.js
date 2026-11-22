import test from 'node:test';import assert from 'node:assert/strict';
import {createEngineStore} from './engine-store.js';import {emptyEngine} from './trading-engine.js';
test('state is signed with server-only key, bound to version, never accepted after tampering or replay',async()=>{
 const original=globalThis.fetch;let row={version:0,data:emptyEngine()};const sent=[];
 globalThis.fetch=async(url,opts)=>{
  if(url.includes('/rpc/')){const b=JSON.parse(opts.body);sent.push(b);if(b.expected!==row.version)return {ok:true,json:async()=>false};row={version:row.version+1,data:b.next_data};return {ok:true,json:async()=>true};}
  return {ok:true,json:async()=>[structuredClone(row)]};
 };
 try{
  const key='fictional-signing-key-for-tests-only-32plus';const store=createEngineStore(()=>({url:'https://example.supabase.co/rest/v1/stock_tracker_state',key:'fictional-api-key'}),{key:()=>key});
  let read=await store.read();assert.equal(read.version,0);assert.equal(await store.cas(0,{...read.data,reason:'New state'}),true);assert.equal(row.data.integrity.length,64);assert.equal(JSON.stringify(sent).includes(key),false);
  const checkpoint=structuredClone(row);read=await store.read();assert.equal(read.data.integrity,undefined);
  row.data.mode='active';await assert.rejects(store.read(),/integrity/);
  row=structuredClone(checkpoint);row.version+=1;await assert.rejects(store.read(),/integrity/);
  row=structuredClone(checkpoint);assert.equal(await store.cas(0,read.data),false);
  row.data.integrity='0'.repeat(64);await assert.rejects(store.read(),/integrity/);
 }finally{globalThis.fetch=original;}
});
