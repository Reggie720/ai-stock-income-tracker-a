import test from 'node:test';import assert from 'node:assert/strict';
import {SYMBOLS,emptyLab,advanceLab,features,reviewModel,learnedRanking,createLearningLab,botResults} from './learning-lab.js';
import {createResearchCollector,validateResearchNote,safeSourceUrl} from './learning-research.js';
import {createLearningStore} from './learning-store.js';
const time=Date.parse('2026-11-24T16:00:00Z');
function stock(symbol='O',end=time,base=50){const history=Array.from({length:13},(_,i)=>({at:new Date(end-(12-i)*5*60000).toISOString(),price:base+i*.01}));return {symbol,quote:history.at(-1).price,quoteAt:history.at(-1).at,history,pattern:{qualifies:true}};}
const feed=(at=time)=>({updatedAt:new Date(at).toISOString(),monitor:{enabled:true},stocks:[stock('O',at)]});
function store(){let row={version:0,data:emptyLab()};return {read:async()=>structuredClone(row),cas:async(v,data)=>{if(v!==row.version)return false;row={version:v+1,data:structuredClone(data)};return true;},peek:()=>structuredClone(row)};}
test('fresh historical features exclude future, stale, duplicate and missing data',()=>{
 assert.ok(features(stock(),time));assert.equal(features({...stock(),quoteAt:'2020-01-01'},time),null);assert.equal(features({...stock(),history:stock().history.slice(-3)},time),null);
 const s=stock();s.history.push({at:new Date(time+1000).toISOString(),price:999999});assert.ok(features(s,time).gain<1);
});
test('prospective forecasts deduplicate a time slot and only score real later quotes',()=>{
 let s=advanceLab(emptyLab(),feed(),time);assert.equal(s.observations.length,1);assert.equal(s.observations[0].status,'pending');s=advanceLab(s,feed(),time+60000);assert.equal(s.observations.length,1);
 const due=time+3600000,f=feed(due);f.stocks[0].history=[{at:new Date(due-1000).toISOString(),price:9999},{at:new Date(due).toISOString(),price:51}];
 s=advanceLab(s,f,due);assert.equal(s.observations[0].status,'observed');assert.equal(s.observations[0].outcome.price,51);assert.equal(s.lifetime.scored,1);s=advanceLab(s,f,due+1000);assert.equal(s.lifetime.scored,1);
});
test('missing, stale and next-session quotes are never counted as correct predictions',()=>{
 const s=advanceLab(emptyLab(),feed(),time),due=time+3600000;
 const missing=advanceLab(s,null,due+13*60000);assert.equal(missing.observations[0].status,'missing_data');assert.equal(missing.lifetime.scored,0);
 const next=feed(due);next.stocks[0].history=[{at:'2026-11-25T16:00:00Z',price:999}];assert.equal(advanceLab(s,next,due).observations[0].status,'pending');
 assert.equal(advanceLab(emptyLab(),feed(),Date.parse('2026-11-24T22:00Z')).observations.length,0);
});
function training(){const s=emptyLab(),days=['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11'];for(const day of days)for(let i=0;i<20;i++)s.observations.push({id:day+':'+i,symbol:'O',day,status:'observed',features:{gain:i%2?.2:-.2,pullback:0,bin:i%2?'up:smooth':'down:smooth'},predictions:{baselineProbability:.5,activeVersion:null,activeProbability:.5},outcome:{up:i%2===1,quoteAt:day+'T18:00:00Z',changePercent:i%2?.2:-.2}});return s;}
test('chronological validation activates only a model that beats baseline on separate sessions',()=>{
 const now=Date.parse('2026-11-12T13:00Z'),s=reviewModel(training(),now);assert.equal(s.activeVersion,1);const m=s.models[0];assert.ok(m.validation.baseline.brier>m.validation.candidates[0].metrics.brier);assert.ok(m.validation.cutoff>m.trainedThrough);assert.equal(reviewModel(s,now).models.length,1);
 const sparse=training();sparse.observations=sparse.observations.slice(0,30);assert.equal(reviewModel(sparse,now).activeVersion,null);
});
test('current/future labels cannot affect earlier-session training or validation',()=>{
 const now=Date.parse('2026-11-12T13:00Z'),a=training(),b=training();b.observations.push(...Array.from({length:100},(_,i)=>({id:'future'+i,symbol:'O',day:'2026-11-20',status:'observed',features:{bin:'up:smooth'},outcome:{up:false,quoteAt:'2026-11-20T18:00Z'}})));
 assert.deepEqual(reviewModel(a,now).models,reviewModel(b,now).models);
});
test('poor genuinely forward performance rolls back a learned ranking',()=>{
 const s=reviewModel(training(),Date.parse('2026-11-12T13:00Z'));s.lastReview=null;
 for(const day of ['2026-11-13','2026-11-16','2026-11-17','2026-11-18','2026-11-19'])for(let i=0;i<4;i++)s.observations.push({id:day+i,symbol:'O',day,status:'observed',features:{bin:'up:smooth'},predictions:{activeVersion:1,activeProbability:.99,baselineProbability:.5},outcome:{up:false,quoteAt:day+'T18:00Z'}});
 const out=reviewModel(s,Date.parse('2026-11-20T13:00Z'));assert.equal(out.activeVersion,null);assert.equal(out.reviews.at(-1).action,'rollback');
});
test('stale memory or data does not reorder live stock candidates',()=>{
 const s=reviewModel(training(),Date.parse('2026-11-12T13:00Z'));s.lastTick=new Date(time).toISOString();assert.equal(learnedRanking(s,feed(),time).length,1);assert.equal(learnedRanking(s,feed(),time+25*60000).length,0);
});
test('competing research workers use a durable lease and publish only one snapshot',async()=>{
 const db=store();let researchCalls=0;const lab=createLearningLab({store:db,feed:async()=>feed(),now:()=>time,research:async()=>{researchCalls++;return {day:'2026-11-24',aiStatus:'ready'};},tradeStatus:async()=>({history:[]})});
 await Promise.all([lab.tick(),lab.tick()]);assert.equal(researchCalls,1);assert.equal(db.peek().data.observations.length,1);await lab.tick();assert.equal(researchCalls,1);assert.equal(db.peek().data.lease,null);
});
test('provider failure preserves evidence and marks research unavailable without inventing it',async()=>{
 const db=store(),lab=createLearningLab({store:db,feed:async()=>feed(),now:()=>time,research:async()=>{throw Error('secret');},tradeStatus:async()=>({history:[]})});await lab.tick();assert.equal(db.peek().data.observations.length,1);assert.equal(db.peek().data.reports[0].aiStatus,'unavailable');assert.doesNotMatch(JSON.stringify(await lab.read()),/secret/);
});
test('realized trade results use actual fill amounts and exclude paper/forecast returns',()=>{
 const data=botResults([{productId:'O-USD',side:'BUY',quantity:'0.02',costOrProceedsCents:'100',fees:'0'},{productId:'O-USD',side:'SELL',quantity:'0.01',costOrProceedsCents:'55',fees:'0'},{productId:'O-USD',side:'SELL',quantity:'0.01',costOrProceedsCents:'50',fees:'0'}]);assert.equal(data.realizedNetCents,'5');assert.equal(data.openBotPositions,0);
});
test('AI interpretation rejects invented source IDs and unsafe source URLs',()=>{
 assert.equal(safeSourceUrl('javascript:alert(1)'),null);assert.equal(safeSourceUrl('https://user:pass@example.com'),null);
 const note={summary:'Evidence is limited.',stocks:SYMBOLS.map(symbol=>({symbol,assessment:'Needs more observations.',evidenceIds:['memory'],risks:['Loss'],unknowns:['Future price']}))};assert.ok(validateResearchNote(note,[{id:'memory'}]));assert.throws(()=>validateResearchNote(note,[]));assert.throws(()=>validateResearchNote({...note,summary:'https://invented.invalid'},[{id:'O-quote'}]));
});
test('research separates stale quotes, unavailable profiles, news facts and AI interpretation',async()=>{
 const calls=[];const collector=createResearchCollector({env:{FINNHUB_API_KEY:'fictional-key'},request:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url.includes('company-news')?[]:{}};}});
 const report=await collector({feed:feed(),memory:{},day:'2026-11-24',now:time+600000});assert.equal(report.aiStatus,'unavailable');assert.equal(report.evidence.find(x=>x.id==='O-quote').stale,true);assert.ok(report.sourceStatus.every(s=>s.profileStatus==='unavailable'));assert.equal(calls.length,SYMBOLS.length*2);assert.ok(calls.every(x=>x.url.startsWith('https://finnhub.io/api/v1/')));
});
test('signed learning memory rejects tampering and version replay',async()=>{
 let row={version:0,data:emptyLab()};const request=async(url,o)=>{if(url.includes('/rpc/')){const b=JSON.parse(o.body);if(b.expected!==row.version)return {ok:true,json:async()=>false};row={version:row.version+1,data:b.next_data};return {ok:true,json:async()=>true};}return {ok:true,json:async()=>[structuredClone(row)]};};
 const db=createLearningStore(()=>({url:'https://example.test/rest/v1/stock_tracker_state',key:'test'}),{request,key:()=> 'fictional-signing-key-only-for-tests-12345'});const s=await db.read();assert.equal(await db.cas(s.version,s.data),true);await db.read();row.data.status='tampered';await assert.rejects(db.read(),/integrity/);
});


test('research rejects headlines about unrelated funds and matches Realty Income by name',async()=>{
 const {relevantHeadline}=await import('./learning-research.js');
 assert.equal(relevantHeadline('JEPI','Lazard’s New ETF Targets Monthly Income With Junk Bonds'),false);
 assert.equal(relevantHeadline('JEPI','Forget JEPI: 4 Dividend Stocks'),true);
 assert.equal(relevantHeadline('O','Better Dividend Stock: Realty Income vs. Iron Mountain'),true);
 assert.equal(relevantHeadline('O','Stocks climb on outlook'),false);
});



test('corporate research supports requested companies without expanding live order scope',async()=>{
 const {PLAN,decideOrder,emptyEngine,PLAN_VERSION}=await import('./trading-engine.js');
 for(const symbol of ['SUNB','WMT','ACI','KR','QSR']){
  const f=feed();f.stocks=[stock(symbol)];const memory=advanceLab(emptyLab(),f,time);
  assert.equal(memory.observations[0].symbol,symbol);
  assert.equal(PLAN.products.includes(symbol+'-USD'),false);
  const engine=emptyEngine();engine.mode='active';engine.cashCents='200';engine.approval={version:PLAN_VERSION,products:[...PLAN.products]};
  assert.equal(decideOrder(engine,{...f,learnedRanking:[{symbol,probability:.99,version:1}]},time),null);
 }
});
test('company news matches verified brand names and rejects unrelated issuers',async()=>{
 const {relevantHeadline}=await import('./learning-research.js');
 assert.equal(relevantHeadline('SUNB','Sunbelt Rentals reports earnings'),true);
 assert.equal(relevantHeadline('WMT','Walmart holiday sales update'),true);
 assert.equal(relevantHeadline('ACI','Safeway supermarket outlook'),true);
 assert.equal(relevantHeadline('KR',"Fry's stores and Kroger announce update"),true);
 assert.equal(relevantHeadline('QSR','Burger King revenue increases'),true);
 assert.equal(relevantHeadline('WMT','Other retailers report earnings'),false);
});
