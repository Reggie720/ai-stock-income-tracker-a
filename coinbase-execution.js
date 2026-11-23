import {createHash} from 'node:crypto';
import {coinbaseConfig,executeCoinbaseCommand} from './coinbase-reader.js';
import {PLAN,PLAN_VERSION,units,session} from './trading-engine.js';
const uuid=s=>typeof s==='string'&&/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(s);
export class NoOrderSent extends Error{constructor(message){super(message);this.noOrderSent=true;}}
export function createFeeScheduleVerifier({request=fetch,now=Date.now}={}){
 let checkedAt=0,valid=false,last=null;
 async function inspectSource(source){
  try{
   const r=await request(source,{redirect:'error',headers:{Accept:'text/html','User-Agent':'StockTracker/1.0 (public fee disclosure check)'},signal:AbortSignal.timeout(15000)});
   if(!r.ok)return last={verified:false,source,httpStatus:r.status,reason:'source_unavailable'};
   const html=await r.text();if(html.length>3000000)return last={verified:false,source,httpStatus:r.status,reason:'source_too_large'};
   const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160|#x[aA]0);/g,' ').replace(/\s+/g,' ').toLowerCase();
   const commissions=text.includes('does not charge commission or fees for stock trades in your ccm brokerage account');
   const regulatory=text.includes('we do not currently charge regulatory fees.')||(source==='https://help.coinbase.com/en/trading-and-funding/pricing-and-fees/stock-pricing-fees'&&text.includes('while coinbase capital markets (ccm) does not charge commission or fees for stock trades in your ccm brokerage account, there are fees for certain services that ccm’s clearing firm and your stock custodian provide.'));
   return last={verified:commissions&&regulatory,source,httpStatus:r.status,commissions,regulatory,reason:commissions&&regulatory?'verified':'disclosure_not_verified'};
  }catch(e){return last={verified:false,source,reason:'source_request_failed',errorType:e?.name==='TimeoutError'?'timeout':'network_or_redirect'};}
 }
 async function inspect(){
  let proof=await inspectSource('https://www.coinbase.com/stocks');
  if(proof.reason==='source_request_failed'||proof.httpStatus>=500)proof=await inspectSource('https://www.coinbase.com/stocks');
  // Fixed official help source is permitted only when the main source is unavailable.
  // Missing or changed fee language is never bypassed using another source.
  if(['source_unavailable','source_request_failed'].includes(proof.reason))proof=await inspectSource('https://help.coinbase.com/en/trading-and-funding/pricing-and-fees/stock-pricing-fees');
  if(['source_unavailable','source_request_failed'].includes(proof.reason)){
   // Official schedule linked by Coinbase's stocks page, reviewed Nov 23 2026.
   // Pin the reviewed document: changed bytes are not silently interpreted as zero fees.
   const source='https://images.ctfassets.net/o10es7wu5gm1/15gaaAIKknqZUL2LQVQ5sN/7b369aefcc0bb423fb88cd7c258119b3/CCM_Fee_Schedule.pdf';
   try{
    const r=await request(source,{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)return {verified:false,source,httpStatus:r.status,reason:'source_unavailable'};
    const bytes=Buffer.from(await r.arrayBuffer());
    const verified=bytes.length<1000000&&createHash('sha256').update(bytes).digest('hex')==='c3a4e390d786113208d773082dd1db13f0134fae9acb45487ab47583f8ef1ab3';
    return {verified,source,httpStatus:r.status,reason:verified?'reviewed_official_schedule_verified':'schedule_changed_or_unverified'};
   }catch{return {verified:false,source,reason:'source_request_failed'};}
  }
  return proof;
 }
 async function verify(){
  if(valid&&now()-checkedAt<86400000)return true;
  valid=false;const proof=await inspect();
  valid=proof.verified===true;checkedAt=now();return valid;
 }
 verify.inspect=inspect;
 return verify;
}
export function createExecutionBroker({env=process.env,run=executeCoinbaseCommand,now=Date.now,verifyFeeSchedule=createFeeScheduleVerifier({now})}={}){
 const cfg=()=>{const c=coinbaseConfig(env);if(c.error||c.missing)throw new NoOrderSent('The tracker key is missing or invalid');return c;};
 async function account(){
  const c=cfg(),list=await run(['portfolios','list'],c);if(!Array.isArray(list.portfolios))throw new NoOrderSent('Portfolio check unavailable');
  const all=list.portfolios.filter(p=>p.deleted!==true&&uuid(p.uuid)),p=c.portfolio?all.find(p=>p.uuid===c.portfolio):all.length===1?all[0]:null;
  if(!p)throw new NoOrderSent('Select one explicit authorized portfolio');
  const permission=await run(['api-key','permissions'],c);
  if(permission.portfolio_uuid!==p.uuid||permission.can_view!==true||typeof permission.can_trade!=='boolean')throw new NoOrderSent('Key scope or View permission unverified');
  let cursor=null;const seen=new Set(),usd=[];
  for(let i=0;i<5;i++){
   const args=['balance',`portfolio_id==${p.uuid}`,'show_zero==true'];if(cursor)args.push(`cursor==${cursor}`);
   const b=await run(args,c);if(b.portfolio_id!==p.uuid||!Array.isArray(b.accounts))throw new NoOrderSent('Balance scope unverified');
   usd.push(...b.accounts.filter(a=>a.currency==='USD'));
   if(b.has_next===false||(b.has_next==null&&!b.cursor)){
    if(usd.length!==1||usd[0].active!==true||usd[0].ready!==true||usd[0].available_balance?.currency!=='USD')throw new NoOrderSent('One ready USD account is required');
    units(usd[0].available_balance.value);return {portfolioId:p.uuid,canTrade:permission.can_trade,spendableUsd:usd[0].available_balance.value};
   }
   if(typeof b.cursor!=='string'||!/^[A-Za-z0-9_=.+/-]{1,1024}$/.test(b.cursor)||seen.has(b.cursor))throw new NoOrderSent('Incomplete balance pagination');seen.add(b.cursor);cursor=b.cursor;
  }
  throw new NoOrderSent('Incomplete balance pagination');
 }
 async function submit(order){
  // All validation here occurs before the sole financial request below.
  try{
   if(!uuid(order.clientOrderId)||!uuid(order.portfolioId)||!PLAN.products.includes(order.productId)||!['BUY','SELL'].includes(order.side)||order.approval?.version!==PLAN_VERSION||!order.approval.products?.includes(order.productId)||order.approval.equityAccountConfirmed!==true||order.approval.settledFundsConfirmed!==true||order.approval.marketOrderAccepted!==true)throw new NoOrderSent('Approved plan or order identity missing');
   const time=session(now());if(!time.open)throw new NoOrderSent('Verified regular trading window is closed');
   if(await verifyFeeSchedule()!==true)throw new NoOrderSent('Current zero stock-trade fees could not be verified from Coinbase disclosures');
   const a=await account();if(!a.canTrade||a.portfolioId!==order.portfolioId)throw new NoOrderSent('Trade permission or portfolio changed');
   const c=cfg(),product=await run(['products','get',order.productId],c);
   if(product.product_id!==order.productId||product.product_type!=='EQUITY'||product.quote_currency_id!=='USD'||units(product.base_increment)<=0n||product.trading_disabled===true||product.cancel_only===true||product.status&&String(product.status).toLowerCase()!=='online')throw new NoOrderSent('Stock product is unavailable');
   const fees=await run(['fees','product_type==EQUITY'],c);
   if(units(fees.fee_tier?.maker_fee_rate)!==0n||units(fees.fee_tier?.taker_fee_rate)!==0n||fees.has_cost_plus_commission===true)throw new NoOrderSent('Zero stock commission could not be verified');
   const portfolio=await run(['portfolios','get',order.portfolioId,'currency==USD'],c);
   if(portfolio.portfolio?.uuid!==order.portfolioId||!Array.isArray(portfolio.equity_positions)||portfolio.equity_positions.some(p=>typeof p.asset!=='string'))throw new NoOrderSent('Stock position identity could not be verified');
   const symbol=order.productId.replace(/-USD$/,''),positions=portfolio.equity_positions.filter(p=>p.asset===symbol);
   // Portfolio equity amounts can be numeric/rounded. Use them only as a
   // conservative account guard; SELL size always comes from exact fill strings.
   const quantityField=v=>{if(typeof v==='string')return units(v);if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9){const s=String(v);if(/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(s)&&s.replace('.','').replace(/^0+/,'').length<=15)return units(s);}if(v&&v.currency===symbol)return units(v.value);throw new NoOrderSent('Stock quantity is unavailable');};
   if(order.side==='BUY'){
    if(typeof order.protectedReserveCents!=='string'||!/^\d{1,16}$/.test(order.protectedReserveCents))throw new NoOrderSent('Savings reserve could not be verified');
    const protectedCash=BigInt(order.protectedReserveCents)*10n**16n;
    if(order.quoteCents!=='100'||units(a.spendableUsd)<units('1')+protectedCash||units(product.quote_min_size)>units('1')||units(product.base_increment)>=units('1'))throw new NoOrderSent('Fractional $1 purchase is unavailable without spending reserved cash');
    if(positions.length>1||positions.some(p=>quantityField(p.total_balance_equity)>0n))throw new NoOrderSent('Existing non-bot stock holdings prevent a separate bot position in this stock');
   }else{
    const quantity=units(order.quantity);if(quantity<=0n||quantity<units(product.base_min_size)||quantity%units(product.base_increment)!==0n)throw new NoOrderSent('Sell size violates stock increments');
    if(positions.length!==1||quantityField(positions[0].available_to_trade_equity)<quantity||quantityField(positions[0].total_balance_equity)!==quantity)throw new NoOrderSent('Broker stock quantity differs from the bot-owned position; manual trades require reconciliation');
   }
  }catch(e){if(e.noOrderSent)throw e;throw new NoOrderSent('Preflight data could not be verified; no order sent');}
  const quoteAt=Date.parse(order.signalQuoteAt);
  if(!session(now()).open||!Number.isFinite(quoteAt)||quoteAt>now()||now()-quoteAt>300000)throw new NoOrderSent('The market session or sampled quote expired before submission');
  const args=['orders','create',`product_id=${order.productId}`,`side=${order.side}`,'type=market',
   order.side==='BUY'?'quote_size=1.00':`base_size=${order.quantity}`,`portfolio_id=${order.portfolioId}`,
   `client_order_id=${order.clientOrderId}`,'equity_trading_session=NORMAL','time_in_force=IOC'];
  // No retry, shell, arbitrary products, margin, transfer, crypto or withdrawals.
  return run(args,cfg());
 }
 async function get(orderId,portfolioId){if(typeof orderId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9-]{4,99}$/.test(orderId)||!uuid(portfolioId))throw Error('Invalid order identity');const a=await account();if(a.portfolioId!==portfolioId)throw Error('Portfolio changed');return run(['orders','get',orderId,'product_type==EQUITY'],cfg());}
 return {account,submit,get};
}
