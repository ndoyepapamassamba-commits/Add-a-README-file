-- Teranga CV scheduled jobs (Supabase only: needs pg_cron and pg_net, not run in PGlite).
-- The x-cron-secret header is read from tcv.settings at every run; no secret lives in this file.
-- The deployer stores it once, out-of-band:
--   insert into tcv.settings (key, value) values ('CRON_SECRET', '<generated>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- cron.schedule with an existing job name replaces that job, so re-running this migration is safe.
select cron.schedule(
  'tcv-reconcile',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://seegnylaubuularegmku.supabase.co/functions/v1/api/cron/reconcile',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select value from tcv.settings where key = 'CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);

-- 20:30 UTC = 20:30 in Dakar (Senegal is UTC+0 all year).
select cron.schedule(
  'tcv-daily',
  '30 20 * * *',
  $job$
  select net.http_post(
    url := 'https://seegnylaubuularegmku.supabase.co/functions/v1/api/cron/daily',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select value from tcv.settings where key = 'CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);
