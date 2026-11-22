-- Applied migration: lower_stock_tracker_buying_cap_to_five_dollars
alter table public.stock_tracker_live_engine add constraint stock_tracker_five_dollar_buying_cap check ((data->>'spentCents')::numeric between 0 and 500);
