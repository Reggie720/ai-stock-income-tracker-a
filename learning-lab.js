import {randomUUID} from 'node:crypto';
import {PLAN,session,units} from './trading-engine.js';
import {COMPANIES,RESEARCH_SYMBOLS,RESEARCH_BATCHES} from './company-research.js';
// Preserve the existing short-horizon model and its measured sample history.
export const SYMBOLS=['SGOV','JEPI','DIVO','O','SUNB','WMT','ACI','KR','QSR'];
const MINUTE=60000,DAY=86400000;
const clone=x=>structuredClone(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function emptyLab(){return {schema:1,lastTick:null,lastReview:null,observations:[],models:[],reviews:[],activeVersion:null,reports:[],researchAttempts:[],lifetime:{observed:0,scored:0,unavailable:0},stockMemory:{},lastQuotes:{},status:'Collecting prospective evidence',lease:null,tradeResults:null};}
export function validateLab(s){if(!s||s.schema!==1||!Array.isArray(s.observations)||s.observations.length>2100||!Array.isArray(s.models)||!Array.isArray(s.reports)||!s.lifetime||!s.stockMemory)throw Error('Invalid learning memory');return s;}
function fresh(t,now,age){const n=Date.parse(t);return Number.isFinite(n)&&n<=now&&now-n<=age;}
export function features(stock,now){
 if(!SYMBOLS.includes(stock?.symbol)||!finite(stock.quote)||stock.quote<=0||!fresh(stock.quoteAt,now,5*MINUTE))return null;
 const h=(stock.history||[]).filter(x=>finite(x.price)&&x.price>0&&fresh(x.at,now,65*MINUTE)&&Date.parse(x.at)<=Date.parse(stock.quoteAt)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const unique=[...new Map(h.map(x=>[x.at,x])).values()];
 if(unique.length<6)return null;
 const span=(Date.parse(unique.at(-1).at)-Date.parse(unique[0].at))/MINUTE;if(span<30)return null;
 if(unique.slice(1).some((x,i)=>Date.parse(x.at)-Date.parse(unique[i].at)>10*MINUTE))return null;
 const gain=100*(stock.quote/unique[0].price-1);let peak=unique[0].price,pullback=0;
 for(const x of unique){peak=Math.max(peak,x.price);pullback=Math.max(pullback,100*(1-x.price/peak));}
 return {gain,pullback,spanMinutes:span,samples:unique.length,bin:(gain<-.05?'down':gain>.05?'up':'flat')+':'+(pullback>.25?'choppy':'smooth')};
}
const modelKey=(kind,symbol,f)=>kind==='symbol_momentum'?symbol+':'+f.bin:f.bin;
export function fit(rows,kind){
 const prior=(rows.filter(x=>x.outcome.up).length+1)/(rows.length+2),buckets={};
 for(const r of rows){const k=modelKey(kind,r.symbol,r.features);const b=buckets[k] ||= {n:0,up:0};b.n++;if(r.outcome.up)b.up++;}
 return {kind,prior,buckets};
}
export function probability(model,symbol,f){if(!model)return .5;const b=model.buckets[modelKey(model.kind,symbol,f)];return b?(b.up+20*model.prior)/(b.n+20):model.prior;}
function score(rows,predict){const n=rows.length;if(!n)return null;return {n,brier:rows.reduce((n,r)=>n+(predict(r)-(r.outcome.up?1:0))**2,0)/n,accuracy:rows.filter(r=>(predict(r)>=.5)===r.outcome.up).length/n};}
export function reviewModel(input,now){
 const s=clone(input),day=session(now).day;
 if(s.lastReview===day)return s;s.lastReview=day;
 const rows=s.observations.filter(r=>r.status==='observed'&&r.day<day&&Date.parse(r.outcome.quoteAt)<=now);
 const dates=[...new Set(rows.map(x=>x.day))].sort();let result='Collecting at least 40 completed forecasts across 8 sessions',evidence={examples:rows.length,sessions:dates.length};
 const current=s.models.find(m=>m.version===s.activeVersion);
 if(current){
  const forward=rows.filter(x=>x.day>current.introducedDay&&x.predictions?.activeVersion===current.version),days=new Set(forward.map(x=>x.day)).size;
  if(forward.length>=20&&days>=5){const real=score(forward,r=>r.predictions.activeProbability),base=score(forward,r=>r.predictions.baselineProbability);if(real.brier>base.brier+.03){s.activeVersion=null;s.status='Rolled back learned ranking after worse forward results';s.reviews.push({day,action:'rollback',version:current.version,evidence:{forward:real,baseline:base,sessions:days}});s.reviews=s.reviews.slice(-90);return s;}}
 }
 if(rows.length>=40&&dates.length>=8){
  const cutoff=dates[dates.length-Math.max(3,Math.ceil(dates.length*.3))],train=rows.filter(x=>x.day<cutoff),validation=rows.filter(x=>x.day>=cutoff);
  if(train.length>=20&&validation.length>=12&&new Set(train.map(x=>x.day)).size>=5){
   const baseline=(train.filter(x=>x.outcome.up).length+1)/(train.length+2),base=score(validation,()=>baseline);const candidates=[];
   for(const kind of ['momentum','symbol_momentum']){const m=fit(train,kind),metrics=score(validation,r=>probability(m,r.symbol,r.features));candidates.push({kind,metrics});}
   evidence={...evidence,cutoff,training:train.length,validation:validation.length,baseline:base,candidates};
   const best=candidates.filter(x=>x.metrics.brier<=base.brier-.01&&x.metrics.accuracy>=base.accuracy).sort((a,b)=>a.metrics.brier-b.metrics.brier)[0];
   const recent=s.models.filter(m=>now-Date.parse(m.at)<90*DAY);
   const last=s.models.at(-1);
   if(best&&recent.length<3&&(!last||now-Date.parse(last.at)>=14*DAY)){
    const version=(last?.version||0)+1,m=fit(train,best.kind);
    s.models.push({...m,version,at:new Date(now).toISOString(),introducedDay:day,trainedThrough:train.at(-1)?.day,validation:evidence});s.activeVersion=version;result='Validated learned ranking activated within the approved watchlist';s.reviews.push({day,action:'activate',version,evidence});
   }else result=best?'Keeping current ranking during the observation period':'Kept baseline: no candidate beat the later-session comparison';
  }
 }
 s.status=result;s.reviews.push({day,action:'review',evidence});s.reviews=s.reviews.slice(-90);s.models=s.models.slice(-12);return s;
}
export function advanceLab(input,feed,now){
 const s=clone(validateLab(input)),day=session(now).day,feedFresh=feed&&fresh(feed.updatedAt,now,3*MINUTE),stocks=feedFresh&&Array.isArray(feed.stocks)?feed.stocks:[];
 for(const o of s.observations.filter(x=>x.status==='pending'&&Date.parse(x.dueAt)<=now)){
  const due=Date.parse(o.dueAt);
  if(session(due).day!==o.day||!session(due).open){o.status='session_ended';s.lifetime.unavailable++;continue;}
  const stock=stocks.find(x=>x.symbol===o.symbol),history=stock?.history||[];
  const q=history.filter(x=>finite(x.price)&&x.price>0&&Date.parse(x.at)>=due&&Date.parse(x.at)<=due+10*MINUTE&&Date.parse(x.at)<=now&&session(Date.parse(x.at)).day===o.day).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0];
  if(q){o.status='observed';o.outcome={quoteAt:q.at,price:q.price,changePercent:100*(q.price/o.entryPrice-1),up:q.price>o.entryPrice};s.lifetime.scored++;const mem=s.stockMemory[o.symbol] ||= {scored:0,up:0,sumChange:0};mem.scored++;if(o.outcome.up)mem.up++;mem.sumChange+=o.outcome.changePercent;}
  else if(now>due+12*MINUTE){o.status='missing_data';s.lifetime.unavailable++;}
 }
 // Review excludes all current-session outcomes; no future labels enter a forecast.
 s.lastTick=new Date(now).toISOString();let next=reviewModel(s,now);
 if(feedFresh&&session(now).open&&feed.monitor?.enabled===true){
  const model=next.models.find(x=>x.version===next.activeVersion),priorRows=next.observations.filter(x=>x.status==='observed'&&x.day<day),prior=(priorRows.filter(x=>x.outcome.up).length+1)/(priorRows.length+2);
  for(const stock of stocks){const f=features(stock,now);if(!f)continue;const id=day+':'+stock.symbol+':'+Math.floor(now/(15*MINUTE));
   if(next.observations.some(x=>x.id===id)||next.lastQuotes[stock.symbol]===stock.quoteAt)continue;
   const due=now+60*MINUTE;if(!session(due).open)continue;
   next.observations.push({id,symbol:stock.symbol,day,createdAt:new Date(now).toISOString(),quoteAt:stock.quoteAt,entryPrice:stock.quote,dueAt:new Date(due).toISOString(),features:f,status:'pending',predictions:{baselineProbability:prior,activeVersion:model?.version??null,activeProbability:model?probability(model,stock.symbol,f):prior,momentumUp:f.gain>0},source:'Finnhub sampled quotes; prospective 60-minute research outcome'});
   next.lastQuotes[stock.symbol]=stock.quoteAt;next.lifetime.observed++;
  }
 }
 if(next.observations.length>2000){const pending=next.observations.filter(x=>x.status==='pending'),done=next.observations.filter(x=>x.status!=='pending');next.observations=[...done.slice(-(2000-pending.length)),...pending];}
 return next;
}
export function learnedRanking(s,feed,now){
 const model=s.models.find(x=>x.version===s.activeVersion);if(!model||!fresh(s.lastTick,now,20*MINUTE)||!fresh(feed?.updatedAt,now,3*MINUTE))return [];
 return (feed.stocks||[]).map(stock=>{const f=features(stock,now);return f?{symbol:stock.symbol,probability:probability(model,stock.symbol,f),version:model.version,evidence:'Earlier-session training and separate later-session validation; not guaranteed returns'}:null;}).filter(Boolean).sort((a,b)=>b.probability-a.probability);
}
export function botResults(history=[]){
 const positions={};let net=0n,sales=0,fees=0;
 for(const o of history){if(!SYMBOLS.includes(o.productId?.replace('-USD',''))||!['BUY','SELL'].includes(o.side))continue;
  try{const q=units(o.quantity),v=BigInt(o.costOrProceedsCents);fees+=Number(o.fees)||0;if(q===0n)continue;
   const p=positions[o.productId];if(o.side==='BUY'){positions[o.productId]={q:(p?.q||0n)+q,cost:(p?.cost||0n)+v};}
   else if(p&&q<=p.q){const cost=p.cost*q/p.q;net+=v-cost;sales++;p.q-=q;p.cost-=cost;if(!p.q)delete positions[o.productId];}
  }catch{}
 }
 return {filledOrderRecords:history.length,saleFills:sales,realizedNetCents:String(net),recordedFeesUsd:fees,openBotPositions:Object.keys(positions).length,basis:'Reconciled Coinbase fills only; price forecasts and paper trades are excluded'};
}
export function labView(s,feed,now,legacy=null){
 validateLab(s);const observed=s.observations.filter(x=>x.status==='observed'),dates=new Set(observed.map(x=>x.day));
 return {enabled:true,researchCompanies:COMPANIES,researchSymbols:RESEARCH_SYMBOLS,researchBatches:RESEARCH_BATCHES,lastTick:s.lastTick,status:s.status+(s.feedDiagnostics?' · Feed '+(s.feedDiagnostics.feedAgeSeconds===null?'unavailable':s.feedDiagnostics.feedAgeSeconds+'s old')+' · '+(s.feedDiagnostics.sessionOpen?'Research session open':'Research session closed')+' · '+s.feedDiagnostics.stocks.filter(x=>x.featuresReady).length+' stocks with usable samples':''),feedDiagnostics:s.feedDiagnostics??null,prospectiveForecasts:s.lifetime.observed,completedForecasts:s.lifetime.scored,unavailableForecasts:s.lifetime.unavailable,trainingWindow:{examples:observed.length,sessions:dates.size,minimumExamples:40,minimumSessions:8},activeVersion:s.activeVersion,ranking:learnedRanking(s,feed,now),stockMemory:SYMBOLS.map(symbol=>({symbol,...s.stockMemory[symbol]})),recentForecasts:s.observations.slice(-20).reverse(),reviews:s.reviews.slice(-5).reverse(),reports:s.reports.slice(-12).reverse(),tradeResults:s.tradeResults,legacyLearning:legacy,limits:'Learning predicts later sampled prices, not profits. Research candidates are tested chronologically. Only validated ranking reorders approved signal-qualified stocks; it cannot raise budgets, broaden the watchlist, change entry/exit rules or alter the separately authorized one-time purchase.'};
}
export function createLearningLab({store,feed,research,tradeStatus,now=Date.now,id=randomUUID}){
 return {
  async export(){const row=await store.read();const {lease,...data}=row.data;return {exportedAt:new Date(now()).toISOString(),format:'stock-tracker-learning-v1',data};},
  async read(){const row=await store.read();let f=null;try{f=await feed();}catch{}return labView(row.data,f,now(),f?.learning||null);},
  async ranking(f){try{const row=await store.read();return learnedRanking(row.data,f,now());}catch{return [];}},
  async tick({refreshResearch=false}={}){
   const time=now(),row=await store.read();validateLab(row.data);if(row.data.lease?.until>time)return {status:'busy'};
   const token=id(),claimed={...row.data,lease:{token,until:time+110000}};if(!await store.cas(row.version,claimed))return {status:'busy'};
   let f=null;try{f=await feed();}catch{}
   const observedTime=now();
   let next=advanceLab(claimed,f,observedTime);
   const feedAge=Date.parse(f?.updatedAt);
   next.feedDiagnostics={checkedAt:new Date(observedTime).toISOString(),feedUpdatedAt:f?.updatedAt??null,feedAgeSeconds:Number.isFinite(feedAge)?Math.round((observedTime-feedAge)/1000):null,sessionOpen:session(observedTime).open,monitorEnabled:f?.monitor?.enabled===true,stocks:(f?.stocks||[]).map(stock=>({symbol:stock.symbol,quoteAt:stock.quoteAt??null,historySamples:Array.isArray(stock.history)?stock.history.length:0,featuresReady:!!features(stock,observedTime)}))};
   try{const t=await tradeStatus();next.tradeResults=botResults(t.history);}catch{next.tradeResults={unavailable:true};}
   const day=session(time).day;
   const covered=new Set(next.reports.filter(r=>r.day===day&&r.aiStatus==='ready').flatMap(r=>r.interpretation?.stocks?.map(x=>x.symbol)||r.symbols||[]));
   const batch=RESEARCH_BATCHES.find(symbols=>{const key=symbols.join(',');const attempts=next.researchAttempts.filter(x=>x.day===day&&x.batchKey===key),last=attempts.at(-1);return symbols.some(x=>!covered.has(x))&&attempts.length<3&&(!last||time-Date.parse(last.at)>=(refreshResearch?MINUTE:60*MINUTE));});
   const lastResearch=next.researchAttempts.at(-1);
   if(research&&batch&&(!lastResearch||time-Date.parse(lastResearch.at)>=(refreshResearch?MINUTE:5*MINUTE))){
    const batchKey=batch.join(',');next.researchAttempts.push({day,batchKey,at:new Date(time).toISOString()});next.researchAttempts=next.researchAttempts.slice(-540);
    try{const report=await research({feed:f,memory:labView(next,f,time,f?.learning||null),day,now:time,symbols:batch});next.reports=next.reports.filter(r=>r.day!==day||r.batchKey!==batchKey);next.reports.push({...report,batchKey,symbols:batch});next.reports=next.reports.slice(-180);}catch{next.reports=next.reports.filter(r=>r.day!==day||r.batchKey!==batchKey);next.reports.push({day,batchKey,symbols:batch,at:new Date(time).toISOString(),aiStatus:'unavailable',message:'Research provider unavailable; no facts or forecast fabricated.'});}
   }
   next.lease=null;if(!await store.cas(row.version+1,next))return {status:'state_changed'};
   return {status:'learning_updated',forecasts:next.lifetime.observed,completed:next.lifetime.scored,activeVersion:next.activeVersion,reportStatus:next.reports.at(-1)?.aiStatus||'pending'};
  }
 };
}

