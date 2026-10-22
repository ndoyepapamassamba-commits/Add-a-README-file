-- Teranga Pro: course « Power Query pour le reporting bancaire » (product pq_essentiel).
-- Applies on top of 20261018000001_schema.sql, 000003 stage, 000004 premium and 000005 autopay. Idempotent; runs on
-- Supabase Postgres 17 and in PGlite.
-- New: products pq_essentiel (sold) and pq_complet / imf_kit (reserved), column tcv.orders.buyer, tables
-- tcv.course_assets, tcv.course_upload_chunks, tcv.leads, tcv.quiz_attempts and their Store functions (among them
-- the chunked upload used by PUT /admin/course-assets/:name and tcv_rate_limit_count); new definitions of
-- tcv.order_json, tcv_insert_order, tcv_purge and tcv_stats (every column and block of 000005 kept).
-- Deployment rule: from 000003 on, migrations erase data with UPDATE only (the deployment tool asks for an
-- interactive confirmation before any statement that removes rows).

-- ---------------------------------------------------------------------------------------------
-- Products and course buyer
-- ---------------------------------------------------------------------------------------------

alter table tcv.orders drop constraint if exists orders_product_check;
alter table tcv.orders add constraint orders_product_check
  check (product in ('cv', 'lettre', 'pack', 'stage', 'premium', 'pq_essentiel', 'pq_complet', 'imf_kit'));

-- Course orders only: { fullName, email?, phone?, acceptCgv, acceptedAt, cgvVersion } (CourseBuyer in types.ts).
alter table tcv.orders add column if not exists buyer jsonb;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- Private course content (module HTML, workbooks, quiz and its key; `_backup/…` copies are never served: the API
-- only reads the assets its manifest lists under `pq_essentiel/`). Read by the Edge Function only.
create table if not exists tcv.course_assets (
  name       text primary key,
  mime       text not null check (length(mime) between 3 and 120),
  bytes      bytea not null,
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

-- `<folder>/<path>`: no "..", no empty segment, no trailing slash (same rule as isCourseAssetName in store_memory.ts).
alter table tcv.course_assets drop constraint if exists course_assets_name_check;
alter table tcv.course_assets add constraint course_assets_name_check
  check (name ~ '^[a-z0-9_]+/[A-Za-z0-9._/-]{1,150}$' and position('..' in name) = 0 and position('//' in name) = 0
         and right(name, 1) <> '/');

-- Staging area of the chunked upload (plain SQL statements of about 200 KB, or PUT /admin/course-assets/:name with
-- chunks of at most 1 000 000 base64 characters). A committed upload keeps its rows with an empty b64 (no row removal).
create table if not exists tcv.course_upload_chunks (
  upload_id    text not null check (upload_id ~ '^[A-Za-z0-9_.-]{8,100}$'),
  seq          integer not null check (seq >= 0 and seq < 1000),
  b64          text not null,
  created_at   timestamptz not null default now(),
  committed_at timestamptz,
  primary key (upload_id, seq)
);

-- "Prévenez-moi de l'ouverture": contact fields are emptied 12 months after sign-up (tcv_purge).
create table if not exists tcv.leads (
  id           text primary key,
  email        text,
  whatsapp     text,
  consent_text text not null,
  source       text not null,
  product      text not null default 'pq_essentiel',
  ip_hash      text,
  created_at   timestamptz not null default now(),
  purged_at    timestamptz,
  check (purged_at is not null or email is not null or whatsapp is not null)
);

create index if not exists leads_created_at_idx on tcv.leads (created_at);

-- Passed quiz attempts (failed attempts are not stored). The buyer's name stays on the order.
create table if not exists tcv.quiz_attempts (
  id               text primary key,
  order_id         text not null references tcv.orders (id),
  score            integer not null check (score between 0 and 100),
  correct          integer not null check (correct >= 0),
  total            integer not null check (total > 0),
  passed           boolean not null,
  public_listing   boolean not null default false,
  attestation_code text check (attestation_code ~ '^[0-9a-f]{12}$'),
  created_at       timestamptz not null default now()
);

create index if not exists quiz_attempts_order_idx on tcv.quiz_attempts (order_id, created_at);
create index if not exists quiz_attempts_code_idx on tcv.quiz_attempts (attestation_code);

alter table tcv.course_assets enable row level security;
alter table tcv.course_upload_chunks enable row level security;
alter table tcv.leads enable row level security;
alter table tcv.quiz_attempts enable row level security;

revoke all on all tables in schema tcv from public, anon, authenticated;

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
    'buyer', o.buyer,
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
    id, access_token_hash, product, template, amount, currency, status, input, document, buyer,
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
    nullif(p_row -> 'buyer', 'null'::jsonb),
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
-- * expired orders lose input, document, buyer, payer phone, notification text and ip hash; the payment facts stay.
--   Course orders (pq_*, imf_kit) stay readable 730 days after payment (access period), other paid orders 30 days
--   (p_paid_before); unpaid orders of every product follow p_unpaid_before;
-- * whatever the order, the Wave notification text (payer name and number) and the payer phone are erased 30 days
--   after the detection (or the payment), as the privacy policy says; not counted as a purge;
-- * events older than 30 days lose their payload, the row is kept (duplicate detection);
-- * leads lose their contact fields 365 days after sign-up;
-- * upload chunks left uncommitted for 2 days lose their content;
-- * rate_limits rows are left as they are.
create or replace function public.tcv_purge(p_unpaid_before timestamptz, p_paid_before timestamptz, p_now timestamptz)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update tcv.orders set
    input = null, document = null, buyer = null, manual_payer_phone = null, payment_detected_text = null,
    ip_hash = null, purged_at = p_now
  where purged_at is null
    and ((status <> 'paid' and created_at < p_unpaid_before)
      or (status = 'paid' and product not in ('pq_essentiel', 'pq_complet', 'imf_kit')
          and coalesce(paid_at, created_at) < p_paid_before)
      or (status = 'paid' and product in ('pq_essentiel', 'pq_complet', 'imf_kit')
          and coalesce(paid_at, created_at) < p_now - interval '730 days'));
  get diagnostics v_count = row_count;
  update tcv.orders set payment_detected_text = null, manual_payer_phone = null
  where (payment_detected_text is not null or manual_payer_phone is not null)
    and coalesce(payment_detected_at, paid_at, created_at) < p_now - interval '30 days';
  update tcv.events set payload = null
  where created_at < p_now - interval '30 days' and payload is not null;
  update tcv.leads set email = null, whatsapp = null, ip_hash = null, purged_at = p_now
  where purged_at is null and created_at < p_now - interval '365 days';
  update tcv.course_upload_chunks set b64 = ''
  where committed_at is null and b64 <> '' and created_at < p_now - interval '2 days';
  return v_count;
end;
$$;

-- Funnel per product over the orders created since p_from (null = all time).
create or replace function tcv.funnel_rows(p_from timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'product', f.product, 'orders', f.orders, 'checkouts', f.checkouts, 'paid', f.paid, 'revenue', f.revenue
  ) order by f.product), '[]'::jsonb)
  from (
    select o.product,
      count(*) as orders,
      count(*) filter (where o.status in ('checkout', 'awaiting_manual', 'paid')) as checkouts,
      count(*) filter (where o.status = 'paid') as paid,
      coalesce(sum(o.paid_amount) filter (where o.status = 'paid'), 0) as revenue
    from tcv.orders o
    where p_from is null or o.created_at >= p_from
    group by o.product
  ) f
$$;

revoke all on function tcv.funnel_rows(timestamptz) from public;

-- Day boundaries in UTC (= Dakar time). Every block of 000005 is kept; funnel, leads and quizPasses are new.
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
    'lastPhoneNotificationAt', (select tcv.iso(max(e.created_at)) from tcv.events e where e.type = 'phone.notification'),
    'funnel', jsonb_build_object(
      'last30', tcv.funnel_rows(v_d0 - interval '29 days'),
      'allTime', tcv.funnel_rows(null)
    ),
    'leads', (select jsonb_build_object(
                'total', count(*),
                'last30', count(*) filter (where l.created_at >= v_d0 - interval '29 days'),
                'active', count(*) filter (where l.purged_at is null))
              from tcv.leads l),
    'quizPasses', (select jsonb_build_object(
                     'total', count(distinct q.order_id),
                     'last30', count(distinct q.order_id) filter (where q.created_at >= v_d0 - interval '29 days'))
                   from tcv.quiz_attempts q where q.passed)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Course content: chunked upload (plain SQL) and read
-- ---------------------------------------------------------------------------------------------

-- One chunk = base64 of a slice of the file, each chunk encoded on its own: ≤ 140 000 raw bytes (≈ 186 700 characters)
-- from scripts/course-sql.mjs, ≤ 720 000 raw bytes (960 000 characters) from the upload route. Re-sending the same
-- (upload_id, seq) replaces it. Returns the number of uncommitted chunks held for this upload.
create or replace function public.tcv_course_upload_chunk(p_upload_id text, p_seq integer, p_b64 text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if p_b64 is null or length(p_b64) > 1000000 then
    raise exception 'tcv_course_upload_chunk: chunk missing or longer than 1000000 characters' using errcode = '22023';
  end if;
  perform decode(p_b64, 'base64'); -- invalid base64 raises here, before anything is stored
  insert into tcv.course_upload_chunks as c (upload_id, seq, b64, created_at, committed_at)
  values (p_upload_id, p_seq, p_b64, now(), null)
  on conflict (upload_id, seq) do update set b64 = excluded.b64, created_at = now(), committed_at = null;
  select count(*) into v_count from tcv.course_upload_chunks where upload_id = p_upload_id and committed_at is null;
  return v_count;
end;
$$;

-- Assembles chunks 0..p_chunks-1, checks the sha256 of the whole file, then creates or replaces the asset.
create or replace function public.tcv_course_upload_commit(
  p_upload_id text, p_name text, p_mime text, p_sha256 text, p_chunks integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
  v_max integer;
  v_bytes bytea;
  v_sha text;
  v_row tcv.course_assets;
begin
  select count(*), max(seq) into v_n, v_max
  from tcv.course_upload_chunks where upload_id = p_upload_id and committed_at is null;
  if p_chunks is null or p_chunks < 1 or v_n <> p_chunks or v_max <> p_chunks - 1 then
    raise exception 'tcv_course_upload_commit: % chunk(s) held, % expected', coalesce(v_n, 0), p_chunks
      using errcode = '22023';
  end if;
  select string_agg(decode(c.b64, 'base64'), ''::bytea order by c.seq) into v_bytes
  from tcv.course_upload_chunks c where c.upload_id = p_upload_id and c.committed_at is null;
  v_sha := encode(sha256(coalesce(v_bytes, ''::bytea)), 'hex');
  if v_sha <> lower(coalesce(p_sha256, '')) then
    raise exception 'tcv_course_upload_commit: sha256 mismatch, received %', v_sha using errcode = '22023';
  end if;
  insert into tcv.course_assets as a (name, mime, bytes, sha256, updated_at)
  values (p_name, p_mime, coalesce(v_bytes, ''::bytea), v_sha, now())
  on conflict (name) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256,
    updated_at = now()
  returning * into v_row;
  update tcv.course_upload_chunks set b64 = '', committed_at = now()
  where upload_id = p_upload_id and committed_at is null;
  return jsonb_build_object('name', v_row.name, 'mime', v_row.mime, 'size', octet_length(v_row.bytes),
    'sha256', v_row.sha256, 'updated_at', tcv.iso(v_row.updated_at));
end;
$$;

-- Small asset (≤ 140 000 bytes) in one statement.
create or replace function public.tcv_course_put_asset(p_name text, p_mime text, p_b64 text, p_sha256 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := 'put-' || left(lower(coalesce(p_sha256, '')), 64);
begin
  perform public.tcv_course_upload_chunk(v_id, 0, p_b64);
  return public.tcv_course_upload_commit(v_id, p_name, p_mime, p_sha256, 1);
end;
$$;

-- The asset with its bytes as base64 (no line breaks), or null.
create or replace function public.tcv_course_asset(p_name text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', a.name, 'mime', a.mime, 'size', octet_length(a.bytes), 'sha256', a.sha256,
    'updated_at', tcv.iso(a.updated_at), 'base64', translate(encode(a.bytes, 'base64'), E'\n', '')
  )
  from tcv.course_assets a where a.name = p_name
$$;

-- Metadata only (no bytes), for upload checks: select public.tcv_course_asset_list('pq_essentiel/');
create or replace function public.tcv_course_asset_list(p_prefix text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', a.name, 'mime', a.mime, 'size', octet_length(a.bytes), 'sha256', a.sha256,
    'updated_at', tcv.iso(a.updated_at)
  ) order by a.name), '[]'::jsonb)
  from tcv.course_assets a
  where left(a.name, length(coalesce(p_prefix, ''))) = coalesce(p_prefix, '')
$$;

-- Read-only view of a tcv_hit_rate_limit bucket: its count in the current window, 0 when absent or expired (the upload
-- route refuses an IP after too many wrong tokens, even with the right one, without counting its good requests).
create or replace function public.tcv_rate_limit_count(p_key text, p_window_seconds integer, p_now timestamptz)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.count from tcv.rate_limits r
    where r.key = p_key and r.window_start > p_now - make_interval(secs => p_window_seconds)
  ), 0)
$$;

-- ---------------------------------------------------------------------------------------------
-- Leads and quiz
-- ---------------------------------------------------------------------------------------------

create or replace function public.tcv_insert_lead(p_row jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into tcv.leads (id, email, whatsapp, consent_text, source, product, ip_hash, created_at, purged_at)
  values (
    p_row ->> 'id',
    p_row ->> 'email',
    p_row ->> 'whatsapp',
    p_row ->> 'consent_text',
    p_row ->> 'source',
    coalesce(p_row ->> 'product', 'pq_essentiel'),
    p_row ->> 'ip_hash',
    coalesce((p_row ->> 'created_at')::timestamptz, now()),
    (p_row ->> 'purged_at')::timestamptz
  );
end;
$$;

create or replace function public.tcv_insert_quiz_attempt(p_row jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into tcv.quiz_attempts (id, order_id, score, correct, total, passed, public_listing, attestation_code, created_at)
  values (
    p_row ->> 'id',
    p_row ->> 'order_id',
    (p_row ->> 'score')::integer,
    (p_row ->> 'correct')::integer,
    (p_row ->> 'total')::integer,
    (p_row ->> 'passed')::boolean,
    coalesce((p_row ->> 'public_listing')::boolean, false),
    p_row ->> 'attestation_code',
    coalesce((p_row ->> 'created_at')::timestamptz, now())
  );
end;
$$;

-- Summary of the passed attempts of an order (null when it never passed). The latest pass sets code and listing.
create or replace function public.tcv_quiz_progress(p_order_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'firstPassedAt', tcv.iso(min(q.created_at)),
    'lastPassedAt', tcv.iso(max(q.created_at)),
    'bestScore', max(q.score),
    'lastScore', (array_agg(q.score order by q.created_at desc, q.id desc))[1],
    'code', (array_agg(q.attestation_code order by q.created_at desc, q.id desc))[1],
    'publicListing', (array_agg(q.public_listing order by q.created_at desc, q.id desc))[1],
    'passes', count(*)
  ) end
  from tcv.quiz_attempts q
  where q.order_id = p_order_id and q.passed
$$;

-- The attestation behind a code, whatever its listing choice (the API answers 404 unless publicListing is true).
-- Null when unknown, or when the order was purged.
create or replace function public.tcv_find_attestation(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', p_code,
    'orderId', o.id,
    'product', o.product,
    'fullName', o.buyer ->> 'fullName',
    'passedAt', tcv.iso(p.first_passed),
    'publicListing', p.last_listing
  )
  from (
    select q.order_id,
      min(q.created_at) as first_passed,
      (array_agg(q.public_listing order by q.created_at desc, q.id desc))[1] as last_listing
    from tcv.quiz_attempts q
    where q.passed and q.order_id = (
      select q2.order_id from tcv.quiz_attempts q2 where q2.attestation_code = p_code and q2.passed limit 1
    )
    group by q.order_id
  ) p
  join tcv.orders o on o.id = p.order_id
  where o.purged_at is null and o.buyer is not null
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: only the service role (the Edge Function) may call the Store API.
-- ---------------------------------------------------------------------------------------------

revoke all on function public.tcv_course_upload_chunk(text, integer, text) from public, anon, authenticated;
revoke all on function public.tcv_course_upload_commit(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.tcv_course_put_asset(text, text, text, text) from public, anon, authenticated;
revoke all on function public.tcv_course_asset(text) from public, anon, authenticated;
revoke all on function public.tcv_course_asset_list(text) from public, anon, authenticated;
revoke all on function public.tcv_rate_limit_count(text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.tcv_insert_lead(jsonb) from public, anon, authenticated;
revoke all on function public.tcv_insert_quiz_attempt(jsonb) from public, anon, authenticated;
revoke all on function public.tcv_quiz_progress(text) from public, anon, authenticated;
revoke all on function public.tcv_find_attestation(text) from public, anon, authenticated;

grant execute on function public.tcv_course_upload_chunk(text, integer, text) to service_role;
grant execute on function public.tcv_course_upload_commit(text, text, text, text, integer) to service_role;
grant execute on function public.tcv_course_put_asset(text, text, text, text) to service_role;
grant execute on function public.tcv_course_asset(text) to service_role;
grant execute on function public.tcv_course_asset_list(text) to service_role;
grant execute on function public.tcv_rate_limit_count(text, integer, timestamptz) to service_role;
grant execute on function public.tcv_insert_lead(jsonb) to service_role;
grant execute on function public.tcv_insert_quiz_attempt(jsonb) to service_role;
grant execute on function public.tcv_quiz_progress(text) to service_role;
grant execute on function public.tcv_find_attestation(text) to service_role;
