begin;
-- Research-only watchlist expansion; preserves current records and existing tickers.
update public.stock_tracker_state set data=jsonb_set(data,'{watchlist}',(select jsonb_agg(symbol order by ord) from (select symbol,min(ord) ord from (select value symbol,ordinality ord from jsonb_array_elements_text(data->'watchlist') with ordinality union all select symbol,100+ord from unnest(array['SGOV','JEPI','DIVO','O','SUNB','WMT','ACI','KR','QSR','DLTR','DG','ECHO','CAT','URI','PWR','FLR','WM','XOM','CVX','COP','LNG','NVDA','AMD','INTC','TSM','AVGO','AAPL','MSFT','CRUS','DELL','LOGI']) with ordinality a(symbol,ord)) requested group by symbol) merged)),updated_at=now() where id='main' and jsonb_typeof(data->'watchlist')='array';
update public.stock_tracker_state set data=jsonb_set(data,'{monthlyPlan}',
 '{"mode":"research_only","monthlyAmount":"0.00","symbols":["WMT","KR","ACI","DLTR","DG","ECHO","SUNB","QSR"],"horizonMonths":12,"tradeEnabled":false,"contributionsOnly":"0.00"}'::jsonb),updated_at=now()
where id='main' and (not data ? 'monthlyPlan' or data->'monthlyPlan'='null'::jsonb);
do $$ begin if (select jsonb_array_length(data->'watchlist') from public.stock_tracker_state where id='main')>40 then raise exception 'Expanded watchlist exceeds the monitoring bound';end if;end $$;
select tracker_monitor.refresh_monitor_feed(now());
commit;
