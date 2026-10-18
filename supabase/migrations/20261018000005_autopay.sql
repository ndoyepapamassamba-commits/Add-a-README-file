-- Teranga CV "autopay": manual Wave transfers recognised by a unique amount, reported by the owner's phone.
-- Applies on top of 20261018000001_schema.sql (+ 000003 stage, 000004 premium). Idempotent; runs on Supabase
-- Postgres 17 and in PGlite.
-- New: three order columns, tcv_assign_manual_amount / tcv_list_open_manual_orders /
-- tcv_record_payment_detection, and updated order_json, tcv_insert_order, tcv_purge, tcv_stats.
-- Deployment rule: from 000003 on, migrations use UPDATE only to erase data (the deployment tool asks for an
-- interactive confirmation before any statement that removes rows), so tcv_purge below empties rows in place.

alter table tcv.orders add column if not exists manual_amount integer;
alter table tcv.orders add column if not exists payment_detected_at timestamptz;
alter table tcv.orders add column if not exists payment_detected_text text;

-- Last phone notification (admin "Téléphone relié" line).
create index if not exists events_type_created_at_idx on tcv.events (type, created_at);

-- ---------------------------------------------------------------------------------------------
-- Updated helpers and Store functions (same signatures, new fields)
-- ---------------------------------------------------------------------------------------------

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
    'manual_amount', o.manual_amount,
    'payment_detected_at', tcv.iso(o.payment_detected_at),
    'payment_detected_text', o.payment_detected_text,
    'paid_amount', o.paid_amount,
    'paid_at', tcv.iso(o.paid_at),
    'payout_id', o.payout_id,
    'ip_hash', o.ip_hash,
    'created_at', tcv.iso(o.created_at),
    'purged_at', tcv.iso(o.purged_at)
  )
$$;

create or replace function public.tcv_insert_order(p_row jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into tcv.orders (
    id, access_token_hash, product, template, amount, currency, status, input, document,
    checkout_session_id, wave_launch_url, checkout_expires_at, wave_transaction_id, payment_method,
    manual_payer_phone, manual_amount, payment_detected_at, payment_detected_text,
    paid_amount, paid_at, payout_id, ip_hash, created_at, purged_at
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
    (p_row ->> 'manual_amount')::integer,
    (p_row ->> 'payment_detected_at')::timestamptz,
    p_row ->> 'payment_detected_text',
    (p_row ->> 'paid_amount')::integer,
    (p_row ->> 'paid_at')::timestamptz,
    p_row ->> 'payout_id',
    p_row ->> 'ip_hash',
    coalesce((p_row ->> 'created_at')::timestamptz, now()),
    (p_row ->> 'purged_at')::timestamptz
  );
end;
$$;

-- Personal data is erased in place (UPDATE only, see the header):
-- * expired orders lose input, document, payer phone, notification text (it names the payer) and ip hash;
--   the payment facts (amounts, dates, status) stay for the accounts;
-- * events older than 30 days lose their payload (Wave event bodies, phone notification texts); the row
--   itself is kept, so a replayed webhook or notification id is still recognised as a duplicate;
-- * rate_limits rows hold only a hashed key and a counter: they are left as they are (a stale window is
--   restarted by tcv_hit_rate_limit).
create or replace function public.tcv_purge(p_unpaid_before timestamptz, p_paid_before timestamptz, p_now timestamptz)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update tcv.orders set
    input = null, document = null, manual_payer_phone = null, payment_detected_text = null, ip_hash = null,
    purged_at = p_now
  where purged_at is null
    and ((status <> 'paid' and created_at < p_unpaid_before)
      or (status = 'paid' and coalesce(paid_at, created_at) < p_paid_before));
  get diagnostics v_count = row_count;
  update tcv.events set payload = null
  where created_at < p_now - interval '30 days' and payload is not null;
  return v_count;
end;
$$;

-- Day boundaries in UTC (= Dakar time). lastPhoneNotificationAt feeds the admin health line.
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
        'manual_amount', r.manual_amount, 'payment_detected_at', tcv.iso(r.payment_detected_at),
        'created_at', tcv.iso(r.created_at), 'paid_at', tcv.iso(r.paid_at)
      ) order by r.created_at desc, r.id desc), '[]'::jsonb)
      from (select * from tcv.orders order by created_at desc, id desc limit 50) r
    ),
    'payouts', (
      select coalesce(jsonb_agg(tcv.payout_json(s.p) order by (s.p).day desc), '[]'::jsonb)
      from (select p from tcv.payouts p order by p.day desc limit 30) s
    ),
    'lastPhoneNotificationAt', (select tcv.iso(max(e.created_at)) from tcv.events e where e.type = 'phone.notification')
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- New Store functions
-- ---------------------------------------------------------------------------------------------

-- Unique amount p_base - k (smallest free k in 1..p_max_offset) among unpaid manual orders created after
-- p_since. Amounts repeat after the waiting window, so uniqueness is enforced here rather than by an index.
-- Row locks alone cannot see a concurrent assignment to ANOTHER order (it is not committed yet), so every
-- assignment first takes the same transaction-scoped advisory lock: they run one after the other, and each
-- statement below sees the amounts committed by the previous ones. The order row itself is locked FOR UPDATE.
create or replace function public.tcv_assign_manual_amount(
  p_id text, p_base integer, p_max_offset integer, p_since timestamptz
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_current integer;
  v_amount integer;
begin
  perform pg_advisory_xact_lock(hashtext('tcv_assign_manual_amount'));
  select o.manual_amount into v_current from tcv.orders o where o.id = p_id for update;
  if not found then
    return null;
  end if;
  if v_current is not null then
    return v_current;
  end if;
  select p_base - k into v_amount
  from generate_series(1, greatest(p_max_offset, 0)) as k
  where p_base - k > 0
    and not exists (
      select 1 from tcv.orders o
      where o.id <> p_id
        and o.status in ('checkout', 'awaiting_manual')
        and o.payment_method is null
        and o.created_at > p_since
        and o.manual_amount = p_base - k
    )
  order by k
  limit 1;
  if v_amount is null then
    return null;
  end if;
  update tcv.orders set manual_amount = v_amount where id = p_id;
  return v_amount;
end;
$$;

create or replace function public.tcv_list_open_manual_orders(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(tcv.order_json(o) order by o.created_at desc, o.id desc), '[]'::jsonb)
  from tcv.orders o
  where o.status in ('checkout', 'awaiting_manual') and o.payment_method is null and o.created_at > p_since
$$;

-- Never marks the order paid (tcv_mark_paid does, when MANUAL_AUTO_CONFIRM is on).
create or replace function public.tcv_record_payment_detection(p_id text, p_text text, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update tcv.orders set payment_detected_at = p_now, payment_detected_text = p_text where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: only the service role (the Edge Function) may call the Store API.
-- ---------------------------------------------------------------------------------------------

revoke all on function public.tcv_assign_manual_amount(text, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_list_open_manual_orders(timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_record_payment_detection(text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.tcv_assign_manual_amount(text, integer, integer, timestamptz) to service_role;
grant execute on function public.tcv_list_open_manual_orders(timestamptz) to service_role;
grant execute on function public.tcv_record_payment_detection(text, text, timestamptz) to service_role;
