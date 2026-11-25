-- No ledger mutation. The server still verifies HMAC integrity and exact authorization.
alter table public.stock_tracker_live_engine drop constraint stock_tracker_two_dollar_buying_cap;
alter table public.stock_tracker_live_engine add constraint stock_tracker_owner_approved_buying_cap check (
 (data->>'spentCents')::numeric between 0 and
 case when coalesce(
  data#>>'{budgetIncrease,version}'='additional-two-v1'
  and data#>>'{budgetIncrease,additionalCents}'='200'
  and data#>>'{budgetIncrease,totalCapCents}'='400'
  and data#>>'{budgetIncrease,id}' ~ '^[a-z0-9-]{8,80}$'
  and data#>>'{budgetIncrease,portfolioBinding}' ~ '^[a-f0-9]{64}$'
  and data#>>'{budgetIncrease,portfolioBinding}'=data#>>'{approval,portfolioBinding}'
  and jsonb_typeof(data#>'{budgetIncrease,products}')='array'
  and jsonb_array_length(data#>'{budgetIncrease,products}')=4
  and data#>'{budgetIncrease,products}' @> '["WMT-USD","KR-USD","ACI-USD","QSR-USD"]'::jsonb,
 false) then 400 else 200 end
);
-- Exercise the actual copied constraints without changing signed production rows.
create temporary table cap_guard_test (like public.stock_tracker_live_engine including constraints including defaults) on commit drop;
do $$
declare
 base jsonb := '{"schema":1,"mode":"paused","spentCents":"200"}'::jsonb;
 amended jsonb;
begin
 insert into cap_guard_test(id,version,data) values('main',0,base);
 begin
  insert into cap_guard_test(id,version,data) values('main',0,base||'{"spentCents":"300"}');
  raise exception 'Unapproved increase was accepted';
 exception when check_violation then null;end;
 amended:=base||jsonb_build_object('spentCents','400','approval',jsonb_build_object('portfolioBinding',repeat('a',64)), 'budgetIncrease',jsonb_build_object('version','additional-two-v1','id','owner-extra-two-test','additionalCents','200','totalCapCents','400','portfolioBinding',repeat('a',64),'products',jsonb_build_array('WMT-USD','KR-USD','ACI-USD','QSR-USD')));
 insert into cap_guard_test(id,version,data) values('main',0,amended);
 begin
  insert into cap_guard_test(id,version,data) values('main',0,amended||'{"spentCents":"401"}');
  raise exception 'Over-cap spending was accepted';
 exception when check_violation then null;end;
 begin
  insert into cap_guard_test(id,version,data) values('main',0,jsonb_set(amended,'{budgetIncrease,totalCapCents}','"600"'));
  raise exception 'Tampered amendment was accepted';
 exception when check_violation then null;end;
end $$;
