# Teranga CV — end-to-end test

`cd e2e && npm install && node flow.mjs` — starts `supabase/functions/api/dev.ts` twice (Wave and manual payment),
then drives Chromium at 360 × 740 through the whole customer and owner journey (wizard, blurred preview, fake Wave
payment, cancel and retry, manual transfer + admin unlock, PDF/Word downloads, admin revenue, nightly cron).
Needs `deno` on the PATH; screenshots, downloads and server logs go to `$SHOTS_DIR` (default: the OS temp folder).
