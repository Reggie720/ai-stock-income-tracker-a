-- Separate signed research memory; never modifies financial order state.
create table public.stock_tracker_learning_lab (
 id text primary key check(id='main'),version bigint not null default 0 check(version>=0),
 data jsonb not null check(data->>'schema'='1'),updated_at timestamptz not null default now()
);
alter table public.stock_tracker_learning_lab enable row level security;
revoke all on public.stock_tracker_learning_lab from public,anon,authenticated,service_role;
grant select,update on public.stock_tracker_learning_lab to service_role;
insert into public.stock_tracker_learning_lab(id,data) values('main','{"schema":1,"lastTick":null,"lastReview":null,"observations":[],"models":[],"reviews":[],"activeVersion":null,"reports":[],"researchAttempts":[],"lifetime":{"observed":0,"scored":0,"unavailable":0},"stockMemory":{},"lastQuotes":{},"status":"Collecting prospective evidence","lease":null,"tradeResults":null}');
create function public.stock_tracker_learning_cas(expected bigint,next_data jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if jsonb_typeof(next_data)<>'object' or next_data->>'schema'<>'1' or jsonb_typeof(next_data->'observations')<>'array' or jsonb_array_length(next_data->'observations')>2100 then raise exception 'Invalid research memory';end if;
 update public.stock_tracker_learning_lab set data=next_data,version=version+1,updated_at=now() where id='main' and version=expected;
 get diagnostics changed=row_count;return changed=1;
end $$;
revoke all on function public.stock_tracker_learning_cas(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.stock_tracker_learning_cas(bigint,jsonb) to service_role;
create function public.stock_tracker_learning_version_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.version is distinct from old.version+1 then raise exception 'Learning version cannot be rolled back';end if;
 return new;
end $$;
revoke all on function public.stock_tracker_learning_version_guard() from public,anon,authenticated;
grant execute on function public.stock_tracker_learning_version_guard() to service_role;
create trigger stock_tracker_learning_no_rollback before update on public.stock_tracker_learning_lab for each row execute function public.stock_tracker_learning_version_guard();
