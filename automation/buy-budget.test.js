import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBuy, cents} from './buy-budget.js';
const portfolioId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  return {
    now: 100000,
    policy: {currency: 'USD', totalBudget: '25.00', maximumLoss: '2.00', ownerApproved: true, productsApproved: true, strategyApproved: true, products: ['SGOV-USD'], portfolioId, paused: false},
    ledger: {currency: 'USD', portfolioId, checkedAt: 100000, complete: true, reconciled: true, unresolvedOrders: 0, lifetimeBuyCost: '20.00', pendingBuyCost: '3.00', lossToDate: '0.00'},
    evidence: {portfolioId, checkedAt: 100000, canTrade: true, equityEligible: true, marketOpen: true, session: 'NORMAL', strategyQualified: true, quoteAt: 100000, productId: 'SGOV-USD', currency: 'USD', previewVerified: true, costBoundVerified: true, spendableUsd: '25.00'},
    order: {side: 'BUY', currency: 'USD', productId: 'SGOV-USD', productType: 'EQUITY', session: 'NORMAL', maximumPrincipal: '1.90', maximumFees: '0.10'}
  };
}
test('exact cents reject ambiguous, negative, excessive precision and non-string amounts', () => {
  assert.equal(cents('25'), 2500n);
  for (const v of [25, null, '', '01', '-1', 'NaN', '1e2', '0.001', 'Infinity']) assert.throws(() => cents(v));
});
test('fees and open orders consume lifetime cap, successful check never enables orders', () => {
  const f = fixture(); assert.deepEqual(assessBuy(f), {readyForReservation:true,liveOrdersEnabled:false,reason:'transactional_reservation_required',maximumCost:'2.00',remainingAfterReservation:'0.00'});
  f.order.maximumFees = '0.11'; assert.equal(assessBuy(f).reason, 'total_budget_exceeded');
  f.order.maximumFees = '0.10'; f.ledger.lifetimeBuyCost = '25.00'; f.ledger.pendingBuyCost = '0.00'; f.ledger.sellProceeds = '25.00'; assert.equal(assessBuy(f).reason,'total_budget_exceeded');
});
test('every missing eligibility, permission, approval or cost proof blocks preparation', () => {
  for (const [section, key] of [['policy','ownerApproved'],['policy','productsApproved'],['policy','strategyApproved'],['evidence','canTrade'],['evidence','equityEligible'],['evidence','marketOpen'],['evidence','strategyQualified'],['evidence','previewVerified'],['evidence','costBoundVerified'],['ledger','complete'],['ledger','reconciled']]) {
    for (const value of [false, null, undefined, 'true']) {const f=fixture();f[section][key]=value;assert.equal(assessBuy(f).readyForReservation,false,`${section}.${key}`);}
  }
});
test('unknown amounts, unresolved orders, stale and future evidence fail closed', () => {
  for (const patch of [f=>f.ledger.unresolvedOrders=1,f=>f.ledger.checkedAt=1,f=>f.evidence.quoteAt=100001,f=>f.evidence.spendableUsd=null,f=>f.policy.maximumLoss=null,f=>f.order.maximumFees=null]) {const f=fixture();patch(f);assert.equal(assessBuy(f).readyForReservation,false);}
});
test('loss and pause, funds, portfolio, product and session restrictions block preparation', () => {
  for (const patch of [f=>f.ledger.lossToDate='2.00',f=>f.policy.paused=true,f=>f.evidence.spendableUsd='1.99',f=>f.evidence.portfolioId='22222222-2222-4222-8222-222222222222',f=>f.order.productId='BTC-USD',f=>f.order.session='OVERNIGHT',f=>f.order.side='SELL',f=>f.evidence.productId='JEPI-USD',f=>f.policy.totalBudget='26.00']) {const f=fixture();patch(f);assert.equal(assessBuy(f).readyForReservation,false);}
});
