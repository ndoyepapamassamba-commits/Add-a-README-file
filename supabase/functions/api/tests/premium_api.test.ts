// CV Premium through the HTTP API: create → redacted preview → manual payment → owner unlock → full
// document, on MemoryStore and on the real SQL functions (PGlite with every migration, including
// 20261018000004_premium.sql); Wave checkout amount; validation errors; the orders.product constraint.
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1.0.13";
import type { Document, Store } from "../lib/types.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { ADMIN_KEY, makeHarness, orderData, orderRow, RETURN_BASE } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore, testMigrations } from "./fixtures/backend_pglite.ts";
import { premiumBody } from "./fixtures/premium_inputs.ts";

const db = await openTestDb();
const MASKED = /^[█ ]*$/;

const STORES: Array<[string, () => Promise<Store>]> = [
  ["MemoryStore", () => Promise.resolve(new MemoryStore())],
  ["SqlStore(PGlite)", async () => {
    await db.reset();
    return sqlStore(db);
  }],
];

/** A fictional senior profile, as the wizard posts it. */
function seniorData(): Record<string, unknown> {
  return {
    ...orderData("cv"),
    identity: {
      civility: "Mme",
      firstName: "Ndèye Khady",
      lastName: "Seck",
      phone: "77 300 40 50",
      email: "nk.seck@example.com",
      city: "Dakar",
    },
    target: { jobTitle: "Responsable du contrôle financier", kind: "emploi", sector: "comptabilite", level: "senior" },
    premium: {
      headline: "Contrôle financier et reporting bancaire",
      pitch: "Je supervise la clôture mensuelle et le reporting réglementaire d'une banque de détail.",
      quote: "Une clôture réussie se prépare dès le premier jour du mois.",
      keyFigures: [{ value: "17+", label: "années en banque" }, { value: "4", label: "jours pour clôturer" }],
      domains: [{ title: "Clôture et consolidation", detail: "arrêtés mensuels, liasses, rapprochements" }],
      achievements: [{
        title: "Clôture accélérée",
        detail: "délai de clôture ramené de neuf à quatre jours ouvrés grâce aux contrôles automatisés",
        tags: ["Excel", "Procédures", "Contrôles"],
      }],
      skillLevels: [{ name: "Excel", level: "Expert" }, { name: "Power BI", level: "Avancé" }],
      qualities: ["Rigueur", "Intégrité"],
      personal: { age: "44", situation: "Mariée" },
      accent: "foret",
    },
  };
}

for (const [storeName, makeStore] of STORES) {
  Deno.test({
    name: `premium API [${storeName}]: create → preview → manual payment → unlock → full document`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const h = makeHarness({ store: await makeStore(), wave: null, env: { MANUAL_WAVE_NUMBER: "77 000 11 22" } });

      // 1. Create: 201, price 5000, redacted preview with the premium block and no letter.
      const created = await h.call("POST", "/orders", { body: premiumBody(seniorData()) });
      assertEquals(created.status, 201, JSON.stringify(created.body));
      const { order, preview } = created.body;
      assertEquals([order.product, order.amount, order.status], ["premium", 5000, "preview"]);
      assertEquals(preview.lettre, null);
      const pb = preview.cv.premium;
      assertEquals(pb.headline, "Contrôle financier et reporting bancaire");
      assertEquals(pb.keyFigures, [{ value: "17+", label: "années en banque" }, {
        value: "4",
        label: "jours pour clôturer",
      }]);
      assertEquals(pb.achievements[0].title, "Clôture accélérée");
      assertEquals(pb.achievements[0].tags[0], "Excel");
      for (
        const s of [
          pb.quote,
          pb.domains[0].detail,
          pb.achievements[0].detail,
          ...pb.achievements[0].tags.slice(1),
          ...pb.personal,
        ]
      ) {
        assertMatch(s, MASKED);
      }
      const previewJson = JSON.stringify(preview);
      for (const hidden of ["clôture réussie", "neuf", "automatisés", "Procédures", "liasses", "Mariée", "44"]) {
        assert(!previewJson.includes(hidden), `"${hidden}" leaked into the preview`);
      }

      // 2. Read back before payment: still the redacted preview, never the document.
      const id = order.id;
      const t = order.token;
      const before = await h.call("GET", `/orders/${id}?t=${t}`);
      assertEquals(Object.keys(before.body).sort(), ["order", "preview"]);
      assertEquals(before.body.preview, preview);

      // 3. Template switch keeps working for premium orders.
      const tpl = await h.call("POST", `/orders/${id}/template`, { body: { t, template: "elegant" } });
      assertEquals([tpl.status, tpl.body.order.template], [200, "elegant"]);

      // 4. Manual payment: instructions with the premium amount, then "J'ai payé".
      const checkout = await h.call("POST", `/orders/${id}/checkout`, { body: { t, returnBase: RETURN_BASE } });
      assertEquals(checkout.status, 200);
      assertEquals(checkout.body, {
        mode: "manual",
        waveNumber: "+221 77 000 11 22",
        amount: 5000,
        reference: id,
        whatsapp: "221770001122",
      });
      const paidClick = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t, payerPhone: "78 111 22 33" } });
      assertEquals([paidClick.status, paidClick.body.order.status], [200, "awaiting_manual"]);
      const waiting = await h.call("GET", `/orders/${id}?t=${t}`);
      assert(waiting.body.preview && !waiting.body.document, "no document before the owner unlocks it");

      // 5. The owner sees it in the admin page and unlocks it.
      const auth = { authorization: `Bearer ${ADMIN_KEY}` };
      const stats = await h.call("GET", "/admin/stats", { headers: auth });
      const listed = stats.body.stats.recentOrders.find((o: { id: string }) => o.id === id);
      assertEquals([listed.product, listed.amount, listed.status], ["premium", 5000, "awaiting_manual"]);
      const unlock = await h.call("POST", `/admin/orders/${id}/unlock`, { headers: auth });
      assertEquals(unlock.body, { ok: true, changed: true });

      // 6. Full document: the stored one, with every premium detail in clear.
      const after = await h.call("GET", `/orders/${id}?t=${t}`);
      assertEquals(Object.keys(after.body).sort(), ["document", "order"]);
      assertEquals([after.body.order.status, after.body.order.paymentMethod], ["paid", "manual"]);
      const doc = after.body.document as Document;
      assertEquals(doc, (await h.store.getOrder(id))!.document);
      assertEquals(doc.lettre, null);
      const full = doc.cv!.premium!;
      assertEquals(full.quote, "Une clôture réussie se prépare dès le premier jour du mois.");
      assertEquals(full.achievements[0], {
        title: "Clôture accélérée",
        detail: "Délai de clôture ramené de neuf à quatre jours ouvrés grâce aux contrôles automatisés.",
        tags: ["Excel", "Procédures", "Contrôles"],
      });
      assertEquals(full.domains, [{
        title: "Clôture et consolidation",
        detail: "Arrêtés mensuels, liasses, rapprochements",
      }]);
      assertEquals(full.personal, ["Âge : 44 ans", "Situation : Mariée"]);
      assertEquals(full.accent, "foret");
      assert(
        doc.cv!.profile.startsWith(
          "Je supervise la clôture mensuelle et le reporting réglementaire d'une banque de détail.",
        ),
      );
      const stored = (await h.store.getOrder(id))!;
      assertEquals([stored.paid_amount, stored.payment_method, stored.input?.premium?.accent], [
        5000,
        "manual",
        "foret",
      ]);
    },
  });
}

Deno.test("premium API (Wave): the checkout session is created for prices.premium and unlocks the document", async () => {
  const h = makeHarness();
  const created = await h.call("POST", "/orders", { body: premiumBody(seniorData()) });
  const { id, token } = created.body.order;
  const res = await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  assertEquals(res.status, 200);
  const [args] = h.wave!.callsOf("createCheckoutSession")[0] as [Record<string, unknown>];
  assertEquals([args.amount, args.clientReference], [5000, id]);
  h.wave!.completeSession((await h.store.getOrder(id))!.checkout_session_id!);
  const after = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([after.body.order.status, after.body.order.paymentMethod], ["paid", "wave"]);
  assert(after.body.document.cv.premium.quote.startsWith("Une clôture réussie"));
});

Deno.test("premium API: validation errors come back with dotted field paths", async () => {
  const h = makeHarness();
  const data = seniorData();
  (data.premium as Record<string, unknown>).keyFigures = [{ value: "dix-sept", label: "années" }];
  const bad = await h.call("POST", "/orders", { body: premiumBody(data) });
  assertEquals([bad.status, bad.body.error], [400, "validation"]);
  assertEquals(Object.keys(bad.body.fields), ["premium.keyFigures.0.value"]);
  const missing = await h.call("POST", "/orders", { body: premiumBody(orderData("cv")) });
  assertEquals(Object.keys(missing.body.fields), ["premium.headline"]);
  assertEquals(await h.store.stats(h.clock.iso()).then((s) => s.recentOrders.length), 0, "nothing stored");
});

Deno.test({
  name: "premium migration: orders.product accepts premium and stage, still refuses unknown products",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const files = (await testMigrations()).map((u) => u.pathname.split("/").pop());
    assert(files.includes("20261018000004_premium.sql"), JSON.stringify(files));
    assert(!files.some((f) => f!.includes("cron")), "the pg_cron migration is Supabase-only");
    await db.reset();
    await db.migrate(); // idempotent: the product migration runs twice without error
    const store = sqlStore(db);
    for (const product of ["cv", "lettre", "pack", "stage", "premium"] as const) {
      const row = orderRow({ product: product as never });
      await store.insertOrder(row);
      assertEquals((await store.getOrder(row.id))?.product, product);
    }
    await assertRejects(() => store.insertOrder(orderRow({ product: "deluxe" as never })));
    const def = await db.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'orders_product_check'`,
      [],
    );
    assertEquals(def.rows.length, 1);
    for (const p of ["cv", "lettre", "pack", "stage", "premium"]) assert(String(def.rows[0].def).includes(`'${p}'`), p);
  },
});
