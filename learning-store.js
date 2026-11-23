import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonical} from './engine-store.js';
import {emptyLab,validateLab} from './learning-lab.js';
export function createLearningStore(config,{key=()=>process.env.COINBASE_LEDGER_SIGNING_KEY,request=fetch}={}){
 const settings=()=>{const c=config();if(!c)throw Error('Persistent learning storage unavailable');return c;};
 const sign=(version,data)=>{const secret=key();if(typeof secret!=='string'||secret.length<32)throw Error('Learning integrity setup unavailable');return createHmac('sha256',secret).update('learning-lab\n'+version+'\n'+canonical(data)).digest('hex');};
 async function call(url,options={}){const c=settings(),r=await request(url,{...options,headers:{apikey:c.key,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Learning storage unavailable');return r.json();}
 return {async read(){const c=settings(),rows=await call(c.url.replace(/stock_tracker_state$/,'stock_tracker_learning_lab')+'?id=eq.main&select=version,data');if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0].version))throw Error('Learning memory not initialized');const {integrity,...data}=rows[0].data;validateLab(data);if(!(rows[0].version===0&&integrity===undefined&&canonical(data)===canonical(emptyLab()))){if(typeof integrity!=='string'||!/^[a-f0-9]{64}$/.test(integrity)||!timingSafeEqual(Buffer.from(integrity,'hex'),Buffer.from(sign(rows[0].version,data),'hex')))throw Error('Learning integrity check failed');}return {version:rows[0].version,data};},
 async cas(version,data){validateLab(data);const c=settings();return await call(c.url.replace(/stock_tracker_state$/,'rpc/stock_tracker_learning_cas'),{method:'POST',body:JSON.stringify({expected:version,next_data:{...data,integrity:sign(version+1,data)}})})===true;}};
}
