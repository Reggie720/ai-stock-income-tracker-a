-- Separate from existing tracker records. No Coinbase credentials stored here.
create table public.stock_tracker_live_engine (
 id text primary key check(id='main'), version bigint not null default 0 check(version>=0),
 data jsonb not null, updated_at timestamptz not null default now(),
 check(data->>'schema'='1'),check(data->>'mode' in ('off','active','paused')),
 check((data->>'spentCents') ~ '^[0-9]{1,16}$'),
 check((data->>'spentCents')::numeric between 0 and 500)
);
alter table public.stock_tracker_live_engine enable row level security;
revoke all on public.stock_tracker_live_engine from public,anon,authenticated,service_role;
grant select,update on public.stock_tracker_live_engine to service_role;
insert into public.stock_tracker_live_engine(id,data) values('main',
 '{"schema":1,"mode":"off","approval":null,"portfolioId":null,"cashCents":"0","spentCents":"0","reserveCents":"0","positions":{},"pending":null,"history":[],"attempts":[],"unsettled":[],"reason":"Review the proposed plan before activation.","lastTick":null}');
create function public.stock_tracker_engine_cas(expected bigint,next_data jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare updated integer;
begin
 if jsonb_typeof(next_data)<>'object' or next_data->>'schema'<>'1' or next_data->>'mode' not in ('off','active','paused')
  or not coalesce(next_data->>'spentCents' ~ '^[0-9]{1,16}$',false) then raise exception 'Invalid trading state';end if;
 update public.stock_tracker_live_engine set data=next_data,version=version+1,updated_at=now()
 where id='main' and version=expected and (next_data->>'spentCents')::numeric >= (data->>'spentCents')::numeric;
 get diagnostics updated=row_count;return updated=1;
end $$;
revoke all on function public.stock_tracker_engine_cas(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.stock_tracker_engine_cas(bigint,jsonb) to service_role;
