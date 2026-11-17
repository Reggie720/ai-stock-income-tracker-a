-- Sanitized, read-only feed for the password-protected app. No credentials/account IDs.
create table if not exists public.stock_tracker_monitor_feed (
 id text primary key check(id='main'), data jsonb not null, updated_at timestamptz not null default now()
);
alter table public.stock_tracker_monitor_feed enable row level security;
revoke all on public.stock_tracker_monitor_feed from public,anon,authenticated,service_role;
grant select on public.stock_tracker_monitor_feed to service_role;
create table if not exists tracker_monitor.daily_reviews (
 session_date date primary key, data jsonb not null, created_at timestamptz not null default now()
);
alter table tracker_monitor.daily_reviews enable row level security;
revoke all on tracker_monitor.daily_reviews from public,anon,authenticated,service_role;

create or replace function tracker_monitor.refresh_monitor_feed(p_time timestamptz default now()) returns void
language plpgsql set search_path='' as $$
declare d record; daily jsonb; cards jsonb; snapshot jsonb; newest timestamptz;
 today date=(p_time at time zone 'America/New_York')::date; inserted_day date; notice_id bigint;
begin
 if not pg_try_advisory_xact_lock(638225042) then return; end if;
 -- Backfill only sessions for which actual samples remain. Never invent a daily review.
 for d in select distinct (quote_at at time zone 'America/New_York')::date as session_date
 from tracker_monitor.samples where (quote_at at time zone 'America/New_York')::date<today
 or ((quote_at at time zone 'America/New_York')::date=today and (p_time at time zone 'America/New_York')::time>=time '16:15') loop
  if exists(select 1 from tracker_monitor.daily_reviews where session_date=d.session_date) then continue; end if;
  select jsonb_build_object('date',d.session_date,'source','Finnhub sampled prices',
   'scope','Daily price-pattern review, not news or full fundamental research',
   'stocks',coalesce(jsonb_agg(x),'[]'::jsonb),
   'matchedAlerts',(select count(*) from tracker_monitor.alerts where kind='trend' and session_date=d.session_date)) into daily
  from (select s.symbol,count(*) as samples,min(quote_at) as "firstQuote",max(quote_at) as "lastQuote",
   (array_agg(price order by quote_at))[1] as "firstObservedPrice",
   (array_agg(price order by quote_at desc))[1] as "lastObservedPrice",
   round(100*((array_agg(price order by quote_at desc))[1]/(array_agg(price order by quote_at))[1]-1),3) as "sampledChangePercent"
   from tracker_monitor.samples s where (quote_at at time zone 'America/New_York')::date=d.session_date
   group by s.symbol order by s.symbol) x;
  insert into tracker_monitor.daily_reviews(session_date,data,created_at) values(d.session_date,daily,p_time)
  on conflict do nothing returning session_date into inserted_day;
  if inserted_day=today then
   insert into tracker_monitor.alerts(symbol,session_date,kind,metrics)
   values('DAILY',today,'test',jsonb_build_object('purpose','daily_price_review')) returning id into notice_id;
   perform tracker_monitor.publish(notice_id,'Daily stock price review saved. '||(daily->>'matchedAlerts')||
    ' hourly-pattern alerts today. Open Signals in your tracker to review prices, reasons and learning progress. Real-money trading is not connected.');
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('symbol',w.symbol,'quote',q.price,'quoteAt',q.quote_at,
  'pattern',tracker_monitor.evaluate(w.symbol,p_time))), '[]'::jsonb) into cards
 from tracker_monitor.symbols() w left join lateral
  (select price,quote_at from tracker_monitor.samples where symbol=w.symbol order by quote_at desc limit 1) q on true;
 select max(quote_at) into newest from tracker_monitor.samples;
 snapshot=jsonb_build_object('updatedAt',p_time,'marketHours',tracker_monitor.market_hours(p_time),
 'monitor',tracker_monitor.status(),'learning',tracker_monitor.adaptive_status(),'paper',tracker_monitor.paper_trading_status(),
 'liveTrading',false,'stocks',cards,'latestQuoteAt',newest,
 'alerts',(select coalesce(jsonb_agg(x),'[]'::jsonb) from
  (select symbol,created_at as "createdAt",status,metrics from tracker_monitor.alerts where kind='trend' order by created_at desc limit 20)x),
 'orders',(select coalesce(jsonb_agg(x),'[]'::jsonb) from
  (select symbol,created_at as "createdAt",state,dollars,reason from tracker_monitor.paper_orders order by created_at desc limit 20)x),
 'dailyReviews',(select coalesce(jsonb_agg(data order by session_date desc),'[]'::jsonb) from
  (select session_date,data from tracker_monitor.daily_reviews order by session_date desc limit 7)x),
 'limits','Quotes may be delayed. Pattern matches are candidates for review, not guaranteed buying opportunities. This system learns a bounded price filter; it does not research news or prove profitability.');
 insert into public.stock_tracker_monitor_feed(id,data,updated_at) values('main',snapshot,p_time)
 on conflict(id) do update set data=excluded.data,updated_at=excluded.updated_at;
end $$;
revoke all on function tracker_monitor.refresh_monitor_feed(timestamptz) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION tracker_monitor.publish(p_alert_id bigint, p_message text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare cfg tracker_monitor.settings%rowtype; request_number bigint; token text; actions jsonb='[]'; payload jsonb;
begin
 select * into cfg from tracker_monitor.settings where id;
 if cfg.topic !~ '^stockalerts_[a-f0-9]{32}$' then raise exception 'Invalid notification topic'; end if;
 if cfg.ntfy_server is distinct from 'https://ntfy.envs.net' then raise exception 'Invalid notification server'; end if;
 if not exists(select 1 from tracker_monitor.alerts where id=p_alert_id) then raise exception 'Alert unavailable'; end if;
 if cfg.feedback_enabled and not exists(select 1 from tracker_monitor.feedback where alert_id=p_alert_id) then
  token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into tracker_monitor.feedback(alert_id,token_hash,expires_at)
  values(p_alert_id,encode(sha256(convert_to(token,'UTF8')),'hex'),now()+interval '7 days');
  select jsonb_agg(jsonb_build_object('action','http','label',v.caption,
   'url','https://evmutebomxptszqdmjyt.supabase.co/functions/v1/stock-alert-feedback',
   'method','POST','headers',jsonb_build_object('Content-Type','application/json'),
   'body',jsonb_build_object('token',token,'label',v.value)::text,'clear',true)) into actions
  from (values('Useful','useful'),('False alarm','false_alarm')) v(caption,value);
 end if;
 actions=actions||jsonb_build_array(jsonb_build_object('action','view','label','Open tracker','url','https://ai-stock-income-tracker-a.onrender.com/#signals'));
 payload=jsonb_build_object('topic',cfg.topic,'title','Stock tracker alert',
  'message',p_message,'click','https://ai-stock-income-tracker-a.onrender.com/#signals','priority',3,'tags',jsonb_build_array('chart_with_upwards_trend'),'actions',actions);
 request_number=net.http_post(url:=cfg.ntfy_server,body:=payload,timeout_milliseconds:=10000);
 insert into tracker_monitor.pending(request_id,kind,alert_id) values(request_number,'notification',p_alert_id);
 return request_number;
end $function$;
CREATE OR REPLACE FUNCTION tracker_monitor.consider_alert(p_symbol text, p_time timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; alert_number bigint; session_day date;
begin
 if not (select enabled from tracker_monitor.settings where id) then return; end if;
 if not tracker_monitor.market_hours(p_time) then return; end if;
 if not exists(select 1 from tracker_monitor.symbols() where symbol=p_symbol) then return; end if;
 result=tracker_monitor.evaluate(p_symbol,p_time);
 if not (result->>'qualifies')::boolean then return; end if;
 session_day=(p_time at time zone 'America/New_York')::date;
 insert into tracker_monitor.alerts(symbol,session_date,kind,metrics)
 values(p_symbol,session_day,'trend',result)
 on conflict(symbol,session_date) where kind='trend' do nothing returning id into alert_number;
 if alert_number is null then return; end if;
 perform tracker_monitor.publish(alert_number,
  p_symbol||' matched your 1-hour upward-trend rule. Change +'||(result->>'gain_percent')||
  '%, last quote $'||(result->>'last_price')||'. Quote time '||
  (result->>'quote_at')||'. Action: review this stock in Signals. Where: Alpaca Paper Trading, Recent Orders. A $1 automatic practice buy may follow account and market checks. Real-money trading is not connected. Recheck current prices; a pattern match does not guarantee a rise.');
end $function$;
revoke all on function tracker_monitor.publish(bigint,text),tracker_monitor.consider_alert(text,timestamptz) from public,anon,authenticated,service_role;
select cron.schedule('stock-tracker-signal-feed-v1','* * * * *','select tracker_monitor.refresh_monitor_feed();');
