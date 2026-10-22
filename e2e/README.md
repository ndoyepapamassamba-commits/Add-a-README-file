# Teranga CV — end-to-end test

`cd e2e && npm install && node flow.mjs` — starts `supabase/functions/api/dev.ts` twice (Wave and manual payment),
then drives Chromium at 360 × 740 through the whole customer and owner journey (wizard, blurred preview, fake Wave
payment, Wave app taking over the tab, cancel and retry, manual transfer + admin unlock, PDF/Word downloads, admin
revenue, nightly cron, the admin card « Relier mon téléphone » (MacroDroid link ending in `k=dev-phone`, « Copier le
lien » with its select() fallback, « Tester l'action » shown on the « Téléphone relié » line), private browsing with markup typed as a name), then `products.mjs` (same run): the Pack Stage
in manual mode (3 companies, unique amount, transfer recognised through the dev page `/fake-phone` →
`POST /api/payments/notify`, letters PDF of 3 pages) and the CV Premium (photo kept on the phone, masked Prestige
preview, fake Wave payment, PDF of at most 2 pages, Word, « CV web (.html) »; manual mode: 5 000 FCFA minus a
unique offset), then `course.mjs` (same run): the Teranga Pro course (`formation/`, PUBLIC lorem fixture only) —
`demo-shim.js` proven idle without the demo flag (Node vm records every access), sales closed (lead form, free module,
sitemap, SEO basics), manual purchase (exact amount 24 999 FCFA, a round « 25 000F » notification unlocks nothing, the
exact one sent from `/fake-phone` opens the reader), sanitizer trap, xlsx/zip downloads unzipped (`fflate`) to find the
buyer's licence line, quiz fail then pass, public and printable attestation, receipt, Wave purchase, the admin
« Formation » card, and the demo mode (`demo.html`: whole journey simulated in the browser, zero request to the API,
« Quitter la démo » leaves nothing behind).
When LibreOffice (`soffice`) is installed, the Word files are also opened with it and must fit on one A4 page, and
the personalised course workbook must open.
Needs `deno` on the PATH; screenshots, downloads and server logs go to `$SHOTS_DIR` (default: the OS temp folder).
