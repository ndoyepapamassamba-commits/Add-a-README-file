# Teranga CV — technical spec (single source of truth)

Automated micro-business: a Senegalese job seeker fills a form, gets a free **blurred preview** of a
professional French CV and/or lettre de motivation, pays **by Wave** (1 000–1 500 FCFA), and instantly
downloads the full document (PDF / Word / print). Every night the day's Wave revenue is **paid out
automatically** to the owner's personal Wave number (Wave Payout API). No human in the loop.

Bridge mode (until the owner's Wave Business API key exists): "manual" payment — the customer sends a unique
amount by normal Wave transfer to the owner's number; the owner's phone reports the Wave notification and the
order unlocks by itself (see "Autopay"), the owner can still unlock it from `admin.html`. Both modes coexist;
automatic Wave wins when `WAVE_API_KEY` is set. Products: cv, lettre, pack (see below), stage ("Pack Stage") and
premium ("CV Premium"), each described in its own section at the end.

Shared types: `supabase/functions/api/lib/types.ts` (read it first — it is the contract).

## Hosting

* Backend: Supabase project `teranga-cv` (ref `seegnylaubuularegmku`, region eu-west-3), one Edge Function
  named **`api`** (Deno, `verify_jwt = false`). Base URL:
  `https://seegnylaubuularegmku.supabase.co/functions/v1/api`. Supabase rewrites `text/html` to text/plain,
  so the function serves JSON only.
* Frontend: static files in `cv/` served by GitHub Pages
  (`https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/`) and, until Pages is enabled, by
  `https://rawcdn.githack.com/ndoyepapamassamba-commits/Add-a-README-file/<commit-sha>/cv/index.html`.
  All asset links in `cv/` MUST be relative.
* Cron: `pg_cron` + `pg_net` call `POST /cron/reconcile` every 10 min and `POST /cron/daily` at 20:30 UTC
  (= 20:30 Dakar, Senegal is UTC+0), header `x-cron-secret` read from `tcv.settings`.

## Repository layout and ownership

```
supabase/
  SPEC.md                         (this file)
  config.toml                     [functions.api] verify_jwt = false                 — backend
  migrations/20261018000001_schema.sql   tables + tcv_* SQL functions (PGlite-testable) — backend
  migrations/20261018000002_cron.sql     pg_cron/pg_net jobs, secret read from tcv.settings (Supabase only) — backend
  migrations/20261018000003_stage.sql    product check accepts 'stage'                                — backend
  migrations/20261018000004_premium.sql  product check accepts all five products                      — backend
  migrations/20261018000005_autopay.sql  unique manual amounts + phone detections (see "Autopay")    — backend
  functions/api/
    index.ts                      Deno.serve(createReloadingApp(…)): env over tcv.settings, reloaded ≤ every 60 s — backend
    dev.ts                        local server: real app + MemoryStore + FakeWave + serves ../../../cv  — backend
    lib/types.ts                  contract (do not change shapes without updating all users)
    lib/app.ts                    createApp(deps) => (req: Request) => Promise<Response>  — backend
    lib/http.ts, lib/config.ts, lib/ids.ts, lib/validate.ts, lib/pricing.ts, lib/phone.ts — backend
    lib/wave.ts                   HttpWaveClient + verifyWaveSignature + FakeWave      — backend
    lib/store_memory.ts           MemoryStore                                          — backend
    lib/store_sql.ts              SqlStore(queryFn) — calls the tcv_* SQL functions; used with PGlite in tests  — backend
    lib/store_supabase.ts         SupabaseStore — same tcv_* functions through supabase.rpc()  — backend
    lib/payout.ts, lib/reconcile.ts                                                    — backend
    lib/generator/index.ts        generateDocument()                                   — generator
    lib/generator/banks.ts        French phrase banks, SECTORS, QUALITIES               — generator
    lib/generator/text.ts         French text helpers                                  — generator
    lib/generator/polish.ts       copy-editing of typed input (casing, missing accents, acronyms) — generator
    lib/generator/stage.ts, stage_banks.ts      Pack Stage (see "Pack Stage")           — generator
    lib/generator/premium.ts, banks_premium.ts  CV Premium (see "CV Premium")           — generator
    lib/validate_stage.ts, lib/autopay.ts                                              — backend
    lib/redact.ts                 redactDocument()                                     — generator
    lib/llm.ts                    optional OpenRouter rewriter (makeEnhancer)          — generator
    tests/*.test.ts               deno tests (each owner writes tests for their modules)
cv/                                                                                    — frontend
  index.html  resultat.html  admin.html  confirmer.html  config.js  data.js  render.js  app.css  app.js
  stage.js (Pack Stage wizard parts)  premium-render.js  premium-wizard.js  premium-export.js  premium.css
  guides/*.html  sitemap.xml                                                           — content
LANCEMENT-CV.md  MARKETING-CV.md  (repo root)                                          — content
```

Run tests: `deno test -A supabase/functions/api/tests/` and type-check with
`deno check supabase/functions/api/index.ts supabase/functions/api/dev.ts`.
Imports: Deno style with explicit `.ts` extensions; npm packages via `npm:pkg@x.y.z` (pinned).
supabase-js is imported ONLY in `lib/store_supabase.ts` and `index.ts`.

## Business constants

| Key | Default | Env override |
|---|---|---|
| prices | cv 1000, lettre 1000, pack 1500, stage 1500 (1 company) / 2500 (2–5), premium 5000 XOF | `PRICE_CV`, `PRICE_LETTRE`, `PRICE_PACK`, `PRICE_STAGE`, `PRICE_STAGE_MULTI`, `PRICE_PREMIUM` |
| brand | "Teranga CV" | `BRAND_NAME` |
| preview rate limit | 12 / hour / IP | `PREVIEW_RATE_LIMIT_PER_HOUR` |
| payout min | 1000 XOF | `PAYOUT_MIN` |
| reserve kept in business wallet | 0 | `PAYOUT_RESERVE` |
| Wave checkout fee | 0.01 | `WAVE_FEE_RATE` |
| Wave payout fee (paid on top of receive_amount) | 0.01 | `PAYOUT_FEE_RATE` |
| data retention | unpaid 3 days, paid 30 days | — |

**Where settings come from.** Every key below can be set either as an Edge Function env var/secret or
as a row in the private table `tcv.settings(key text primary key, value text not null, updated_at)`,
read through `tcv_get_settings() → jsonb object` (Store.getSettings). Env wins over the table.
`index.ts` loads settings at most once per 60 s per function instance (cache in module scope) and builds
`Config` with `loadConfig(envGet, settings)`. Reason: the deployer can only write private values
(owner phone, ADMIN_KEY, CRON_SECRET) into the database, not into function secrets. The Wave API key
should preferably be entered by the owner as a function secret in the Supabase dashboard.

Other settings: `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_WEBHOOK_MODE` (`signing` default | `shared`),
`OWNER_WAVE_MOBILE` (normalised to E.164 `+2217XXXXXXXX`; invalid → payouts disabled),
`PAYOUT_ENABLED` (`"true"` to enable), `MANUAL_WAVE_NUMBER`, `OWNER_WHATSAPP` (digits, e.g. `221771234567`;
defaults to the digits of MANUAL_WAVE_NUMBER/OWNER_WAVE_MOBILE), `ADMIN_KEY`, `CRON_SECRET`,
`ALLOWED_RETURN_PREFIXES` (comma list; default:
`https://ndoyepapamassamba-commits.github.io/Add-a-README-file/,https://rawcdn.githack.com/ndoyepapamassamba-commits/Add-a-README-file/,https://raw.githack.com/ndoyepapamassamba-commits/Add-a-README-file/`;
non-https entries are dropped),
`OPENROUTER_API_KEY`, `LLM_MODEL` (default `google/gemini-2.5-flash`), `PUBLIC_API_BASE` (public https address
of this function, default `https://seegnylaubuularegmku.supabase.co/functions/v1/api`, trailing slashes removed;
non-https, query or fragment → default; dev.ts uses `http://localhost:<port>/api`).
`http://localhost:<port>/` is added ONLY by dev.ts config, never by the production default — the
production default list contains https prefixes only and validation rejects non-https outside dev.

Senegal mobile numbers: 9 digits starting with 70, 71, 75, 76, 77 or 78. `phone.ts` exports
`normalizeSnMobile(s): string | null` accepting "77 123 45 67", "771234567", "+221771234567",
"00221771234567", "221 77 123 45 67" → "+221771234567"; anything else → null. And
`formatSnMobile("+221771234567") → "+221 77 123 45 67"`.

## HTTP API (function base `/functions/v1/api`)

The router strips everything up to and including the first `/api` path segment, so `/api/orders`,
`/functions/v1/api/orders` → `/orders`. CORS on every response: `Access-Control-Allow-Origin: *`,
`Access-Control-Allow-Methods: GET, POST, OPTIONS`,
`Access-Control-Allow-Headers: content-type, authorization, x-cron-secret`. `OPTIONS` → 204.
All bodies are JSON (`content-type: application/json; charset=utf-8`). Errors:
`{ "error": "<code>", "message": "<French sentence for the customer>", "fields"?: {"<path>": "<French message>"} }`.
Request bodies larger than 32 KB → 413. Unknown route → 404 `not_found`. Uncaught error → 500 `internal`
(log the error, never leak stack traces). Other codes: 400 `bad_request` (unreadable JSON), 413
`payload_too_large`, 401 `unauthorized` (cron/admin), 401 `bad_signature` and 503 `webhook_disabled` (webhook);
a known path with the wrong method → 404 `not_found`.

Order lookup failures (unknown id OR wrong token) both return **404 `not_found`** (no enumeration).
Token comparison: sha256(token) compared to `access_token_hash` in constant time.

| Method & path | Auth | Behaviour |
|---|---|---|
| `GET /health` | – | `{ ok: true, time }` |
| `GET /config` | – | `{ brandName, currency:"XOF", prices:{cv,lettre,pack,stage,premium,stageMulti}, payment:{ wave: bool, manual: bool, manualWaveNumber: string\|null (formatted "+221 77 …"), ownerWhatsapp: string\|null } }`. `manual` is true only when manual mode is the one in use (no Wave client); `manualWaveNumber` is returned whenever configured. |
| `POST /orders` | – | body `{ product, template, data: OrderInput, website?: "" }`. `website` is a honeypot: non-empty → 400 `validation`. Rate limit key `preview:<ipHash>` (3600 s, `previewRateLimitPerHour`) and `preview:global:<YYYY-MM-DD>` (86400 s, max 5000) → 429 `rate_limited`. Validate (see below) → 400. Generate document (seed = order id), optionally `deps.enhance` (ignore null), insert order (status `preview`, amount = price). → **201** `{ order: PublicOrder & { token }, preview: Document(redacted) }` |
| `GET /orders/:id?t=TOKEN` | token | If purged → 410 `purged`. If status `checkout` and Wave client present: fetch the session, and if it is paid (see "Payment confirmation") mark paid. → 200 `{ order: PublicOrder, document?: Document (only when paid), preview?: Document (redacted, when not paid) }` |
| `POST /orders/:id/template` | body `t` | `{ t, template }` → updates template (allowed in any status) → 200 `{ order: PublicOrder }` |
| `POST /orders/:id/checkout` | body `t` | `{ t, returnBase }`. Paid → 409 `already_paid`. `returnBase` (checked before choosing the mode, so in both modes) must be an absolute https URL starting with one of `allowedReturnPrefixes` (no query, no fragment; strip trailing `/`) → else 400 `bad_return_url`. **Wave mode** (wave client present): reuse the stored session if status is `checkout` and `checkout_expires_at` > now + 2 min; else create one: `amount` = order.amount, `clientReference` = order.id, `successUrl` = `${returnBase}/resultat.html?o=${id}&t=${t}`, `errorUrl` = `${returnBase}/index.html?o=${id}&t=${t}&paiement=echec`; store session id, launch url, `checkout_expires_at` (= `when_expires` or now + 30 min), status `checkout`. → 200 `{ mode:"wave", launchUrl }`. WaveError → 502 `wave_error`. **Manual mode** (no wave client, `manualWaveNumber` set) → 200 `{ mode:"manual", waveNumber (formatted), amount, reference: id, whatsapp: ownerWhatsapp }`. Neither → 503 `payment_unavailable` ("Le paiement en ligne arrive très bientôt."). |
| `POST /orders/:id/manual-paid` | body `t` | Manual mode only (else 409 `not_manual`). `{ t, payerPhone }` → `normalizeSnMobile` else 400. Status → `awaiting_manual`, store `manual_payer_phone` (E.164). → 200 `{ order: PublicOrder }` |
| `POST /wave/webhook` | Wave | See "Webhook". |
| `POST /cron/reconcile` | `x-cron-secret` | See "Reconcile". 401 if header ≠ `cronSecret` (constant time) or `cronSecret` unset. |
| `POST /cron/daily` | `x-cron-secret` | See "Daily payout". |
| `GET /admin/stats` | `Authorization: Bearer ADMIN_KEY` | → 200 `{ stats: Stats, health: { wave, webhook, payout, manual, llm, ownerWaveMobile: formatted\|null, phoneHook, phoneHookUrl, lastPhoneNotificationAt } }` (see "Autopay"). 401 otherwise (also when ADMIN_KEY unset). |
| `POST /admin/orders/:id/unlock` | Bearer ADMIN_KEY | `markPaid(method "manual", paidAmount = order.amount)` → 200 `{ ok:true, changed }`. 404 if unknown. |

`PublicOrder = { id, product, template, amount, currency, status, paymentMethod, paidAt, createdAt }`.

### Validation (`validate.ts`)

`validateOrderRequest(body) → { ok:true, product, template, data } | { ok:false, fields }`.
Compose accents (Unicode NFC), trim every string, collapse internal whitespace runs to one space (keep newlines
in `missions` / `motivation`), strip control chars except `\n`. Empty optional strings → `undefined`.
Limits: firstName/lastName ≤ 40 (required); phone required, must satisfy `normalizeSnMobile` OR be
8–20 chars of `+ 0-9 space` (foreign numbers allowed); email optional ≤ 80, simple regex; city
required ≤ 60; address ≤ 80; jobTitle required ≤ 80; kind/sector/level/civility must be enum values;
education ≤ 6 items (degree required ≤ 100, others ≤ 100 / year ≤ 20); experiences ≤ 6 items (title
required ≤ 80, company ≤ 80, place ≤ 60, start/end ≤ 20, missions ≤ 800); skills ≤ 20 × 60;
it ≤ 15 × 40; languages ≤ 6 (name ≤ 30, level enum); interests ≤ 8 × 40; letter required with
company (≤ 100) when product ∈ {lettre, pack}; recipient ≤ 100; companyCity ≤ 60; source ≤ 100;
qualities ≤ 4 × 40; motivation ≤ 600. For product `cv`, `letter` is ignored. At least one education
OR one experience is required for products cv/pack (error key `experiences`). `fields` keys are dotted paths (`identity.firstName`,
`experiences.2.title`) with French messages.

### Payment confirmation (shared by GET order, webhook, reconcile)

A Wave session confirms order O iff `payment_status === "succeeded"` AND `currency === "XOF"` AND
`client_reference === O.id` AND `parseInt(amount) >= O.amount`. Then
`store.markPaid(O.id, { method:"wave", paidAmount: parseInt(amount), transactionId, sessionId, paidAt: now })`.
Anything else (processing, cancelled, failed, expired, amount mismatch) = not paid; log mismatches.

### Webhook (`POST /wave/webhook`)

1. `waveWebhookSecret` unset → 503. Read the RAW body with `await req.text()` before any parsing.
2. `signing` mode: header `Wave-Signature: t=<unix>,v1=<hex>[,v1=<hex>…]`. Expected =
   lowercase hex HMAC-SHA256(key = secret, message = `t + rawBody`) (plain concatenation, no
   separator). Accept if it equals ANY v1 (constant-time compare) and `|now − t| ≤ 300 s`. Else 401.
   `shared` mode: `Authorization: Bearer <secret>` constant-time compare. Else 401.
   Official test vector (must be a unit test, with the time check disabled/now = t):
   secret `wave_sn_WHS_xz4m6g8rjs9bshxy05xj4khcvjv7j3hcp4fbpvv6met0zdrjvezg`, t `1667920421`,
   body = exact contents of `supabase/functions/api/tests/fixtures/wave_vector_body.txt` (no trailing
   newline), expected v1 `53c971695230e9c51b1030d673eee76e70bbcdf8a7c5b8c1d44e0b8b1329647b`.
3. Parse JSON `{ id, type, data }` (invalid → 400). `store.recordEvent(id, type, data?.id ?? null, event)`
   → duplicate → 200 `{ ok:true, duplicate:true }`.
4. `checkout.session.completed`: load order by `data.client_reference` (missing → 200 ignored). If a Wave
   client exists, re-fetch the session by `data.id` with a 3 s timeout and use the fetched object when
   it succeeds (fall back to the signed payload on timeout/network error). Apply "Payment confirmation".
5. Every other event type → 200 `{ ok:true, ignored:true }`; a handled completion → 200 `{ ok:true, paid: bool }`.
   Always answer within 5 s.

### Reconcile (`POST /cron/reconcile`)

`store.listOpenCheckouts(now − 24 h, 50)`; for each, `getCheckoutSession` and apply "Payment
confirmation". Stop on a 429 WaveError. → `{ ok:true, checked, paid }`. No Wave client → `{ ok:true, skipped:"no_wave" }`.

### Daily payout (`POST /cron/daily`, `payout.ts`)

`day` = `now.toISOString().slice(0,10)`. Payout id `PO-YYYYMMDD`, idempotency key `teranga-cv-PO-YYYYMMDD`,
client_reference = payout id, `payment_reason` = `"Revenus Teranga CV"`.
`buildPayoutBody(row)` is deterministic: `JSON.stringify({ currency:"XOF", receive_amount:String(row.amount), mobile:row.mobile, client_reference:row.id, payment_reason:"Revenus Teranga CV" })` — the SAME bytes on every retry.

1. **Settle** `store.listUnsettledPayouts()`: `processing` → `searchPayouts(id)` and update status from the
   result (`succeeded`/`failed`→failPayout/`reversed`→failPayout). `pending`/`unknown` → re-send
   `createPayout(buildPayoutBody(row), row.idempotency_key)` (Wave guarantees no double send for the same
   key) and handle the result like step 3.
2. **Create** only if `payoutEnabled && ownerWaveMobile && wave`: `balance = await wave.getBalance()`
   (on error → `maxAmount = null`), `maxAmount = balance − payoutReserve`. `row = store.createPayout(...)`.
   null → nothing to pay today.
3. **Send**: `updatePayout(id, { request_body })`, then `wave.createPayout(body, key)`:
   status `succeeded` → `succeeded` (+ `wave_payout_id`, `fee`); `processing` → `processing`;
   `failed` → `failPayout(id, payout_error.error_code)`. WaveError retryable → status `unknown`
   (retried next run with the same key); non-retryable → `failPayout(id, code)`.
4. **Purge** personal data: unpaid orders older than 3 days, paid orders older than 30 days.
5. → `{ ok:true, payout: row|null, settled: n, purged: n, errors: string[] }`. Never throws; errors are logged and reported.

`computePayoutAmount(gross, feeRate, payoutFeeRate, maxAmount)` (exported from payout.ts and mirrored in
SQL): `net = floor(gross*(1-feeRate))`; `base = maxAmount==null ? net : min(net, maxAmount)`;
`amount = floor((base-1)/(1+payoutFeeRate))`; `amount < 0 → 0`.

## Database (schema `tcv`, functions in `public`)

Tables (schema `tcv`, RLS enabled, no policies): `orders` (columns = `OrderRow`, `id` PK,
`checkout_session_id` unique, indexes on `(status, created_at)`, `paid_at`, `payout_id`), `payouts`
(`PayoutRow`, `day` unique, `idempotency_key` unique), `events` (`id` PK, type, ref, payload jsonb,
created_at), `rate_limits` (`key` PK, `window_start` timestamptz, `count` int), `settings` (`key` PK,
`value` text not null, `updated_at` timestamptz default now()).

One SQL function per Store method, `security definer`, `set search_path = ''` (fully-qualified names),
args prefixed `p_`, jsonb in/out using the `OrderRow`/`PayoutRow` field names:
`tcv_insert_order(p_row jsonb)`, `tcv_get_order(p_id text) → jsonb|null`, `tcv_update_order(p_id, p_patch jsonb)`
(whitelisted columns only; must refuse status `paid` and paid_* fields), `tcv_mark_paid(p_id, p_method,
p_paid_amount, p_transaction_id, p_session_id, p_paid_at) → boolean` (single `UPDATE … WHERE status <> 'paid'`),
`tcv_list_open_checkouts(p_since, p_limit) → jsonb array`, `tcv_record_event(p_id, p_type, p_ref, p_payload) → boolean`
(`insert … on conflict do nothing`), `tcv_hit_rate_limit(p_key, p_window_seconds, p_max, p_now) → boolean`,
`tcv_create_payout(p_id, p_day, p_mobile, p_idempotency_key, p_fee_rate, p_payout_fee_rate, p_max_amount, p_min_amount, p_now) → jsonb|null`
(locks candidate orders `FOR UPDATE`, inserts payout, attaches orders — all-or-nothing; returns null on
existing day or amount < min), `tcv_update_payout(p_id, p_patch jsonb)`, `tcv_fail_payout(p_id, p_error, p_now)`
(status failed + detach orders), `tcv_list_unsettled_payouts() → jsonb array`, `tcv_purge(p_unpaid_before,
p_paid_before, p_now) → int` (sets input/document/manual_payer_phone/payment_detected_text/ip_hash NULL, purged_at = now;
events older than 30 days keep their row but lose their payload; rate_limits are left alone — since 000005 it uses
UPDATE only, see "Migrations"), `tcv_stats(p_now) → jsonb` (`Stats`; day boundaries in UTC),
`tcv_get_settings() → jsonb` (object of all key → value).
Autopay (`20261018000005_autopay.sql`): columns `manual_amount`, `payment_detected_at`, `payment_detected_text`
(cleared by `tcv_purge`), `tcv_assign_manual_amount(p_id, p_base, p_max_offset, p_since) → int|null`,
`tcv_list_open_manual_orders(p_since) → jsonb array`, `tcv_record_payment_detection(p_id, p_text, p_now)`.
`revoke all on function … from public, anon, authenticated; grant execute … to service_role;`
(tests create those roles in PGlite if missing). Prefix-free, idempotent migrations (`create … if not exists`,
`create or replace function`).

The cron migration enables `pg_cron`, `pg_net` and schedules the jobs. It does NOT contain the secret:
the deployer inserts `CRON_SECRET` into `tcv.settings` out-of-band (one-off SQL, never committed).
Jobs: `tcv-reconcile` (`*/10 * * * *`) and `tcv-daily` (`30 20 * * *`) with
`net.http_post(url := 'https://seegnylaubuularegmku.supabase.co/functions/v1/api/cron/…', headers :=
jsonb_build_object('content-type','application/json','x-cron-secret', (select value from tcv.settings
where key = 'CRON_SECRET')), body := '{}'::jsonb, timeout_milliseconds := 20000)`.
`cron.schedule` with the same job name replaces the job (idempotent).

## Document generation (generator owner)

`generateDocument(input: OrderInput, product: Product, opts: { seed: string; now: Date }): Document` —
pure, deterministic for a given seed. `cv` built for cv/pack, `lettre` for lettre/pack, the other is `null`.
Hard rules:
* **Never invent facts**: no employer, diploma, date, number, certification or experience that the
  customer did not type. Phrase banks may only *phrase* their real data (job title, sector, level, kind,
  latest degree, latest experience, skills, qualities, motivation).
* Professional, natural French used in Senegal's job market; correct elision (`de`→`d'` before vowels
  and mute h: "poste d'assistant", "d'hôtesse"), gender agreement from `civility`
  (motivé/motivée, diplômé/diplômée, prêt/prête…), capitalisation (lastName UPPERCASE, firstName Title-Case,
  bullets start with a capital and have no trailing period), French dates ("Dakar, le 1er octobre 2026",
  months lower-case), no "undefined"/"null"/"NaN", no double spaces, no space before ",", no empty "()".
* Variety: pick among ≥ 3 variants per sentence slot using a PRNG seeded from `seed`.
* CV: `fullName` "Awa NDIAYE"; `title` = jobTitle (stage: "Stagiaire — <jobTitle>" is NOT allowed;
  keep jobTitle, add nothing); `contacts` = [formatted phone, email?, "city" or "address, city"];
  `profile` 2–3 sentences (level × kind × sector banks + real data); experiences in input order,
  `period` "2022 – 2024" / "Depuis 2023" (end empty or matching /aujourd|actuel|en cours|présent|now/i) /
  "2024" (only one) / ""; bullets from `missions` split on newlines, ";", "•", leading "-"/"*" (max 6,
  trimmed, capitalised, no trailing period; none → []); education in input order; skills deduped
  case-insensitively (max 12); `it`, `languages`, `interests` as given.
* Lettre (4 paragraphs): P1 hook + application (job, company, `source` if given: "Suite à votre annonce
  parue sur …"); P2 background (latest degree + school; latest experience; débutant → training,
  internships, eagerness); P3 skills + 2–4 qualities (mapped phrases) + interest for the company
  (+ customer's `motivation` text, cleaned, if given); P4 availability + interview request. `subject`:
  emploi "Objet : Candidature au poste de/d' <jobTitle, in-sentence case: first letter lower-cased unless acronym>", stage "Objet : Demande de stage — <jobTitle>",
  alternance "Objet : Candidature en alternance — <jobTitle>". `recipient` = [recipient || "À l'attention
  du Responsable des Ressources Humaines", company, companyCity?]. `sender` = [fullName, address/city,
  phone, email?]. `salutation` "Madame, Monsieur,". `closing` one of ≥ 3 formal formulas.
  `signature` = fullName.
* `banks.ts` exports `SECTORS: Record<Sector, { label: string; domain: string; skills: string[] }>` and
  `QUALITIES: Array<{ label: string; phrase: (g: (m: string, f: string) => string) => string }>` using
  exactly these labels: Rigueur, Sens de l'organisation, Esprit d'équipe, Ponctualité, Sens du contact,
  Autonomie, Capacité d'adaptation, Dynamisme, Honnêteté, Discrétion, Créativité, Résistance au stress.
  Unknown qualities typed by the customer are used verbatim (lower-cased in-sentence).

`redactDocument(doc): Document` — same shape; masked runs use only `█` and spaces (one `█` per letter,
max 12 per word). Visible: cv.fullName, title, contacts, experience title/company/place/period,
education, languages, it, interests, first 3 skills, first 8 words of profile; lettre sender, recipient,
placeDate, subject, salutation, first 12 words of paragraph 1, closing, signature. Everything else masked
(remaining skills become masked runs, bullets fully masked, paragraphs 2–4 fully masked). A test must
prove no hidden word (≥ 4 letters) from the full document appears in the redacted JSON except where it
also appears in a visible field.

`lib/llm.ts`: `makeEnhancer({ apiKey, model, fetchFn? }) → (doc, input, product) => Promise<Document|null>`
rewriting only `cv.profile`, experience `bullets` and `lettre.paragraphs` via OpenRouter
(`POST https://openrouter.ai/api/v1/chat/completions`, `response_format: {type:"json_object"}`, 20 s
timeout). Reject (return null) on any error, bad shape, lengths outside 0.5×–2× of the draft, or any digit
sequence not present in the input. Never throws.

## Frontend (frontend owner)

Plain HTML/CSS/JS, French, mobile-first (360 px wide Android first), no framework, no build step,
fast on 3G (system fonts; only external script: html2pdf.js from cdnjs, loaded lazily on the result
page). Every DOM text from data uses `textContent` / `createElement` — **never `innerHTML` with
customer or API data**. `config.js` sets
`window.TCV_CONFIG = { apiBase: "https://seegnylaubuularegmku.supabase.co/functions/v1/api" }`
(dev.ts serves an override). Prices/payment mode come from `GET /config` (fallback 1000/1000/1500).

* `index.html` — landing (hero with the promise "CV + lettre de motivation pro en 5 minutes", price,
  "Payez avec Wave"), 3-step how-it-works, product cards (CV / Lettre / Pack — pack highlighted as best
  value), sample CV visual (rendered with `render.js` from a built-in fictional sample clearly labelled
  "Exemple"), FAQ, footer (data deleted after 30 days, contact WhatsApp if configured). **No fake
  testimonials, no fake counters, no invented statistics.** Form wizard: Offre → Identité (civilité,
  prénom, nom, téléphone, email, ville, adresse) → Objectif (poste visé, type emploi/stage/alternance,
  secteur, niveau) → Formation (repeatable) → Expériences (repeatable, missions textarea) → Compétences
  (chips suggested from `data.js` per sector + free input), Informatique (chips: Word, Excel,
  PowerPoint, Internet, Canva, …), Langues (prefilled Français/Wolof/Anglais with level selects),
  Centres d'intérêt → Lettre (only for lettre/pack: entreprise, destinataire, ville, source,
  qualités ×4 chips from QUALITIES, motivation) → "Voir mon aperçu gratuit". Client-side validation
  mirrors the server; server `fields` errors are shown next to the inputs. Draft autosaved in
  localStorage (try/catch). Preview screen: template switcher (classique / moderne / élégant), the
  blurred preview, price, big Wave button "Payer {amount} FCFA avec Wave". Wave mode → `window.location`
  to `launchUrl` (never an iframe/webview). Manual mode → instructions (number, exact amount,
  reference), payer phone input, "J'ai payé" → `/manual-paid` → open WhatsApp `wa.me/<ownerWhatsapp>`
  with a prefilled message (reference, amount, payer number) → go to resultat page. `?paiement=echec`
  → friendly retry banner. Keep `{id, token}` of every order in localStorage "Mes documents".
* `resultat.html?o=ID&t=TOKEN` — polls `GET /orders/:id` every 4 s (max 15 min, with a "Vérifier
  maintenant" button) until paid; then renders the full document(s): template switcher, editable text
  (contenteditable) for last-minute fixes, buttons "Télécharger PDF" (html2pdf, A4, one file per
  document), "Télécharger Word" (.doc = HTML with Word namespaces, Blob download), "Imprimer",
  "Copier la lettre", "Partager le site sur WhatsApp". Purged → explains data was deleted after 30 days.
* `admin.html` — takes ADMIN_KEY from the URL fragment `#k=<key>` (then removes it from the address bar
  with `history.replaceState`) or asks for it once; stores it in localStorage; shows health flags with plain-French hints,
  revenue cards (aujourd'hui / hier / 7 j / 30 j / total), "à reverser ce soir", recent orders table with a
  "Débloquer" button for `awaiting_manual`, payouts table. `noindex`.
* `render.js` — `TCVRender.cv(doc.cv, template) → HTMLElement`, `TCVRender.lettre(doc.lettre, template) →
  HTMLElement`; A4 (210 mm) layouts, three themes, print CSS (`@page { size: A4; margin: 0 }`), masked runs
  (`/█[█ ]*/g`) rendered as blurred grey spans with a lock overlay on the preview.
* `data.js` — `TCV_DATA = { sectors: [{key,label,skills[]}], levels, kinds, qualities, itSkills, languageLevels }`
  using exactly the enum keys from types.ts and the QUALITIES labels above.

## Market facts to respect (from verified research, 2026-10)

* Youth (15–34) unemployment 27.4 % (ANSD ENES T4 2025). Competitor Africarrieres sells an AI CV for
  ~4 900 FCFA and a letter for ~2 450 FCFA (accepts Wave); free CV builders exist (AfroTools, Simoon CV),
  so our edge is: French written for Senegal's job market, no account, instant, paid by Wave, very cheap.
* Reach in Senegal (DataReportal 2026): Facebook 3.6 M, YouTube 5.4 M, LinkedIn 1.5 M, Instagram 1.45 M;
  TikTok not measured. Marketing order: Facebook job groups, WhatsApp status/channels, YouTube Shorts/TikTok,
  LinkedIn.
* Do NOT market letters for Campus France / study applications (such a letter must present the applicant's
  own project; do not attribute a formal rule to Campus France, it is unverified). Senegal only (cross-border Wave payments may be refused).
* Owner legal minimum: NINEA (E-NINEA online), declaration to the CDP (law 2008-12) because CVs are
  personal data; data is hosted by Supabase in the EU (Paris) — mention in the privacy notice; collect no
  sensitive data (ethnicity, religion, health, political opinions); retention 30 days.

## Content (content owner)

* `cv/guides/` — 4 genuinely useful SEO articles in French for Senegal (≥ 900 words each, own
  wording, no invented statistics): `modele-cv-senegal.html`, `lettre-de-motivation-stage.html`,
  `lettre-de-motivation-sans-experience.html`, `cv-premier-emploi.html`; each with title/meta
  description/canonical/Open Graph/JSON-LD Article, internal links, and CTA buttons to `../index.html`.
  Plus `cv/sitemap.xml` (GitHub Pages URLs).
* `MARKETING-CV.md` — ready-to-copy 30-day plan: 15 TikTok/Reels scripts (hook ≤ 2 s, 3 beats, CTA),
  15 WhatsApp status texts, 10 Facebook-group posts (Senegalese job groups), a partnership pitch for
  cybercafés/secrétariats/écoles, all with `{LIEN}` placeholder. Honest claims only.
* `LANCEMENT-CV.md` — owner guide in very simple French: what exists, the links (site, admin), what only
  the owner can do (Wave Business account + API key + webhook; then the system pays them nightly), how
  revenue reaches their Wave, how to read the admin page, FAQ. No promises of income.

## Migrations and deployment

Applied in file-name order, idempotent (the PGlite contract tests run `001`, `003`, `004`, `005`; `002` needs
pg_cron/pg_net): `001` schema, `002` cron jobs, `003` product check with `'stage'`, `004` product check with all
five products, `005` autopay columns/functions and new definitions of `tcv.order_json`, `tcv_insert_order`,
`tcv_purge`, `tcv_stats` (every column and block of `001` kept). The live project already ran `001` and `002`.
**Rule:** the deployment tool asks for an interactive confirmation before any SQL containing the keyword that
removes rows, so no migration from `003` on may contain that word (in any case, comments included): personal data
is erased with UPDATEs only (`tests/backend_migrations.test.ts` checks it, and that `003`→`005` keep the rows of a
database that only ran `001`).

## Pack Stage (product `stage`)

For students looking for an internship: a one-page student CV, one *lettre de demande de stage* per company
(1–5) and a sending message. Price `prices.stage` (1 company) or `stageMultiPrice` (2–5), computed server-side
from `internship.companies.length` (`orderPrice`). Never a convention or an attestation, no promise, no fact about
a company: the only company-specific text is the student's own `reason`.

* **Input** `OrderInput.internship` (types.ts): school, program ≤ 100, studyLevel ≤ 40, internshipType
  (`academique|fin_etudes|vacances|perfectionnement`), start/end/durationText ≤ 30, conventionProvided (boolean;
  "oui"/"non" accepted), department ≤ 80, projects ≤ 4 × 200, qualities ≤ 4 × 40, channel (`email|whatsapp|depot`),
  companies 1–5 { name ≤ 100, city ≤ 60, recipient ≤ 100, department ≤ 80, reason 20–300 }. `letter` is ignored;
  `target.kind` is forced to "stage", jobTitle defaults to department or program, sector to "autre", level to
  "debutant". Education, a project or an experience is required. Paths like `internship.companies.2.reason`
  (`lib/validate_stage.ts`).
* **Generation** (`lib/generator/stage.ts`, after `polishInput`): `cv` = the regular CV builder plus each project
  as an experience "Projet académique" / "Activité associative"; `lettre` = null; `lettres[i]` with seed
  `${orderSeed}:${i}` (subject "Objet : Demande de stage {type} — {department or program}", recipient or "Monsieur
  le Directeur des Ressources Humaines", P1 who/request, P2 skills/qualities/projects, P3 the cleaned reason, P4
  availability, convention only if provided, interview); `envoi` = { emailSubject "Candidature — Stage … — Prénom
  NOM", emailBody ending with "Pièces jointes : CV, lettre de motivation", whatsapp ≤ 600 chars }. No LLM rewrite.
* **Preview** (`redact.ts`): `lettres[0]` like a lettre, `lettres[1..]` recipient + subject only, `envoi` subject only.
* **Site**: home card "Pack Stage" (`#stage`), wizard steps from `cv/stage.js` (Identité → Études → Stage →
  Formation prefilled → Projets & expériences → Compétences → Langues → Entreprises with live price), preview and
  result tabs CV · Lettre 1…N · Message d'envoi, ONE PDF (one letter per page) and ONE Word file for all letters,
  the CV as its own file, copy buttons for the e-mail and the WhatsApp message.

## CV Premium (product `premium`)

For experienced professionals: a two-page A4 "Prestige" CV plus a self-contained web version, `prices.premium`
(5 000 XOF). Every figure, achievement, tag, domain and quote is typed by the customer.

* **Input** `OrderInput.premium`: headline ≤ 160 (required), pitch ≤ 500, quote ≤ 220, keyFigures ≤ 4 { value ≤ 12
  with a digit, "+" or "%" and no letter but k/K/M, label ≤ 70 }, domains ≤ 3 { title ≤ 40, detail ≤ 120 },
  achievements ≤ 6 { title ≤ 70, detail ≤ 240, tags ≤ 4 × 30 }, skillLevels ≤ 8 { name ≤ 40,
  level `Expert|Avancé|Bon|Notions` }, qualities ≤ 6 × 40, personal { age, situation ≤ 30 }, accent
  `marine|bordeaux|foret` (default marine). Blank list items are dropped; `letter` is ignored.
* **Generation** (`lib/generator/premium.ts`): `cv` = regular CV + `cv.premium` (customer text copy-edited only;
  the profile is the pitch, plus one aim sentence when the pitch is a single sentence, else the regular profile; a generic first-person
  `quote` from `banks_premium.ts` when none was typed; `personal` lines "Âge : …" / "Situation : …"); `lettre` null.
* **Preview**: headline, key figures, domain and achievement titles, first tag per card, skills and levels,
  qualities visible; quote, details, other tags and personal lines masked (plus the regular CV rules).
* **Site**: home card with a fictional sample, extra wizard steps (accroche & chiffres clés, domaines &
  réalisations, niveaux, photo, couleur — `premium-wizard.js`), `TCVRender.premium(cv, accent, photo)`
  (`premium-render.js`). The photo is resized on the phone (400 × 400 JPEG ≤ 150 KB), kept in localStorage under
  the order id and never sent; resultat.html offers "Ajouter ma photo" when missing. Result (`premium-export.js`):
  colour switcher, PDF of two pages at most, Word (.doc), "CV web (.html)" (inline CSS, photo as data URL, no
  script, `noindex`, only optional Google Fonts), Cormorant Garamond + Manrope loaded on the result page only.

## Autopay: manual transfers detected by the owner's phone (`lib/autopay.ts`)

Settings `PHONE_HOOK_KEY` (secret sent by the owner's phone; unset → hook disabled) and `MANUAL_AUTO_CONFIRM`
(default true; `false`/`0`/`no`/`non`/`off` → detections are only flagged). Owner guide: `MACRODROID.md`.

* **Unique amount.** Manual checkout moves a `preview` order to `checkout` and calls
  `store.assignManualAmount(id, amount, 49, now − 48 h)`: `manual_amount = amount − k`, smallest free k among
  unpaid checkout/awaiting_manual orders created in the last 48 h (advisory lock + `FOR UPDATE` in SQL; no
  index, amounts repeat after 48 h). All taken (or order older than 48 h) → catalogue price, logged. The
  manual response adds `exactAmount`, `exactAmountFormatted` ("1 487 FCFA") and `autoUnlock`
  (`PHONE_HOOK_KEY` set and auto-confirm on); `amount` stays the catalogue price. `manual-paid` is optional
  and `payerPhone` may be empty (a non-empty invalid number is still 400). Admin unlock and confirm record
  `manual_amount ?? amount`.
* **`POST /payments/notify`** — key in `?k=` or `x-hook-key` (constant time; unset → 503 `hook_disabled`,
  wrong → 401). Body ≤ 4 KB: JSON `{ title?, text }`, `text/plain`, or form `text=…&title=…`. The text
  (title + text) is normalised (accents, NBSP/narrow NBSP) and must look like money received ("reçu",
  "received", "vous a envoyé", "sent you") and not an own operation ("vous avez envoyé", "envoyé à", "payé à",
  "retrait", "dépôt", English equivalents) → else `{ok:true, ignored:"not_incoming"}`. Amount = number with
  thousand separators (space, NBSP, ".", ",") followed by F/FCFA/F CFA/CFA/XOF (or preceded by it), skipping
  balances/fees, preferring the first after the keyword → else `{ignored:"no_amount"}`. Every authenticated
  call records event `phone:<sha256(normalised text|minute)>` of type `phone.notification` (the admin
  heartbeat; payload `{text}` only for incoming money) → already recorded → `{ok:true, duplicate:true}`.
  Match among `listOpenManualOrders(now − 48 h)` with a `manual_amount`: exact, else a single order created
  in the last 2 h with `manual_amount < amount ≤ amount_catalogue + 100`; several → none. Matched →
  `recordPaymentDetection` and, with auto-confirm, `markPaid(manual, paidAmount = amount received)`.
  → `{ ok:true, matched: id|null, amount, paid }`. The text is never logged.
* **`POST /payments/confirm`** `{ o, c }`, `c = confirmToken(ADMIN_KEY, o)` = first 32 hex of
  HMAC-SHA256(ADMIN_KEY, "confirm:" + o) → `markPaid` → `{ ok:true, changed }`; invalid or no ADMIN_KEY → 401,
  unknown order → 404. Page `cv/confirmer.html?o=…&c=…` confirms only on a button press (never on GET).
* **Admin.** `recentOrders` add `manual_amount`, `payment_detected_at`; `health` adds `phoneHook`,
  `lastPhoneNotificationAt` (newest `phone.notification` event, carried by `tcv_stats`) and `phoneHookUrl` =
  `${PUBLIC_API_BASE}/payments/notify?k=${encodeURIComponent(PHONE_HOOK_KEY)}` (null without a key): the link the
  owner pastes into MacroDroid. It is the only place the key leaves the server (never in `/config`, errors or logs).
  admin.html shows it in the card "Relier mon téléphone (MacroDroid)": read-only monospace field that wraps,
  "Copier le lien" (navigator.clipboard, else the field is selected), 6 short steps, "Ne partagez jamais ce lien",
  and the same state as the "Téléphone relié" health line. Logging out empties the field.
* **dev.ts** sets `PHONE_HOOK_KEY=dev-phone` and serves `/fake-phone` (GET page that posts a notification).
* **Customer panel**: "Envoyez exactement 1 487 FCFA" with a copy button, why the amount is exact, one line
  "Les frais de transfert Wave sont à votre charge." (Wave charges the sender about 1 %), the number, "J'ai envoyé
  l'argent" → resultat.html polls and unlocks by itself; "Prévenir le vendeur sur WhatsApp" is optional.
* **Database** (`20261018000005_autopay.sql`): columns `manual_amount`, `payment_detected_at`,
  `payment_detected_text`; `tcv_assign_manual_amount`, `tcv_list_open_manual_orders`, `tcv_record_payment_detection`
  (service role only). The notification text is purged with the order; the dedupe event loses its payload after
  30 days (row kept).
