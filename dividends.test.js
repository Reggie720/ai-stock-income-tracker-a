import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDividend,createDividendLookup,dividendReportLines} from './dividends.js';
const now=Date.parse('2026-11-12T12:00:00Z');
const record=(extra={})=>({symbol:'TEST',name:'Fictional Test Fund',as_of:'2026-11-11',type:'etf',dividend:{frequency:'monthly',annual_amount:4.8,forward_yield:0.048,next_ex_date:'2026-12-01',next_pay_date:'2026-12-04',last_payment:{ex_date:'2026-11-02',pay_date:'2026-11-05',amount:0.4},variable_distribution:true},...extra});
test('normalizes the documented provider contract with canonical source attribution',()=>{
 const result=normalizeDividend(record({url:'javascript:bad'}),'TEST',now);
 assert.equal(result.frequency,'monthly');assert.equal(result.lastRecorded.amount,0.4);
 assert.equal(result.sourceUrl,'https://smarterdividends.com/stocks/TEST');
 assert.equal(result.nextPayDate,'2026-12-04');assert.equal(result.annualAmount,4.8);
 assert.match(result.warning,/not independently confirmed/);
});
test('rejects mismatched tickers, invalid dates and unsupported currency',()=>{
 for(const data of [record({symbol:'WRONG'}),record({as_of:'2026-02-30'}),record({as_of:'2027-01-01'}),record({currency:'EUR'})])assert.throws(()=>normalizeDividend(data,'TEST',now));
});
test('missing, negative, nonfinite and string amounts do not become zero or estimates',()=>{
 for(const value of [null,undefined,-1,NaN,Infinity,'4.8']){
  const data=record();data.dividend.annual_amount=value;data.dividend.forward_yield=value;data.dividend.last_payment.amount=value;
  const result=normalizeDividend(data,'TEST',now);
  assert.equal(result.annualAmount,null);assert.equal(result.forwardYield,null);assert.equal(result.lastRecorded,null);
  assert.match(dividendReportLines(result,{price:100},25).join('\n'),/Rate-based monthly average: Unavailable/);
 }
});
test('stale snapshots retain historical records but suppress current rates and future dates',()=>{
 const result=normalizeDividend(record({as_of:'2026-10-01'}),'TEST',now);
 assert.equal(result.stale,true);assert.equal(result.annualAmount,null);assert.equal(result.nextPayDate,null);
 assert.equal(result.frequency,null);assert.equal(result.lastRecorded.amount,0.4);
});
test('past next-dates are not advertised as upcoming and unknown frequency stays unavailable',()=>{
 const data=record();data.dividend.next_ex_date='2026-11-02';data.dividend.next_pay_date='2026-11-05';data.dividend.frequency='made-up';
 const result=normalizeDividend(data,'TEST',now);
 assert.equal(result.nextExDate,null);assert.equal(result.nextPayDate,null);assert.equal(result.frequency,null);
});
test('monthly illustration uses annual amount, price and budget once, with explicit limitations',()=>{
 const result=normalizeDividend(record(),'TEST',now),text=dividendReportLines(result,{price:100},25).join('\n');
 assert.match(text,/saved budget \$25.00: \$0.1000/);
 assert.match(text,/Provider forward yield: 4.80%/);
 assert.match(text,/not a predicted payment/);
 assert.match(text,/Recorded distribution per share: \$0.4 USD/);
 assert.ok(!text.includes('$1.2'));
});
test('zero annual amount is distinct from missing and missing quotes prevent estimates',()=>{
 const data=record();data.dividend.annual_amount=0;
 const result=normalizeDividend(data,'TEST',now);
 assert.match(dividendReportLines(result,{price:100},25).join('\n'),/\$0.0000/);
 assert.match(dividendReportLines(result,null,25).join('\n'),/monthly average: Unavailable/);
});
test('concurrent and repeated lookups share a single request, and expire after an hour',async()=>{
 let calls=0,time=now;
 const lookup=createDividendLookup(async()=>{calls++;return {ok:true,json:async()=>record()};},()=>time);
 const results=await Promise.all([lookup('TEST'),lookup('TEST')]);
 results[0].annualAmount=999;assert.equal((await lookup('TEST')).annualAmount,4.8);assert.equal(calls,1);
 time+=3600001;await lookup('TEST');assert.equal(calls,2);
});
test('provider errors are explicit, cached briefly and never produce invented values',async()=>{
 let calls=0;const lookup=createDividendLookup(async()=>{calls++;return {ok:false,status:429};},()=>now);
 await assert.rejects(lookup('TEST'),/HTTP 429/);await assert.rejects(lookup('TEST'),/HTTP 429/);assert.equal(calls,1);
 await assert.rejects(lookup('../TOKEN'),/Invalid ticker/);assert.equal(calls,1);
});
test('provider rate limits are respected for uncached symbols',async()=>{
 let calls=0;const lookup=createDividendLookup(async url=>{calls++;return {ok:true,json:async()=>record({symbol:url.split('/').pop()})};},()=>now);
 for(let i=0;i<55;i++)await lookup('T'+i);
 await assert.rejects(lookup('T55'),/limit reached/);assert.equal(calls,55);
});
