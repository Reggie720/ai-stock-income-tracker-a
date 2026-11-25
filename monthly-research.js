import {COMPANIES,RESEARCH_SYMBOLS} from './company-research.js';
export function monthlyPlan(value={mode:'research_only',monthlyAmount:'0.00',symbols:[],horizonMonths:12}){
 if(!value||value.mode!=='research_only'||value.tradeEnabled===true||typeof value.monthlyAmount!=='string'||!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(value.monthlyAmount)||!Array.isArray(value.symbols)||value.symbols.length>12||value.symbols.some(s=>!RESEARCH_SYMBOLS.includes(s))||![12,36,60].includes(value.horizonMonths))throw Error('Invalid monthly research draft');
 const [a,b='']=value.monthlyAmount.split('.'),cents=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(cents>1000000n)throw Error('Monthly illustration limit is $10,000');
 return {mode:'research_only',tradeEnabled:false,monthlyAmount:(Number(cents)/100).toFixed(2),symbols:[...new Set(value.symbols)],horizonMonths:value.horizonMonths,contributionsOnly:(Number(cents*BigInt(value.horizonMonths))/100).toFixed(2)};
}
export function monthlyResearch(rows,now=Date.now()){
 const target=now-28*86400000;
 return COMPANIES.map(company=>{
  const quotes=rows.filter(r=>r.symbol===company.symbol&&Number.isFinite(Number(r.price))&&Number(r.price)>0&&Number.isFinite(Date.parse(r.quote_at))&&Date.parse(r.quote_at)<=now).sort((a,b)=>Date.parse(a.quote_at)-Date.parse(b.quote_at));
  const latest=quotes.at(-1),base=quotes.filter(r=>Date.parse(r.quote_at)<=target).at(-1),usable=latest&&base&&Date.parse(latest.quote_at)>target&&now-Date.parse(latest.quote_at)<=7*86400000&&target-Date.parse(base.quote_at)<=7*86400000;
  return {...company,sampledDays:new Set(quotes.map(r=>r.session_date)).size,latest:latest?{price:String(latest.price),at:latest.quote_at}:null,monthlyPriceReturnPercent:usable?100*(Number(latest.price)/Number(base.price)-1):null,comparisonFrom:usable?base.quote_at:null,status:usable?'Observed price change; excludes dividends, fees and taxes':'Collecting daily observations; a one-month comparison is not available yet'};
 });
}
