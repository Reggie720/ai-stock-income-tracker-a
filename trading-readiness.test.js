import test from 'node:test';import assert from 'node:assert/strict';
import {createTradingReadiness} from './trading-readiness.js';
import {runCoinbaseRead} from './coinbase-reader.js';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const env={COINBASE_KEY_ID:'fictional-id',COINBASE_KEY_SECRET:'fictional-secret-not-a-real-credential'};
function runner({trade=false,cash='0',failPermission=false,hasNext=false}={}){return async a=>{
 if(a[0]==='portfolios')return {portfolios:[{uuid:id}]};
 if(a[0]==='api-key'){if(failPermission)throw Error('fictional-secret-not-a-real-credential');return {portfolio_uuid:id,can_view:true,can_trade:trade};}
 return {portfolio_id:id,has_next:hasNext,cursor:hasNext?'repeat':null,accounts:[{currency:'USD',ready:true,active:true,available_balance:{currency:'USD',value:cash}}]};
};}
test('read-only key and zero USD are distinct verified blockers; user terms recorded; no engine activation',async()=>{
 const r=await createTradingReadiness({env,runner:runner()})();assert.equal(r.canTrade,false);assert.equal(r.spendableUsd,'0');assert.equal(r.terms.stopNewBuysAtLoss,'10.00');assert.equal(r.terms.totalBudget,'25.00');assert.equal(r.engineInstalled,true);assert.equal(r.ordersEnabled,false);assert.equal(r.automaticTrading,false);
 for(const c of ['trade_permission','no_usd','strategy_review_required'])assert.ok(r.blockers.some(b=>b.code===c));
 assert.doesNotMatch(JSON.stringify(r),new RegExp(id+'|fictional-secret'));
});
test('even trade grant and USD do not prove stock eligibility or activate an engine',async()=>{
 const r=await createTradingReadiness({env,runner:runner({trade:true,cash:'25.000000000000000000'})})();assert.equal(r.canTrade,true);assert.equal(r.spendableUsd,'25.000000000000000000');assert.equal(r.ordersEnabled,false);assert.equal(r.stockApproval,'not_verified');assert.ok(r.blockers.some(b=>b.code==='strategy_review_required'));assert.ok(!r.blockers.some(b=>['no_usd','below_budget'].includes(b.code)));
});
test('unknown permission, incomplete pagination, mismatched account and missing money fail closed',async()=>{
 for(const run of [runner({failPermission:true}),runner({hasNext:true}),runner({cash:null}),async a=>a[0]==='portfolios'?{portfolios:[{uuid:id}]}:a[0]==='api-key'?{portfolio_uuid:other,can_view:true,can_trade:true}:{portfolio_id:other,accounts:[],has_next:false}]){
  const r=await createTradingReadiness({env,runner:run})();assert.equal(r.ordersEnabled,false);assert.equal(r.automaticTrading,false);assert.ok(r.canTrade===null||r.spendableUsd===null);assert.doesNotMatch(JSON.stringify(r),/fictional-secret/);
 }
});
test('only intended portfolio is inspected; no fallback when explicit scope is inaccessible',async()=>{
 let count=0;const r=await createTradingReadiness({env:{...env,COINBASE_PORTFOLIO_ID:other},runner:async()=>{count++;return {portfolios:[{uuid:id}]};}})();assert.equal(count,1);assert.equal(r.connectionVerified,false);assert.equal(r.canTrade,null);
});
test('same cached credential check uses only fixed reads and coalesces concurrent requests',async()=>{
 const calls=[];const check=createTradingReadiness({env,runner:async a=>{calls.push(a);return runner()(a);}});await Promise.all([check(),check()]);await check();assert.deepEqual(calls,[['portfolios','list'],['api-key','permissions'],['balance',`portfolio_id==${id}`,'show_zero==true']]);
});
test('production read runner rejects every financial or arbitrary command before credentials are used',async()=>{
 for(const a of [['orders','create'],['transfer'],['balance'],['portfolios','get','bad','currency==USD'],['api-key','permissions','extra'],['balance',`portfolio_id==${id}`,'show_zero==true','cursor==bad;command']])await assert.rejects(runCoinbaseRead(a,{}),/Unsupported read/);
});
