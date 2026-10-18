// CV Premium price: PRICE_PREMIUM (default 5000 XOF) from env or tcv.settings, served by GET /config and
// charged on premium orders; the catalogue helpers know the product; other prices are unchanged.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { createReloadingApp } from "../lib/app.ts";
import { envFrom, loadConfig } from "../lib/config.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { isProduct, needsCv, needsLetter, priceOf, PRODUCTS } from "../lib/pricing.ts";
import { captureLogs, Clock, makeHarness } from "./fixtures/backend_harness.ts";
import { premiumBody, randomPremiumInput } from "./fixtures/premium_inputs.ts";

Deno.test("premium price: 5000 XOF by default, PRICE_PREMIUM from env or tcv.settings, env wins", () => {
  const none = loadConfig(envFrom({}));
  assertEquals(none.prices, { cv: 1000, lettre: 1000, pack: 1500, premium: 5000 });
  assertEquals(priceOf("premium", none), 5000);
  assertEquals(loadConfig(envFrom({ PRICE_PREMIUM: "4500" })).prices.premium, 4500);
  assertEquals(loadConfig(envFrom({}), { PRICE_PREMIUM: "6000" }).prices.premium, 6000);
  assertEquals(loadConfig(envFrom({ PRICE_PREMIUM: "5500" }), { PRICE_PREMIUM: "6000" }).prices.premium, 5500);
  for (const bad of ["abc", "0", "-5000", "50.5", " "]) {
    assertEquals(
      loadConfig(envFrom({ PRICE_PREMIUM: bad })).prices.premium,
      5000,
      `PRICE_PREMIUM=${JSON.stringify(bad)}`,
    );
  }
  const others = loadConfig(envFrom({ PRICE_PREMIUM: "7000" }));
  assertEquals([others.prices.cv, others.prices.lettre, others.prices.pack], [1000, 1000, 1500]);
});

Deno.test("premium catalogue: product known, needs a CV, never a letter; other products unchanged", () => {
  assert(PRODUCTS.includes("premium") && isProduct("premium"));
  assertEquals(
    PRODUCTS.map((p) => [p, needsCv(p), needsLetter(p)]),
    [["cv", true, false], ["lettre", false, true], ["pack", true, true], ["premium", true, false]],
  );
});

Deno.test("GET /config returns prices.premium (and the other prices as before)", async () => {
  const h = makeHarness();
  const res = await h.call("GET", "/config");
  assertEquals(res.status, 200);
  assertEquals(res.body.prices, { cv: 1000, lettre: 1000, pack: 1500, premium: 5000 });
  const custom = makeHarness({ env: { PRICE_PREMIUM: "4900" } });
  assertEquals((await custom.call("GET", "/config")).body.prices.premium, 4900);
});

Deno.test("PRICE_PREMIUM written in tcv.settings reaches /config and the orders (reloading app)", async () => {
  captureLogs();
  const clock = new Clock();
  const store = new MemoryStore({ settings: { PRICE_PREMIUM: "6000" } });
  const app = createReloadingApp({ store, envGet: envFrom({}), now: clock.now, services: () => ({ wave: null }) });
  const config = await (await app(new Request("http://x/functions/v1/api/config"))).json();
  assertEquals(config.prices.premium, 6000);
  const res = await app(
    new Request("http://x/functions/v1/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.9" },
      body: JSON.stringify(premiumBody(randomPremiumInput(11))),
    }),
  );
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals([body.order.product, body.order.amount], ["premium", 6000]);
});

Deno.test("premium orders are charged prices.premium, other products their own price", async () => {
  const h = makeHarness();
  const premium = await h.call("POST", "/orders", { body: premiumBody(randomPremiumInput(5)) });
  assertEquals(premium.status, 201, JSON.stringify(premium.body));
  assertEquals([premium.body.order.product, premium.body.order.amount, premium.body.order.currency], [
    "premium",
    5000,
    "XOF",
  ]);
  const stored = await h.store.getOrder(premium.body.order.id);
  assertEquals([stored?.amount, stored?.product], [5000, "premium"]);

  const priced = makeHarness({ env: { PRICE_PREMIUM: "4500" } });
  const res = await priced.call("POST", "/orders", { body: premiumBody(randomPremiumInput(6)) });
  assertEquals(res.body.order.amount, 4500);
});
