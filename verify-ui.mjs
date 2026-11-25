import {parseHTML} from '../read-aloud/test-runtime/node_modules/linkedom/esm/index.js';
import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=await fs.readFile(new URL('../coinbase-connection/index.html',import.meta.url),'utf8');
const {window,document}=parseHTML(html);window.HTMLElement.prototype.scrollIntoView=function(){};
const state={budget:25,watchlist:['TEST'],holdings:[],predictions:[],researchHistory:[]};
let feed={updatedAt:new Date().toISOString(),marketHours:true,monitor:{enabled:true},learning:{status:'Waiting for examples',completed_current_rule_examples:0},paper:{enabled:true,dollars_per_order:1,reserved_or_spent:0,total_cap:25},stocks:[{symbol:'TEST',quote:100,quoteAt:new Date().toISOString(),pattern:{qualifies:true,gain_percent:1,up_fraction:0.8,reason:'One-hour upward pattern'}}],orders:[],dailyReviews:[{date:'2026-11-16',matchedAlerts:0,stocks:[{symbol:'TEST',firstObservedPrice:100,lastObservedPrice:101,sampledChangePercent:1,samples:13}]}]};
feed.stocks[0].history=[{price:99,at:new Date(Date.now()-300000).toISOString()},{price:100,at:new Date().toISOString()}];
let learningFailure=false;const learningData={enabled:true,status:'Collecting evidence',lastTick:null,prospectiveForecasts:0,completedForecasts:0,unavailableForecasts:0,trainingWindow:{examples:0,sessions:0,minimumExamples:40,minimumSessions:8},activeVersion:null,ranking:[],stockMemory:[{symbol:'O'}],recentForecasts:[],reports:[],reviews:[],tradeResults:{filledOrderRecords:0,saleFills:0,realizedNetCents:'0',basis:'Actual fills only'},limits:'Learning is experimental'};
let savingsFailure=false;let tradePermission=false,tradingUsd='0';const engineData={mode:'off',cashCents:'0',spentCents:'0',reserveCents:'0',positions:{},pending:null,unsettled:[],history:[],lastTick:null};
const monthlyData={researchSymbols:['KR','NVDA'],companies:[{symbol:'KR',name:'Kroger',brands:["Fry’s"],group:'Retail',source:'https://www.thekrogerco.com/',latest:null,monthlyPriceReturnPercent:null,status:'Collecting daily observations',coinbaseCatalog:'Research only'}],plan:{monthlyAmount:'0.00',symbols:[],horizonMonths:12,contributionsOnly:'0.00'},limits:'Research only; automatic purchases off.'};
let cbFail=false,cb={connected:false,message:'Tracker needs its own server key'};
let fail=false;const spoken=[];window.speechSynthesis={getVoices:()=>[],cancel(){},resume(){},speak(u){spoken.push(u);}};window.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
const intervals=[];const storage=new Map();
const sandbox={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},window,document,MutationObserver:window.MutationObserver,console,Blob,URL,location:{hash:'#signals'},setTimeout,clearTimeout,setInterval:(f)=>{intervals.push(f);return 0;},confirm:()=>true,
 fetch:async (url,opts)=>({ok:!(learningFailure&&url==='/api/learning')&&!(savingsFailure&&url==='/api/savings')&&!(fail&&url==='/api/monitor')&&!(cbFail&&url==='/api/coinbase/status'),json:async()=>url==='/api/research/monthly'?monthlyData:url==='/api/learning'?learningData:url==='/api/trading/engine'?{installed:true,ledgerReady:true,schedulerConfigured:true,funded:engineData.mode!=='off',plan:{version:'stock-pattern-v3-budget2',budget:engineData.budgetIncrease?'4.00':'2.00'},state:engineData}:url==='/api/trading/start'?(engineData.mode='active',engineData.cashCents='200',{state:engineData}):url==='/api/trading/pause'?(engineData.mode='paused',{state:engineData}):url==='/api/trading/readiness'?{canTrade:tradePermission,portfolioBinding:'0'.repeat(64),portfolioName:'Default',portfolioSuffix:'111111',spendableUsd:tradingUsd,ordersEnabled:false,automaticTrading:false,blockers:[{message:'<img src=x> broker requirement'}]}:url==='/api/savings'?{reserve:null,withdrawable:null,liveAllocationEnabled:false,message:'No funds moved.'}:url==='/api/savings/illustrate'?JSON.parse(opts.body).balance==='200'?{illustrationOnly:true,balance:'200.00',triggers:false}:{illustrationOnly:true,balance:'300.00',triggers:true,savings:'150.00',trading:'150.00'}:url==='/api/coinbase/status'?cb:url==='/api/state'?state:url==='/api/monitor'?(fail?{error:'Unavailable'}:feed):{ai:true,quotes:true}})};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
vm.runInNewContext(html.split('<script>')[1].split('</script>')[0],sandbox);await settle();
assert.equal(document.querySelector('#signals').classList.contains('hidden'),false);
assert.equal(document.querySelectorAll('#marketDock').length,1);assert.match(document.querySelector('#dockDetail').textContent,/REVIEW/);assert.equal(document.querySelectorAll('#dockDetail svg').length,1);
vm.runInNewContext("show('research')",sandbox);await settle();assert.equal(document.querySelector('#marketDock').classList.contains('hidden'),false);
document.querySelector('#dockExpand').click();assert.equal(document.body.classList.contains('dock-expanded'),true);assert.equal(storage.get('tracker-market-panel'),'expanded');
document.querySelector('#dockMinimize').click();assert.equal(document.body.classList.contains('dock-mini'),true);document.querySelector('#dockMinimize').click();assert.equal(document.body.classList.contains('dock-mini'),false);
document.querySelector('#dockSignals').click();await settle();
assert.match(document.querySelector('#signalCards').textContent,/REVIEW/);
assert.match(document.querySelector('#signalCards').textContent,/Where: Alpaca/);assert.match(document.querySelector('#signalCards').textContent,/Live trading controls/);
assert.match(document.querySelector('#dailyReviews').textContent,/first observed \$100.00/);assert.equal(document.querySelectorAll('#signals .speech-controls').length,2);
document.querySelector('#signalCards .speech-controls button').click();assert.match(spoken[0].text,/REVIEW/);
feed={...feed,updatedAt:'2020-01-01T00:00:00Z'};document.querySelector('#refreshSignals').click();await settle();assert.doesNotMatch(document.querySelector('#signalCards h3').textContent,/REVIEW/);assert.match(document.querySelector('#signalSummary').textContent,/stale/);assert.match(document.querySelector('#dockCount').textContent,/WAIT/);assert.equal(document.querySelector('.dock-signal').textContent,'WAIT');
feed={...feed,updatedAt:new Date().toISOString(),stocks:[{...feed.stocks[0],symbol:'<img src=x onerror=alert(1)>',pattern:{qualifies:false,reason:'<script>bad()</script>'}}]};document.querySelector('#refreshSignals').click();await settle();
assert.equal(document.querySelector('#signalCards img'),null);assert.equal(document.querySelector('#signalCards script'),null);assert.match(document.querySelector('#signalCards h3').textContent,/WAIT/);
assert.equal(document.querySelector('#dockDetail img'),null);assert.equal(document.querySelector('#dockDetail script'),null);
fail=true;document.querySelector('#refreshSignals').click();await settle();assert.equal(document.querySelector('#signalCards').textContent,'');assert.match(document.querySelector('#signalSummary').textContent,/No current action can be verified/);
console.log('PASS Signals deep link, REVIEW/WAIT, where-to-review text, read aloud, stale-data blocking, escaping and API failure behavior');

assert.match(document.querySelector('#dockDetail').textContent,/could not be verified/);assert.equal(document.querySelector('#dockCount').textContent,'UNAVAILABLE');
console.log('PASS persistent market panel across tabs, sampled chart, half screen/minimize controls, remembered size, stale and unavailable signals');

vm.runInNewContext("show('settings')",sandbox);await settle();assert.match(document.querySelector('#coinbaseResult').textContent,/Tracker needs/);assert.equal(document.querySelectorAll('#coinbaseConnection input').length,0);
cb={connected:true,mode:'read-only',checkedAt:new Date().toISOString(),portfolioName:'<img src=x>',totals:{total:'10.65585757724606',crypto:'10.65',cashEquivalent:'0',stocks:null},message:'<script>bad()</script>'};document.querySelector('#checkCoinbase').click();await settle();assert.match(document.querySelector('#coinbaseResult').textContent,/Connected directly/);assert.match(document.querySelector('#coinbaseResult').textContent,/\$10.66/);assert.match(document.querySelector('#coinbaseResult').textContent,/Stock holdings: Unavailable/);assert.equal(document.querySelector('#coinbaseResult img'),null);assert.equal(document.querySelector('#coinbaseResult script'),null);
cbFail=true;document.querySelector('#checkCoinbase').click();await settle();assert.doesNotMatch(document.querySelector('#coinbaseResult').textContent,/Connected directly/);assert.match(document.querySelector('#coinbaseResult').textContent,/could not be verified/);
console.log('PASS Coinbase panel missing-key, verified read-only, unknown balances, escaped provider text and failure clearing');

assert.equal(document.querySelectorAll('[data-tab="savings"]').length,1);
document.querySelector('[data-tab="savings"]').click();await settle();
assert.equal(document.querySelector('#savings').classList.contains('hidden'),false);
assert.match(document.querySelector('#savingsStatus').textContent,/Automatic reserve allocation: OFF/);
assert.match(document.querySelector('#savingsStatus').textContent,/not established/);
assert.equal(document.querySelector('#marketDock').classList.contains('hidden'),false);
document.querySelector('#previewSavings').click();await settle();assert.match(document.querySelector('#savingsExampleResult').textContent,/150.00 to savings/);assert.match(document.querySelector('#savingsExampleResult').textContent,/No funds moved/);
document.querySelector('#savingsExample').value='200';document.querySelector('#previewSavings').click();await settle();assert.match(document.querySelector('#savingsExampleResult').textContent,/no split/);
savingsFailure=true;document.querySelector('[data-tab="savings"]').click();await settle();assert.match(document.querySelector('#savingsStatus').textContent,/unavailable/);
console.log('PASS Savings navigation, truthful pending allocation, illustration, strict threshold, failure state and persistent market panel');

assert.equal(document.querySelectorAll('[data-tab="trading"]').length,1);
document.querySelector('[data-tab="trading"]').click();await settle();
assert.equal(document.querySelector('#trading').classList.contains('hidden'),false);
assert.match(document.querySelector('#tradingSetupResult').textContent,/Trade permission: not enabled/);
assert.match(document.querySelector('#tradingSetupResult').textContent,/Available USD: 0/);
assert.equal(document.querySelector('#tradingSetupResult img'),null);
assert.equal(document.querySelector('#startEngine').disabled,true);
assert.match(document.querySelector('#trading').textContent,/\$10 in total losses/);
console.log('PASS Trading setup navigation, read-only permission and zero USD display, disabled Start, selected loss limit and escaped provider content');

tradePermission=true;tradingUsd='25';document.querySelector('#checkTradingSetup').click();await settle();assert.equal(document.querySelector('#startEngine').disabled,true);
for(const id of ['confirmStockAccount','acceptMarketRisk','approveEnginePlan']){document.querySelector('#'+id).checked=true;document.querySelector('#'+id).dispatchEvent(new window.Event('change',{bubbles:true}));}
assert.equal(document.querySelector('#startEngine').disabled,false);document.querySelector('#startEngine').click();await settle();assert.match(document.querySelector('#engineMode').textContent,/ENABLED/);assert.equal(document.querySelector('#startEngine').disabled,true);
tradePermission=false;document.querySelector('#checkTradingSetup').click();await settle();assert.equal(document.querySelector('#pauseEngine').disabled,false);document.querySelector('#pauseEngine').click();await settle();assert.match(document.querySelector('#engineMode').textContent,/PAUSED/);
console.log('PASS complete plan consent, Start gating, enabled state and independent Pause control');

assert.equal(document.querySelectorAll('[data-tab="learning"]').length,1);document.querySelector('[data-tab="learning"]').click();await settle();assert.equal(document.querySelector('#learning').classList.contains('hidden'),false);assert.match(document.querySelector('#learningProgress').textContent,/0\/40 examples/);assert.match(document.querySelector('#learningRanking').textContent,/No validated ranking/);assert.match(document.querySelector('#learningForecasts').textContent,/No prospective/);
learningData.reports=[{day:'2026-11-24',aiStatus:'ready',interpretation:{summary:'<img src=x onerror=alert(1)>',stocks:[]},evidence:[{id:'O-news-1',source:'Provider',asOf:'2026-11-24T16:00Z',headline:'<script>alert(1)</script>',url:'javascript:alert(1)'}]}];document.querySelector('#refreshLearning').click();await settle();assert.equal(document.querySelector('#learningReports img'),null);assert.equal(document.querySelector('#learningReports script'),null);assert.equal(document.querySelector('#learningReports a'),null);
learningFailure=true;document.querySelector('#refreshLearning').click();await settle();assert.match(document.querySelector('#learningState').textContent,/unavailable/);assert.equal(document.querySelector('#learningReports').textContent,'');
console.log('PASS Learning navigation, insufficient-evidence state, sourced-note escaping, unsafe-link rejection and failure clearing');

learningFailure=false;engineData.budgetIncrease={additionalCents:'200'};engineData.approval={products:['JEPI-USD','O-USD','WMT-USD','KR-USD','ACI-USD','QSR-USD']};engineData.spentCents='200';engineData.cashCents='200';
document.querySelector('[data-tab="trading"]').click();await settle();assert.match(document.querySelector('#enginePlanSummary').textContent,/\$4.00 cumulative buying cap/);assert.match(document.querySelector('#engineLedger').textContent,/\$2.00 of \$4.00/);assert.equal(document.querySelector('[data-engine-product="WMT-USD"]').checked,true);assert.equal(document.querySelector('[data-engine-product="SGOV-USD"]').checked,false);
console.log('PASS amended $4 cap, spent/remaining allowance and approved corporate selection');

document.querySelector('[data-tab="monthly"]').click();await settle();assert.equal(document.querySelector('#monthly').classList.contains('hidden'),false);assert.match(document.querySelector('#monthlyCompanies').textContent,/Kroger/);assert.match(document.querySelector('#monthlyIllustration').textContent,/Automatic monthly purchases: OFF/);assert.equal(document.querySelector('#monthlyAmount').value,'');assert.match(document.querySelector('#monthly').textContent,/does not buy/);console.log('PASS monthly research navigation, company display, unset budget and explicit no-purchase draft');
