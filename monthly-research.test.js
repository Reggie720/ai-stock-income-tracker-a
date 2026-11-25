import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyPlan,monthlyResearch} from './monthly-research.js';
import {COMPANIES,RESEARCH_SYMBOLS,RESEARCH_BATCHES} from './company-research.js';
import {PLAN} from './trading-engine.js';
test('research universe covers requested brands, all groups, and no additional live permissions',()=>{
 assert.equal(RESEARCH_SYMBOLS.length,31);assert.equal(new Set(RESEARCH_SYMBOLS).size,31);assert.ok(RESEARCH_SYMBOLS.length<=40);assert.ok(RESEARCH_BATCHES.every(x=>x.length<=6));assert.deepEqual(RESEARCH_BATCHES.flat(),RESEARCH_SYMBOLS);
 for(const symbol of ['KR','DLTR','DG','SUNB','WMT','ECHO','CAT','WM','XOM','LNG','NVDA','AAPL','MSFT','CRUS','LOGI'])assert.ok(RESEARCH_SYMBOLS.includes(symbol));
 assert.ok(COMPANIES.find(c=>c.symbol==='KR').brands.includes("Fry's"));assert.ok(COMPANIES.find(c=>c.symbol==='ECHO').brands.includes('Boost Mobile'));assert.equal(PLAN.products.includes('NVDA-USD'),false);assert.equal(PLAN.budget,'2.00');
});
test('monthly draft is exact contribution arithmetic and cannot enable purchases or promise returns',()=>{
 const p=monthlyPlan({mode:'research_only',monthlyAmount:'5.25',symbols:['WMT','KR'],horizonMonths:12});assert.equal(p.contributionsOnly,'63.00');assert.equal(p.tradeEnabled,false);assert.equal(monthlyPlan().monthlyAmount,'0.00');
 for(const patch of [{tradeEnabled:true},{mode:'active'},{monthlyAmount:'1.001'},{monthlyAmount:'-5'},{symbols:['BTC']},{horizonMonths:1}])assert.throws(()=>monthlyPlan({mode:'research_only',monthlyAmount:'5.25',symbols:['WMT'],horizonMonths:12,...patch}));
});
test('monthly comparison uses real dated observations only, excludes future/stale prices and leaves short history unavailable',()=>{
 const now=Date.parse('2026-11-25T21:00Z');const rows=[{symbol:'WMT',session_date:'2026-10-28',quote_at:'2026-10-28T20:00Z',price:'100'},{symbol:'WMT',session_date:'2026-11-25',quote_at:'2026-11-25T20:00Z',price:'110'},{symbol:'WMT',session_date:'2026-11-26',quote_at:'2026-11-26T20:00Z',price:'900'}];
 const w=monthlyResearch(rows,now).find(c=>c.symbol==='WMT');assert.ok(Math.abs(w.monthlyPriceReturnPercent-10)<1e-8);assert.equal(w.sampledDays,2);assert.equal(monthlyResearch(rows.slice(1),now).find(c=>c.symbol==='WMT').monthlyPriceReturnPercent,null);assert.equal(monthlyResearch(rows,now+9*86400000).find(c=>c.symbol==='WMT').monthlyPriceReturnPercent,null);assert.equal(monthlyResearch(rows,now).find(c=>c.symbol==='DG').latest,null);
});
