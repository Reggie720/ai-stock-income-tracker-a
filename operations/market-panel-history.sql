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
  'history',(select coalesce(jsonb_agg(jsonb_build_object('at',h.quote_at,'price',h.price) order by h.quote_at),'[]'::jsonb)
   from (select distinct on (quote_at) quote_at,price from tracker_monitor.samples
    where symbol=w.symbol and quote_at>=q.quote_at-interval '1 hour' and quote_at<=least(q.quote_at,p_time)
    and (quote_at at time zone 'America/New_York')::date=(q.quote_at at time zone 'America/New_York')::date
    order by quote_at desc limit 13) h),
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
