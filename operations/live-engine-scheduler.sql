-- Only a short-lived signature is queued. The signing key remains in Vault.
-- Token is provisioned privately in Vault and Render, never in this source file.
-- No network wake-ups while OFF unless a known in-flight order needs reading.
select cron.schedule('stock-tracker-coinbase-live-v1','* * * * *',$job$
 select net.http_post(
  url:='https://ai-stock-income-tracker-a.onrender.com/api/trading/tick',
  headers:=jsonb_build_object('Content-Type','application/json',
   'X-Stock-Worker-Time',floor(extract(epoch from now()))::bigint::text,
   'X-Stock-Worker-Signature',encode(extensions.hmac(
    convert_to(floor(extract(epoch from now()))::bigint::text,'UTF8'),
    convert_to((select decrypted_secret from vault.decrypted_secrets where name='stock_tracker_coinbase_worker'),'UTF8'),
    'sha256'),'hex')),
  body:='{}'::jsonb,timeout_milliseconds:=10000)
 from public.stock_tracker_live_engine
 where id='main' and (data->>'mode'='active' or data#>>'{pending,orderId}' is not null)
  and extract(isodow from now() at time zone 'America/New_York') between 1 and 5
  and (now() at time zone 'America/New_York')::time between time '09:45' and time '16:05';
 $job$);
