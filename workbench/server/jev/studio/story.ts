// Story: prompt builders for the (text) LLM and strict parsing / validation of what comes back.
// Model output is DATA: it is parsed, validated and normalised, never executed or trusted.
import type { DialogueLine, Scene, Story } from './types';
import { redactSecrets } from './secrets';

export interface StoryBrief {
  idea: string;
  durationSec: number;
  language: string;
  platform: string;
  characters: { name: string; role: string }[];
  /** Compressed memory of what worked (from Production Memory) — optional. */
  hints?: string[];
}
export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function storyMessages(b: StoryBrief): { role: 'system' | 'user'; content: string }[] {
  const chars = b.characters.length
    ? b.characters.map((c) => `- ${c.name.toUpperCase()} : ${c.role}`).join('\n')
    : '(aucun personnage imposé : crée-les)';
  return [
    {
      role: 'system',
      content:
        'Tu es scénariste de sketchs humoristiques sénégalais pour TikTok (vertical 9:16). Français avec touches de wolof (traduction fournie). ' +
        "L'humour vise les situations (belle-famille, quartier, marché, bureau), jamais un groupe, une ethnie, une religion ou un handicap. Aucune marque réelle, aucune personne réelle. " +
        'Réponds UNIQUEMENT par un objet JSON valide, sans texte autour.',
    },
    {
      role: 'user',
      content: [
        `IDÉE : ${redactSecrets(b.idea)}`,
        `Durée visée : ${b.durationSec} s (plus de 60 s pour TikTok Creator Rewards). Langue : ${b.language}. Plateforme : ${b.platform}.`,
        `Personnages :\n${chars}`,
        ...(b.hints?.length
          ? [`Mémoire de production (ce qui a marché) :\n${b.hints.map((h) => `- ${h}`).join('\n')}`]
          : []),
        'Contraintes : accroche dans la 1re seconde, escalade, twist, chute de moins de 10 mots. Répliques de 12 mots maximum, écrites pour être dites à voix haute. ' +
          'Noms de personnages en MAJUSCULES. Une scène par plan.',
        'JSON attendu : {"title","logline","concept","synopsis","hook","twist","punchline","conflict","climax","resolution","setting","theme","characters":[noms],' +
          '"scenes":[{"act","beat":"hook|escalade|twist|chute","duration":secondes,"location","time","characters":[noms],"action","emotion","camera","lighting","sound","music","transition",' +
          '"dialogue":[{"speaker","text","emotion","translation"?,"language":"fr|wo|en"}],"visual_prompt","video_prompt","voice_prompt","subtitle_prompt"}]}',
      ].join('\n\n'),
    },
  ];
}

/** Extracts the first balanced JSON object of a model answer (tolerates fences and prose around it). */
export function extractJson(text: string): unknown | null {
  const t = text.replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
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
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
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
const WOLOF =
  /\b(waaw|déedéet|deedeet|jërëjëf|jerejef|nanga def|mangi fi|ndank|baax|bëgg|begg|xam|lëgg|yaw|man|dama|ñu|nit|jigéen|góor|toubab|teranga|sama|yow|naka|ba beneen)\b/i;

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
  const scenes: Scene[] = arr(d.scenes).map((x, i) => {
    const sc = rec(x);
    const id = `S${String(i + 1).padStart(2, '0')}`;
    const dialogue: DialogueLine[] = arr(sc.dialogue).map((l) => {
      const ln = rec(l);
      const t = s(ln.text);
      if (wordCount(t) > 12)
        issues.push({
          code: 'LONG_LINE',
          severity: 'warn',
          sceneId: id,
          message: `réplique de ${wordCount(t)} mots (> 12) : « ${t.slice(0, 50)}… »`,
        });
      const lang = s(ln.language, WOLOF.test(t) ? 'wo' : 'fr');
      if ((lang === 'wo' || WOLOF.test(t)) && !s(ln.translation))
        issues.push({
          code: 'NO_TRANSLATION',
          severity: 'warn',
          sceneId: id,
          message: 'réplique en wolof sans traduction pour les sous-titres',
        });
      return {
        speaker: s(ln.speaker, 'NARRATEUR').toUpperCase(),
        text: t,
        translation: s(ln.translation) || undefined,
        language: lang,
        emotion: s(ln.emotion, 'neutral'),
        intensity: Math.max(0, Math.min(1, n(ln.intensity, 0.6))),
        pace: Math.max(0.5, Math.min(1.8, n(ln.pace, 1))),
        pauseAfterMs: Math.max(0, n(ln.pauseAfterMs, 250)),
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
