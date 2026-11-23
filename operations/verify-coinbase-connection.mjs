import {createHmac} from 'node:crypto';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tracker-coinbase-auth-'));let child;
try{
 let code=await fs.readFile(new URL('../server.js',import.meta.url),'utf8');
 code=code.replace('console.log(`AI Stock Income running at http://${HOST}:${PORT}`)','console.log(`http://${HOST}:${server.address().port}`)');
 await fs.writeFile(path.join(dir,'server.js'),code);await fs.copyFile(new URL('../coinbase-reader.js',import.meta.url),path.join(dir,'coinbase-reader.js'));await fs.copyFile(new URL('../savings-rule.js',import.meta.url),path.join(dir,'savings-rule.js'));await fs.copyFile(new URL('../trading-readiness.js',import.meta.url),path.join(dir,'trading-readiness.js'));for(const name of ['trading-engine.js','coinbase-execution.js','engine-store.js','learning-lab.js','learning-store.js','learning-research.js'])await fs.copyFile(new URL('../'+name,import.meta.url),path.join(dir,name));await fs.copyFile(new URL('../dividends.js',import.meta.url),path.join(dir,'dividends.js'));await fs.writeFile(path.join(dir,'package.json'),'{"type":"module"}');
 const env={...process.env,HOST:'127.0.0.1',PORT:'0',RENDER:'true',TRACKER_PASSWORD:'fictional-password',TRACKER_SESSION_SECRET:'fictional-session-secret-long-enough-for-tests'};for(const k of Object.keys(env))if(k.startsWith('COINBASE_')||k.startsWith('SUPABASE_'))delete env[k];env.COINBASE_WORKER_TOKEN='9'.repeat(64);
 child=spawn(process.execPath,['server.js'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 const base=await new Promise((resolve,reject)=>{child.stdout.once('data',x=>resolve(String(x).trim()));child.once('exit',()=>reject(Error('Server startup failed')));});
 assert.equal((await fetch(base+'/api/coinbase/status')).status,401);
 assert.equal((await fetch(base+'/api/savings')).status,401);
 assert.equal((await fetch(base+'/api/trading/readiness')).status,401);
 assert.equal((await fetch(base+'/api/savings/illustrate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"balance":"300"}'})).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'fictional-password'})});assert.equal(login.status,200);const Cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await fetch(base+'/api/coinbase/status',{headers:{Cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const s=await response.json();assert.equal(s.status,'setup_required');assert.equal(s.connected,false);assert.equal(s.liveOrdersEnabled,false);
 for(const route of ['/api/coinbase/status','/api/coinbase/orders','/api/coinbase/connect']){const r=await fetch(base+route,{method:'POST',headers:{Cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,404);}
 const readiness=await fetch(base+'/api/trading/readiness',{headers:{Cookie}});assert.equal(readiness.status,200);const setup=await readiness.json();assert.equal(setup.ordersEnabled,false);assert.equal(setup.terms.stopNewBuysAtLoss,'10.00');assert.equal((await fetch(base+'/api/trading/start',{method:'POST',headers:{Cookie,'Content-Type':'application/json',Origin:'https://ai-stock-income-tracker-a.onrender.com'},body:'{}'})).status,409);
 assert.equal((await fetch(base+'/api/trading/tick',{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/learning')).status,401);
 assert.equal((await fetch(base+'/api/learning/tick',{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/trading/start',{method:'POST',headers:{Cookie,'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'})).status,403);
 const stamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',env.COINBASE_WORKER_TOKEN).update(stamp).digest('hex');
 const workerHeaders={'X-Stock-Worker-Time':stamp,'X-Stock-Worker-Signature':signature};
 assert.equal((await fetch(base+'/api/trading/tick',{method:'POST',headers:workerHeaders,body:'{}'})).status,503);
 assert.equal((await fetch(base+'/api/trading/tick',{method:'POST',headers:workerHeaders,body:'{}'})).status,202);
 const entry={productId:'O-USD',day:'2026-11-24',authorizationId:'owner-schedule-auth-test'};
 for(const [offset,withProof,tamper,expectedStatus] of [[1,false,false,401],[2,true,true,401],[3,true,false,409]]){
  const time=String(Number(stamp)+offset),headers={'Content-Type':'application/json','X-Stock-Worker-Time':time,'X-Stock-Worker-Signature':createHmac('sha256',env.COINBASE_WORKER_TOKEN).update(time).digest('hex')};
  if(withProof)headers['X-Stock-Owner-Signature']=createHmac('sha256',env.COINBASE_WORKER_TOKEN).update([time,'schedule-one-dollar',entry.productId,entry.day,entry.authorizationId].join('\n')).digest('hex');
  const payload=tamper?{...entry,productId:'JEPI-USD'}:entry;
  assert.equal((await fetch(base+'/api/trading/tick?schedule=one-dollar',{method:'POST',headers,body:JSON.stringify(payload)})).status,expectedStatus);
 }
 const learningHeaders={'X-Stock-Worker-Time':stamp,'X-Stock-Worker-Signature':createHmac('sha256',env.COINBASE_WORKER_TOKEN).update(stamp+'\nlearning-lab-v1').digest('hex')};
 assert.equal((await fetch(base+'/api/learning/tick',{method:'POST',headers:learningHeaders,body:'{}'})).status,503);
 const expired=String(Number(stamp)-1000);assert.equal((await fetch(base+'/api/trading/tick',{method:'POST',headers:{'X-Stock-Worker-Time':expired,'X-Stock-Worker-Signature':createHmac('sha256',env.COINBASE_WORKER_TOKEN).update(expired).digest('hex')},body:'{}'})).status,401);
 const statusResponse=await fetch(base+'/api/savings',{headers:{Cookie}});assert.equal(statusResponse.status,200);assert.equal(statusResponse.headers.get('cache-control'),'no-store');const savings=await statusResponse.json();assert.equal(savings.policy.threshold,'200.00');assert.equal(savings.reserve,null);assert.equal(savings.liveAllocationEnabled,false);
 for(const [balance,amount] of [['200','0.00'],['300','150.00'],['200.01','100.00']]){const example=await fetch(base+'/api/savings/illustrate',{method:'POST',headers:{Cookie,'Content-Type':'application/json'},body:JSON.stringify({balance})});assert.equal(example.status,200);const j=await example.json();assert.equal(j.illustrationOnly,true);assert.equal(j.savings,amount);}
 for(const balance of ['-1','NaN','300.001',300]){const example=await fetch(base+'/api/savings/illustrate',{method:'POST',headers:{Cookie,'Content-Type':'application/json'},body:JSON.stringify({balance})});assert.equal(example.status,400);}
 for(const route of ['/api/savings/reserve','/api/savings/withdraw','/api/savings'])assert.equal((await fetch(base+route,{method:'POST',headers:{Cookie,'Content-Type':'application/json'},body:'{}'})).status,404);
 console.log('PASS authenticated savings status, illustrative arithmetic, input validation and unavailable financial writes');
 console.log('PASS real server authentication, no-store status, truthful missing-key result, and no arbitrary /api/coinbase write endpoints');
}finally{if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await fs.rm(dir,{recursive:true,force:true});}

