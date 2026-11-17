CREATE OR REPLACE FUNCTION tracker_monitor.tick(p_time timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare api_key text; ticker record; request_number bigint; cfg tracker_monitor.settings%rowtype;
begin
 if not pg_try_advisory_xact_lock(638225039) then return; end if;
 perform tracker_monitor.collect(p_time);
 perform tracker_monitor.process_outcomes(p_time);
 -- Review once daily after the close, or before a session; current-day data excluded.
 if not tracker_monitor.market_hours(p_time) then perform tracker_monitor.review_rule(p_time); end if;
 update tracker_monitor.settings set last_tick=p_time where id;
 -- Bounded retention. Nothing touches the app's portfolio or research records.
 delete from tracker_monitor.samples where observed_at<p_time-interval '2 days';
 delete from tracker_monitor.alerts where created_at<p_time-interval '90 days'
  and id not in(select alert_id from tracker_monitor.pending where alert_id is not null);
 select * into cfg from tracker_monitor.settings where id for update;
 if not cfg.enabled or not tracker_monitor.market_hours(p_time) then return; end if;
 if cfg.last_queue is not null and date_trunc('minute',p_time)-date_trunc('minute',cfg.last_queue)<interval '5 minutes' then return; end if;
 select decrypted_secret into api_key from vault.decrypted_secrets where name='stock_tracker_finnhub_key' limit 1;
 if api_key is null or length(trim(api_key))<10 then
  update tracker_monitor.settings set last_error='Add stock_tracker_finnhub_key in Supabase Vault' where id;
  return;
 end if;
 for ticker in select * from tracker_monitor.symbols() loop
  if exists(select 1 from tracker_monitor.pending where kind='quote' and symbol=ticker.symbol) then continue; end if;
  request_number=net.http_get(url:='https://finnhub.io/api/v1/quote',
   params:=jsonb_build_object('symbol',ticker.symbol),headers:=jsonb_build_object('X-Finnhub-Token',api_key),timeout_milliseconds:=10000);
  insert into tracker_monitor.pending(request_id,kind,symbol,requested_at)
  values(request_number,'quote',ticker.symbol,p_time);
 end loop;
 update tracker_monitor.settings set last_queue=p_time where id;
end $function$;
revoke all on function tracker_monitor.tick(timestamptz) from public,anon,authenticated,service_role;
