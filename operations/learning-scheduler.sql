-- Offset after the monitor's minute-1/6/11 quote refresh; keep all freshness limits.
-- Independent of trading mode: research continues while live orders are paused.
-- Domain-separated HMAC prevents collision with the existing trading worker.
select cron.schedule('stock-tracker-learning-v1','2-57/5 * * * *',$job$
 select net.http_post(
  url:='https://ai-stock-income-tracker-a.onrender.com/api/learning/tick',
  headers:=jsonb_build_object('Content-Type','application/json',
   'X-Stock-Worker-Time',floor(extract(epoch from now()))::bigint::text,
   'X-Stock-Worker-Signature',encode(extensions.hmac(
    convert_to(floor(extract(epoch from now()))::bigint::text||E'\nlearning-lab-v1','UTF8'),
    convert_to((select decrypted_secret from vault.decrypted_secrets where name='stock_tracker_coinbase_worker'),'UTF8'),
    'sha256'),'hex')),
  body:='{}'::jsonb,timeout_milliseconds:=120000)
 where extract(isodow from now() at time zone 'America/New_York') between 1 and 5
 and (now() at time zone 'America/New_York')::time between time '09:30' and time '16:20';
$job$);
