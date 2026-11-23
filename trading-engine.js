import {randomUUID,createHash} from 'node:crypto';
const SCALE=10n**18n;
export const PLAN_VERSION='stock-pattern-v3-budget2';
export const portfolioBinding=id=>createHash('sha256').update('stock-tracker:'+id).digest('hex');
export const PLAN=Object.freeze({version:PLAN_VERSION,currency:'USD',budget:'2.00',lossStop:'10.00',buyAmount:'1.00',
 products:['SGOV-USD','JEPI-USD','DIVO-USD','O-USD'],takeProfitPercent:5,positionExitLossPercent:5,
 entry:'Existing fresh one-hour upward-pattern signal; one buy attempt per symbol per New York trading day.',
 exit:'Sell only shares bought by this bot when the sampled position value rises 5% or falls 5% from cost.',
 session:'Regular session only; 10:00–15:30 New York, ending 12:30 on verified early-close dates.',
 savings:'Above $200, reserve half when enough settled bot cash is verified; no withdrawals.',
 limitations:'Market orders have no stock-order preview or guaranteed execution price. Loss thresholds do not guarantee a loss cap. This strategy has no demonstrated profitability.'});
export function units(s){if(typeof s!=='string'||!/^(0|[1-9]\d{0,12})(\.\d{1,18})?$/.test(s))throw Error('Invalid decimal');const[a,b='']=s.split('.');return BigInt(a)*SCALE+BigInt(b.padEnd(18,'0'));}
export const decimal=n=>{if(n<0n)throw Error('Negative quantity');const f=String(n%SCALE).padStart(18,'0').replace(/0+$/,'');return String(n/SCALE)+(f?'.'+f:'');};
const cents=n=>(n+SCALE/100n-1n)/(SCALE/100n);
const money=s=>{if(typeof s!=='string'||!/^\d{1,16}$/.test(s))throw Error('Invalid money ledger');return BigInt(s);};
const copy=x=>structuredClone(x);
export function emptyEngine(){return {schema:1,mode:'off',approval:null,portfolioId:null,cashCents:'0',spentCents:'0',reserveCents:'0',
 positions:{},pending:null,history:[],attempts:[],unsettled:[],reason:'Review the proposed plan before activation.',lastTick:null};}
export function validateEngine(s){
 if(!s||s.schema!==1||!['off','active','paused'].includes(s.mode)||!Array.isArray(s.history)||!Array.isArray(s.attempts)||!Array.isArray(s.unsettled)||!s.positions||typeof s.positions!=='object')throw Error('Invalid engine ledger');
 for(const k of ['cashCents','spentCents','reserveCents'])money(s[k]);
 if(money(s.spentCents)>200n)throw Error('Spending cap exceeded');
 for(const [p,v]of Object.entries(s.positions)){if(!PLAN.products.includes(p)||units(v.quantity)<0n||money(v.costCents)<0n)throw Error('Invalid bot position');}
 if(s.pending&&(!PLAN.products.includes(s.pending.productId)||!['BUY','SELL'].includes(s.pending.side)||!['reserved','submitting','submitted','unknown'].includes(s.pending.phase)))throw Error('Invalid pending order');
 return s;
}
const holidays=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
 '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
 '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25']);
const early=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
export function session(now){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const day=`${p.year}-${p.month}-${p.day}`,minute=Number(p.hour)*60+Number(p.minute);
 const calendarValid=['2026','2027','2028'].includes(p.year);
 return {day,open:calendarValid&&!['Sat','Sun'].includes(p.weekday)&&!holidays.has(day)&&minute>=600&&minute<(early.has(day)?750:930),calendarValid};
}
const fresh=(time,now,age)=>{const t=Date.parse(time);return Number.isFinite(t)&&t<=now&&now-t<=age;};
function stock(feed,product,now){
 if(!feed||!fresh(feed.updatedAt,now,180000))return null;
 const s=feed.stocks?.find(s=>s.symbol===product.replace(/-USD$/,''));
 if(!s||!fresh(s.quoteAt,now,300000)||!Number.isFinite(s.quote)||s.quote<=0)return null;
 try{return {...s,price:units(String(s.quote))};}catch{return null;}
}
export function markEquity(s,feed,now){
 let equity=money(s.cashCents)+money(s.reserveCents)+s.unsettled.reduce((n,x)=>n+money(x.cents),0n);
 for(const [p,v]of Object.entries(s.positions)){const q=stock(feed,p,now);if(!q)return null;equity+=units(v.quantity)*q.price/SCALE/(SCALE/100n);}
 return equity;
}
export function decideOrder(s,feed,now){
 validateEngine(s);if(s.mode!=='active'||s.pending||!s.approval||s.approval.version!==PLAN_VERSION||!session(now).open||feed?.monitor?.enabled!==true)return null;
 const selected=s.approval.products;
 if(!Array.isArray(selected)||!selected.length||selected.some(p=>!PLAN.products.includes(p)))throw Error('Invalid approved scope');
 let equity=money(s.cashCents)+money(s.reserveCents)+s.unsettled.reduce((n,x)=>n+money(x.cents),0n);
 for(const [p,v]of Object.entries(s.positions)){
  const q=stock(feed,p,now);if(!q)return null;
  const value=cents(units(v.quantity)*q.price/SCALE),cost=money(v.costCents);equity+=value;
  if(value*100n>=cost*105n||value*100n<=cost*95n)return {productId:p,side:'SELL',quantity:v.quantity,signalQuoteAt:q.quoteAt,reason:value>=cost?'take_profit_5_percent':'position_exit_loss_5_percent'};
 }
 if(s.buyPaused===true||equity<=(units(PLAN.budget)-units(PLAN.lossStop))/(SCALE/100n)||money(s.spentCents)+100n>200n||money(s.cashCents)<100n)return null;
 for(const p of selected){
  const q=stock(feed,p,now),key=`${session(now).day}:${p}`;
  if(!q||q.pattern?.qualifies!==true||s.positions[p]||s.attempts.includes(key))continue;
  return {productId:p,side:'BUY',quoteCents:'100',attemptKey:key,signalQuoteAt:q.quoteAt,reason:'fresh_hourly_pattern'};
 }
 return null;
}
export function reconcileOrder(s,order,now){
 validateEngine(s);const p=s.pending;if(!p||order.order_id!==p.orderId||order.product_id!==p.productId||order.side!==p.side)throw Error('Order identity mismatch');
 if(!['FILLED','CANCELLED','CANCELED','EXPIRED','FAILED'].includes(order.status))return null;
 const filled=units(order.filled_size),fees=units(order.total_fees);
 const price=filled>0n?units(order.average_filled_price):0n;
 const principal=filled*price/SCALE,charge=cents(principal+fees),proceeds=principal>=fees?(principal-fees)/(SCALE/100n):0n;
 const next=copy(s),prior=next.positions[p.productId];
 if(p.side==='BUY'){
  if(charge>money(p.quoteCents)||money(s.spentCents)+charge>200n||charge>money(s.cashCents))throw Error('Actual order cost exceeds reservation; reconciliation requires review');
  next.cashCents=String(money(s.cashCents)-charge);next.spentCents=String(money(s.spentCents)+charge);
  if(filled>0n)next.positions[p.productId]={quantity:decimal((prior?units(prior.quantity):0n)+filled),costCents:String((prior?money(prior.costCents):0n)+charge)};
 }else{
  if(!prior||filled>units(prior.quantity)||filled>units(p.quantity))throw Error('Sale exceeds bot-owned position');
  const left=units(prior.quantity)-filled;
  if(left===0n)delete next.positions[p.productId];else next.positions[p.productId]={quantity:decimal(left),costCents:String(money(prior.costCents)*left/units(prior.quantity))};
  if(proceeds>0n)next.unsettled.push({orderId:p.orderId,cents:String(proceeds),createdAt:new Date(now).toISOString(),status:'settlement_not_verified'});
 }
 next.history.push({clientOrderId:p.clientOrderId,orderId:p.orderId,productId:p.productId,side:p.side,status:order.status,quantity:decimal(filled),fees:decimal(fees),costOrProceedsCents:String(p.side==='BUY'?charge:proceeds),at:new Date(now).toISOString()});
 next.pending=null;next.lastTick=new Date(now).toISOString();next.reason='Order reconciled. Sale proceeds remain unavailable until settlement is verified.';
 return next;
}

// Storage uses atomic compare-and-swap. Broker methods must never retry writes.
export class TradingEngine{
 constructor({store,broker,feed,now=Date.now,id=randomUUID}){Object.assign(this,{store,broker,feed,now,id});}
 async status(){const row=await this.store.read();validateEngine(row.data);return row;}
 async pause(){for(let n=0;n<3;n++){const row=await this.status(),next={...row.data,mode:'paused',reason:'Paused by owner. In-flight orders may still fill.'};if(await this.store.cas(row.version,next))return next;}throw Error('State changed; refresh before retrying');}
 async start(approval){
  if(approval?.version!==PLAN_VERSION||approval.equityAccountConfirmed!==true||approval.settledFundsConfirmed!==true||approval.marketOrderAccepted!==true||approval.accepted!==true||!Array.isArray(approval.products)||!approval.products.length||approval.products.some(p=>!PLAN.products.includes(p)))throw Error('Review and accept the exact trading plan');
  const row=await this.status(),s=row.data;
  const needed=s.portfolioId?(money(s.cashCents)+money(s.reserveCents))*(SCALE/100n):units(PLAN.budget);
  const account=await this.broker.account();if(!account.canTrade||!account.portfolioId||units(account.spendableUsd)<needed)throw Error('Verified Trade permission and sufficient spendable USD are required ($2 on first start)');
  if(approval.portfolioBinding!==portfolioBinding(account.portfolioId))throw Error('The reviewed portfolio changed');
  if(Object.keys(s.positions).some(p=>!approval.products.includes(p)))throw Error('An existing bot position needs its approved exit scope retained');
  if(s.pending)throw Error('Reconcile the pending order before starting');if(s.portfolioId&&s.portfolioId!==account.portfolioId)throw Error('The selected portfolio changed');
  const next=copy(s);next.approval={version:PLAN_VERSION,portfolioBinding:approval.portfolioBinding,products:[...new Set(approval.products)],at:new Date(this.now()).toISOString(),equityAccountConfirmed:true,settledFundsConfirmed:true,marketOrderAccepted:true};next.mode='active';next.portfolioId=account.portfolioId;if(!s.portfolioId)next.cashCents='200';next.reason='Active; waiting for a qualified signal. No order is guaranteed.';
  if(!await this.store.cas(row.version,next))throw Error('State changed; refresh before starting');return next;
 }
 async recoverFeePause(verifyFees){
  const row=await this.status(),s=row.data;
  if(s.mode!=='paused'||s.reason!=='No order sent: Current zero stock-trade fees could not be verified from Coinbase disclosures'||s.pending||!s.portfolioId)return 'not_fee_paused';
  const a=s.approval;
  if(a?.version!==PLAN_VERSION||a.equityAccountConfirmed!==true||a.settledFundsConfirmed!==true||a.marketOrderAccepted!==true||!Array.isArray(a.products)||!a.products.length||a.products.some(p=>!PLAN.products.includes(p))||a.portfolioBinding!==portfolioBinding(s.portfolioId))throw Error('Original approved plan could not be verified');
  if(await verifyFees()!==true)return 'fees_unverified';
  const account=await this.broker.account();
  if(!account.canTrade||account.portfolioId!==s.portfolioId||units(account.spendableUsd)<(money(s.cashCents)+money(s.reserveCents))*(SCALE/100n))throw Error('Account no longer meets the approved plan');
  // Preserve original consent, budget, cash, attempts and positions. A racing
  // owner pause changes the version and must never be overwritten.
  if(!await this.store.cas(row.version,{...s,mode:'active',reason:'Fee verification restored; resumed the existing approved plan. Waiting for a qualified signal.'}))return 'state_changed';
  return 'approved_plan_resumed';
 }
 async confirmSettlement(input){
  if(input?.confirmedSettled!==true||!Array.isArray(input.orderIds)||!input.orderIds.length||new Set(input.orderIds).size!==input.orderIds.length)throw Error('Confirm the exact settled sale records');
  const row=await this.status(),s=row.data;if(s.pending||!s.portfolioId)throw Error('Resolve pending orders first');
  const selected=s.unsettled.filter(x=>input.orderIds.includes(x.orderId));if(selected.length!==input.orderIds.length)throw Error('Sale records changed');
  const amount=selected.reduce((n,x)=>n+money(x.cents),0n),account=await this.broker.account();
  if(account.portfolioId!==s.portfolioId||units(account.spendableUsd)<(money(s.cashCents)+money(s.reserveCents)+amount)*(SCALE/100n))throw Error('Broker USD does not cover these sale proceeds and existing bot cash');
  const next=copy(s);next.cashCents=String(money(s.cashCents)+amount);next.unsettled=next.unsettled.filter(x=>!input.orderIds.includes(x.orderId));next.settlementAttestations=[...(next.settlementAttestations||[]),{orderIds:input.orderIds,cents:String(amount),at:new Date(this.now()).toISOString(),basis:'Owner confirmed settlement; scoped USD coverage independently checked.'}];
  if(!await this.store.cas(row.version,next))throw Error('Trading ledger changed; review settlement again');return next;
 }
 async tick(){
  let row=await this.status(),s=row.data;const now=this.now();
  if(!s.lastTick||now-Date.parse(s.lastTick)>30000){await this.store.cas(row.version,{...s,lastTick:new Date(now).toISOString()});row=await this.status();s=row.data;}
  if(s.pending?.orderId){
   try{const o=await this.broker.get(s.pending.orderId,s.portfolioId),next=reconcileOrder(s,o,now);if(next)await this.store.cas(row.version,next);return 'reconciled_or_waiting';}
   catch{await this.store.cas(row.version,{...s,mode:'paused',reason:'Order reconciliation is uncertain. No new order will be sent.'});return 'reconciliation_required';}
  }
  if(s.pending?.phase==='submitting'||s.pending?.phase==='unknown'){
   if(now-s.pending.sentAt<90000)return 'in_flight';
   await this.store.cas(row.version,{...s,mode:'paused',pending:{...s.pending,phase:'unknown'},reason:'Order outcome unknown. Check Coinbase; this order will not be retried.'});return 'unknown';
  }
  if(s.mode!=='active')return 'off';
  if(!s.pending){
   const feed=await this.feed(),equity=markEquity(s,feed,now);
   if(equity!==null&&equity<=(units(PLAN.budget)-units(PLAN.lossStop))/(SCALE/100n)&&s.buyPaused!==true){await this.store.cas(row.version,{...s,buyPaused:true,reason:'$10 loss threshold reached. New buys are stopped; existing exit rules remain enabled.'});return 'loss_stop';}
   const trading=equity===null?null:equity-money(s.reserveCents);
   if(trading!==null&&trading<=20000n&&s.savingsArmed===false){await this.store.cas(row.version,{...s,savingsArmed:true});return 'savings_rearmed';}
   if(trading!==null&&trading>20000n&&s.savingsArmed!==false&&money(s.cashCents)>=trading/2n){
    const amount=trading/2n,next=copy(s);next.cashCents=String(money(s.cashCents)-amount);next.reserveCents=String(money(s.reserveCents)+amount);next.savingsArmed=trading-amount<=20000n;next.reason='Half the trading balance reserved in the bot ledger. No external transfer.';
    next.savingsEvents=[...(next.savingsEvents||[]),{id:this.id(),cents:String(amount),at:new Date(now).toISOString()}];await this.store.cas(row.version,next);return 'savings_reserved';
   }
   const candidate=decideOrder(s,feed,now);if(!candidate)return 'waiting';
   const next=copy(s);next.pending={...candidate,clientOrderId:this.id(),phase:'reserved',reservedAt:now,orderId:null};if(candidate.attemptKey)next.attempts.push(candidate.attemptKey);
   if(!await this.store.cas(row.version,next))return 'concurrent_worker';return 'reserved';
  }
  if(s.pending.phase!=='reserved'||!session(now).open)return 'waiting';
  let account;
  try{account=await this.broker.account();}catch{await this.store.cas(row.version,{...s,mode:'paused',pending:null,reason:'Account check failed before submission. No order was sent.'});return 'account_preflight_blocked';}
  if(!account.canTrade||account.portfolioId!==s.portfolioId)throw Error('Trading permission or portfolio changed');
  // Recheck signal freshness and exit terms immediately before submitting.
  const decision=decideOrder({...s,pending:null,attempts:s.attempts.filter(x=>x!==s.pending.attemptKey)},await this.feed(),now);
  if(!decision||decision.productId!==s.pending.productId||decision.side!==s.pending.side){await this.store.cas(row.version,{...s,pending:null,reason:'Signal expired before submission.'});return 'expired';}
  if(s.pending.side==='BUY'&&(units(account.spendableUsd)<SCALE+money(s.reserveCents)*(SCALE/100n)||money(s.cashCents)<100n||money(s.spentCents)+100n>200n))return 'insufficient_funds';
  const next=copy(s);next.pending.phase='submitting';next.pending.sentAt=now;next.pending.signalQuoteAt=decision.signalQuoteAt;
  if(!await this.store.cas(row.version,next))return 'concurrent_worker';
  try{
   const response=await this.broker.submit({...next.pending,portfolioId:s.portfolioId,protectedReserveCents:s.reserveCents,approval:s.approval});
   if(!response||typeof response.order_id!=='string'||response.order_id.length<5)throw Error('Unknown outcome');
   // A pause can race the external request; record the order while retaining pause.
   for(let n=0;n<3;n++){row=await this.status();if(row.data.pending?.clientOrderId!==next.pending.clientOrderId)throw Error('Ledger changed');const saved=copy(row.data);saved.pending={...saved.pending,phase:'submitted',orderId:response.order_id};if(await this.store.cas(row.version,saved))return 'submitted';}
   throw Error('Order ID persistence uncertain');
  }catch(e){
   if(e.noOrderSent===true){row=await this.status();if(row.data.pending?.clientOrderId===next.pending.clientOrderId)await this.store.cas(row.version,{...row.data,mode:'paused',pending:null,reason:'No order sent: '+e.message});return 'preflight_blocked';}
   row=await this.status();if(row.data.pending?.clientOrderId===next.pending.clientOrderId)await this.store.cas(row.version,{...row.data,mode:'paused',pending:{...row.data.pending,phase:'unknown',sentAt:now},reason:'Order outcome uncertain. No automatic retry or replacement order.'});return 'unknown';
  }
 }
}
