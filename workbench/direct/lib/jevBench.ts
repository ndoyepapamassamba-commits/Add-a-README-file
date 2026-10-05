// JEV internal benchmark: the SAME mission run WITHOUT JEV (baseline) and WITH
// JEV, through the real agent runtime and the real OpenRouter calls. Tokens,
// cost and latency come from OpenRouter usage; success from a deterministic
// check of the final answer. Nothing is simulated or extrapolated.
import { runAgent } from './agent';
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
    key: 'planning',
    label: 'PLANNING',
    text: 'Donne un plan en 3 étapes numérotées pour clôturer un reporting mensuel.',
    expect: /1[.)][\s\S]*2[.)][\s\S]*3[.)]/,
  },
];

export interface BenchRun {
  key: string;
  jev: boolean;
  ok: boolean;
  session: string;
}

/** Runs the selected tasks without then with JEV (same model routing, same budget). */
export async function runBench(
  keys: string[],
  onProgress: (msg: string) => void,
  signal?: { stop: boolean },
): Promise<BenchRun[]> {
  const out: BenchRun[] = [];
  for (const t of BENCH.filter((b) => keys.includes(b.key))) {
    for (const jev of [false, true]) {
      if (signal?.stop) return out;
      t.setup?.();
      const st = useStore.getState();
      const s = st.newSession(false);
      st.patchSession(s.id, { title: `[bench ${jev ? 'JEV' : 'sans JEV'}] ${t.label}`, mode: 'auto' });
      onProgress(`${t.label} — ${jev ? 'avec JEV' : 'sans JEV'}…`);
      await runAgent(s.id, t.text, [], { mode: 'chat', jev, bench: t.key });
      const sess = useStore.getState().sessions.find((x) => x.id === s.id);
      const answer = [...(sess?.items ?? [])].reverse().find((i) => i.kind === 'assistant' && i.text.trim());
      const ok = Boolean(answer && answer.kind === 'assistant' && t.expect.test(answer.text));
      // The success of a benchmark run is measured by the check, not by the model.
      const log = useStore.getState().jevLog;
      const idx = log.map((e) => e.session).lastIndexOf(s.id);
      if (idx >= 0) {
        const next = [...log];
        next[idx] = { ...next[idx]!, success: ok, bench: t.key };
        useStore.getState().setJevLog(next);
      }
      out.push({ key: t.key, jev, ok, session: s.id });
    }
  }
  return out;
}
