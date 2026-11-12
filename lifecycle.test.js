import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

test('portfolio, journal and backups survive restarts and overlapping requests',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'stock-lifecycle-'));
 let child;
 t.after(async()=>{if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await fs.rm(directory,{recursive:true,force:true});});
 for(const name of ['server.js','dividends.js'])await fs.copyFile(new URL('./'+name,import.meta.url),path.join(directory,name));
 await fs.writeFile(path.join(directory,'package.json'),'{"type":"module"}');
 await fs.mkdir(path.join(directory,'public'));await fs.copyFile(new URL('./public/index.html',import.meta.url),path.join(directory,'public','index.html'));
 // Fake AI only in this isolated test copy; never call a real provider or user data.
 await fs.writeFile(path.join(directory,'mock.mjs'),"import fs from 'node:fs/promises';globalThis.fetch=async()=>{await fs.writeFile(new URL('./ai-started',import.meta.url),'ready');await new Promise(resolve=>setTimeout(resolve,150));return {ok:true,json:async()=>({choices:[{message:{content:'{\"topics\":[\"risk\"]}'},finish_reason:'stop'}]})};};");
 const portServer=net.createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
 const base='http://127.0.0.1:'+port;
 async function start(){
  child=spawn(process.execPath,['--import','./mock.mjs','server.js'],{cwd:directory,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),GROQ_API_KEY:'fictional-test-only',FINNHUB_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  await Promise.race([new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',()=>reject(Error('Server exited: '+stderr)));}),delay(10000).then(()=>{throw Error('Server startup timed out');})]);
 }
 async function request(route='/api/state',payload){
  const response=await fetch(base+route,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  return {status:response.status,data:await response.json()};
 }
 await start();
 const portfolio=[{symbol:'TEST',shares:0.5,cost:25}],journal=[{symbol:'TEST',signal:'WAIT',note:'Fictional test only',date:'2026-11-11'}];
 assert.equal((await request('/api/state',{holdings:portfolio})).status,200);
 assert.equal((await request('/api/state',{predictions:journal})).status,200);
 let state=(await request()).data;assert.deepEqual(state.holdings,portfolio);assert.deepEqual(state.predictions,journal);
 const exported=JSON.parse(JSON.stringify(state));
 const [a,b]=await Promise.all([request('/api/state',{budget:50}),request('/api/state',{watchlist:['TEST']})]);
 assert.equal(a.status,200);assert.equal(b.status,200);
 state=(await request()).data;assert.equal(state.budget,50);assert.deepEqual(state.watchlist,['TEST']);
 // Invalid backup is rejected in full, including its otherwise-valid budget.
 assert.equal((await request('/api/state',{budget:999,holdings:[null]})).status,400);
 assert.equal((await request()).data.budget,50);
 const research=request('/api/research',{question:'Explain risk',symbols:[]});
 for(let i=0;i<100;i++){try{await fs.access(path.join(directory,'ai-started'));break;}catch{await delay(5);}}
 assert.equal((await request('/api/state',{budget:75,holdings:[{symbol:'TEST',shares:1,cost:50}]})).status,200);
 assert.equal((await research).status,200);
 state=(await request()).data;assert.equal(state.budget,75);assert.equal(state.holdings[0].shares,1);assert.equal(state.researchHistory.length,1);
 // Restore a realistic backup larger than the old 12 KB request limit.
 exported.researchHistory=[{question:'Fictional saved research',date:'2026-11-11',answer:'x'.repeat(18000)}];
 const restored=await request('/api/state',exported);assert.equal(restored.status,200);assert.deepEqual(restored.data,exported);
 child.kill();await once(child,'exit');await start();
 assert.deepEqual((await request()).data,exported);
 assert.equal((await request('/api/state',{holdings:[],predictions:[]})).status,200);
 state=(await request()).data;assert.equal(state.holdings.length,0);assert.equal(state.predictions.length,0);assert.equal(state.researchHistory.length,1);
 const invalid=await fetch(base+'/api/state',{method:'POST',body:'{broken'});assert.equal(invalid.status,400);
 const index=await fetch(base+'/');assert.equal(index.status,200);const html=await index.text();assert.ok(html.includes('Manual Portfolio')&&html.includes('Prediction Journal'));
});
