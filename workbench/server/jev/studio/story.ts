// Story: prompt builders for the (text) LLM and strict parsing / validation of what comes back.
// Model output is DATA: it is parsed, validated and normalised, never executed or trusted.
import type { DialogueLine, Scene, Story } from './types';
import { redactSecrets } from './secrets';
import { humorBrief } from './humor';

export interface StoryBrief {
  idea: string;
  durationSec: number;
  language: string;
  platform: string;
  characters: { name: string; role: string }[];
  /** Compressed memory of what worked (from Production Memory) — optional. */
  hints?: string[];
  /** Wizard options (all optional). */
  aspect?: string;
  dimension?: '2D' | '3D';
  audience?: string;
  realism?: number;
  dialogue?: boolean;
  music?: boolean;
  sfx?: boolean;
}
export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function storyMessages(b: StoryBrief): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const chars = b.characters.length
    ? b.characters.map((c) => `- ${c.name.toUpperCase()} : ${c.role}`).join('\n')
    : '(aucun personnage imposé : crée-les)';
  return [
    {
      role: 'system',
      content:
        'Tu es scénariste de sketchs humoristiques ivoiriens pour TikTok (vertical 9:16), façon comédie d’Abidjan. Tout est en FRANÇAIS IVOIRIEN (expressions populaires d’Abidjan, nouchi léger compréhensible par tous) — jamais de wolof ni d’autre langue. ' +
        "L'humour vise les situations (belle-famille, quartier, maquis, marché, gbaka, bureau), jamais un groupe, une ethnie, une religion ou un handicap. Aucune marque réelle, aucune personne réelle. " +
        'Réponds UNIQUEMENT par un objet JSON valide, sans texte autour.',
    },
    {
      role: 'user',
      content: [
        `IDÉE : ${redactSecrets(b.idea)}`,
        `Durée visée : ${b.durationSec} s (plus de 60 s pour TikTok Creator Rewards). Langue : ${b.language}. Plateforme : ${b.platform}.`,
        `Personnages :\n${chars}`,
        ...(b.aspect || b.dimension || b.audience || b.realism !== undefined
          ? [
              `Format : ${b.aspect ?? '9:16'}${b.dimension ? ` · animation ${b.dimension}` : ''}${b.audience ? ` · public : ${redactSecrets(b.audience)}` : ''}${b.realism !== undefined ? ` · réalisme ${b.realism}/100 (0 = très stylisé)` : ''}.`,
            ]
          : []),
        ...(b.dialogue === false
          ? ['Aucun dialogue : action muette, mime, narration écrite à l’écran.']
          : []),
        ...(b.sfx === false ? ['Pas de bruitages écrits.'] : []),
        ...(b.music === false ? ['Pas de musique écrite.'] : []),
        ...(b.hints?.length
          ? [`Mémoire de production (ce qui a marché) :\n${b.hints.map((h) => `- ${h}`).join('\n')}`]
          : []),
        humorBrief(b.idea.length),
        'Contraintes : accroche dans la 1re seconde, escalade, twist, chute de moins de 10 mots. Répliques de 12 mots maximum, écrites pour être dites à voix haute. ' +
          'Noms de personnages en MAJUSCULES. Une scène par plan.',
        'ENCHAÎNEMENT : chaque scène découle directement de la précédente (même lieu et même moment sauf raison montrée à l’image ; la situation ou l’objet de la scène d’avant continue) ; aucune scène ne contredit la précédente ; un nouveau personnage est introduit par l’action ; la chute répond à l’accroche. ' +
          'Chaque personnage garde son nom, son rôle, son âge et sa relation aux autres du début à la fin. Toute réplique est dite par un personnage PRÉSENT dans la scène (listé dans "characters").',
        'JSON attendu : {"title","logline","concept","synopsis","hook","twist","punchline","conflict","climax","resolution","setting","theme","characters":[noms],' +
          '"scenes":[{"act","beat":"hook|escalade|twist|chute","duration":secondes,"location","time","characters":[noms],"action","emotion","camera","lighting","sound","music","transition",' +
          '"dialogue":[{"speaker","text","emotion","translation"?,"english","language":"fr"}],"visual_prompt","video_prompt","voice_prompt","subtitle_prompt"}]}',
      ].join('\n\n'),
    },
  ];
}

/**
 * Extracts the first JSON object of a model answer (tolerates fences and prose around it). Repairs what models get
 * wrong: trailing commas, and an answer CUT by the length limit (a reasoning model that spent its budget thinking) —
 * the object is closed after its last complete element, so the finished scenes are kept.
 */
export function extractJson(text: string): unknown | null {
  const t = text.replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  if (start < 0) return null;
  const tryParse = (x: string): unknown | null => {
    for (const v of [x, x.replace(/,(\s*[}\]])/g, '$1')]) {
      try {
        return JSON.parse(v);
      } catch {
        /* next */
      }
    }
    return null;
  };
  // Walk once: balanced end, or the « safe cut points » (just after a complete } or ] inside the object).
  const stack: string[] = [];
  const cuts: { at: number; closers: string }[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) return tryParse(t.slice(start, i + 1));
      cuts.push({ at: i + 1, closers: [...stack].reverse().join('') });
    }
  }
  // Truncated: close after the last complete element that parses (most recent first).
  for (let k = cuts.length - 1; k >= 0 && k >= cuts.length - 400; k--) {
    const c = cuts[k]!;
    const v = tryParse(t.slice(start, c.at).replace(/,\s*$/, '') + c.closers);
    if (v) return v;
  }
  return null;
}

/** Why an answer is unusable, in words the owner can act on. */
export function explainNoJson(text: string, finishReason?: string): string {
  const t = (text ?? '').trim();
  if (!t) return 'réponse vide (le modèle a probablement dépensé toute la longueur autorisée à « réfléchir »)';
  if (finishReason === 'length') return `réponse coupée par la limite de longueur (${t.length} caractères reçus, JSON inachevé)`;
  if (!t.includes('{')) return `le modèle a répondu en texte au lieu de JSON : « ${t.slice(0, 90)}… »`;
  return 'la réponse ne contient pas de JSON valide';
}

type Dict = Record<string, unknown>;
const s = (x: unknown, d = ''): string =>
  typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : d;
const n = (x: unknown, d: number): number =>
  typeof x === 'number' && Number.isFinite(x)
    ? x
    : typeof x === 'string' && Number.isFinite(Number(x))
      ? Number(x)
      : d;
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const rec = (x: unknown): Dict => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Dict) : {});

export interface ParsedStory {
  story: Story;
  scenes: Scene[];
  issues: StoryIssue[];
}
export interface StoryIssue {
  code:
    | 'NO_JSON'
    | 'NO_SCENES'
    | 'LONG_LINE'
    | 'LONG_PUNCHLINE'
    | 'DURATION_SHORT'
    | 'NO_TRANSLATION'
    | 'NO_HOOK';
  severity: 'warn' | 'error';
  message: string;
  sceneId?: string;
}
/** Wolof words: forbidden in the dialogues (everything is in Ivorian French). */
const WOLOF =
  /\b(waaw|déedéet|deedeet|jërëjëf|jerejef|nanga def|mangi fi|ndank|baax|bëgg|begg|xam|lëgg|yaw|man|dama|ñu|nit|jigéen|góor|toubab|teranga|sama|yow|naka|ba beneen)\b/i;

function normScene(x: unknown, i: number, issues: StoryIssue[], idOverride?: string): Scene {
  const sc = rec(x);
  const id = idOverride ?? `S${String(i + 1).padStart(2, '0')}`;
  const dialogue: DialogueLine[] = arr(sc.dialogue).map((l) => {
    const ln = rec(l);
    // « [hausse les épaules] C'est pas mon palabre. » → gesture for the animation, clean text for voice / subtitles.
    const raw = s(ln.text);
    const gm = /^\s*[[(]([^\])]{2,40})[\])]\s*/.exec(raw);
    const t = gm ? raw.slice(gm[0].length) : raw;
    const gesture = s(ln.gesture) || (gm ? gm[1]!.trim().toLowerCase() : '');
    if (wordCount(t) > 12)
      issues.push({
        code: 'LONG_LINE',
        severity: 'warn',
        sceneId: id,
        message: `réplique de ${wordCount(t)} mots (> 12) : « ${t.slice(0, 50)}… »`,
      });
    // Everything is in Ivorian French: a line in wolof (or another language) is flagged to be rewritten.
    const lang = 'fr';
    if (WOLOF.test(t) || /^(wo|fr\+wo)$/.test(s(ln.language)))
      issues.push({
        code: 'NO_TRANSLATION',
        severity: 'warn',
        sceneId: id,
        message: `réplique hors français ivoirien (wolof détecté) : « ${t.slice(0, 40)} » — à réécrire en français d’Abidjan`,
      });
    return {
      speaker: s(ln.speaker, 'NARRATEUR').toUpperCase(),
      text: t,
      translation: s(ln.translation) || undefined,
      ...(s(ln.english) ? { english: s(ln.english) } : {}),
      language: lang,
      emotion: s(ln.emotion, 'neutral'),
      intensity: Math.max(0, Math.min(1, n(ln.intensity, 0.6))),
      pace: Math.max(0.5, Math.min(1.8, n(ln.pace, 1))),
      pauseAfterMs: Math.max(0, n(ln.pauseAfterMs, 250)),
      ...(gesture ? { gesture } : {}),
    };
  });
  return {
    scene_id: id,
    act: s(sc.act, '1'),
    beat: s(sc.beat, i === 0 ? 'hook' : 'escalade').toLowerCase(),
    duration: Math.max(2, Math.min(30, n(sc.duration, 6))),
    location: s(sc.location, 'maison'),
    time: s(sc.time, 'jour'),
    characters: arr(sc.characters)
      .map((c) => s(c).toUpperCase())
      .filter(Boolean),
    action: s(sc.action),
    dialogue,
    emotion: s(sc.emotion, 'neutral'),
    camera: s(sc.camera, 'plan moyen'),
    lighting: s(sc.lighting),
    sound: s(sc.sound),
    music: s(sc.music),
    transition: s(sc.transition, 'cut'),
    visual_prompt: s(sc.visual_prompt),
    video_prompt: s(sc.video_prompt),
    voice_prompt: s(sc.voice_prompt),
    subtitle_prompt: s(sc.subtitle_prompt),
    status: 'DRAFT' as const,
  };
}

/** Parses and normalises the model's answer. Never throws: failures become issues. */
export function parseStory(
  text: string,
  target: { durationSec: number; language: string },
): ParsedStory | { issues: StoryIssue[] } {
  const raw = extractJson(text);
  if (!raw)
    return {
      issues: [{ code: 'NO_JSON', severity: 'error', message: 'la réponse ne contient pas de JSON valide' }],
    };
  const d = rec(raw);
  const issues: StoryIssue[] = [];
  // A speaker absent from the scene's cast would talk off-screen (or not be drawn): added to the scene's characters.
  const scenes: Scene[] = arr(d.scenes)
    .map((x, i) => normScene(x, i, issues))
    .map((sc) => {
      const missing = [...new Set(sc.dialogue.map((l) => l.speaker))].filter((sp) => sp && !sc.characters.some((c) => c.toUpperCase() === sp.toUpperCase()));
      return missing.length ? { ...sc, characters: [...sc.characters, ...missing] } : sc;
    });
  if (!scenes.length)
    issues.push({ code: 'NO_SCENES', severity: 'error', message: 'aucune scène dans la réponse' });
  const total = scenes.reduce((a, c) => a + c.duration, 0);
  if (scenes.length && total < target.durationSec * 0.9)
    issues.push({
      code: 'DURATION_SHORT',
      severity: 'warn',
      message: `durée cumulée ${total}s < ${Math.round(target.durationSec * 0.9)}s visées`,
    });
  const punch = s(d.punchline);
  if (punch && wordCount(punch) >= 10)
    issues.push({
      code: 'LONG_PUNCHLINE',
      severity: 'warn',
      message: `chute de ${wordCount(punch)} mots (< 10 attendus)`,
    });
  if (!s(d.hook)) issues.push({ code: 'NO_HOOK', severity: 'warn', message: 'aucune accroche renseignée' });
  const names = [
    ...new Set([...arr(d.characters).map((c) => s(c).toUpperCase()), ...scenes.flatMap((x) => x.characters)]),
  ].filter(Boolean);
  return {
    story: {
      title: s(d.title, 'Sans titre'),
      logline: s(d.logline),
      concept: s(d.concept),
      synopsis: s(d.synopsis),
      hook: s(d.hook),
      twist: s(d.twist),
      punchline: punch,
      conflict: s(d.conflict),
      climax: s(d.climax),
      resolution: s(d.resolution),
      durationSec: total || target.durationSec,
      characters: names,
      setting: s(d.setting),
      theme: s(d.theme),
    },
    scenes,
    issues,
  };
}

// ───────── one scene (Story Lab « REGENERATE SCENE ») ─────────
export function sceneMessages(o: {
  idea: string;
  logline: string;
  language: string;
  scenes: Scene[];
  index: number;
  instruction?: string;
  dialogue?: boolean;
}): { role: 'system' | 'user'; content: string }[] {
  const around = o.scenes
    .map(
      (sc, i) =>
        `${i === o.index ? '>>' : '  '} ${sc.scene_id} (${sc.beat}, ${sc.duration}s) ${sc.location} : ${sc.action}`,
    )
    .join('\n');
  const cur = o.scenes[o.index]!;
  return [
    {
      role: 'system',
      content:
        'Tu es scénariste de sketchs humoristiques. Tu réécris UNE SEULE scène en gardant la cohérence avec les autres. Aucune marque réelle, aucune personne réelle. Réponds UNIQUEMENT par un objet JSON valide.',
    },
    {
      role: 'user',
      content: [
        `IDÉE : ${redactSecrets(o.idea)}`,
        `Logline : ${redactSecrets(o.logline)}`,
        `Langue : ${o.language}. Scènes (>> = à réécrire) :\n${around}`,
        `Scène actuelle :\n${JSON.stringify({ beat: cur.beat, duration: cur.duration, location: cur.location, characters: cur.characters, action: cur.action, dialogue: cur.dialogue.map((d) => ({ speaker: d.speaker, text: d.text })) })}`,
        o.instruction
          ? `Consigne : ${redactSecrets(o.instruction)}`
          : 'Consigne : propose une version différente et plus drôle, même rôle narratif.',
        ...(o.dialogue === false
          ? ['Aucun dialogue pour cette production.']
          : ['Répliques de 12 mots maximum.']),
        'JSON : {"act","beat","duration","location","time","characters":[noms en MAJUSCULES],"action","emotion","camera","lighting","sound","music","transition","dialogue":[{"speaker","text","emotion","translation"?,"english","language"}],"visual_prompt","video_prompt","voice_prompt","subtitle_prompt"}',
      ].join('\n\n'),
    },
  ];
}
/** Parses ONE regenerated scene; ids and generated assets of the original are kept by the caller. */
export function parseScene(
  text: string,
  base: Scene,
): { scene: Scene; issues: StoryIssue[] } | { issues: StoryIssue[] } {
  const raw = extractJson(text);
  if (!raw)
    return {
      issues: [{ code: 'NO_JSON', severity: 'error', message: 'la réponse ne contient pas de JSON valide' }],
    };
  const o = rec(raw);
  const issues: StoryIssue[] = [];
  const sc = normScene(o.scene ?? o, 0, issues, base.scene_id);
  if (!sc.action) return { issues: [{ code: 'NO_SCENES', severity: 'error', message: 'scène sans action' }] };
  return {
    scene: {
      ...sc,
      imageAssetId: base.imageAssetId,
      videoAssetId: base.videoAssetId,
      status: base.imageAssetId ? base.status : 'DRAFT',
    },
    issues,
  };
}
