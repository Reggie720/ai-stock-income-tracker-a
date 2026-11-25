-- Prevent every research cycle from preceding the quote refresh.
-- Alters only the existing learning worker; no order/portfolio settings change.
select cron.alter_job((select jobid from cron.job where jobname='stock-tracker-learning-v1'),schedule:='2-57/5 * * * *');
