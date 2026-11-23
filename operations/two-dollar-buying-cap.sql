-- Lower the hard cap without changing signed state or activating trading.
alter table public.stock_tracker_live_engine add constraint stock_tracker_two_dollar_buying_cap check ((data->>'spentCents')::numeric between 0 and 200);
