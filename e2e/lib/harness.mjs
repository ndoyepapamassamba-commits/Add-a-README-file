// Browser harness: Chromium at phone size, console-error tracking, offline html2pdf, assertions, screenshots.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export const PHONE = { width: 360, height: 740 };

// resultat.html loads html2pdf.js 0.10.1 from cdnjs with an SRI hash. The npm build of the same version is
// byte-identical (same sha512), so it is served for that URL: the export runs offline and the browser still
// enforces the integrity check.
const HTML2PDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
const HTML2PDF = fs.readFileSync(path.join(import.meta.dirname, "../node_modules/html2pdf.js/dist/html2pdf.bundle.min.js"));

let passed = 0;

export function check(condition, message) {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`);
  passed += 1;
  console.log(`ok ${passed} - ${message}`);
}

export const passedCount = () => passed;

/** Whitespace-normalised text (NBSP and newlines included), for substring comparisons. */
export const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function launchBrowser() {
  // PLAYWRIGHT_BROWSERS_PATH (if set) points at a Chromium build matching the pinned Playwright version.
  return chromium.launch();
}

/**
 * A fresh phone-sized context (own storage, like a separate device). Every console error, uncaught page error
 * and unexpected external request of every page it opens is appended to `problems`.
 */
export async function phoneContext(browser, problems, label) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    acceptDownloads: true,
  });
  context.setDefaultTimeout(20_000);
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) => {
    const url = route.request().url();
    if (url === HTML2PDF_URL) {
      return route.fulfill({
        status: 200,
        body: HTML2PDF,
        headers: { "content-type": "text/javascript; charset=utf-8", "access-control-allow-origin": "*" },
      });
    }
    problems.push(`[${label}] unexpected external request ${url}`);
    return route.abort();
  });
  const watch = (page) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`[${label}] console error on ${page.url()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => problems.push(`[${label}] page error on ${page.url()}: ${err.message}`));
  };
  context.on("page", watch);
  return context;
}

export async function assertNoHorizontalScroll(page, label) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  check(scroll <= client, `${label}: no horizontal scrollbar at ${PHONE.width} px (scrollWidth ${scroll} ≤ ${client})`);
}

export function screenshotter(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return (page, name, opts = {}) => page.screenshot({ path: path.join(dir, `${name}.png`), ...opts });
}

/** Saves a download and returns { name, bytes }. */
export async function saveDownload(download, dir) {
  const name = download.suggestedFilename();
  const file = path.join(dir, name);
  await download.saveAs(file);
  return { name, bytes: fs.readFileSync(file) };
}
