import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA = path.join(root, 'data', 'store.json');
const defaults = { budget: 25, watchlist: ['SGOV','JEPI','DIVO','O'], holdings: [], predictions: [], researchHistory: [] };
const validSymbol = s => typeof s === 'string' && /^[A-Z][A-Z0-9.\-]{0,11}$/.test(s);
const send = (res,status,obj) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
async function load(){try{return {...defaults,...JSON.parse(await fs.readFile(DATA,'utf8'))};}catch{return structuredClone(defaults);}}
async function save(x){await fs.mkdir(path.dirname(DATA),{recursive:true});await fs.writeFile(DATA+'.tmp',JSON.stringify(x,null,2));await fs.rename(DATA+'.tmp',DATA);}
async function body(req){let text='';for await(const c of req){text+=c;if(text.length>12000)throw Error('Request too large');}return JSON.parse(text||'{}');}
async function quote(symbol){
 if(!process.env.FINNHUB_API_KEY)throw Error('FINNHUB_API_KEY not configured');
 const u='https://finnhub.io/api/v1/quote?symbol='+encodeURIComponent(symbol)+'&token='+encodeURIComponent(process.env.FINNHUB_API_KEY);
 const r=await fetch(u,{signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Quote provider HTTP '+r.status);
 const d=await r.json();if(!Number.isFinite(d.c)||d.c<=0)throw Error('No valid quote for '+symbol);
 return {symbol,price:d.c,change:d.d,changePercent:d.dp,previousClose:d.pc,asOf:d.t?new Date(d.t*1000).toISOString():null,source:'Finnhub quote API',delayedOrRealTime:'Depends on provider and exchange entitlements'};
}
async function aiResearch(question,symbols){
 if(!process.env.GROQ_API_KEY)throw Error('GROQ_API_KEY not configured');
 const quotes=[],errors=[];
 for(const s of symbols.slice(0,5)){try{quotes.push(await quote(s));}catch(e){errors.push(`${s}: ${e.message}`);}}
 const context={quotes,quoteErrors:errors,disclaimer:'Quotes may be delayed. No dividend history, fundamentals, or news feeds are provided by this service. Do not invent any.'};
 const prompt='You are an educational stock research assistant. Use ONLY the provided verified quote data for current numeric claims. If data is missing, say unavailable. Never fabricate dividend amounts, yields, news, sources, forecasts, probability, confidence percentages, or trading signals. No personalized financial advice. Clearly distinguish general knowledge from sourced live data. Explain downside risk and that a $25 budget may need fractional shares. Do not claim you can execute trades. Give practical concise analysis.';
 const model=process.env.GROQ_MODEL||'llama-3.3-70b-versatile';
 const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({model,temperature:0.2,max_tokens:1100,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({question,context})}]}),
  signal:AbortSignal.timeout(25000)
 });
 if(!r.ok){
  let detail='';try{const errorBody=await r.json();detail=String(errorBody?.error?.message||errorBody?.message||'').slice(0,350);}catch{}
  // Never echo provider headers, tokens, or raw request data.
  throw Error(`Groq HTTP ${r.status}${detail?': '+detail:''} (model: ${model})`);
 }
 const j=await r.json();const answer=j.choices?.[0]?.message?.content;
 if(!answer)throw Error('AI returned no answer');
 return {answer,quotes,quoteErrors:errors,source:quotes.length?'Finnhub quote API':'No live market data available',generatedAt:new Date().toISOString(),warning:'AI-generated educational analysis; verify independently. No guaranteed returns.'};
}
const limits=new Map();function rate(req){const ip=req.socket.remoteAddress||'local',now=Date.now(),arr=(limits.get(ip)||[]).filter(x=>now-x<60000);if(arr.length>=25)return false;arr.push(now);limits.set(ip,arr);return true;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  if(!rate(req))return send(res,429,{error:'Too many requests; retry in a minute'});
  if(url.pathname==='/api/status')return send(res,200,{ok:true,ai:!!process.env.GROQ_API_KEY,quotes:!!process.env.FINNHUB_API_KEY,mode:'local single-user; not publicly authenticated'});
  if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,await load());
  if(url.pathname==='/api/state'&&req.method==='POST'){
   const b=await body(req),d=await load();
   if(typeof b.budget==='number'&&b.budget>=0&&b.budget<=100000000)d.budget=b.budget;
   if(Array.isArray(b.watchlist)&&b.watchlist.length<=40&&b.watchlist.every(validSymbol))d.watchlist=[...new Set(b.watchlist)];
   if(Array.isArray(b.holdings)&&b.holdings.length<=100&&b.holdings.every(x=>validSymbol(x.symbol)&&Number.isFinite(x.shares)&&x.shares>=0&&Number.isFinite(x.cost)&&x.cost>=0))d.holdings=b.holdings.map(x=>({symbol:x.symbol,shares:x.shares,cost:x.cost}));
   if(Array.isArray(b.predictions)&&b.predictions.length<=100)d.predictions=b.predictions.filter(x=>validSymbol(x.symbol)&&['BUY','WAIT','SELL'].includes(x.signal)).map(x=>({symbol:x.symbol,signal:x.signal,note:String(x.note||'').slice(0,500),date:String(x.date||'').slice(0,40)}));
   await save(d);return send(res,200,d);
  }
  if(url.pathname==='/api/quote'&&req.method==='GET'){const s=(url.searchParams.get('symbol')||'').toUpperCase();if(!validSymbol(s))return send(res,400,{error:'Invalid ticker'});return send(res,200,await quote(s));}
  if(url.pathname==='/api/research'&&req.method==='POST'){
   const b=await body(req),question=String(b.question||'').trim();
   if(question.length<5||question.length>1500)return send(res,400,{error:'Question must be 5–1500 characters'});
   const symbols=(Array.isArray(b.symbols)?b.symbols:[]).map(s=>String(s).toUpperCase()).filter(validSymbol).slice(0,5);
   const result=await aiResearch(question,symbols),d=await load();
   d.researchHistory=[{question,date:result.generatedAt,answer:result.answer},...d.researchHistory].slice(0,30);
   await save(d);return send(res,200,result);
  }
  return send(res,404,{error:'Unknown endpoint'});
 }
 if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
 let f=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(f.includes('..')||f.includes('\\'))return send(res,403,{error:'Forbidden'});
 const target=path.join(root,'public',f),content=await fs.readFile(target);
 res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(content);
 }catch(e){send(res,e.code==='ENOENT'?404:503,{error:e.message||'Service unavailable'});}});
server.listen(PORT,HOST,()=>console.log(`AI Stock Income running at http://${HOST}:${PORT}`));
