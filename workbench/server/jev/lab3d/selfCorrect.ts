// BOUCLE DE GÉNÉRATION ET D'AUTO-CORRECTION 3D — le modèle écrit le code three.js, le bac à sable l'exécute, les
// erreurs réelles (exception avec sa ligne, console.error, compilateur GLSL, physique, délai dépassé) sont renvoyées au
// modèle avec les lignes fautives et les fiches de documentation pertinentes ; il corrige ; on recommence jusqu'à un
// rendu sans erreur ou la limite de tours. Pur : la génération et l'exécution sont injectées (testé en Node).
import { ragContext } from './rag';

export interface LabError {
  kind: string;
  msg: string;
  line: number | null;
}
export interface LabRun {
  ok: boolean;
  errors: LabError[];
  warnings: string[];
  stats: { meshes: number; triangles: number; drawCalls: number; bodies: number; programs: number };
}
export interface Round {
  round: number;
  code: string;
  run: LabRun;
  /** What the model was told before this round (empty for the first). */
  feedback: string;
}
/** The blender-cinematic-scene skill, applied to WebGL: lighting, camera, tone mapping and verification rules. */
export const CINEMATIC_WEBGL_RULES = [
  'Éclairage trois points : une lumière principale (key) chaude et forte, un remplissage (fill) doux et froid à l’opposé, un contre-jour (rim) derrière le sujet ; ombres activées sur la key (renderer.shadowMap.enabled, castShadow / receiveShadow).',
  'Caméra cinéma : PerspectiveCamera avec fov 35–45 (équivalent 50 mm), légèrement en plongée, sujet au tiers ; un seul mouvement de caméra lent dans onFrame (orbite ou travelling), jamais plusieurs.',
  'Rendu filmique : renderer.toneMapping = THREE.ACESFilmicToneMapping, toneMappingExposure ≈ 1.0–1.2, renderer.outputColorSpace = THREE.SRGBColorSpace ; matériaux MeshStandardMaterial / MeshPhysicalMaterial avec roughness et metalness justifiés ; brouillard ou fond assorti à la palette.',
  'Silhouette avant détail : blocs principaux visibles et lisibles depuis la caméra avant toute décoration ; échelle cohérente ; pas plus de ~200 draw calls (instancing pour les répétitions).',
  'Vérification : le code se termine (pas de boucle while infinie) ; toute animation passe par onFrame ; rien hors du champ de la caméra.',
];
export const SYSTEM_3D = `Tu es un ingénieur three.js. Tu écris UNIQUEMENT du JavaScript pour le bac à sable décrit dans la documentation (pas d'import, pas de HTML). Réponds par un seul bloc \`\`\`js … \`\`\` contenant tout le code, sans explication autour. Code robuste : objets visibles depuis la caméra (4,3,6), échelle de quelques unités, couleurs agréables, animation par onFrame.`;

/** The code of the answer: the first fenced block (js / javascript / none), else the whole text. */
export function extractCode(text: string): string {
  const m = /```(?:js|javascript|ts|typescript)?\s*\n([\s\S]*?)```/i.exec(text);
  return (m ? m[1]! : text).trim();
}
/** The faulty lines with a little context, numbered as the sandbox reports them. */
export function linesAround(code: string, line: number, span = 2): string {
  const ls = code.split('\n');
  const a = Math.max(1, line - span);
  const b = Math.min(ls.length, line + span);
  const out: string[] = [];
  for (let i = a; i <= b; i++)
    out.push(`${i === line ? '>>' : '  '} ${String(i).padStart(3)} | ${ls[i - 1]}`);
  return out.join('\n');
}
/** The correction message: every error, the faulty lines, the relevant documentation cards. */
export function feedbackFor(code: string, run: LabRun): string {
  const errs = run.errors
    .slice(0, 6)
    .map((e, i) => `${i + 1}. [${e.kind}] ${e.msg}${e.line ? `\n${linesAround(code, e.line)}` : ''}`);
  const warn = run.warnings.slice(0, 3).map((w) => `- ${w}`);
  const empty =
    run.ok && run.stats.meshes === 0
      ? ["La scène ne contient aucun mesh visible : l'objet demandé n'a pas été ajouté à scene."]
      : [];
  return [
    `Ton code a échoué dans le bac à sable. Erreurs réelles :`,
    ...errs,
    ...empty,
    ...(warn.length ? ['Avertissements :', ...warn] : []),
    '',
    ragContext(run.errors.map((e) => `${e.kind} ${e.msg}`).join(' '), 2),
    '',
    'Renvoie le code COMPLET corrigé dans un seul bloc ```js.',
  ].join('\n');
}
export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
/**
 * prompt → code → run → (errors → feedback → corrected code → run)… at most maxRounds runs. Returns every round; the
 * last one is the best (ok, or the last attempt). A scene that runs without error but shows nothing counts as failed.
 */
export async function generateWithCorrection(o: {
  prompt: string;
  generate: (messages: Msg[]) => Promise<string>;
  run: (code: string) => Promise<LabRun>;
  maxRounds?: number;
  onRound?: (r: Round) => void;
  /** Code to start from (iterating on an existing scene). */
  base?: string;
  /** Extra rules appended to the system prompt (e.g. the cinematic rules of the blender-cinematic-scene skill). */
  rules?: string[];
}): Promise<{ ok: boolean; rounds: Round[]; code: string }> {
  const maxRounds = Math.max(1, o.maxRounds ?? 3);
  const messages: Msg[] = [
    { role: 'system', content: `${SYSTEM_3D}${o.rules?.length ? `\n\nRègles supplémentaires :\n${o.rules.map((r) => `- ${r}`).join('\n')}` : ''}\n\n${ragContext(o.prompt, 3)}` },
    {
      role: 'user',
      content: o.base
        ? `Code actuel :\n\`\`\`js\n${o.base}\n\`\`\`\n\nModification demandée : ${o.prompt}`
        : o.prompt,
    },
  ];
  const rounds: Round[] = [];
  let feedback = '';
  for (let r = 1; r <= maxRounds; r++) {
    const answer = await o.generate(messages);
    const code = extractCode(answer);
    const run = await o.run(code);
    const good = run.ok && run.stats.meshes > 0;
    const round = { round: r, code, run: { ...run, ok: good }, feedback };
    rounds.push(round);
    o.onRound?.(round);
    if (good) return { ok: true, rounds, code };
    feedback = feedbackFor(code, run);
    messages.push(
      { role: 'assistant', content: `\`\`\`js\n${code}\n\`\`\`` },
      { role: 'user', content: feedback },
    );
  }
  return { ok: false, rounds, code: rounds[rounds.length - 1]!.code };
}
