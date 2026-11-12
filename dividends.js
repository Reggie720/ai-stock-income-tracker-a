// Documented free API: https://smarterdividends.com/dividend-api
// Cache individual lookups and attribute every displayed record.
const DAY=86400000;
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
const amount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const issuerUrls={
 SGOV:'https://www.ishares.com/us/products/314116/ishares-0-3-month-treasury-bond-etf',
 JEPI:'https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-equity-premium-income-etf-46641q332',
 DIVO:'https://amplifyetfs.com/divo/',
 O:'https://www.realtyincome.com/investors'
};
export function normalizeDividend(data,symbol,now=Date.now()){
 if(data?.symbol!==symbol||!data.dividend||typeof data.dividend!=='object')throw Error('Dividend provider returned an invalid ticker record');
 const asOf=isoDate(data.as_of),today=new Date(now).toISOString().slice(0,10);
 if(!asOf||asOf>today)throw Error('Dividend provider returned an invalid as-of date');
 if(data.currency&&data.currency!=='USD')throw Error('Dividend currency is not supported');
 const stale=now-Date.parse(asOf)>7*DAY,dividend=data.dividend,last=dividend.last_payment;
 const future=value=>{const date=isoDate(value);return !stale&&date&&date>=today?date:null;};
 const lastEx=isoDate(last?.ex_date),lastPay=isoDate(last?.pay_date);
 const frequency=['monthly','quarterly','semiannual','annual','weekly','irregular'].includes(dividend.frequency)?dividend.frequency:null;
 return {symbol,name:typeof data.name==='string'?data.name.slice(0,150):symbol,
  securityType:['etf','stock','fund'].includes(data.type)?data.type:null,
  asOf,retrievedAt:new Date(now).toISOString(),stale,
  source:'SmarterDividends',sourceUrl:'https://smarterdividends.com/stocks/'+encodeURIComponent(symbol),issuerUrl:issuerUrls[symbol]||null,
  frequency:stale?null:frequency,annualAmount:stale?null:amount(dividend.annual_amount),
  forwardYield:stale?null:amount(dividend.forward_yield),
  nextExDate:future(dividend.next_ex_date),nextPayDate:future(dividend.next_pay_date),
  lastRecorded:last&&lastEx&&lastEx<=today&&amount(last.amount)!==null?{amount:last.amount,exDate:lastEx,payDate:lastPay}:null,
  variable:typeof dividend.variable_distribution==='boolean'?dividend.variable_distribution:null,
  warning:'Provider-reported data may lag issuer announcements or contain errors. A recorded distribution is not necessarily the latest. Future dates are provider-reported, not independently confirmed.'};
}
export function createDividendLookup(fetchImpl=fetch,clock=Date.now){
 const cache=new Map(),pending=new Map();let calls=[];
 return async function lookup(symbol){
  if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol))throw Error('Invalid ticker');
  const now=clock(),cached=cache.get(symbol);
  if(cached&&cached.until>now){if(cached.error)throw Error(cached.error);return structuredClone(cached.value);}
  if(pending.has(symbol))return structuredClone(await pending.get(symbol));
  calls=calls.filter(time=>now-time<60000);
  if(calls.length>=55)throw Error('Dividend lookup limit reached; retry in a minute');
  calls.push(now);
  const request=(async()=>{
   try{
    const response=await fetchImpl('https://smarterdividends.com/api/v1/stocks/'+encodeURIComponent(symbol),{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('Dividend provider HTTP '+response.status);
    const value=normalizeDividend(await response.json(),symbol,clock());
    if(cache.size>=200)cache.delete(cache.keys().next().value);
    cache.set(symbol,{value,until:clock()+3600000});return value;
   }catch(error){cache.set(symbol,{error:error.message||'Dividend data unavailable',until:clock()+60000});throw error;}
  })();
  pending.set(symbol,request);
  try{return structuredClone(await request);}finally{pending.delete(symbol);}
 };
}
export const dividendProfile=createDividendLookup();
export function dividendReportLines(profile,quote,budget){
 if(!profile)return ['Dividend data: Unavailable (provider did not return a usable record)','Estimated monthly income: Unavailable'];
 const dollars=value=>'$'+value.toFixed(6).replace(/0+$/,'').replace(/\.$/,''),p=profile;
 const lines=['Name: '+p.name,'Provider security type: '+(p.securityType||'Unavailable'),
  'Dividend source: '+p.source+' | '+p.sourceUrl,'Provider as of: '+p.asOf+(p.stale?' (stale: current rates and future dates withheld)':''),
  'Provider-reported frequency: '+(p.frequency||'Unavailable')];
 if(p.lastRecorded)lines.push('Recorded distribution per share: '+dollars(p.lastRecorded.amount)+' USD',
  'Recorded ex-dividend date: '+p.lastRecorded.exDate,
  'Recorded payment date: '+(p.lastRecorded.payDate||'Unavailable')+(p.lastRecorded.payDate&&p.lastRecorded.payDate>new Date().toISOString().slice(0,10)?' (upcoming in this record)':''));
 else lines.push('Recorded distribution amount and dates: Unavailable');
 lines.push('Next ex-dividend date (provider-reported): '+(p.nextExDate||'Unavailable / not reported'),
  'Next payment date (provider-reported): '+(p.nextPayDate||'Unavailable / not reported'),
  'Provider annualized dividend/share: '+(p.annualAmount!==null?dollars(p.annualAmount)+' USD':'Unavailable'),
  'Provider forward yield: '+(p.forwardYield!==null?(p.forwardYield*100).toFixed(2)+'%':'Unavailable'));
 if(quote&&p.annualAmount!==null){
  const shares=budget/quote.price,monthly=shares*p.annualAmount/12;
  lines.push('Rate-based monthly average for saved budget $'+budget.toFixed(2)+': $'+monthly.toFixed(4),
   'Formula: (budget / quoted price) x provider annualized dividend/share / 12. This is an illustration before fees and taxes, not a predicted payment.');
 }else lines.push('Rate-based monthly average: Unavailable (needs a valid quote and non-stale annual amount)');
 lines.push('Amounts may vary; returns and distributions are not guaranteed.',p.warning);
 if(p.issuerUrl)lines.push('Check issuer announcements: '+p.issuerUrl);
 return lines;
}
