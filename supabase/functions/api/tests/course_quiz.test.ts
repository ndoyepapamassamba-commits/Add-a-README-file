// Final quiz and attestation (SPEC_COURSE §3.7, §3.8): server-side scoring, only passes stored, the attestation
// code (HMAC of the order id, made once), attempt limit, public verification only when the buyer opted in.
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1.0.13";
import { hmacSha256Hex } from "../lib/ids.ts";
import { ATTESTATION_KIND, attestCode, COURSE_CATALOG, COURSE_MESSAGES } from "../lib/course.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { ADMIN_KEY, createOrder, DAY, HOUR, MIN, T0 } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";
import {
  BUYER_NAME,
  courseHarness,
  createCourseOrder,
  FIXTURE_QUIZ_ANSWERS,
  nextIp,
  paidCourseOrder,
  seedCourseMemory,
} from "./fixtures/course_harness.ts";

const ATTESTATION_NOT_FOUND = { error: "not_found", message: COURSE_MESSAGES.attestationNotFound };

function quiz(h: Harness, o: { id: string; token: string }, answers: unknown, publicListing?: unknown) {
  const body: Record<string, unknown> = { t: o.token, answers };
  if (publicListing !== undefined) body.publicListing = publicListing;
  return h.call("POST", `/orders/${o.id}/quiz`, { body });
}

const withWrong = (n: number) => {
  const a: Record<string, number> = { ...FIXTURE_QUIZ_ANSWERS };
  for (const id of ["q04", "q03", "q02", "q01"].slice(0, n)) a[id] = (a[id] + 1) % 4;
  return a;
};

const attestation = (h: Harness, code: string, ip?: string) => h.call("GET", `/attestations/${code}`, { ip });

Deno.test("quiz: 4/4 and 3/4 pass with the attestation code; 2/4 fails and nothing is stored", async () => {
  const h = await courseHarness();
  const o = await paidCourseOrder(h);
  const code = (await hmacSha256Hex(ADMIN_KEY, `attest:${o.id}`)).slice(0, 12);
  assertEquals(await attestCode(ADMIN_KEY, o.id), code);

  const fail = await quiz(h, o, withWrong(2));
  assertEquals([fail.status, fail.body], [200, { score: 50, correct: 2, total: 4, passPercent: 70, passed: false, code: null }]);
  assertEquals((h.store as MemoryStore).quizAttempts.length, 0, "failed attempts are not stored");
  assertEquals(await h.store.getQuizProgress(o.id), null);

  const three = await quiz(h, o, withWrong(1));
  assertEquals(three.body, { score: 75, correct: 3, total: 4, passPercent: 70, passed: true, code });
  const four = await quiz(h, o, FIXTURE_QUIZ_ANSWERS, true);
  assertEquals(four.body, { score: 100, correct: 4, total: 4, passPercent: 70, passed: true, code });
  const attempts = (h.store as MemoryStore).quizAttempts;
  assertEquals(attempts.map((a) => [a.order_id, a.score, a.correct, a.total, a.passed, a.public_listing, a.attestation_code]), [
    [o.id, 75, 3, 4, true, false, code],
    [o.id, 100, 4, 4, true, true, code],
  ]);
  for (const a of attempts) assert(/^QA-[0-9A-HJKMNP-TV-Z]{10}$/.test(a.id));
});

Deno.test("quiz: unanswered (null or missing) questions are wrong, unknown ids are ignored", async () => {
  const h = await courseHarness();
  const o = await paidCourseOrder(h);
  const partial = await quiz(h, o, { q01: 0, q02: 1, q03: null, zz: 3, q99: 0 });
  assertEquals([partial.body.correct, partial.body.score, partial.body.passed], [2, 50, false]);
  assertEquals((await quiz(h, o, {})).body.score, 0);
  const proto = await quiz(h, o, JSON.parse('{"__proto__": 1, "q01": 0}'));
  assertEquals([proto.status, proto.body.correct], [200, 1]);
});

Deno.test("quiz: bad answers or publicListing → 400 with the field messages", async () => {
  const h = await courseHarness();
  const o = await paidCourseOrder(h);
  const tooMany = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, 0]));
  for (const bad of [undefined, null, [], "0,1", 3, { q01: 10 }, { q01: -1 }, { q01: 1.5 }, { q01: "1" }, { q01: true }, tooMany]) {
    const res = await quiz(h, o, bad);
    assertEquals(res.status, 400, JSON.stringify(bad));
    assertEquals(res.body.fields, { answers: COURSE_MESSAGES.answers }, JSON.stringify(bad));
  }
  for (const bad of ["yes", 1, null]) {
    const res = await quiz(h, o, FIXTURE_QUIZ_ANSWERS, bad);
    assertEquals([res.status, res.body.fields], [400, { publicListing: "Valeur invalide." }], String(bad));
  }
  assertEquals((h.store as MemoryStore).quizAttempts.length, 0);
});

Deno.test("quiz: unpaid, wrong token, document orders → the same 404 as an unknown order", async () => {
  const h = await courseHarness();
  const unpaid = await createCourseOrder(h);
  const paid = await paidCourseOrder(h);
  const doc = await createOrder(h, "cv", nextIp());
  await h.call("POST", `/admin/orders/${doc.id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  for (const o of [unpaid, { id: paid.id, token: "wrong" }, doc, { id: "TCV-ZZZZZZZZ", token: paid.token }]) {
    const res = await quiz(h, o, FIXTURE_QUIZ_ANSWERS);
    assertEquals([res.status, res.body], [404, { error: "not_found", message: "Commande introuvable." }], o.id);
  }
});

Deno.test("quiz: the 11th attempt within 24 hours → 429; the window then restarts", async () => {
  const h = await courseHarness();
  const o = await paidCourseOrder(h);
  for (let i = 0; i < 10; i++) assertEquals((await quiz(h, o, withWrong(4))).status, 200, `attempt ${i + 1}`);
  const limited = await quiz(h, o, FIXTURE_QUIZ_ANSWERS);
  assertEquals([limited.status, limited.body], [429, { error: "rate_limited", message: COURSE_MESSAGES.quizLimited }]);
  assertEquals((h.store as MemoryStore).quizAttempts.length, 0, "the refused attempt was not scored");
  h.clock.advance(DAY + MIN);
  assertEquals((await quiz(h, o, FIXTURE_QUIZ_ANSWERS)).body.passed, true);
});

Deno.test("quiz: the code is made once per order and survives an ADMIN_KEY rotation; no ADMIN_KEY → 503 on a first pass", async () => {
  const store = new MemoryStore();
  await seedCourseMemory(store);
  const h = await courseHarness({ store });
  const o = await paidCourseOrder(h);
  const first = await quiz(h, o, FIXTURE_QUIZ_ANSWERS);
  const rotated = await courseHarness({ store, clock: h.clock, env: { ADMIN_KEY: "a-new-admin-key" } });
  h.clock.advance(MIN);
  const again = await quiz(rotated, o, FIXTURE_QUIZ_ANSWERS);
  assertEquals(again.body.code, first.body.code, "stable code");
  const noKey = await courseHarness({ store, clock: h.clock, env: { ADMIN_KEY: undefined } });
  assertEquals((await quiz(noKey, o, withWrong(1))).body.code, first.body.code, "an earlier pass still provides the code");

  // A first pass without ADMIN_KEY: 503, nothing stored; a failed attempt is still answered.
  const fresh = await paidCourseOrder(noKey);
  const unavailable = await quiz(noKey, fresh, FIXTURE_QUIZ_ANSWERS);
  assertEquals([unavailable.status, unavailable.body], [503, { error: "quiz_unavailable", message: COURSE_MESSAGES.quizUnavailable }]);
  assertEquals(await store.getQuizProgress(fresh.id), null);
  assertEquals((await quiz(noKey, fresh, withWrong(3))).body, { score: 25, correct: 1, total: 4, passPercent: 70, passed: false, code: null });
});

Deno.test("GET /orders/:id/course carries the attestation: first pass date, best score, latest listing choice", async () => {
  const h = await courseHarness();
  const o = await paidCourseOrder(h);
  const path = `/orders/${o.id}/course?t=${encodeURIComponent(o.token)}`;
  assertFalse("attestation" in (await h.call("GET", path)).body);
  const pass = await quiz(h, o, FIXTURE_QUIZ_ANSWERS, false);
  const firstAt = h.clock.iso();
  h.clock.advance(2 * HOUR);
  await quiz(h, o, withWrong(1), true);
  const v = (await h.call("GET", path)).body;
  assertEquals(v.attestation, { code: pass.body.code, passedAt: firstAt, score: 100, publicListing: true });
});

Deno.test("GET /attestations/:code: 200 only when the latest pass is listed; name, course, date and kind only", async () => {
  const h = await courseHarness();
  const o = await paidCourseOrder(h);
  const { code } = (await quiz(h, o, FIXTURE_QUIZ_ANSWERS, false)).body;
  assertEquals((await attestation(h, code)).body, ATTESTATION_NOT_FOUND, "not listed");
  h.clock.advance(DAY + 3 * HOUR);
  await quiz(h, o, FIXTURE_QUIZ_ANSWERS, true);
  const listed = await attestation(h, code);
  assertEquals(listed.status, 200);
  assertEquals(listed.body, {
    code,
    fullName: BUYER_NAME,
    course: COURSE_CATALOG.pq_essentiel.label,
    date: T0.slice(0, 10),
    kind: ATTESTATION_KIND,
  });
  assertFalse(JSON.stringify(listed.body).includes(o.id), "no order id");
  assertEquals((await attestation(h, code.toUpperCase())).status, 200, "codes are case-insensitive");
  h.clock.advance(MIN);
  await quiz(h, o, FIXTURE_QUIZ_ANSWERS, false);
  assertEquals((await attestation(h, code)).body, ATTESTATION_NOT_FOUND, "the latest pass withdrew the listing");
});

Deno.test("GET /attestations/:code: unknown, malformed and purged → 404; 61 lookups per hour per IP → 429", async () => {
  const h = await courseHarness();
  for (const bad of ["ABC", "0123456789abc", "0123456789a", "zzzzzzzzzzzz", "0123456789ab"]) {
    const res = await attestation(h, bad);
    assertEquals([res.status, res.body], [404, ATTESTATION_NOT_FOUND], bad);
  }
  const o = await paidCourseOrder(h);
  const { code } = (await quiz(h, o, FIXTURE_QUIZ_ANSWERS, true)).body;
  assertEquals((await attestation(h, code)).status, 200);
  // The order is erased 24 months after payment: its attestation is no longer shown.
  h.clock.advance(731 * DAY);
  const now = h.clock.now().getTime();
  await h.store.purge(new Date(now - 3 * DAY).toISOString(), new Date(now - 30 * DAY).toISOString(), h.clock.iso());
  assertEquals((await attestation(h, code)).body, ATTESTATION_NOT_FOUND);

  const limits = await courseHarness();
  const ip = "192.0.2.99";
  for (let i = 0; i < 60; i++) assertEquals((await attestation(limits, "0123456789ab", ip)).status, 404);
  const limited = await attestation(limits, "0123456789ab", ip);
  assertEquals([limited.status, limited.body.error], [429, "rate_limited"]);
  assertEquals((await attestation(limits, "0123456789ab", "192.0.2.100")).status, 404, "per IP");
  assertEquals((await attestation(limits, "ABC", ip)).status, 404, "malformed codes are refused before the limiter");
});

Deno.test("quiz: content missing → 503 course_unavailable", async () => {
  const store = new MemoryStore();
  await seedCourseMemory(store);
  store.courseAssets.delete("pq_essentiel/quiz-key.json");
  const h = await courseHarness({ store });
  const o = await paidCourseOrder(h);
  const res = await quiz(h, o, FIXTURE_QUIZ_ANSWERS);
  assertEquals([res.status, res.body.error], [503, "course_unavailable"]);
  assert(h.logs.error.includes("course asset pq_essentiel/quiz-key.json is missing"));
  assertEquals(store.quizAttempts.length, 0);
});
