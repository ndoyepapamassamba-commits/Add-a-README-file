// LLM enhancer with an injected fake fetch: a faithful rewrite is merged; anything doubtful ⇒ null.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { Document, OrderInput } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { DEFAULT_TIMEOUT_MS, makeEnhancer, OPENROUTER_URL } from "../lib/llm.ts";

const NOW = new Date("2026-10-01T09:30:00Z");

const INPUT: OrderInput = {
  identity: {
    civility: "Mme", firstName: "Fatou", lastName: "Sarr", phone: "77 123 45 67", email: "fatou@gmail.com",
    city: "Dakar", address: "Parcelles Assainies U15",
  },
  target: { jobTitle: "Infirmière", kind: "emploi", sector: "sante", level: "junior" },
  education: [{ degree: "Diplôme d'État d'infirmier", school: "ENDSS", year: "2022" }],
  experiences: [{
    title: "Infirmière", company: "Clinique Al Amine", start: "2022", end: "2024",
    missions: "Soins aux patients\nPrise des constantes\nSuivi des dossiers",
  }],
  skills: ["Soins de base", "Prise de constantes"],
  it: ["Word"],
  languages: [],
  interests: [],
  letter: { company: "Hôpital Principal", qualities: ["Rigueur"] },
};

const DOC: Document = generateDocument(INPUT, "pack", { seed: "LLM", now: NOW });

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch returning `content` as the model's message (or a raw response when `raw` is given). */
function fakeFetch(content: unknown, opts: { status?: number; raw?: string } = {}): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const body = opts.raw ??
      JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });
    return Promise.resolve(new Response(body, { status: opts.status ?? 200 }));
  }) as typeof fetch;
  return { fetchFn, calls };
}

/** A faithful rewrite: same facts, slightly different wording, same shape. */
function goodRewrite(doc: Document) {
  return {
    profile: doc.cv!.profile.replace(/\.$/, ", avec sérieux et bienveillance."),
    bullets: doc.cv!.experiences.map((e) => e.bullets.map((b) => `${b} au quotidien`)),
    paragraphs: doc.lettre!.paragraphs.map((p) => p.replace(/\.$/, ", avec conviction.")),
  };
}

const enhancer = (fetchFn: typeof fetch, timeoutMs?: number) =>
  makeEnhancer({ apiKey: "sk-test", model: "google/gemini-2.5-flash", fetchFn, timeoutMs });

Deno.test("llm: a faithful rewrite is merged, everything else is untouched", async () => {
  const rewrite = goodRewrite(DOC);
  const { fetchFn, calls } = fakeFetch(rewrite);
  const out = await enhancer(fetchFn)(DOC, INPUT, "pack");
  assert(out, "expected a document");
  assertEquals(out.cv!.profile, rewrite.profile);
  assertEquals(out.cv!.experiences[0].bullets, rewrite.bullets[0]);
  assertEquals(out.lettre!.paragraphs, rewrite.paragraphs);
  assertEquals({ ...out.cv!, profile: "", experiences: [] }, { ...DOC.cv!, profile: "", experiences: [] });
  assertEquals({ ...out.lettre!, paragraphs: [] }, { ...DOC.lettre!, paragraphs: [] });
  assertEquals(out.cv!.experiences[0].title, DOC.cv!.experiences[0].title);
  assert(DOC.cv!.profile !== out.cv!.profile, "the original document must not be mutated");

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, OPENROUTER_URL);
  assertEquals(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("authorization"), "Bearer sk-test");
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.model, "google/gemini-2.5-flash");
  assertEquals(body.response_format, { type: "json_object" });
  const sent = JSON.stringify(body.messages);
  for (const secret of ["77 123 45 67", "fatou@gmail.com", "Parcelles", "Sarr"]) {
    assert(!sent.includes(secret), `personal data sent to the model: ${secret}`);
  }
  assert(sent.includes("Infirmière"));
});

Deno.test("llm: JSON wrapped in a markdown fence is accepted; a cv-only order needs no paragraphs", async () => {
  const cvDoc = generateDocument(INPUT, "cv", { seed: "LLM", now: NOW });
  const { profile, bullets } = goodRewrite(DOC);
  const { fetchFn } = fakeFetch("```json\n" + JSON.stringify({ profile, bullets }) + "\n```");
  const out = await enhancer(fetchFn)(cvDoc, INPUT, "cv");
  assertEquals(out?.cv?.profile, profile);
  assertEquals(out?.lettre, null);
});

Deno.test("llm: invalid JSON, wrong shapes and HTTP errors ⇒ null", async () => {
  const good = goodRewrite(DOC);
  const cases: Array<[string, ReturnType<typeof fakeFetch>]> = [
    ["not JSON", fakeFetch("Voici votre lettre améliorée !")],
    ["JSON array", fakeFetch([good.profile])],
    ["missing paragraphs", fakeFetch({ profile: good.profile, bullets: good.bullets })],
    ["three paragraphs", fakeFetch({ ...good, paragraphs: good.paragraphs.slice(0, 3) })],
    ["profile not a string", fakeFetch({ ...good, profile: 42 })],
    ["bullet count changed", fakeFetch({ ...good, bullets: [good.bullets[0].slice(1)] })],
    ["experience count changed", fakeFetch({ ...good, bullets: [] })],
    ["HTTP 500", fakeFetch(good, { status: 500 })],
    ["body not JSON", fakeFetch(null, { raw: "<html>Bad gateway</html>" })],
    ["no choices", fakeFetch(null, { raw: JSON.stringify({ error: { message: "quota" } }) })],
  ];
  for (const [name, { fetchFn }] of cases) {
    assertEquals(await enhancer(fetchFn)(DOC, INPUT, "pack"), null, name);
  }
});

Deno.test("llm: invented numbers or names, and length drift ⇒ null", async () => {
  const good = goodRewrite(DOC);
  const withParagraph = (i: number, text: string) => ({ ...good, paragraphs: good.paragraphs.map((p, j) => (j === i ? text : p)) });
  const p2 = DOC.lettre!.paragraphs[1];
  const cases: Array<[string, unknown]> = [
    ["invented percentage", withParagraph(1, `${p2.slice(0, -1)} et j'ai réduit les délais de 20 %.`)],
    ["invented year", withParagraph(1, `${p2.slice(0, -1)} depuis 2015.`)],
    ["invented employer", withParagraph(1, `${p2.slice(0, -1)} puis chez Total Sénégal.`)],
    ["way too long", withParagraph(2, `${DOC.lettre!.paragraphs[2]} `.repeat(3).trim())],
    ["way too short", withParagraph(3, "Merci.")],
    ["empty profile", { ...good, profile: "" }],
    ["mask characters", withParagraph(0, `${DOC.lettre!.paragraphs[0]} ████`)],
  ];
  for (const [name, content] of cases) {
    const { fetchFn } = fakeFetch(content);
    assertEquals(await enhancer(fetchFn)(DOC, INPUT, "pack"), null, name);
  }
  // Digits typed by the customer stay allowed.
  const { fetchFn } = fakeFetch(withParagraph(1, `${p2.slice(0, -1)}, entre 2022 et 2024.`));
  assert(await enhancer(fetchFn)(DOC, INPUT, "pack"), "digits from the input must be accepted");
});

Deno.test("llm: timeout, network error and a fetch that ignores abort ⇒ null, never throws", async () => {
  const hanging = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  const started = Date.now();
  assertEquals(await enhancer(hanging, 50)(DOC, INPUT, "pack"), null);
  assert(Date.now() - started < 2000, "the timeout must cut the request short");

  let release: () => void = () => {};
  const deaf = (() => new Promise<Response>((resolve) => (release = () => resolve(new Response("{}"))))) as typeof fetch;
  assertEquals(await enhancer(deaf, 30)(DOC, INPUT, "pack"), null);
  release();

  const broken = (() => Promise.reject(new TypeError("network down"))) as typeof fetch;
  assertEquals(await enhancer(broken)(DOC, INPUT, "pack"), null);
  const throwing = (() => {
    throw new Error("sync failure");
  }) as typeof fetch;
  assertEquals(await enhancer(throwing)(DOC, INPUT, "pack"), null);
});

Deno.test("llm: the default timeout is 20 seconds", () => {
  assertEquals(DEFAULT_TIMEOUT_MS, 20_000);
});
