// JEV internal benchmark 2.0: the SAME mission run in 4 variants — WITHOUT JEV,
// JEV PRE, JEV PRE + LIVE, JEV FULL — N times each, through the real agent
// runtime and the real OpenRouter calls. Tokens,
// cost and latency come from OpenRouter usage; success from a deterministic
// check of the final answer. Nothing is simulated or extrapolated.
import { runAgent, type JevVariant } from './agent';
import { useStore } from './store';
import { writeText } from './vfs';

export interface BenchTask {
  key: string;
  label: string;
  text: string;
  /** Success check on the final answer. */
  expect: RegExp;
  setup?: () => void;
}

const setupData = () =>
  writeText(
    'bench/ventes.csv',
    'agence,mois,montant\nDakar,janvier,1200\nThies,janvier,300\nDakar,fevrier,450\nKaolack,fevrier,80\n',
  );

export const BENCH: BenchTask[] = [
  {
    key: 'coding',
    label: 'CODING',
    text: 'Écris une fonction JavaScript `somme(tab)` qui additionne un tableau de nombres, puis donne le résultat de somme([2,3,5]).',
    expect: /\b10\b/,
  },
  {
    key: 'data',
    label: 'DATA ANALYSIS',
    text: 'Dans bench/ventes.csv, quel est le total des montants pour Dakar ?',
    expect: /1[\s  ]?650/,
    setup: setupData,
  },
  {
    key: 'research',
    label: 'RESEARCH',
    text: 'Sans chercher sur le web : quelle est la capitale du Sénégal ? Une phrase.',
    expect: /dakar/i,
  },
  {
    key: 'document',
    label: 'DOCUMENT ANALYSIS',
    text: 'Lis bench/contrat.md et indique la durée du contrat.',
    expect: /24\s*mois|deux ans/i,
    setup: () =>
      writeText(
        'bench/contrat.md',
        '# Contrat de service\n\nArticle 1 — Objet : maintenance.\n\nArticle 2 — Durée : le contrat est conclu pour 24 mois à compter de la signature.\n\nArticle 3 — Prix : 1 200 000 XOF par an.\n',
      ),
  },
  {
    key: 'writing',
    label: 'WRITING',
    text: 'Rédige en 40 mots maximum un mail de remerciement à l’équipe pour la clôture mensuelle.',
    expect: /merci|remerci/i,
  },
  {
    key: 'reasoning',
    label: 'REASONING',
    text: 'Un portefeuille de 2 000 000 XOF perd 15 % puis regagne 15 %. Quelle est sa valeur finale ? Donne le chiffre.',
    expect: /1[\s  .]?955[\s  .]?000/,
  },
  {
    key: 'browser',
    label: 'BROWSER',
    text: 'Ouvre bench/page.html dans le navigateur intégré et donne le titre de la page.',
    expect: /Rapport Mensuel/i,
    setup: () =>
      writeText(
        'bench/page.html',
        '<!doctype html><html><head><title>Rapport Mensuel</title></head><body><h1>Rapport Mensuel</h1></body></html>',
      ),
  },
  {
    key: 'multistep',
    label: 'MULTI-STEP AGENT',
    text: 'Crée le fichier bench/notes.txt contenant « bonjour », puis relis-le et confirme son contenu.',
    expect: /bonjour/i,
  },
  {
    key: 'excel',
    label: 'EXCEL',
    text: 'Profile le fichier bench/ventes.csv : combien de lignes de données et quelles colonnes ?',
    expect: /\b4\b[\s\S]*(agence|mois|montant)|(agence|mois|montant)[\s\S]*\b4\b/i,
    setup: setupData,
  },
  {
    key: 'debugging',
    label: 'DEBUGGING',
    text: 'Trouve le bug : `function moyenne(t){ return t.reduce((a,b)=>a+b) / t.lenght }`. Donne la ligne corrigée.',
    expect: /length/,
  },
  {
    key: 'refactoring',
    label: 'REFACTORING',
    text: 'Réécris de façon plus lisible : `const r = x.filter(e=>e>0).map(e=>e*2)` en donnant un nom clair aux variables.',
    expect: /filter[\s\S]*map|map[\s\S]*filter/,
  },
  {
    key: 'multiagent',
    label: 'MULTI-AGENT',
    text: 'Délègue à deux spécialistes en parallèle : l’un calcule 17 × 23, l’autre donne la racine carrée de 144. Puis donne les deux résultats.',
    expect: /391[\s\S]*12|12[\s\S]*391/,
  },
  {
    key: 'complexcode',
    label: 'COMPLEX CODING',
    text: 'Écris dans bench/fib.js une fonction fib(n) itérative, exécute-la pour n = 30 avec code.run et donne le résultat.',
    expect: /832[\s  ]?040/,
  },
  {
    key: 'highrisk',
    label: 'HIGH-RISK REASONING',
    text: 'Crédit de 10 000 000 XOF, provision IFRS 9 de 35 %, puis reprise de 20 % de la provision. Quel est le montant de la provision après reprise ? Donne le chiffre exact.',
    expect: /2[\s  .]?800[\s  .]?000/,
  },
  {
    key: 'planning',
    label: 'PLANNING',
    text: 'Donne un plan en 3 étapes numérotées pour clôturer un reporting mensuel.',
    expect: /1[.)][\s\S]*2[.)][\s\S]*3[.)]/,
  },
];

export interface BenchRun {
  key: string;
  variant: JevVariant;
  rep: number;
  ok: boolean;
  session: string;
}

export const VARIANTS: { id: JevVariant; label: string }[] = [
  { id: 'off', label: 'SANS JEV' },
  { id: 'pre', label: 'JEV PRE' },
  { id: 'live', label: 'JEV PRE + LIVE' },
  { id: 'full', label: 'JEV FULL' },
];

/** Runs the selected tasks in each variant, `reps` times (same routing inputs, same budget). */
export async function runBench(
  keys: string[],
  onProgress: (msg: string) => void,
  signal?: { stop: boolean },
  opts: { variants?: JevVariant[]; reps?: number } = {},
): Promise<BenchRun[]> {
  const variants = opts.variants ?? ['off', 'full'];
  const reps = Math.max(1, Math.min(10, opts.reps ?? 1));
  const out: BenchRun[] = [];
  for (let rep = 1; rep <= reps; rep++)
    for (const t of BENCH.filter((b) => keys.includes(b.key))) {
      for (const variant of variants) {
        if (signal?.stop) return out;
        t.setup?.();
        const st = useStore.getState();
        const s = st.newSession(false);
        const vl = VARIANTS.find((v) => v.id === variant)!.label;
        st.patchSession(s.id, {
          title: `[bench ${vl}${reps > 1 ? ` #${rep}` : ''}] ${t.label}`,
          mode: 'auto',
        });
        onProgress(`${t.label} — ${vl}${reps > 1 ? ` (répétition ${rep}/${reps})` : ''}…`);
        await runAgent(s.id, t.text, [], { mode: 'chat', jev: variant, bench: t.key, rep });
        const sess = useStore.getState().sessions.find((x) => x.id === s.id);
        const answer = [...(sess?.items ?? [])]
          .reverse()
          .find((i) => i.kind === 'assistant' && i.text.trim());
        const ok = Boolean(answer && answer.kind === 'assistant' && t.expect.test(answer.text));
        // The success of a benchmark run is measured by the check, not by the model.
        const log = useStore.getState().jevLog;
        const idx = log.map((e) => e.session).lastIndexOf(s.id);
        if (idx >= 0) {
          const next = [...log];
          next[idx] = { ...next[idx]!, success: ok, bench: t.key, variant, rep };
          useStore.getState().setJevLog(next);
        }
        out.push({ key: t.key, variant, rep, ok, session: s.id });
      }
    }
  return out;
}
