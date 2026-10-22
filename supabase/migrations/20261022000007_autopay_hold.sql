-- Teranga CV autopay, hardened: a unique amount is held from the moment it is SHOWN, not from the order's creation,
-- and an open order keeps it as long as its customer can open it (until the daily purge).
-- Applies on top of 000001 … 000006. Idempotent; runs on Supabase Postgres 17 and in PGlite.
-- Why: with the 000005 rule (amounts held 48 h after the order was created) an amount still shown to a customer could
-- be handed to another order, and the late transfer unlocked the OTHER order; a paid order freed its amount at once,
-- so a notification delivered again unlocked the next order given that amount.
-- New: column tcv.orders.manual_amount_at, tcv_hold_manual_amount, tcv_list_held_manual_orders; new definitions of
-- tcv.order_json and tcv_insert_order (every column of 000006 kept). tcv_assign_manual_amount and
-- tcv_list_open_manual_orders (000005) stay for the Edge Function deployed before this migration; the new one never
-- calls them. Deployment rule: from 000003 on, migrations use UPDATE only to erase data (the deployment tool asks for
-- an interactive confirmation before any statement that removes rows).

-- When the unique amount was given or last shown at checkout. Rows of 000005 have none: their hold starts at their
-- creation (coalesce(manual_amount_at, created_at) everywhere below), the old rule.
alter table tcv.orders add column if not exists manual_amount_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- Updated helpers (same signatures, new field)
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
    'buyer', o.buyer,
    'checkout_session_id', o.checkout_session_id,
    'wave_launch_url', o.wave_launch_url,
    'checkout_expires_at', tcv.iso(o.checkout_expires_at),
    'wave_transaction_id', o.wave_transaction_id,
    'payment_method', o.payment_method,
    'manual_payer_phone', o.manual_payer_phone,
    'manual_amount', o.manual_amount,
    'manual_amount_at', tcv.iso(o.manual_amount_at),
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
    id, access_token_hash, product, template, amount, currency, status, input, document, buyer,
    checkout_session_id, wave_launch_url, checkout_expires_at, wave_transaction_id, payment_method,
    manual_payer_phone, manual_amount, manual_amount_at, payment_detected_at, payment_detected_text,
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
    nullif(p_row -> 'buyer', 'null'::jsonb),
    p_row ->> 'checkout_session_id',
    p_row ->> 'wave_launch_url',
    (p_row ->> 'checkout_expires_at')::timestamptz,
    p_row ->> 'wave_transaction_id',
    p_row ->> 'payment_method',
    p_row ->> 'manual_payer_phone',
    (p_row ->> 'manual_amount')::integer,
    (p_row ->> 'manual_amount_at')::timestamptz,
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

-- ---------------------------------------------------------------------------------------------
-- New Store functions (lib/autopay.ts prepareManualCheckout and handlePaymentNotify)
-- ---------------------------------------------------------------------------------------------

-- An amount is HELD by an order when it is unpaid (checkout / awaiting_manual, payment_method null) and either not
-- purged (its customer can still open it: the unpaid purge runs once a day, so an order may live up to about 96 h) or
-- given or shown after p_unpaid_since (now − 72 h); or when it was paid after p_paid_since (now − 48 h).
-- * paid order → its amount, unchanged;
-- * the order still holds its amount → the same amount, shown again: manual_amount_at = p_now;
-- * else its previous amount if nobody holds it, otherwise the smallest free p_base − k (k in 1..p_max_offset);
--   none free → manual_amount and manual_amount_at become null and the result is null (the customer is asked for the
--   catalogue price: it unlocks nothing automatically, and while the order is open the near match is off for its
--   price, see tcv_list_held_manual_orders; the owner checks the transfer).
-- Every call takes the advisory lock of tcv_assign_manual_amount (both may run while a deployment is in progress):
-- assignments run one after the other and each sees the amounts committed by the previous ones.
create or replace function public.tcv_hold_manual_amount(
  p_id text, p_base integer, p_max_offset integer, p_now timestamptz, p_unpaid_since timestamptz,
  p_paid_since timestamptz
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_order tcv.orders;
  v_amount integer;
begin
  perform pg_advisory_xact_lock(hashtext('tcv_assign_manual_amount'));
  select * into v_order from tcv.orders o where o.id = p_id for update;
  if not found then
    return null;
  end if;
  if v_order.status = 'paid' then
    return v_order.manual_amount;
  end if;
  if v_order.manual_amount is not null and v_order.status in ('checkout', 'awaiting_manual')
     and v_order.payment_method is null
     and (v_order.purged_at is null or coalesce(v_order.manual_amount_at, v_order.created_at) > p_unpaid_since) then
    update tcv.orders set manual_amount_at = p_now where id = p_id;
    return v_order.manual_amount;
  end if;
  select c.amount into v_amount
  from (
    select v_order.manual_amount as amount, 0 as rank
    where v_order.manual_amount is not null and v_order.manual_amount > 0 and v_order.manual_amount < p_base
      and v_order.manual_amount >= p_base - greatest(p_max_offset, 0)
    union all
    select p_base - k, k from generate_series(1, greatest(p_max_offset, 0)) as k where p_base - k > 0
  ) c
  where not exists (
    select 1 from tcv.orders o
    where o.id <> p_id
      and o.manual_amount = c.amount
      and ((o.status in ('checkout', 'awaiting_manual') and o.payment_method is null
            and (o.purged_at is null or coalesce(o.manual_amount_at, o.created_at) > p_unpaid_since))
        or (o.status = 'paid' and o.paid_at > p_paid_since))
  )
  order by c.rank
  limit 1;
  update tcv.orders set
    manual_amount = v_amount,
    manual_amount_at = case when v_amount is null then null else p_now end
  where id = p_id;
  return v_amount;
end;
$$;

-- The open manual orders a received transfer may be for. Purged orders are left out: their customer can no longer
-- open them (the owner sees the unmatched transfer). Every listed order with a manual_amount holds it (an open order
-- that is not purged always does, see above): only those can be unlocked. An order asked for the catalogue price
-- (manual_amount null, no Wave session) is listed too: it never matches, but while it is open a rounded-up transfer
-- of its price is ambiguous, so the API turns the near match off for that price.
create or replace function public.tcv_list_held_manual_orders() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(tcv.order_json(o) order by o.created_at desc, o.id desc), '[]'::jsonb)
  from tcv.orders o
  where o.status in ('checkout', 'awaiting_manual') and o.payment_method is null and o.purged_at is null
    and (o.manual_amount is not null or o.checkout_session_id is null)
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: only the service role (the Edge Function) may call the Store API.
-- ---------------------------------------------------------------------------------------------

revoke all on function public.tcv_hold_manual_amount(text, integer, integer, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tcv_list_held_manual_orders() from public, anon, authenticated;

grant execute on function public.tcv_hold_manual_amount(text, integer, integer, timestamptz, timestamptz, timestamptz)
  to service_role;
grant execute on function public.tcv_list_held_manual_orders() to service_role;
