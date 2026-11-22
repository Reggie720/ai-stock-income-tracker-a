import {createHmac,timingSafeEqual} from 'node:crypto';
import {validateEngine,emptyEngine} from './trading-engine.js';
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function createEngineStore(config,{key=()=>process.env.COINBASE_LEDGER_SIGNING_KEY}={}){
 const sign=(version,data)=>{const secret=key();if(typeof secret!=='string'||secret.length<32)throw Error('Trading integrity setup is incomplete');return createHmac('sha256',secret).update(String(version)+'\n'+canonical(data)).digest('hex');};
 const settings=()=>{const c=config();if(!c)throw Error('Durable server storage is required for live trading');return c;};
 async function request(url,options={}){const c=settings();let r;try{r=await fetch(url,{...options,headers:{apikey:c.key,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Trading storage unavailable; no local fallback');}if(!r.ok)throw Error('Trading storage could not confirm the operation');return r.json();}
 return {
  async read(){const c=settings(),rows=await request(c.url.replace(/stock_tracker_state$/,'stock_tracker_live_engine')+'?id=eq.main&select=version,data');if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0].version))throw Error('Trading ledger is not initialized');
   const {integrity,...data}=rows[0].data;validateEngine(data);
   const bootstrap=rows[0].version===0&&integrity===undefined&&canonical(data)===canonical(emptyEngine());
   if(!bootstrap){if(typeof integrity!=='string'||!/^[a-f0-9]{64}$/.test(integrity)||!timingSafeEqual(Buffer.from(integrity,'hex'),Buffer.from(sign(rows[0].version,data),'hex')))throw Error('Trading ledger integrity check failed; orders are blocked');}
   return {version:rows[0].version,data};
  },
  async cas(version,data){validateEngine(data);const c=settings(),signed={...data,integrity:sign(version+1,data)};const r=await request(c.url.replace(/stock_tracker_state$/,'rpc/stock_tracker_engine_cas'),{method:'POST',body:JSON.stringify({expected:version,next_data:signed})});if(typeof r!=='boolean')throw Error('Trading ledger did not confirm reservation');return r;}
 };
}
