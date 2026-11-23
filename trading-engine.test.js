import test from 'node:test';import assert from 'node:assert/strict';
import {TradingEngine,emptyEngine,PLAN_VERSION,decideOrder,reconcileOrder,session,portfolioBinding} from './trading-engine.js';
import {createExecutionBroker,NoOrderSent,createFeeScheduleVerifier} from './coinbase-execution.js';
const id='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-11-23T16:00:00Z');
const approval={version:PLAN_VERSION,portfolioBinding:portfolioBinding(id),accepted:true,equityAccountConfirmed:true,settledFundsConfirmed:true,marketOrderAccepted:true,products:['JEPI-USD']};
function store(){let row={version:0,data:emptyEngine()};return {async read(){return structuredClone(row);},async cas(v,data){if(v!==row.version)return false;row={version:v+1,data:structuredClone(data)};return true;},peek:()=>structuredClone(row)};}
const feed=()=>({monitor:{enabled:true},updatedAt:new Date(now).toISOString(),stocks:[{symbol:'JEPI',quote:50,quoteAt:new Date(now).toISOString(),pattern:{qualifies:true}}]});
function rig(){const db=store(),calls=[];const broker={account:async()=>({portfolioId:id,canTrade:true,spendableUsd:'25'}),submit:async o=>{calls.push(o);return {order_id:'order-test-1'};},get:async()=>({order_id:'order-test-1',product_id:'JEPI-USD',side:'BUY',status:'FILLED',filled_size:'0.02',average_filled_price:'50',total_fees:'0'})};return {db,calls,broker,engine:new TradingEngine({store:db,broker,feed:async()=>feed(),now:()=>now,id:()=>client})};}
test('owner must approve exact plan, stock-account assertion and market-order risk; start places no trade',async()=>{
 const r=rig();for(const patch of [{accepted:false},{equityAccountConfirmed:false},{marketOrderAccepted:false},{products:['BTC-USD']},{version:'old'}])await assert.rejects(r.engine.start({...approval,...patch}));
 await r.engine.start(approval);assert.equal(r.calls.length,0);assert.equal(r.db.peek().data.cashCents,'200');
});
test('durable reservation precedes financial call, then a verified fill is reconciled exactly once',async()=>{
 const r=rig();await r.engine.start(approval);assert.equal(await r.engine.tick(),'reserved');assert.equal(r.calls.length,0);assert.equal(r.db.peek().data.pending.phase,'reserved');
 assert.equal(await r.engine.tick(),'submitted');assert.equal(r.calls.length,1);assert.equal(r.calls[0].clientOrderId,client);
 await r.engine.tick();const s=r.db.peek().data;assert.equal(s.cashCents,'100');assert.equal(s.spentCents,'100');assert.equal(s.positions['JEPI-USD'].quantity,'0.02');assert.equal(s.history.length,1);await r.engine.tick();assert.equal(r.calls.length,1);
});
test('two workers cannot submit the same reservation twice',async()=>{
 const r=rig();await r.engine.start(approval);await r.engine.tick();await Promise.all([r.engine.tick(),r.engine.tick()]);assert.equal(r.calls.length,1);
});
test('timeout after possible financial submission pauses and never retries or releases reservation',async()=>{
 const r=rig();r.broker.submit=async o=>{r.calls.push(o);throw Error('timeout');};await r.engine.start(approval);await r.engine.tick();assert.equal(await r.engine.tick(),'unknown');assert.equal(r.db.peek().data.mode,'paused');assert.equal(r.db.peek().data.pending.phase,'unknown');await r.engine.tick();assert.equal(r.calls.length,1);await assert.rejects(r.engine.start(approval));
});
test('known preflight failure clears unsubmitted reservation and pauses without financial call',async()=>{
 const r=rig();r.broker.submit=async()=>{throw new NoOrderSent('Fees changed');};await r.engine.start(approval);await r.engine.tick();assert.equal(await r.engine.tick(),'preflight_blocked');assert.equal(r.db.peek().data.pending,null);assert.equal(r.db.peek().data.mode,'paused');
});
test('pause stops new orders and cannot reset spending when resumed',async()=>{
 const r=rig();await r.engine.start(approval);await r.engine.tick();await r.engine.tick();await r.engine.tick();await r.engine.pause();await r.engine.tick();assert.equal(r.calls.length,1);await r.engine.start(approval);assert.equal(r.db.peek().data.spentCents,'100');assert.equal(r.db.peek().data.cashCents,'100');
});
test('stale samples, one daily attempt, full spending cap and latched loss stop block buys',async()=>{
 const r=rig();await r.engine.start(approval);const s=r.db.peek().data;
 for(const change of [x=>x.spentCents='200',x=>x.cashCents='0',x=>x.buyPaused=true,x=>x.attempts.push('2026-11-23:JEPI-USD')]){const d=structuredClone(s);change(d);assert.equal(decideOrder(d,feed(),now),null);}
 const stale=feed();stale.stocks[0].quoteAt='2020-01-01';assert.equal(decideOrder(s,stale,now),null);
 assert.equal(await r.engine.tick(),'reserved'); // A $2 starting balance must not trigger the historical $25-derived loss floor.
});
test('5% gain or loss sells only bot-owned quantities; sale proceeds are not assumed settled',async()=>{
 const r=rig();await r.engine.start(approval);await r.engine.tick();await r.engine.tick();await r.engine.tick();let s=r.db.peek().data;
 for(const quote of [52.5,47.5]){const f=feed();f.stocks[0].quote=quote;const o=decideOrder(s,f,now);assert.equal(o.side,'SELL');assert.equal(o.quantity,'0.02');}
 s.pending={side:'SELL',productId:'JEPI-USD',quantity:'0.02',phase:'submitted',orderId:'sell-1',clientOrderId:client};
 const out=reconcileOrder(s,{side:'SELL',product_id:'JEPI-USD',order_id:'sell-1',status:'FILLED',filled_size:'0.02',average_filled_price:'53',total_fees:'0'},now);assert.equal(out.cashCents,'100');assert.equal(out.unsettled[0].cents,'106');assert.equal(out.positions['JEPI-USD'],undefined);
 assert.throws(()=>reconcileOrder(s,{side:'SELL',product_id:'JEPI-USD',order_id:'sell-1',status:'FILLED',filled_size:'1',average_filled_price:'53',total_fees:'0'},now));
});
test('partial terminal fills count actual spending, unknown fee fields do not become zero',async()=>{
 const s=emptyEngine();s.cashCents='200';s.pending={side:'BUY',productId:'JEPI-USD',quoteCents:'100',phase:'submitted',orderId:'buy-1',clientOrderId:client};const o={side:'BUY',product_id:'JEPI-USD',order_id:'buy-1',status:'CANCELLED',filled_size:'0.01',average_filled_price:'50',total_fees:'0'};
 assert.equal(reconcileOrder(s,o,now).spentCents,'50');assert.throws(()=>reconcileOrder(s,{...o,total_fees:undefined},now));assert.throws(()=>reconcileOrder(s,{...o,filled_size:'1'},now));
});
test('calendar blocks weekends, holidays, late early-close sessions and unverified years',()=>{
 for(const date of ['2026-11-21T16:00Z','2026-11-26T16:00Z','2026-11-27T18:00Z','2029-01-04T16:00Z'])assert.equal(session(Date.parse(date)).open,false);
 assert.equal(session(Date.parse('2026-11-27T16:00Z')).open,true);
});
test('savings reservation uses only verified bot cash; repeated high-balance splits are latched',async()=>{
 const r=rig(),row=await r.db.read();await r.db.cas(row.version,{...row.data,mode:'active',approval,portfolioId:id,cashCents:'30000'});assert.equal(await r.engine.tick(),'savings_reserved');assert.equal(r.db.peek().data.reserveCents,'15000');assert.equal(r.db.peek().data.cashCents,'15000');
});
function executionFixture(overrides={}){
 const commands=[],env={COINBASE_KEY_ID:'test-key',COINBASE_KEY_SECRET:'fictional-secret-not-a-real-credential'};
 const run=async args=>{commands.push(args);if(args[0]==='portfolios'&&args[1]==='list')return {portfolios:[{uuid:id}]};if(args[0]==='portfolios'&&args[1]==='get')return {portfolio:{uuid:id},equity_positions:overrides.positions??[]};if(args[0]==='api-key')return {portfolio_uuid:id,can_view:true,can_trade:overrides.trade??true};if(args[0]==='balance')return {portfolio_id:id,accounts:[{currency:'USD',active:true,ready:true,available_balance:{currency:'USD',value:'25'}}]};if(args[0]==='products')return {product_id:'JEPI-USD',product_type:'EQUITY',quote_currency_id:'USD',quote_min_size:'0.01',base_increment:'0.00001',base_min_size:'0.00001'};if(args[0]==='fees')return {fee_tier:{maker_fee_rate:'0',taker_fee_rate:overrides.fee??'0'}};if(args[0]==='orders')return {order_id:'accepted-1'};throw Error('Unexpected command');};
 return {commands,broker:createExecutionBroker({env,run,now:()=>overrides.time??now,verifyFeeSchedule:async()=>overrides.feeProof??true})};
}
const order={productId:'JEPI-USD',side:'BUY',quoteCents:'100',protectedReserveCents:'0',signalQuoteAt:new Date(now).toISOString(),clientOrderId:client,portfolioId:id,approval:{...approval}};
test('production adapter constructs exact scoped $1 market order with retained client ID and no alternate session',async()=>{
 const r=executionFixture();await r.broker.submit(order);const writes=r.commands.filter(a=>a[0]==='orders');assert.equal(writes.length,1);assert.deepEqual(writes[0],['orders','create','product_id=JEPI-USD','side=BUY','type=market','quote_size=1.00',`portfolio_id=${id}`,`client_order_id=${client}`,'equity_trading_session=NORMAL','time_in_force=IOC']);
});
test('adapter blocks bad scope, key permission, fees, session, expired schedule before any order call',async()=>{
 for(const options of [{trade:false},{fee:'0.01'},{time:Date.parse('2026-11-26T16:00Z')},{feeProof:false}]){const r=executionFixture(options);await assert.rejects(r.broker.submit(order),e=>e.noOrderSent===true);assert.equal(r.commands.filter(a=>a[0]==='orders').length,0);}
 const r=executionFixture();await assert.rejects(r.broker.submit({...order,productId:'BTC-USD'}));assert.equal(r.commands.length,0);const protectedCash=executionFixture();await assert.rejects(protectedCash.broker.submit({...order,protectedReserveCents:'2500'}));assert.equal(protectedCash.commands.filter(a=>a[0]==='orders').length,0);
});

test('sale proceeds require exact owner settlement confirmation and independent USD coverage; cannot credit twice',async()=>{
 const r=rig();await r.engine.start(approval);let row=await r.db.read();await r.db.cas(row.version,{...row.data,cashCents:'100',spentCents:'100',unsettled:[{orderId:'sale-1',cents:'106'}]});
 await assert.rejects(r.engine.confirmSettlement({confirmedSettled:false,orderIds:['sale-1']}));
 r.broker.account=async()=>({portfolioId:id,canTrade:true,spendableUsd:'2.05'});
 await assert.rejects(r.engine.confirmSettlement({confirmedSettled:true,orderIds:['sale-1']}));
 r.broker.account=async()=>({portfolioId:id,canTrade:true,spendableUsd:'2.06'});
 await r.engine.confirmSettlement({confirmedSettled:true,orderIds:['sale-1']});assert.equal(r.db.peek().data.cashCents,'206');assert.equal(r.db.peek().data.spentCents,'100');assert.equal(r.db.peek().data.unsettled.length,0);
 await assert.rejects(r.engine.confirmSettlement({confirmedSettled:true,orderIds:['sale-1']}));
});
test('a pause racing a submission is retained while the returned order ID is saved',async()=>{
 const r=rig();r.broker.submit=async()=>{await r.engine.pause();return {order_id:'order-test-1'};};await r.engine.start(approval);await r.engine.tick();await r.engine.tick();assert.equal(r.db.peek().data.mode,'paused');assert.equal(r.db.peek().data.pending.orderId,'order-test-1');await r.engine.tick();assert.equal(r.db.peek().data.mode,'paused');assert.equal(r.db.peek().data.history.length,1);
});
test('fee disclosure verifier uses fixed public host, caches only valid proofs and rejects changes',async()=>{
 let time=now,count=0,html='CCM does not charge commission or fees for stock trades in your CCM brokerage account. We do not currently charge regulatory fees.';
 const verify=createFeeScheduleVerifier({now:()=>time,request:async(url,opts)=>{count++;assert.equal(url,'https://www.coinbase.com/stocks');assert.equal(opts.redirect,'error');return {ok:true,text:async()=>html};}});
 assert.equal(await verify(),true);assert.equal(await verify(),true);assert.equal(count,1);time+=86400001;html='Fees changed';assert.equal(await verify(),false);assert.equal(count,2);
});

test('execution adapter sells exact bot quantity and blocks pre-existing or externally mixed holdings',async()=>{
 const owned={asset:'JEPI',total_balance_equity:0.02,available_to_trade_equity:0.02};
 let r=executionFixture({positions:[owned]});await r.broker.submit({...order,side:'SELL',quantity:'0.02'});assert.ok(r.commands.at(-1).includes('base_size=0.02'));assert.ok(!r.commands.at(-1).some(x=>x.startsWith('quote_size=')));
 for(const side of ['BUY','SELL']){r=executionFixture({positions:[{...owned,total_balance_equity:'10.02',available_to_trade_equity:'10.02'}]});await assert.rejects(r.broker.submit({...order,side,quantity:'0.02'}),e=>e.noOrderSent===true);assert.equal(r.commands.filter(a=>a[0]==='orders').length,0);}
});

test('two dollar funding boundary, old consent rejection and cap after proceeds',async()=>{
 const r=rig();r.broker.account=async()=>({portfolioId:id,canTrade:true,spendableUsd:'1.99'});await assert.rejects(r.engine.start(approval));
 r.broker.account=async()=>({portfolioId:id,canTrade:true,spendableUsd:'2.00'});await assert.rejects(r.engine.start({...approval,version:'stock-pattern-v2-budget5'}));await r.engine.start(approval);
 const s=r.db.peek().data;s.spentCents='150';s.cashCents='9999';assert.equal(decideOrder(s,feed(),now),null);
 s.spentCents='200';assert.equal(decideOrder(s,feed(),now),null);s.pending={side:'BUY',productId:'JEPI-USD',quoteCents:'100',phase:'submitted',orderId:'over-cap',clientOrderId:client};
 assert.throws(()=>reconcileOrder(s,{side:'BUY',product_id:'JEPI-USD',order_id:'over-cap',status:'FILLED',filled_size:'0.02',average_filled_price:'50',total_fees:'0'},now),/exceeds/);
});
