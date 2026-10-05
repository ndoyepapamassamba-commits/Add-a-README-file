// JEV scientific benchmark: a PAIRED experiment. For every task and every repetition
// (one benchmark_group_id), the SAME prompt, workspace state, tools and model protocol
// are run in 4 variants — OFF, PRE, LIVE, FULL — in a shuffled order, through the real
// agent runtime and the real OpenRouter calls. Tokens, cost and latency come from the
// provider usage; success from a deterministic check of the final answer. Nothing is
// simulated or extrapolated: the benchmark only runs when the user starts it.
import { runAgent, type JevVariant } from './agent';
import { useStore } from './store';
import { writeText } from './vfs';
import { qualityScore } from '../../server/jev/qa';
import type { QualityVector } from '../../server/jev/qa';

export interface BenchTask {
  key: string;
  label: string;
  /** Task category of the scientific analysis (see CATEGORY_LABEL). */
  category: string;
  text: string;
  /** Success check on the final answer. */
  expect: RegExp;
  setup?: () => void;
  /** Files the task creates: deleted before each run so that every variant starts from the same workspace. */
  outputs?: string[];
}

const setupData = () =>
  writeText(
    'bench/ventes.csv',
    'agence,mois,montant\nDakar,janvier,1200\nThies,janvier,300\nDakar,fevrier,450\nKaolack,fevrier,80\n',
  );

export const BENCH: BenchTask[] = [
  {
    key: 'coding',
    category: 'code',
    label: 'CODING',
    text: 'Écris une fonction JavaScript `somme(tab)` qui additionne un tableau de nombres, puis donne le résultat de somme([2,3,5]).',
    expect: /\b10\b/,
  },
  {
    key: 'data',
    category: 'data',
    label: 'DATA ANALYSIS',
    text: 'Dans bench/ventes.csv, quel est le total des montants pour Dakar ?',
    expect: /1[\s  ]?650/,
    setup: setupData,
  },
  {
    key: 'research',
    category: 'research',
    label: 'RESEARCH',
    text: 'Sans chercher sur le web : quelle est la capitale du Sénégal ? Une phrase.',
    expect: /dakar/i,
  },
  {
    key: 'document',
    category: 'document',
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
    category: 'writing',
    label: 'WRITING',
    text: 'Rédige en 40 mots maximum un mail de remerciement à l’équipe pour la clôture mensuelle.',
    expect: /merci|remerci/i,
  },
  {
    key: 'reasoning',
    category: 'reasoning',
    label: 'REASONING',
    text: 'Un portefeuille de 2 000 000 XOF perd 15 % puis regagne 15 %. Quelle est sa valeur finale ? Donne le chiffre.',
    expect: /1[\s  .]?955[\s  .]?000/,
  },
  {
    key: 'browser',
    category: 'browser',
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
    category: 'agent',
    label: 'MULTI-STEP AGENT',
    text: 'Crée le fichier bench/notes.txt contenant « bonjour », puis relis-le et confirme son contenu.',
    expect: /bonjour/i,
    outputs: ['bench/notes.txt'],
  },
  {
    key: 'excel',
    category: 'excel',
    label: 'EXCEL',
    text: 'Profile le fichier bench/ventes.csv : combien de lignes de données et quelles colonnes ?',
    expect: /\b4\b[\s\S]*(agence|mois|montant)|(agence|mois|montant)[\s\S]*\b4\b/i,
    setup: setupData,
  },
  {
    key: 'debugging',
    category: 'code',
    label: 'DEBUGGING',
    text: 'Trouve le bug : `function moyenne(t){ return t.reduce((a,b)=>a+b) / t.lenght }`. Donne la ligne corrigée.',
    expect: /length/,
  },
  {
    key: 'refactoring',
    category: 'code',
    label: 'REFACTORING',
    text: 'Réécris de façon plus lisible : `const r = x.filter(e=>e>0).map(e=>e*2)` en donnant un nom clair aux variables.',
    expect: /filter[\s\S]*map|map[\s\S]*filter/,
  },
  {
    key: 'multiagent',
    category: 'agent',
    label: 'MULTI-AGENT',
    text: 'Délègue à deux spécialistes en parallèle : l’un calcule 17 × 23, l’autre donne la racine carrée de 144. Puis donne les deux résultats.',
    expect: /391[\s\S]*12|12[\s\S]*391/,
  },
  {
    key: 'complexcode',
    category: 'code',
    label: 'COMPLEX CODING',
    text: 'Écris dans bench/fib.js une fonction fib(n) itérative, exécute-la pour n = 30 avec code.run et donne le résultat.',
    expect: /832[\s  ]?040/,
    outputs: ['bench/fib.js'],
  },
  {
    key: 'highrisk',
    category: 'reasoning',
    label: 'HIGH-RISK REASONING',
    text: 'Crédit de 10 000 000 XOF, provision IFRS 9 de 35 %, puis reprise de 20 % de la provision. Quel est le montant de la provision après reprise ? Donne le chiffre exact.',
    expect: /2[\s  .]?800[\s  .]?000/,
  },
  {
    key: 'chat',
    category: 'chat',
    label: 'CHAT SIMPLE',
    text: 'Dis bonjour en une phrase.',
    expect: /bonjour/i,
  },
  {
    key: 'longctx',
    category: 'long_context',
    label: 'LONG CONTEXT',
    text: 'Dans bench/long.md, quel est le code du projet ? Réponds uniquement par le code.',
    expect: /ZX-4471/,
    setup: () =>
      writeText(
        'bench/long.md',
        `${Array.from({ length: 220 }, (_, i) => `Note ${i + 1} : revue du portefeuille, agence ${['Dakar', 'Thiès', 'Kaolack', 'Saint-Louis'][i % 4]}, encours stable, aucun incident à signaler pour cette période.`).join('\n')}\n\nCode du projet : ZX-4471.\n\n${Array.from({ length: 220 }, (_, i) => `Annexe ${i + 1} : rappel de procédure interne sans incidence sur le suivi.`).join('\n')}\n`,
      ),
  },
  {
    key: 'toolheavy',
    category: 'tool_heavy',
    label: 'TOOL-HEAVY',
    text: 'Crée les fichiers bench/a.txt, bench/b.txt et bench/c.txt contenant respectivement « un », « deux » et « trois », puis liste le dossier bench et dis combien de ces trois fichiers existent.',
    expect: /\b(3|trois)\b/i,
    outputs: ['bench/a.txt', 'bench/b.txt', 'bench/c.txt'],
  },
  {
    key: 'planning',
    category: 'writing',
    label: 'PLANNING',
    text: 'Donne un plan en 3 étapes numérotées pour clôturer un reporting mensuel.',
    expect: /1[.)][\s\S]*2[.)][\s\S]*3[.)]/,
  },
];

export interface BenchRun {
  key: string;
  variant: JevVariant;
  rep: number;
  groupId: string;
  ok: boolean;
  session: string;
}

export const VARIANTS: { id: JevVariant; label: string }[] = [
  { id: 'off', label: 'OFF' },
  { id: 'pre', label: 'PRE' },
  { id: 'live', label: 'LIVE' },
  { id: 'full', label: 'FULL' },
];

export interface BenchOptions {
  variants?: JevVariant[];
  reps?: number;
  /** fixed-model: the SAME model in every variant (isolates the JEV effect). free-routing: the router chooses. */
  protocol?: 'fixed-model' | 'free-routing';
  /** Model imposed in the fixed-model protocol. */
  model?: string;
}

const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/**
 * Runs the paired experiment. Each (task, repetition) is one benchmark group run in every selected
 * variant, in a random order (cancels the order and prompt-cache effects), from the same workspace state.
 */
export async function runBench(
  keys: string[],
  onProgress: (msg: string) => void,
  signal?: { stop: boolean },
  opts: BenchOptions = {},
): Promise<BenchRun[]> {
  const variants = opts.variants?.length ? opts.variants : (['off', 'pre', 'live', 'full'] as JevVariant[]);
  const reps = Math.max(1, Math.min(10, opts.reps ?? 1));
  const protocol = opts.protocol ?? 'fixed-model';
  if (protocol === 'fixed-model' && !opts.model)
    throw new Error('Protocole « modèle imposé » : choisissez un modèle.');
  const experimentId = `EXP-${Date.now().toString(36)}`;
  const out: BenchRun[] = [];
  const baseline = new Set(Object.keys(useStore.getState().files));
  const tasks = BENCH.filter((b) => keys.includes(b.key));
  for (let rep = 1; rep <= reps; rep++)
    for (const [ti, t] of tasks.entries()) {
      const groupId = `${experimentId}:${t.key}:${rep}`;
      for (const [order, variant] of shuffle(variants).entries()) {
        if (signal?.stop) return out;
        // Same starting workspace for every run: remove what earlier runs created, rewrite the task data.
        const st0 = useStore.getState();
        for (const p of Object.keys(st0.files))
          if (!baseline.has(p) && !p.startsWith('.ai/')) st0.deleteFile(p);
        for (const p of t.outputs ?? []) if (useStore.getState().files[p]) useStore.getState().deleteFile(p);
        t.setup?.();
        const st = useStore.getState();
        const s = st.newSession(false);
        const vl = VARIANTS.find((v) => v.id === variant)!.label;
        st.patchSession(s.id, {
          title: `[bench ${vl}${reps > 1 ? ` #${rep}` : ''}] ${t.label}`,
          mode: 'auto',
          ...(protocol === 'fixed-model' ? { model: opts.model! } : {}),
        });
        onProgress(`${t.label} — ${vl}${reps > 1 ? ` (répétition ${rep}/${reps})` : ''}…`);
        await runAgent(s.id, t.text, [], {
          mode: 'chat',
          jev: variant,
          bench: t.key,
          rep,
          experiment: {
            experimentId,
            groupId,
            taskId: `TASK_${String(ti + 1).padStart(3, '0')}:${t.key}`,
            category: t.category,
            protocol,
            rep,
            order,
          },
        });
        const sess = useStore.getState().sessions.find((x) => x.id === s.id);
        const answer = [...(sess?.items ?? [])]
          .reverse()
          .find((i) => i.kind === 'assistant' && i.text.trim());
        const ok = Boolean(answer && answer.kind === 'assistant' && t.expect.test(answer.text));
        // Success and the correctness dimension of the quality come from the deterministic check, not from the model.
        const log = useStore.getState().jevLog;
        const idx = log.map((e) => e.session).lastIndexOf(s.id);
        if (idx >= 0) {
          const e = log[idx]!;
          const vec = e.qualityVector as unknown as QualityVector | undefined;
          const withTruth = vec ? { ...vec, correctness: ok ? 1 : 0 } : null;
          const next = [...log];
          next[idx] = {
            ...e,
            success: ok,
            bench: t.key,
            variant,
            rep,
            qualityVector: withTruth ?? e.qualityVector,
            qualityMeasured: withTruth ? qualityScore(withTruth) : ok ? (e.qualityMeasured ?? null) : 0,
            qualitySource: 'local-qa+ground-truth',
          };
          useStore.getState().setJevLog(next);
        }
        out.push({ key: t.key, variant, rep, groupId, ok, session: s.id });
      }
    }
  return out;
}
