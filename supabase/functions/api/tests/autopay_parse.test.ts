// Autopay: Wave notification parsing (French / English, every space variant), order matching, confirm token.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import {
  confirmToken,
  formatFcfa,
  matchManualOrder,
  normalizeNotification,
  parseNotification,
} from "../lib/autopay.ts";
import { orderRow, T0 } from "./fixtures/backend_harness.ts";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

/** [notification text, incoming?, amount] — realistic Wave texts as forwarded by MacroDroid. */
const CASES: Array<[string, boolean, number | null]> = [
  // French, money received
  ["Vous avez reçu 1 487F de Awa Ndiaye (77 123 45 67). Nouveau solde : 25 300F", true, 1487],
  ["Vous avez reçu 1.487F de Moussa Diop", true, 1487],
  ["Vous avez reçu 1487 FCFA de Fatou Sall", true, 1487],
  [`Vous avez reçu 1${NBSP}487${NBSP}F de Awa Ndiaye`, true, 1487],
  [`Vous avez reçu 2${NNBSP}950F de Ibrahima Fall`, true, 2950],
  ["Transfert reçu : 999F de Cheikh Ba (78 000 11 22)", true, 999],
  ["Moussa Diop (77 123 45 67) vous a envoyé 1 452 F", true, 1452],
  ["VOUS AVEZ REÇU 1 487 F DE AWA NDIAYE", true, 1487],
  ["Vous avez recu 1487F de Awa", true, 1487],
  ["Wave Vous avez reçu F 1 487 de Awa Ndiaye", true, 1487],
  ["Paiement reçu de 4 960 F CFA de Khady Sow", true, 4960],
  ["Vous avez reçu 1 487,00 F de Awa", true, 1487],
  ["Vous avez reçu 10.000F de Ousmane. Nouveau solde: 150.000F", true, 10000],
  ["Nouveau solde : 25 300F. Vous avez reçu 1 487F de Awa", true, 1487],
  ["Vous avez reçu 1 487 XOF de Awa", true, 1487],
  ["Vous avez reçu 1 487F de Fatou Diop", true, 1487],
  ["Transfert reçu\nVous avez reçu 1 498F de Mame Diarra\tNouveau solde 3 000F", true, 1498],
  ["Vous avez reçu 1 487 francs CFA de Awa", true, 1487],
  // English
  ["You have received 1,487F from Awa Ndiaye", true, 1487],
  ["You received 1,452 F from Moussa. New balance: 20,000F", true, 1452],
  ["Awa Ndiaye sent you 999 FCFA", true, 999],
  ["Payment received: 2,450 XOF from Fatou", true, 2450],
  ["You have received 1,487.00 F from Awa", true, 1487],
  // Owner's own operations and unrelated notifications: never treated as a customer payment
  ["Vous avez envoyé 1 487F à Awa Ndiaye", false, null],
  ["Transfert de 5 000F envoyé à Moussa Diop", false, null],
  ["Vous avez payé 2 000F à Senelec", false, null],
  ["Retrait de 10 000F effectué chez votre agent", false, null],
  ["Dépôt de 20.000F reçu", false, null],
  ["You sent 1,000F to Awa", false, null],
  ["Your withdrawal of 5,000F was successful", false, null],
  ["Votre code de vérification est 123456", false, null],
  ["Récupérez votre argent en agence", false, null],
  ["", false, null],
  // Money received but no readable amount
  ["Vous avez reçu de l'argent de Awa Ndiaye", true, null],
  ["Vous avez reçu un transfert de 77 123 45 67", true, null],
];

Deno.test("autopay parse: amount table (French, English, NBSP, F/FCFA/CFA/XOF, outgoing ignored)", () => {
  for (const [text, incoming, amount] of CASES) {
    const p = parseNotification(text);
    assertEquals([p.incoming, p.amount], [incoming, amount], JSON.stringify(text));
  }
  assertEquals(CASES.filter(([, inc, amt]) => inc && amt !== null).length >= 20, true);
});

Deno.test("autopay parse: normalisation removes accents, unifies spaces and lower-cases", () => {
  assertEquals(normalizeNotification(`  Vous avez REÇU\n1${NBSP}487${NNBSP}F  `), "vous avez recu 1 487 f");
  assertEquals(normalizeNotification("Dépôt\u200b effectué"), "depot effectue");
});

Deno.test("autopay formatFcfa groups thousands with plain spaces", () => {
  assertEquals([formatFcfa(999), formatFcfa(1487), formatFcfa(12500), formatFcfa(1000000)], ["999 FCFA", "1 487 FCFA", "12 500 FCFA", "1 000 000 FCFA"]);
});

const NOW = new Date(T0);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

Deno.test("autopay match: exact unique amount first", () => {
  const a = orderRow({ status: "checkout", amount: 1500, manual_amount: 1499, created_at: minutesAgo(600) });
  const b = orderRow({ status: "awaiting_manual", amount: 1500, manual_amount: 1498, created_at: minutesAgo(5) });
  assertEquals(matchManualOrder([a, b], 1499, NOW), { order: a, how: "exact" });
  assertEquals(matchManualOrder([a, b], 1498, NOW), { order: b, how: "exact" });
});

Deno.test("autopay match: a rounded-up transfer matches one recent order only", () => {
  const recent = orderRow({ status: "checkout", amount: 1500, manual_amount: 1487, created_at: minutesAgo(30) });
  const old = orderRow({ status: "checkout", amount: 1000, manual_amount: 999, created_at: minutesAgo(180) });
  assertEquals(matchManualOrder([recent, old], 1500, NOW), { order: recent, how: "near" });
  assertEquals(matchManualOrder([recent, old], 1600, NOW), { order: recent, how: "near" }, "up to price + 100");
  assertEquals(matchManualOrder([recent, old], 1601, NOW).order, null, "above price + 100");
  assertEquals(matchManualOrder([recent, old], 1000, NOW).order, null, "the 999 F order is older than 2 h");
  assertEquals(matchManualOrder([recent], 1400, NOW).order, null, "less than asked is never a match");
  const second = orderRow({ status: "checkout", amount: 1500, manual_amount: 1490, created_at: minutesAgo(10) });
  assertEquals(matchManualOrder([recent, second], 1500, NOW), { order: null, how: "ambiguous" });
});

Deno.test("autopay match: orders without a unique amount, paid orders and ties are never matched", () => {
  const noAmount = orderRow({ status: "checkout", amount: 1500, manual_amount: null, created_at: minutesAgo(1) });
  assertEquals(matchManualOrder([noAmount], 1500, NOW), { order: null, how: "none" }, "a round catalogue price is too common");
  const paid = orderRow({ status: "paid", amount: 1500, manual_amount: 1499, created_at: minutesAgo(1) });
  assertEquals(matchManualOrder([paid], 1499, NOW).order, null);
  const twin1 = orderRow({ status: "checkout", amount: 1500, manual_amount: 1499, created_at: minutesAgo(1) });
  const twin2 = orderRow({ status: "checkout", amount: 1500, manual_amount: 1499, created_at: minutesAgo(2) });
  assertEquals(matchManualOrder([twin1, twin2], 1499, NOW), { order: null, how: "ambiguous" });
  assertEquals(matchManualOrder([], 1499, NOW), { order: null, how: "none" });
});

Deno.test("autopay confirmToken = first 32 hex chars of HMAC-SHA256(ADMIN_KEY, 'confirm:' + id)", async () => {
  // Vector computed independently: python3 hmac.new(b"test-admin-key", b"confirm:TCV-0000ABCD", sha256).hexdigest()[:32]
  assertEquals(await confirmToken("test-admin-key", "TCV-0000ABCD"), "b251640ba958181e2dbeb6ac9e6ea7c8");
  assertEquals((await confirmToken("other-key", "TCV-0000ABCD")).length, 32);
  assertEquals(await confirmToken("other-key", "TCV-0000ABCD") === await confirmToken("test-admin-key", "TCV-0000ABCD"), false);
});
