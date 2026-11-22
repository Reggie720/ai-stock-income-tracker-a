import {coinbaseConfig,runCoinbaseRead} from './coinbase-reader.js';
import {portfolioBinding} from './trading-engine.js';
const uuid=s=>typeof s==='string'&&/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(s);
const decimal=s=>typeof s==='string'&&/^(0|[1-9]\d{0,12})(\.\d{1,18})?$/.test(s);
// Owner-selected terms. They are not activated trading permission.
export const tradingTerms=Object.freeze({currency:'USD',totalBudget:'25.00',stopNewBuysAtLoss:'10.00',
  savingsThreshold:'200.00',savingsPercentage:50,proposedProducts:['SGOV-USD','JEPI-USD','DIVO-USD','O-USD']});
const base=()=>({terms:tradingTerms,automaticTrading:false,ordersEnabled:false,
  engineInstalled:true,stockApproval:'not_verified',stockPreviewSupported:false,
  canView:null,canTrade:null,spendableUsd:null,connectionVerified:false,checkedAt:null,blockers:[]});

export function createTradingReadiness({env=process.env,runner=runCoinbaseRead,now=Date.now}={}){
 let pending=null,cached=null,at=0;
 return async function check(){
  if(cached&&now()-at<60000)return cached;
  if(pending)return pending;
  pending=(async()=>{
   const r=base(),cfg=coinbaseConfig(env);
   const block=(code,message)=>r.blockers.push({code,message});
   if(cfg.missing||cfg.error){block('key_configuration',cfg.error||'Configure the tracker’s own Coinbase server key.');return r;}
   try{
    const list=await runner(['portfolios','list'],cfg);
    if(list.error||!Array.isArray(list.portfolios))throw Error();
    const all=list.portfolios.filter(p=>p.deleted!==true&&uuid(p.uuid));
    const selected=cfg.portfolio?all.find(p=>p.uuid===cfg.portfolio):all.length===1?all[0]:null;
    if(!selected){block('portfolio_selection','Select one intended portfolio for the tracker.');return r;}
    r.connectionVerified=true;r.checkedAt=new Date(now()).toISOString();r.portfolioBinding=portfolioBinding(selected.uuid);r.portfolioName=typeof selected.name==='string'?selected.name.slice(0,100):'Selected account';r.portfolioSuffix=selected.uuid.slice(-6);
    try{
     const permissions=await runner(['api-key','permissions'],cfg);
     if(permissions.error||permissions.portfolio_uuid!==selected.uuid||typeof permissions.can_view!=='boolean'||typeof permissions.can_trade!=='boolean')throw Error();
     r.canView=permissions.can_view;r.canTrade=permissions.can_trade;
     if(!r.canView)block('view_permission','The tracker key does not have View permission.');
     if(!r.canTrade)block('trade_permission','The tracker key is View only. Trading requires Trade permission; Transfer is not required for this setup.');
    }catch{block('permissions_unverified','Coinbase key permissions could not be verified. Read access does not prove trading access.');}
    try{
     let cursor=null,complete=false;const seen=new Set(),usd=[];
     for(let page=0;page<5;page++){
      const args=['balance',`portfolio_id==${selected.uuid}`,'show_zero==true'];if(cursor)args.push(`cursor==${cursor}`);
      const balance=await runner(args,cfg);
      if(balance.error||balance.portfolio_id!==selected.uuid||!Array.isArray(balance.accounts))throw Error();
      for(const a of balance.accounts)if(a.currency==='USD')usd.push(a);
      if(balance.has_next===false||(balance.has_next==null&&!balance.cursor)){complete=true;break;}
      if(balance.has_next!==true||typeof balance.cursor!=='string'||!/^[A-Za-z0-9_=.-]{1,1024}$/.test(balance.cursor)||seen.has(balance.cursor))throw Error();
      seen.add(balance.cursor);cursor=balance.cursor;
     }
     // Multiple USD accounts cannot safely be assumed additive or interchangeable.
     if(!complete||usd.length!==1)throw Error();
     const a=usd[0];if(a.ready!==true||a.active!==true||a.available_balance?.currency!=='USD'||!decimal(a.available_balance.value))throw Error();
     r.spendableUsd=a.available_balance.value;
     const [whole,frac='']=r.spendableUsd.split('.');
     const value=BigInt(whole)*10n**18n+BigInt(frac.padEnd(18,'0'));
     if(value===0n)block('no_usd','No spendable USD is available for stock purchases. Existing crypto will not be sold automatically.');
     else if(value<25n*10n**18n)block('below_budget','Available USD is below the selected $25 budget.');
    }catch{block('usd_unverified','Spendable USD could not be verified for this portfolio. Cash equivalents and staked holdings are not substituted.');}
   }catch{block('connection_unverified','The tracker’s selected Coinbase portfolio could not be verified.');}
   block('stock_approval_unverified','Stock account eligibility has not been established by balance or product lookup.');
   r.warnings=['Stock previews are unavailable. The proposed market-order plan requires explicit acceptance of execution-price risk and runtime fee verification.'];
   r.engineInstalled=true;
   block('strategy_review_required','Review and accept the proposed $1-entry, 5% gain/loss exit plan before starting.');
   return r;
  })();
  try{cached=await pending;at=now();return cached;}finally{pending=null;}
 };
}
