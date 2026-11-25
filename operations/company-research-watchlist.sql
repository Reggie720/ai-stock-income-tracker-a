-- Add only research candidates. Never alter live-engine scope, approval or money.
update public.stock_tracker_state set data=jsonb_set(data,'{watchlist}',
 (select jsonb_agg(symbol order by ord) from (
  select symbol,min(ord) ord from (
   select value as symbol,ordinality as ord
   from jsonb_array_elements_text(coalesce(data->'watchlist','[]'::jsonb)) with ordinality
   union all select symbol,100+ord
   from unnest(array['SUNB','WMT','ACI','KR','QSR']) with ordinality a(symbol,ord)
  ) requested group by symbol
 ) merged)),updated_at=now()
where id='main' and jsonb_typeof(data->'watchlist')='array';
