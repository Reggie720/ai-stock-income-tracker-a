-- HMAC verification occurs in the app. The signature binds state to version.
-- This trigger prevents a table writer from rolling back to an old signed row.
create function public.stock_tracker_engine_update_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.version is distinct from old.version+1
  or (new.data->>'spentCents')::numeric < (old.data->>'spentCents')::numeric then
  raise exception 'Trading ledger version or spending cannot be rolled back';
 end if;
 return new;
end $$;
revoke all on function public.stock_tracker_engine_update_guard() from public,anon,authenticated;
grant execute on function public.stock_tracker_engine_update_guard() to service_role;
create trigger stock_tracker_engine_no_rollback before update on public.stock_tracker_live_engine
for each row execute function public.stock_tracker_engine_update_guard();
