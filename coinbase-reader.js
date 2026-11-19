import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const execute=promisify(execFile),require=createRequire(import.meta.url);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const decimal=v=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)?v:null;
const base={provider:'Coinbase',mode:'read-only',liveOrdersEnabled:false,automaticTrading:false,stockApproval:'not_verified'};
function config(env){
 let keyId=env.COINBASE_KEY_ID||'',secret=env.COINBASE_KEY_SECRET||'';
 if(env.COINBASE_API_KEY_JSON){
  try{const v=JSON.parse(env.COINBASE_API_KEY_JSON);keyId=v.name??v.id;secret=v.privateKey??v.secret;}catch{return {error:'The Coinbase server key JSON is invalid. Replace it in Render Environment.'};}
 }
 if(!keyId&&!secret)return {missing:true};
 if(typeof keyId!=='string'||typeof secret!=='string'||keyId.length<3||keyId.length>512||/[\r\n]/.test(keyId)||secret.length<32||secret.length>16384)return {error:'The Coinbase server key is incomplete or invalid. Check its ID and private key in Render Environment.'};
 const portfolio=env.COINBASE_PORTFOLIO_ID;
 if(portfolio&&!uuid.test(portfolio))return {error:'Select the intended Coinbase portfolio in the server configuration before connecting.'};
 return {keyId,secret:secret.replace(/\\n/g,'\n'),portfolio};
}
// Only fixed read commands reach the official CLI. No shell, credentials in argv, writes or request history.
async function runCli(args,cfg){
 const cli=path.join(path.dirname(require.resolve('@coinbase/coinbase-cli/package.json')),'dist','index.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tracker-coinbase-read-'));
 try{
  const {stdout}=await execute(process.execPath,[cli,...args],{timeout:20000,maxBuffer:2097152,windowsHide:true,env:{PATH:process.env.PATH||'',CI:'1',COINBASE_CONFIG_DIR:dir,COINBASE_ENV:'live',COINBASE_KEY_ID:cfg.keyId,COINBASE_KEY_SECRET:cfg.secret,COINBASE_NO_HISTORY:'1',COINBASE_NO_UPDATE_CHECK:'1'}});
  return JSON.parse(stdout);
 }catch(error){
  // Provider errors can contain request details. Return only an allowlisted category.
  const output=String(error.stderr||'');
  const kind=/\b401\b|UNAUTHENTICATED|invalid.*(?:key|jwt)/i.test(output)?'AUTH':/\b403\b|PERMISSION_DENIED|scope/i.test(output)?'PERMISSION':error.killed||error.code==='ETIMEDOUT'?'TIMEOUT':'UNAVAILABLE';
  const safe=Error(kind);safe.kind=kind;throw safe;
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
export function createCoinbaseReader({env=process.env,runner=runCli,now=Date.now}={}){
 let cached=null,cachedAt=0,inflight=null;
 return async function status(){
  const cfg=config(env);
  if(cfg.missing)return {...base,configured:false,connected:false,status:'setup_required',message:'Your tracker needs its own Coinbase server key. The ChatGPT plugin does not supply it.'};
  if(cfg.error)return {...base,configured:false,connected:false,status:'configuration_error',message:cfg.error};
  if(cached&&now()-cachedAt<60000)return cached;
  if(inflight)return inflight;
  inflight=(async()=>{
   try{
    const listing=await runner(['portfolios','list'],cfg);
    if(listing.error||!Array.isArray(listing.portfolios))throw Error('Invalid portfolio response');
    const accessible=listing.portfolios.filter(p=>p.deleted!==true&&uuid.test(p.uuid||''));
    const selected=cfg.portfolio?accessible.find(p=>p.uuid===cfg.portfolio):accessible.length===1?accessible[0]:null;
    if(!cfg.portfolio&&accessible.length!==1)return {...base,configured:true,connected:false,status:'portfolio_selection_required',message:'This key exposes multiple or no portfolios. Scope it to one intended account, or set COINBASE_PORTFOLIO_ID in Render Environment.'};
    if(!selected)return {...base,configured:true,connected:false,status:'portfolio_not_authorized',message:'This key cannot access the selected portfolio. Check its Accounts scope; no other portfolio was selected.'};
    const details=await runner(['portfolios','get',selected.uuid,'currency==USD'],cfg);
    if(details.error||details.portfolio?.uuid!==selected.uuid||!details.portfolio_balances)throw Error('Invalid portfolio response');
    const balances=details.portfolio_balances;
    const money=key=>balances[key]?.currency==='USD'?decimal(balances[key].value):null;
    return {...base,configured:true,connected:true,status:'connected_read_only',checkedAt:new Date(now()).toISOString(),portfolioName:typeof selected.name==='string'?selected.name.slice(0,100):'Selected portfolio',totals:{currency:'USD',total:money('total_balance'),crypto:money('total_crypto_balance'),cashEquivalent:money('total_cash_equivalent_balance'),stocks:money('total_equities_balance')},message:'Direct tracker connection verified. Values include holdings that may be staked or unavailable to trade. Cash equivalents are not a confirmed USD buying balance. Stock approval is not established by these balances.'};
   }catch(error){
    const messages={AUTH:'Coinbase rejected the server key. Check or replace it in Render Environment.',PERMISSION:'Coinbase denied read access. Check the selected key and portfolio permissions.',TIMEOUT:'Coinbase did not respond in time. Retry later; no order was sent.'};
    return {...base,configured:true,connected:false,status:'verification_failed',message:messages[error.kind]||'Coinbase account verification is unavailable. No order was sent.'};
   }
  })();
  try{cached=await inflight;cachedAt=now();return cached;}finally{inflight=null;}
 };
}
