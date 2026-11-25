-- Expand research collection only. No live-engine permissions, ledger or cash changes.
create or replace function tracker_monitor.symbols() returns table(symbol text)
language sql stable set search_path='' as $$
 select upper(w.value) from public.stock_tracker_state s,
 lateral jsonb_array_elements_text(case when jsonb_typeof(s.data->'watchlist')='array' then s.data->'watchlist' else '[]'::jsonb end) with ordinality w(value,ord)
 where s.id='main' and upper(w.value) ~ '^[A-Z][A-Z0-9.\-]{0,11}$' order by w.ord limit 40
$$;
create table public.stock_tracker_company_daily_quotes (
 symbol text not null check(symbol ~ '^[A-Z][A-Z0-9.\-]{0,11}$'),
 session_date date not null,quote_at timestamptz not null,
 price numeric not null check(price>0 and price<1000000000000),
 source text not null default 'Finnhub last observed regular-session quote',
 primary key(symbol,session_date)
);
alter table public.stock_tracker_company_daily_quotes enable row level security;
revoke all on public.stock_tracker_company_daily_quotes from public,anon,authenticated,service_role;
grant select on public.stock_tracker_company_daily_quotes to service_role;
create or replace function tracker_monitor.capture_company_daily_quotes() returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.stock_tracker_company_daily_quotes(symbol,session_date,quote_at,price)
 select s->>'symbol',((s->>'quoteAt')::timestamptz at time zone 'America/New_York')::date,(s->>'quoteAt')::timestamptz,(s->>'quote')::numeric
 from public.stock_tracker_monitor_feed f cross join lateral jsonb_array_elements(f.data->'stocks') s
 where f.id='main' and s->>'symbol' ~ '^[A-Z][A-Z0-9.\-]{0,11}$'
 and jsonb_typeof(s->'quote')='number' and (s->>'quote')::numeric>0
 and s->>'quoteAt' is not null and (s->>'quoteAt')::timestamptz<=now()
 and (s->>'quoteAt')::timestamptz>=now()-interval '1 day'
 and tracker_monitor.market_hours((s->>'quoteAt')::timestamptz)
 on conflict(symbol,session_date) do update set quote_at=excluded.quote_at,price=excluded.price
 where excluded.quote_at>stock_tracker_company_daily_quotes.quote_at;
 delete from public.stock_tracker_company_daily_quotes where session_date<current_date-interval '3 years';
end $$;
revoke all on function tracker_monitor.capture_company_daily_quotes() from public,anon,authenticated,service_role;
-- Reuse only recorded observations; no synthetic historical return series.
insert into public.stock_tracker_company_daily_quotes(symbol,session_date,quote_at,price)
select s->>'symbol',d.session_date,(s->>'lastQuote')::timestamptz,(s->>'lastObservedPrice')::numeric
from tracker_monitor.daily_reviews d cross join lateral jsonb_array_elements(d.data->'stocks') s
where s->>'symbol' ~ '^[A-Z][A-Z0-9.\-]{0,11}$' and jsonb_typeof(s->'lastObservedPrice')='number'
and (s->>'lastObservedPrice')::numeric>0 and s->>'lastQuote' is not null
and (s->>'lastQuote')::timestamptz<=now()
on conflict(symbol,session_date) do nothing;
select tracker_monitor.capture_company_daily_quotes();
select cron.schedule('stock-tracker-company-daily-observations','*/15 13-22 * * 1-5','select tracker_monitor.capture_company_daily_quotes();');
