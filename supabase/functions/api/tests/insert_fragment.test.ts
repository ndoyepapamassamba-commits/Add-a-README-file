// scripts/insert-fragment.mjs: the free module fragment goes into formation/gratuit.html only when its tags balance
// strictly (review of 22/10/2026: a </div> closing a <details> pushed the end of the public page out of its column),
// and every public formation page is balanced as published.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1.0.13";
import { checkFragment, insertFragment, tagBalanceProblems } from "../../../../scripts/insert-fragment.mjs";

const FORMATION = decodeURIComponent(new URL("../../../../formation/", import.meta.url).pathname);
const ROOT = '<section class="module module-free" data-module="0">';

Deno.test("insert-fragment: strict tag balance (the bug of the review is caught)", () => {
  const buggy = `${ROOT}<div class="exercise"><p>x</p><details class="solution"><summary>Voir la solution</summary><p>y</p></div></div></section>`;
  const problems = tagBalanceProblems(buggy);
  assert(problems.length >= 1 && problems[0].includes("</div> closes <details>"), problems.join(" | "));
  assertThrows(() => checkFragment(buggy), Error, "balises mal fermées");
  const fixed = buggy.replace("<p>y</p></div>", "<p>y</p></details>");
  assertEquals(tagBalanceProblems(fixed), []);
  checkFragment(fixed);
  // Void elements, self-closing SVG shapes, comments and attributes holding « > » do not confuse it.
  assertEquals(tagBalanceProblems(`<p>a<br>b</p><!-- </div> --><svg viewBox="0 0 1 1"><path d="M0 0"/><text x="1">a &gt; b</text></svg><a title="x>y">t</a>`), []);
  assertEquals(tagBalanceProblems("<section><p>open"), ["<section> (line 1) is never closed", "<p> (line 1) is never closed"]);
});

Deno.test("insert-fragment: insertion keeps the markers and wraps tables; an unbalanced fragment is refused", () => {
  const page = "<main><!-- GRATUIT:DEBUT -->old<!-- GRATUIT:FIN --></main>";
  const out = insertFragment(page, `${ROOT}<table class="data"><caption>T</caption><tr><td>1</td></tr></table></section>`);
  assert(out.includes('<div class="table-wrap" role="region" tabindex="0" aria-label="T"><table class="data">'));
  assertEquals(tagBalanceProblems(out), []);
  assertThrows(() => insertFragment(page, `${ROOT}<div></section>`), Error, "balises mal fermées");
});

Deno.test("formation pages: every public page is strictly balanced (gratuit.html included)", async () => {
  const pages: string[] = [];
  for await (const e of Deno.readDir(FORMATION)) if (e.isFile && e.name.endsWith(".html")) pages.push(e.name);
  assert(pages.includes("gratuit.html") && pages.length >= 8, pages.join(", "));
  for (const name of pages.sort()) {
    const html = await Deno.readTextFile(`${FORMATION}${name}`);
    assertEquals(tagBalanceProblems(html), [], name);
  }
  // The free module fragment, as published, passes the same check as at integration time.
  const page = await Deno.readTextFile(`${FORMATION}gratuit.html`);
  const fragment = page.slice(page.indexOf("<!-- GRATUIT:DEBUT -->") + 22, page.indexOf("<!-- GRATUIT:FIN -->"));
  checkFragment(fragment);
});
