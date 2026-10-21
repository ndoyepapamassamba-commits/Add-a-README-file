// « Prévenez-moi de l'ouverture » leads (SPEC_COURSE §3.9): stored with the consent text, rate-limited, never
// echoed nor logged, erased (contact fields emptied by UPDATE) 12 months later, counted on the admin page.
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1.0.13";
import { LEAD_CONSENT_TEXT } from "../lib/course.ts";
import { COURSE_MSG } from "../lib/validate_course.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import type { LeadRow, Store } from "../lib/types.ts";
import { ADMIN_KEY, DAY, makeHarness, T0 } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore, supabaseStore } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";

const lead = (over: Record<string, unknown> = {}) => ({ email: "Awa.Ndiaye@Example.com", consent: true, source: "formation-index", website: "", ...over });

Deno.test("POST /leads: 201 { ok }, stored with the consent text, contact cleaned, nothing echoed", async () => {
  const store = new MemoryStore();
  const h = makeHarness({ store });
  const res = await h.call("POST", "/leads", { body: lead() });
  assertEquals([res.status, res.body], [201, { ok: true }]);
  const res2 = await h.call("POST", "/leads", { body: lead({ email: undefined, whatsapp: "00225 07 07 07 07 07", source: "formation-gratuit" }) });
  assertEquals(res2.status, 201);
  const rows = [...store.leads.values()];
  assertEquals(rows.length, 2);
  const [a, b] = rows;
  assertMatch(a.id, /^LD-[0-9A-HJKMNP-TV-Z]{8}$/);
  assertEquals([a.email, a.whatsapp, a.source, a.product, a.created_at, a.purged_at], ["awa.ndiaye@example.com", null, "formation-index", "pq_essentiel", T0, null]);
  assertEquals(a.consent_text, LEAD_CONSENT_TEXT);
  assert(a.ip_hash && a.ip_hash.length === 32 && !a.ip_hash.includes("203.0.113"));
  assertEquals([b.email, b.whatsapp, b.source], [null, "+2250707070707", "formation-gratuit"]);
  const sources = await h.call("POST", "/leads", { body: lead({ source: "Page Index !", email: "x@y.co" }), ip: "192.0.2.3" });
  assertEquals(sources.status, 201);
  assertEquals([...store.leads.values()].at(-1)?.source, "autre");
  assertFalse([...h.logs.warn, ...h.logs.error].some((l) => /awa|example|0707/i.test(l)), "contact data never logged");
});

Deno.test("POST /leads: honeypot and validation", async () => {
  const store = new MemoryStore();
  const h = makeHarness({ store });
  const trap = await h.call("POST", "/leads", { body: lead({ website: "http://spam.example" }) });
  assertEquals([trap.status, trap.body], [400, { error: "validation", message: "Votre demande n'a pas pu être traitée." }]);
  const cases: Array<[Record<string, unknown>, Record<string, string>]> = [
    [{ email: undefined }, { contact: COURSE_MSG.contact }],
    [{ consent: false }, { consent: COURSE_MSG.consent }],
    [{ consent: "true" }, { consent: COURSE_MSG.consent }],
    [{ email: "nope" }, { email: COURSE_MSG.email }],
    [{ email: undefined, whatsapp: "123" }, { whatsapp: COURSE_MSG.whatsapp }],
  ];
  for (const [over, fields] of cases) {
    const res = await h.call("POST", "/leads", { body: lead(over), ip: `192.0.2.${Object.keys(fields)[0].length}` });
    assertEquals([res.status, res.body.error, res.body.fields], [400, "validation", fields], JSON.stringify(over));
  }
  assertEquals(store.leads.size, 0);
  assertEquals((await h.call("POST", "/leads", { rawBody: "not json", headers: { "content-type": "application/json" } })).status, 400);
});

Deno.test("POST /leads: the 6th lead from one IP within an hour → 429; other IPs are not affected", async () => {
  const h = makeHarness();
  for (let i = 0; i < 5; i++) {
    assertEquals((await h.call("POST", "/leads", { body: lead({ email: `p${i}@example.com` }), ip: "192.0.2.50" })).status, 201);
  }
  const limited = await h.call("POST", "/leads", { body: lead(), ip: "192.0.2.50" });
  assertEquals([limited.status, limited.body], [429, { error: "rate_limited", message: "Trop de demandes. Réessayez dans un moment." }]);
  assertEquals((await h.call("POST", "/leads", { body: lead(), ip: "192.0.2.51" })).status, 201);
  h.clock.advance(3_600_000);
  assertEquals((await h.call("POST", "/leads", { body: lead(), ip: "192.0.2.50" })).status, 201, "a new hour");
});

Deno.test("POST /leads: 2 000 per day for everyone together", async () => {
  const store = new MemoryStore();
  const h = makeHarness({ store });
  store.rateLimits.set(`lead:global:${T0.slice(0, 10)}`, { windowStart: Date.parse(T0), count: 2000 });
  const res = await h.call("POST", "/leads", { body: lead() });
  assertEquals(res.status, 429);
  assertEquals(store.leads.size, 0);
});

Deno.test("GET /admin/stats: lead counts only, never the contact data", async () => {
  const h = makeHarness();
  await h.call("POST", "/leads", { body: lead({ email: "secret.person@example.com" }), ip: "192.0.2.60" });
  await h.call("POST", "/leads", { body: lead({ email: undefined, whatsapp: "+221 77 999 88 77" }), ip: "192.0.2.61" });
  const res = await h.call("GET", "/admin/stats", { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  assertEquals(res.body.stats.leads, { total: 2, last30: 2, active: 2 });
  const text = JSON.stringify(res.body);
  assertFalse(text.includes("secret.person") || text.includes("77999") || text.includes("221779998877"));
});

// --- Retention, on the three stores ----------------------------------------------------------------

const db: TestDb = await openTestDb();

const IMPLS: Array<{ name: string; make(): Promise<Store> }> = [
  { name: "MemoryStore", make: () => Promise.resolve(new MemoryStore()) },
  { name: "SqlStore(PGlite)", make: async () => (await db.reset(), sqlStore(db)) },
  { name: "SupabaseStore(PostgREST stand-in)", make: async () => (await db.reset(), supabaseStore(db)) },
];

const daysAgo = (now: string, days: number) => new Date(Date.parse(now) - days * DAY).toISOString();
const leadRow = (id: string, createdAt: string, over: Partial<LeadRow> = {}): LeadRow => ({
  id,
  email: `${id.toLowerCase()}@example.com`,
  whatsapp: "+221771234567",
  consent_text: LEAD_CONSENT_TEXT,
  source: "formation-index",
  product: "pq_essentiel",
  ip_hash: "iphash",
  created_at: createdAt,
  purged_at: null,
  ...over,
});

for (const impl of IMPLS) {
  Deno.test({
    name: `leads [${impl.name}] purge empties the contact fields after 365 days (UPDATE, row kept); stats count them`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const store = await impl.make();
      const now = "2027-10-20T12:00:00.000Z";
      await store.insertLead(leadRow("LD-OLD00001", daysAgo(now, 366)));
      await store.insertLead(leadRow("LD-NEW00001", daysAgo(now, 364)));
      await store.insertLead(leadRow("LD-NOW00001", daysAgo(now, 1), { whatsapp: null }));
      assertEquals((await store.stats(now)).leads, { total: 3, last30: 1, active: 3 });
      await store.purge(daysAgo(now, 3), daysAgo(now, 30), now);
      const stats = await store.stats(now);
      assertEquals(stats.leads, { total: 3, last30: 1, active: 2 }, "the row is kept, only its contact is erased");
      if (store instanceof MemoryStore) {
        const old = store.leads.get("LD-OLD00001")!;
        assertEquals([old.email, old.whatsapp, old.ip_hash, old.purged_at], [null, null, null, now]);
        assertEquals(old.consent_text, LEAD_CONSENT_TEXT);
        assertEquals(store.leads.get("LD-NEW00001")?.email, "ld-new00001@example.com");
      } else {
        const rows = (await db.query("select id, email, whatsapp, ip_hash, purged_at, consent_text from tcv.leads order by id", [])).rows;
        const old = rows.find((r) => r.id === "LD-OLD00001")!;
        assertEquals([old.email, old.whatsapp, old.ip_hash, old.consent_text], [null, null, null, LEAD_CONSENT_TEXT]);
        assertEquals(new Date(old.purged_at as string).toISOString(), now);
        assertEquals(rows.find((r) => r.id === "LD-NEW00001")?.email, "ld-new00001@example.com");
      }
      // A lead without any contact is refused (contact-or-purged rule).
      let refused = false;
      try {
        await store.insertLead(leadRow("LD-EMPTY001", now, { email: null, whatsapp: null }));
      } catch {
        refused = true;
      }
      assert(refused, "lead without contact refused");
    },
  });
}

// --- The front pages show the consent text verbatim -------------------------------------------------

const FORMATION = new URL("../../../../formation/", import.meta.url);
const formationExists = await Deno.stat(FORMATION).then((s) => s.isDirectory).catch(() => false);

Deno.test({
  name: formationExists
    ? "formation/index.html and gratuit.html show LEAD_CONSENT_TEXT verbatim"
    : "formation/index.html and gratuit.html show LEAD_CONSENT_TEXT verbatim (skipped: formation/ not in this checkout yet)",
  ignore: !formationExists,
  fn: async () => {
    for (const page of ["index.html", "gratuit.html"]) {
      const html = await Deno.readTextFile(new URL(page, FORMATION));
      assert(html.includes(LEAD_CONSENT_TEXT), `formation/${page} must contain LEAD_CONSENT_TEXT on one line, verbatim`);
    }
  },
});
