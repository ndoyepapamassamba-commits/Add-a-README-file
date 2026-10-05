// JEV DISTILLATION LAB + TRAINING DATASET FACTORY.
// Distinction obligatoire (jamais « les poids ont été entraînés » sans entraînement réel) :
//  1 prompt improvement · 2 skill learning · 3 policy learning · 4 strategy distillation ·
//  5 dataset generation  → réalisables ici ;
//  6 fine-tuning · 7 weight training → pipeline séparé, infrastructure d'entraînement requise.
import type { JevLogEntry } from '../metrics';
import { redact } from '../provider';
import { qualityOfEntry } from './memory';
import { scrubSecrets } from './security';
import { mineCandidates, type FabricSkill } from './skills';

export interface LearningLevel {
  level: number;
  name: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  detail: string;
}
export const LEARNING_LEVELS: LearningLevel[] = [
  {
    level: 1,
    name: 'Prompt improvement',
    status: 'AVAILABLE',
    detail: 'consignes compactes injectées (skills validées, rappels issus des échecs) ; aucun poids modifié',
  },
  {
    level: 2,
    name: 'Skill learning',
    status: 'AVAILABLE',
    detail: 'la Skill Factory extrait des procédures de missions réussies, les teste et les versionne',
  },
  {
    level: 3,
    name: 'Policy learning',
    status: 'AVAILABLE',
    detail: 'le Policy Engine apprend des règles de routage à partir des mesures',
  },
  {
    level: 4,
    name: 'Strategy distillation',
    status: 'AVAILABLE',
    detail:
      'les traces d’experts (plan, décisions, outils, critères) d’un modèle fort deviennent des skills pour un modèle moins cher',
  },
  {
    level: 5,
    name: 'Dataset generation',
    status: 'AVAILABLE',
    detail: 'export JSONL / JSON / CSV d’exemples validés ; aucun entraînement n’est lancé',
  },
  {
    level: 6,
    name: 'Fine-tuning',
    status: 'UNAVAILABLE',
    detail:
      'nécessite une infrastructure de fine-tuning réelle (GPU ou service de fine-tuning) : non connectée dans cette édition',
  },
  {
    level: 7,
    name: 'Weight training',
    status: 'UNAVAILABLE',
    detail:
      'modification des poids d’un modèle open-weight : hors de portée d’un navigateur, pipeline séparé',
  },
];

/** Structured expert trace: plan, decisions, tools, criteria, validations, result, mistakes avoided — never a chain of thought. */
export interface ExpertTrace {
  id: string;
  task: string;
  taskType: string;
  difficulty: number | null;
  teacher: string;
  plan: string[];
  decisions: string[];
  tools: string[];
  criteria: string[];
  validations: string[];
  result: { success: boolean | null; quality: number | null; costUsd: number; answerChars: number | null };
  errorsAvoided: string[];
  createdAt: number;
}

const DEC =
  /(STOP|REPLAN|ESCALAT|CORRECT|DRIFT|SWITCH|REMOVE_TOOL|ADD TOOL|COMPRESS|REMOVE_CONTEXT|LOWER_REASONING|RAISE_REASONING)/;

export function expertTrace(e: JevLogEntry): ExpertTrace | null {
  if (e.success !== true) return null;
  const tools = e.toolsUsed ?? [];
  const q = e.qualityVector ?? {};
  return {
    id: `trace-${e.id}`,
    task: scrubSecrets(redact(e.instruction ?? e.mission)).slice(0, 400),
    taskType: e.task,
    difficulty: e.experiment?.difficulty ?? null,
    teacher: e.model,
    plan: tools.length ? tools.map((t, i) => `${i + 1}. ${t}`) : ['réponse directe, sans outil'],
    decisions: e.checkpoints
      .map((c) => c.decision)
      .filter((d) => DEC.test(d))
      .slice(0, 10),
    tools,
    criteria: Object.entries(q)
      .filter(([, v]) => v < 1)
      .map(([k]) => `${k} à vérifier`)
      .slice(0, 6),
    validations: [
      `qualité ${qualityOfEntry(e) ?? 'NON MESURÉE'}`,
      e.qualitySource ?? 'contrôle local',
      ...(e.corrections ? [`${e.corrections} correction(s) ciblée(s)`] : []),
    ],
    result: {
      success: e.success,
      quality: qualityOfEntry(e),
      costUsd: e.acct?.totalCost ?? e.cost + e.jevCost,
      answerChars: e.answer?.length ?? null,
    },
    errorsAvoided: [
      ...(e.corrections ? ['erreur corrigée avant livraison'] : []),
      ...(e.driftEvents ?? []).map((d) => `dérive évitée : ${d.slice(0, 60)}`),
    ],
    createdAt: e.at,
  };
}

/** Successful, good runs of strong (teacher) models. `teachers` empty = every model qualifies. */
export function teacherTraces(
  log: JevLogEntry[],
  o: { teachers?: string[]; minQuality?: number } = {},
): ExpertTrace[] {
  return log
    .filter(
      (e) =>
        (!o.teachers?.length || o.teachers.includes(e.model)) &&
        (qualityOfEntry(e) ?? 0) >= (o.minQuality ?? 80),
    )
    .map(expertTrace)
    .filter((t): t is ExpertTrace => t !== null);
}

/** Strategy distillation: skills mined from the TEACHER's runs only (2 repetitions suffice; the test lab still decides). */
export function distillSkills(
  log: JevLogEntry[],
  existing: FabricSkill[],
  teacher: string,
  now?: number,
): ReturnType<typeof mineCandidates> {
  return mineCandidates({
    log: log.filter((e) => e.model === teacher),
    existing,
    teacher,
    now,
    rules: { minRepeats: 2 },
  });
}

// ───────────────────────── training dataset factory ─────────────────────────

export interface TrainingRow {
  instruction: string;
  input: string;
  expected_output: string;
  evaluation_criteria: string[];
  task_type: string;
  difficulty: number | null;
  source: string;
  quality: number | null;
  teacher_model: string;
  student_model: string | null;
  validation_status: 'validated' | 'unvalidated' | 'rejected';
}
export interface DatasetReport {
  rows: TrainingRow[];
  /** Entries left out, with the reason (nothing is silently dropped). */
  skipped: { noExample: number; rejected: number; lowQuality: number; unjudged: number };
}
export interface DatasetOptions {
  teachers?: string[];
  student?: string | null;
  minQuality?: number;
  /** Keep failed runs, labelled « rejected » (useful as negative examples). */
  includeRejected?: boolean;
}

export function buildDataset(log: JevLogEntry[], o: DatasetOptions = {}): DatasetReport {
  const skipped = { noExample: 0, rejected: 0, lowQuality: 0, unjudged: 0 };
  const rows: TrainingRow[] = [];
  for (const e of log) {
    if (o.teachers?.length && !o.teachers.includes(e.model)) continue;
    if (!e.instruction || !e.answer) {
      skipped.noExample++;
      continue;
    }
    if (e.success === null) {
      skipped.unjudged++;
      continue;
    }
    const q = qualityOfEntry(e);
    if (e.success === false && !o.includeRejected) {
      skipped.rejected++;
      continue;
    }
    if (e.success && q !== null && q < (o.minQuality ?? 75)) {
      skipped.lowQuality++;
      continue;
    }
    const truth = (e.qualitySource ?? '').includes('ground-truth');
    rows.push({
      instruction: scrubSecrets(e.instruction),
      input: '',
      expected_output: scrubSecrets(e.answer),
      evaluation_criteria: e.config?.why?.length
        ? e.config.why.slice(0, 3)
        : ['réponse correcte et complète', 'format demandé respecté'],
      task_type: e.task,
      difficulty: e.experiment?.difficulty ?? null,
      source: e.fabric ? `fabric:${e.fabric.kind}` : e.bench ? `benchmark:${e.bench}` : 'mission',
      quality: q,
      teacher_model: e.model,
      student_model: o.student ?? null,
      validation_status:
        e.success === false
          ? 'rejected'
          : truth && (q ?? 100) >= (o.minQuality ?? 75)
            ? 'validated'
            : 'unvalidated',
    });
  }
  return { rows, skipped };
}
export const toJsonl = (rows: TrainingRow[]) => rows.map((r) => JSON.stringify(r)).join('\n');
export const toJson = (rows: TrainingRow[]) => JSON.stringify(rows, null, 2);
export function toCsv(rows: TrainingRow[]): string {
  const cols: (keyof TrainingRow)[] = [
    'instruction',
    'input',
    'expected_output',
    'evaluation_criteria',
    'task_type',
    'difficulty',
    'source',
    'quality',
    'teacher_model',
    'student_model',
    'validation_status',
  ];
  const esc = (v: unknown) => `"${(Array.isArray(v) ? v.join(' | ') : String(v ?? '')).replace(/"/g, '""')}"`;
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
}
export const TRAINING_NOTICE =
  'Ce jeu de données est PRÊT pour un fine-tuning externe. Aucun entraînement n’a été lancé et aucun poids n’a été modifié : le fine-tuning (niveau 6) et l’entraînement de poids (niveau 7) exigent une infrastructure réelle non connectée ici.';
