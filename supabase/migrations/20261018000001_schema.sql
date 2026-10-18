-- Teranga CV: private tables in schema tcv, one security-definer function per Store method in public.
-- Idempotent; runs on Supabase Postgres 17 and in PGlite (the backend contract tests apply this file).
-- Timestamps leave the database as ISO-8601 UTC strings with milliseconds, like JS toISOString().

create schema if not exists tcv;
revoke all on schema tcv from public;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists tcv.payouts (
  id              text primary key,
  day             date not null unique,
  amount          integer not null check (amount >= 0),
  mobile          text not null,
  status          text not null check (status in ('pending', 'processing', 'succeeded', 'failed', 'unknown')),
  idempotency_key text not null unique,
  request_body    text not null default '',
  wave_payout_id  text,
  fee             numeric,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists tcv.orders (
  id                  text primary key,
  access_token_hash   text not null,
  product             text not null check (product in ('cv', 'lettre', 'pack')),
  template            text not null check (template in ('classique', 'moderne', 'elegant')),
  amount              integer not null check (amount > 0),
  currency            text not null default 'XOF' check (currency = 'XOF'),
  status              text not null check (status in ('preview', 'checkout', 'awaiting_manual', 'paid')),
  input               jsonb,
  document            jsonb,
  checkout_session_id text unique,
  wave_launch_url     text,
  checkout_expires_at timestamptz,
  wave_transaction_id text,
  payment_method      text check (payment_method in ('wave', 'manual')),
  manual_payer_phone  text,
  paid_amount         integer,
  paid_at             timestamptz,
  payout_id           text references tcv.payouts (id),
  ip_hash             text,
  created_at          timestamptz not null default now(),
  purged_at           timestamptz
);

create index if not exists orders_status_created_at_idx on tcv.orders (status, created_at);
create index if not exists orders_paid_at_idx on tcv.orders (paid_at);
create index if not exists orders_payout_id_idx on tcv.orders (payout_id);

create table if not exists tcv.events (
  id         text primary key,
  type       text not null,
  ref        text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_created_at_idx on tcv.events (created_at);

create table if not exists tcv.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null
);

create table if not exists tcv.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table tcv.orders enable row level security;
alter table tcv.payouts enable row level security;
alter table tcv.events enable row level security;
alter table tcv.rate_limits enable row level security;
alter table tcv.settings enable row level security;

revoke all on all tables in schema tcv from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (schema tcv, not callable through the API)
-- ---------------------------------------------------------------------------------------------

create or replace function tcv.iso(p_ts timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function tcv.order_json(o tcv.orders) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id,
    'access_token_hash', o.access_token_hash,
    'product', o.product,
    'template', o.template,
    'amount', o.amount,
    'currency', o.currency,
    'status', o.status,
    'input', o.input,
    'document', o.document,
    'checkout_session_id', o.checkout_session_id,
    'wave_launch_url', o.wave_launch_url,
    'checkout_expires_at', tcv.iso(o.checkout_expires_at),
    'wave_transaction_id', o.wave_transaction_id,
    'payment_method', o.payment_method,
    'manual_payer_phone', o.manual_payer_phone,
    'paid_amount', o.paid_amount,
    'paid_at', tcv.iso(o.paid_at),
    'payout_id', o.payout_id,
    'ip_hash', o.ip_hash,
    'created_at', tcv.iso(o.created_at),
    'purged_at', tcv.iso(o.purged_at)
  )
$$;

create or replace function tcv.payout_json(p tcv.payouts) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'day', to_char(p.day, 'YYYY-MM-DD'),
    'amount', p.amount,
    'mobile', p.mobile,
    'status', p.status,
    'idempotency_key', p.idempotency_key,
    'request_body', p.request_body,
    'wave_payout_id', p.wave_payout_id,
    'fee', p.fee,
    'error', p.error,
    'created_at', tcv.iso(p.created_at),
    'updated_at', tcv.iso(p.updated_at)
  )
$$;

-- Mirror of computePayoutAmount (payout.ts): the same float8 operations in the same order as JavaScript.
create or replace function tcv.payout_amount(
  p_gross bigint, p_fee_rate double precision, p_payout_fee_rate double precision, p_max_amount double precision
) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_net double precision := floor(p_gross::double precision * (1::double precision - p_fee_rate));
  v_base double precision := case when p_max_amount is null then v_net else least(v_net, p_max_amount) end;
  v_amount double precision := floor((v_base - 1) / (1 + p_payout_fee_rate));
begin
  return greatest(v_amount, 0)::integer;
end;
$$;

create or replace function tcv.period_stats(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'orders', (select count(*) from tcv.orders where created_at >= p_from and created_at < p_to),
    'paid', (select count(*) from tcv.orders where status = 'paid' and paid_at >= p_from and paid_at < p_to),
    'revenue', (select coalesce(sum(paid_amount), 0) from tcv.orders
                where status = 'paid' and paid_at >= p_from and paid_at < p_to)
  )
$$;

revoke all on function tcv.iso(timestamptz) from public;
revoke all on function tcv.order_json(tcv.orders) from public;
revoke all on function tcv.payout_json(tcv.payouts) from public;
revoke all on function tcv.payout_amount(bigint, double precision, double precision, double precision) from public;
revoke all on function tcv.period_stats(timestamptz, timestamptz) from public;

-- ---------------------------------------------------------------------------------------------
-- Store API (public.tcv_*), called with the service role only
-- ---------------------------------------------------------------------------------------------

create or replace function public.tcv_insert_order(p_row jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into tcv.orders (
    id, access_token_hash, product, template, amount, currency, status, input, document,
    checkout_session_id, wave_launch_url, checkout_expires_at, wave_transaction_id, payment_method,
    manual_payer_phone, paid_amount, paid_at, payout_id, ip_hash, created_at, purged_at
  ) values (
    p_row ->> 'id',
    p_row ->> 'access_token_hash',
    p_row ->> 'product',
    p_row ->> 'template',
    (p_row ->> 'amount')::integer,
    coalesce(p_row ->> 'currency', 'XOF'),
    p_row ->> 'status',
    nullif(p_row -> 'input', 'null'::jsonb),
    nullif(p_row -> 'document', 'null'::jsonb),
    p_row ->> 'checkout_session_id',
    p_row ->> 'wave_launch_url',
    (p_row ->> 'checkout_expires_at')::timestamptz,
    p_row ->> 'wave_transaction_id',
    p_row ->> 'payment_method',
    p_row ->> 'manual_payer_phone',
    (p_row ->> 'paid_amount')::integer,
    (p_row ->> 'paid_at')::timestamptz,
    p_row ->> 'payout_id',
    p_row ->> 'ip_hash',
    coalesce((p_row ->> 'created_at')::timestamptz, now()),
    (p_row ->> 'purged_at')::timestamptz
  );
end;
$$;

create or replace function public.tcv_get_order(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select tcv.order_json(o) from tcv.orders o where o.id = p_id
$$;

-- Payment fields can only change through tcv_mark_paid; a paid order never leaves "paid" and keeps the
-- checkout fields of the session that paid it (only its template may still change).
create or replace function public.tcv_update_order(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('template', 'status', 'checkout_session_id', 'wave_launch_url', 'checkout_expires_at',
                     'manual_payer_phone') then
      raise exception 'tcv_update_order: column % cannot be patched', v_key using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'status' and coalesce(p_patch ->> 'status', '') not in ('preview', 'checkout', 'awaiting_manual') then
    raise exception 'tcv_update_order: status % not allowed', p_patch ->> 'status' using errcode = '22023';
  end if;
  update tcv.orders o set
    template = case when p_patch ? 'template' then p_patch ->> 'template' else o.template end,
    status = case when o.status = 'paid' or not (p_patch ? 'status') then o.status else p_patch ->> 'status' end,
    checkout_session_id = case when o.status <> 'paid' and p_patch ? 'checkout_session_id'
      then p_patch ->> 'checkout_session_id' else o.checkout_session_id end,
    wave_launch_url = case when o.status <> 'paid' and p_patch ? 'wave_launch_url'
      then p_patch ->> 'wave_launch_url' else o.wave_launch_url end,
    checkout_expires_at = case when o.status <> 'paid' and p_patch ? 'checkout_expires_at'
      then (p_patch ->> 'checkout_expires_at')::timestamptz else o.checkout_expires_at end,
    manual_payer_phone = case when o.status <> 'paid' and p_patch ? 'manual_payer_phone'
      then p_patch ->> 'manual_payer_phone' else o.manual_payer_phone end
  where o.id = p_id;
end;
$$;

create or replace function public.tcv_mark_paid(
  p_id text, p_method text, p_paid_amount integer, p_transaction_id text, p_session_id text, p_paid_at timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update tcv.orders set
    status = 'paid',
    payment_method = p_method,
    paid_amount = p_paid_amount,
    wave_transaction_id = coalesce(p_transaction_id, wave_transaction_id),
    checkout_session_id = coalesce(p_session_id, checkout_session_id),
    paid_at = p_paid_at
  where id = p_id and status <> 'paid';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.tcv_list_open_checkouts(p_since timestamptz, p_limit integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(tcv.order_json(s.o) order by (s.o).created_at desc, (s.o).id desc), '[]'::jsonb)
  from (
    select o from tcv.orders o
    where o.status = 'checkout' and o.checkout_session_id is not null and o.created_at > p_since
    order by o.created_at desc, o.id desc
    limit p_limit
  ) s
$$;

create or replace function public.tcv_record_event(p_id text, p_type text, p_ref text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into tcv.events (id, type, ref, payload) values (p_id, p_type, p_ref, p_payload)
  on conflict (id) do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- Fixed window: a window that started at least p_window_seconds ago is restarted at p_now.
create or replace function public.tcv_hit_rate_limit(
  p_key text, p_window_seconds integer, p_max integer, p_now timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into tcv.rate_limits as r (key, window_start, count) values (p_key, p_now, 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= p_now - make_interval(secs => p_window_seconds)
      then p_now else r.window_start end,
    count = case when r.window_start <= p_now - make_interval(secs => p_window_seconds)
      then 1 else r.count + 1 end
  returning r.count into v_count;
  return v_count <= p_max;
end;
$$;

create or replace function public.tcv_create_payout(
  p_id text, p_day date, p_mobile text, p_idempotency_key text, p_fee_rate double precision,
  p_payout_fee_rate double precision, p_max_amount double precision, p_min_amount integer, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids text[];
  v_gross bigint;
  v_amount integer;
  v_row tcv.payouts;
begin
  if exists (select 1 from tcv.payouts where day = p_day or id = p_id or idempotency_key = p_idempotency_key) then
    return null;
  end if;
  select coalesce(array_agg(c.id), '{}'), coalesce(sum(c.paid_amount), 0)
    into v_ids, v_gross
  from (
    select id, paid_amount from tcv.orders
    where status = 'paid' and payment_method = 'wave' and payout_id is null
    for update
  ) c;
  v_amount := tcv.payout_amount(v_gross, p_fee_rate, p_payout_fee_rate, p_max_amount);
  if v_amount < p_min_amount then
    return null;
  end if;
  insert into tcv.payouts (id, day, amount, mobile, status, idempotency_key, request_body, created_at, updated_at)
  values (p_id, p_day, v_amount, p_mobile, 'pending', p_idempotency_key, '', p_now, p_now)
  on conflict do nothing
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  update tcv.orders set payout_id = p_id where id = any (v_ids);
  return tcv.payout_json(v_row);
end;
$$;

-- succeeded and failed are final: a stale cron run can neither reopen nor rewrite them.
create or replace function public.tcv_update_payout(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('status', 'request_body', 'wave_payout_id', 'fee', 'error', 'updated_at') then
      raise exception 'tcv_update_payout: column % cannot be patched', v_key using errcode = '22023';
    end if;
  end loop;
  update tcv.payouts p set
    status = case when p_patch ? 'status' then p_patch ->> 'status' else p.status end,
    request_body = case when p_patch ? 'request_body' then p_patch ->> 'request_body' else p.request_body end,
    wave_payout_id = case when p_patch ? 'wave_payout_id' then p_patch ->> 'wave_payout_id' else p.wave_payout_id end,
    fee = case when p_patch ? 'fee' then (p_patch ->> 'fee')::numeric else p.fee end,
    error = case when p_patch ? 'error' then p_patch ->> 'error' else p.error end,
    updated_at = coalesce((p_patch ->> 'updated_at')::timestamptz, now())
  where p.id = p_id and p.status not in ('succeeded', 'failed');
end;
$$;

-- Detaching the orders of a payout that succeeded would pay them a second time: refused.
create or replace function public.tcv_fail_payout(p_id text, p_error text, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update tcv.payouts set status = 'failed', error = p_error, updated_at = p_now
  where id = p_id and status <> 'succeeded';
  if found then
    update tcv.orders set payout_id = null where payout_id = p_id;
  end if;
end;
$$;

create or replace function public.tcv_list_unsettled_payouts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(tcv.payout_json(p) order by p.day), '[]'::jsonb)
  from tcv.payouts p
  where p.status in ('pending', 'processing', 'unknown')
$$;

create or replace function public.tcv_purge(p_unpaid_before timestamptz, p_paid_before timestamptz, p_now timestamptz)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update tcv.orders set
    input = null, document = null, manual_payer_phone = null, ip_hash = null, purged_at = p_now
  where purged_at is null
    and ((status <> 'paid' and created_at < p_unpaid_before)
      or (status = 'paid' and coalesce(paid_at, created_at) < p_paid_before));
  get diagnostics v_count = row_count;
  delete from tcv.events where created_at < p_now - interval '30 days';
  delete from tcv.rate_limits where window_start < p_now - interval '2 days';
  return v_count;
end;
$$;

-- Day boundaries in UTC (= Dakar time).
create or replace function public.tcv_stats(p_now timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_d0 timestamptz := date_trunc('day', p_now at time zone 'UTC') at time zone 'UTC';
begin
  return jsonb_build_object(
    'today', tcv.period_stats(v_d0, v_d0 + interval '1 day'),
    'yesterday', tcv.period_stats(v_d0 - interval '1 day', v_d0),
    'last7', tcv.period_stats(v_d0 - interval '6 days', v_d0 + interval '1 day'),
    'last30', tcv.period_stats(v_d0 - interval '29 days', v_d0 + interval '1 day'),
    'allTime', (select jsonb_build_object('paid', count(*), 'revenue', coalesce(sum(paid_amount), 0))
                from tcv.orders where status = 'paid'),
    'pendingPayout', (select coalesce(sum(paid_amount), 0) from tcv.orders
                      where status = 'paid' and payment_method = 'wave' and payout_id is null),
    'recentOrders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'product', r.product, 'amount', r.amount, 'status', r.status,
        'payment_method', r.payment_method, 'manual_payer_phone', r.manual_payer_phone,
        'created_at', tcv.iso(r.created_at), 'paid_at', tcv.iso(r.paid_at)
      ) order by r.created_at desc, r.id desc), '[]'::jsonb)
      from (select * from tcv.orders order by created_at desc, id desc limit 50) r
    ),
    'payouts', (
      select coalesce(jsonb_agg(tcv.payout_json(s.p) order by (s.p).day desc), '[]'::jsonb)
      from (select p from tcv.payouts p order by p.day desc limit 30) s
    )
  );
end;
$$;

create or replace function public.tcv_get_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) from tcv.settings s
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: only the service role (the Edge Function) may call the Store API.
-- ---------------------------------------------------------------------------------------------

revoke all on function public.tcv_insert_order(jsonb) from public, anon, authenticated;
revoke all on function public.tcv_get_order(text) from public, anon, authenticated;
revoke all on function public.tcv_update_order(text, jsonb) from public, anon, authenticated;
revoke all on function public.tcv_mark_paid(text, text, integer, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_list_open_checkouts(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.tcv_record_event(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.tcv_hit_rate_limit(text, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_create_payout(text, date, text, text, double precision, double precision,
  double precision, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_update_payout(text, jsonb) from public, anon, authenticated;
revoke all on function public.tcv_fail_payout(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_list_unsettled_payouts() from public, anon, authenticated;
revoke all on function public.tcv_purge(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_stats(timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_get_settings() from public, anon, authenticated;

grant execute on function public.tcv_insert_order(jsonb) to service_role;
grant execute on function public.tcv_get_order(text) to service_role;
grant execute on function public.tcv_update_order(text, jsonb) to service_role;
grant execute on function public.tcv_mark_paid(text, text, integer, text, text, timestamptz) to service_role;
grant execute on function public.tcv_list_open_checkouts(timestamptz, integer) to service_role;
grant execute on function public.tcv_record_event(text, text, text, jsonb) to service_role;
grant execute on function public.tcv_hit_rate_limit(text, integer, integer, timestamptz) to service_role;
grant execute on function public.tcv_create_payout(text, date, text, text, double precision, double precision,
  double precision, integer, timestamptz) to service_role;
grant execute on function public.tcv_update_payout(text, jsonb) to service_role;
grant execute on function public.tcv_fail_payout(text, text, timestamptz) to service_role;
grant execute on function public.tcv_list_unsettled_payouts() to service_role;
grant execute on function public.tcv_purge(timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.tcv_stats(timestamptz) to service_role;
grant execute on function public.tcv_get_settings() to service_role;
