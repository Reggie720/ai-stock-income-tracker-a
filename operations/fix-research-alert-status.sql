-- Correct research notification copy only. Never change live permissions or signed money records.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('tracker_monitor.consider_alert(text,timestamp with time zone)'::regprocedure);
 if strpos(definition,'Real-money trading is not connected.')=0 then raise exception 'Unexpected trend alert template';end if;
 definition:=replace(definition,
 '. Action: review this stock in Signals. Where: Alpaca Paper Trading, Recent Orders. A $1 automatic practice buy may follow account and market checks. Real-money trading is not connected. Recheck current prices; a pattern match does not guarantee a rise.',
 '. Research alert only: review Signals for the price pattern and simulated practice orders. Open Trading setup for separately approved live orders and holdings. Recheck current prices; a pattern match does not guarantee a rise.');
 if strpos(definition,'Real-money trading is not connected.')>0 then raise exception 'Trend alert replacement did not match';end if;
 execute definition;
 definition:=pg_get_functiondef('tracker_monitor.refresh_monitor_feed(timestamp with time zone)'::regprocedure);
 if strpos(definition,'Real-money trading is not connected.')=0 then raise exception 'Unexpected daily alert template';end if;
 definition:=replace(definition,
 ' hourly-pattern alerts today. Open Signals in your tracker to review prices, reasons and learning progress. Real-money trading is not connected.',
 ' hourly-pattern research alerts today. Open Signals for research and simulated practice orders. Open Trading setup for the separately approved live plan, holdings and real order status.');
 definition:=replace(definition,'''liveTrading'',false,','''researchOnly'',true,''liveTradingStatusSource'',''Trading setup (separate approved engine)'',');
 definition:=replace(definition,
 'Quotes may be delayed. Pattern matches are candidates for review, not guaranteed buying opportunities. This system learns a bounded price filter; it does not research news or prove profitability.',
 'Quotes may be delayed. Pattern matches are research candidates, not guaranteed buying opportunities. Practice orders in Signals are simulated. Learning & research contains separate sourced reports. Trading setup shows the separately approved live engine and actual order records.');
 if strpos(definition,'Real-money trading is not connected.')>0 or strpos(definition,'''liveTrading'',false')>0 then raise exception 'Daily alert replacement did not match';end if;
 execute definition;
end $$;
-- Refresh the research feed; existing daily-review deduplication prevents resending completed reviews.
select tracker_monitor.refresh_monitor_feed(now());
-- This must return zero obsolete templates.
select count(*) as obsolete_templates from pg_proc
where pronamespace='tracker_monitor'::regnamespace and prosrc like '%Real-money trading is not connected.%';
