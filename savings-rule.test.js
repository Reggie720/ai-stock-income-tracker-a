import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySavingsLedger, applySavingsSnapshot, savingsIllustration, savingsStatus} from './savings-rule.js';
const portfolioId='11111111-1111-4111-8111-111111111111', now=100000;
const snapshot=(balance, sequence=1)=>({portfolioId,currency:'USD',id:`event-${sequence}`,sequence,checkedAt:now,reconciled:true,botPositionsIdentified:true,pendingOrdersResolved:true,tradingBalance:balance,unreservedSettledUsd:balance});
const apply=(ledger, event)=>applySavingsSnapshot(ledger,event,now);
test('strictly above $200; split half of balance, keep odd cent for trading',()=>{
 for(const value of ['0','60','199.99','200']) assert.equal(savingsIllustration(value).triggers,false);
 assert.deepEqual([savingsIllustration('200.01').savings,savingsIllustration('200.01').trading],['100.00','100.01']);
 assert.equal(savingsIllustration('300').savings,'150.00');
});
test('exactly $200 remains untouched; reserve grows at a subsequent crossing',()=>{
 let l=emptySavingsLedger(portfolioId);
 assert.equal(apply(l,snapshot('200')).allocated,'0.00');
 l=apply(l,snapshot('300')).ledger;assert.equal(l.reserve,'150.00');
 // tradingBalance excludes $150 existing savings.
 l=apply(l,snapshot('250',2)).ledger;assert.equal(l.reserve,'275.00');
 assert.equal(l.entries[1].tradingAfter,'125.00');
});
test('snapshot replay and out-of-order events cannot duplicate allocation, including after serialization',()=>{
 const event=snapshot('300');const l=JSON.parse(JSON.stringify(apply(emptySavingsLedger(portfolioId),event).ledger));
 assert.equal(apply(l,event).allocated,'0.00');assert.equal(l.reserve,'150.00');
 assert.equal(apply(l,{...event,sequence:0,id:'older'}).allocated,'0.00');
 assert.equal(apply(l,{...event,sequence:2}).allocated,'0.00');
});
test('large balance is split only once per crossing, rearmed after remaining trading balance is at most $200',()=>{
 let l=apply(emptySavingsLedger(portfolioId),snapshot('1000')).ledger;assert.equal(l.reserve,'500.00');assert.equal(l.armed,false);
 l=apply(l,snapshot('500',2)).ledger;assert.equal(l.reserve,'500.00');
 l=apply(l,snapshot('200',3)).ledger;assert.equal(l.armed,true);
 l=apply(l,snapshot('300',4)).ledger;assert.equal(l.reserve,'650.00');
});
test('unsettled proceeds or stock value do not become a funded reserve; next settled snapshot can allocate',()=>{
 const first=snapshot('300');first.unreservedSettledUsd='40.00';
 let r=apply(emptySavingsLedger(portfolioId),first);assert.equal(r.reason,'waiting_for_settled_usd');assert.equal(r.ledger.reserve,'0.00');
 r=apply(r.ledger,snapshot('300',2));assert.equal(r.allocated,'150.00');
});
test('missing reconciliation, stale or malformed balance and wrong account fail without mutating ledger',()=>{
 for(const patch of [{reconciled:false},{botPositionsIdentified:false},{pendingOrdersResolved:false},{checkedAt:1},{checkedAt:now+1},{unreservedSettledUsd:null},{tradingBalance:'300.001'},{portfolioId:'wrong'},{currency:'USDC'},{unreservedSettledUsd:'301'},{sequence:1.2}]){
  const l=emptySavingsLedger(portfolioId), before=JSON.stringify(l);const r=apply(l,{...snapshot('300'),...patch});assert.equal(r.allocated,'0.00');assert.equal(JSON.stringify(l),before);
 }
});
test('corrupt reserve journal blocks allocation and unknown reserve remains unavailable in live status',()=>{
 const l=emptySavingsLedger(portfolioId);l.reserve='20.00';assert.equal(apply(l,snapshot('300')).reason,'invalid_ledger');
 const status=savingsStatus();assert.equal(status.reserve,null);assert.equal(status.withdrawable,null);assert.equal(status.transfersEnabled,false);assert.equal(status.liveAllocationEnabled,false);
});
