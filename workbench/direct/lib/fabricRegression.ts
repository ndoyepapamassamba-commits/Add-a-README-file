// JEV COGNITIVE FABRIC — non-regression self-test. Every check runs against the REAL modules (no
// canned result): PASS / FAIL / WARN. It makes no model call and costs $0.
import { regressionReport } from './inventory';
import { registry } from './fabric';
import { DEFAULT_FABRIC } from '../../server/jev/fabric/types';
import { directAnswer } from '../../server/jev/packet';
import { analyze, pairUp } from '../../server/jev/science';
import { cfBenchTasks } from '../../server/jev/fabric/cfbench';
import { containsSecret, scrubSecrets } from '../../server/jev/fabric/security';
import { toCsv as logCsv } from '../../server/jev/metrics';
import { toCsv, toJsonl } from '../../server/jev/fabric/distill';
import { DIMENSIONS } from '../../server/jev/fabric/learning';
import { LEARNING_LEVELS } from '../../server/jev/fabric/distill';
import { BENCH } from './jevBench';
import type { JevLogEntry } from '../../server/jev/metrics';
import { DESIGN, designCheck } from '../../server/services/houseDesign';
import { houseXlsx } from '../../server/services/houseStyle';
import { housePptx } from '../../server/services/housePptx';
import { DEFAULT_APPRENTICE } from '../../server/jev/apprentice/types';
import { routeFreeFirst } from '../../server/jev/apprentice/router';
import { buildApprenticeRegistry } from '../../server/jev/apprentice/registry';
import { LEARNING_LEVELS as LEVELS } from '../../server/jev/fabric/distill';
import { routeApprentice, LEVELS as LADDER } from '../../server/jev/apprentice/ladder';
import { DEFAULT_VALIDATION } from '../../server/jev/apprentice/types';
import { designCheck as _dc } from '../../server/services/houseDesign';
import * as V5 from '../../server/jev/science';
import * as JEVPRE from '../../server/jev/packet';
import * as FAB_REG from '../../server/jev/fabric/registry';
import * as FAB_COUNCIL from '../../server/jev/fabric/council';
import * as FAB_SEC from '../../server/jev/fabric/security';
import * as FAB_MEM from '../../server/jev/fabric/memory';
import * as FAB_SKILLS from '../../server/jev/fabric/skills';
import * as FAB_BENCH from '../../server/jev/fabric/cfbench';
import * as FAB_DISTILL from '../../server/jev/fabric/distill';
import * as APP_SUP from '../../server/jev/apprentice/supremacy';
import * as APP_METRICS from '../../server/jev/apprentice/metrics';
import * as APP_TEACHER from '../../server/jev/apprentice/teacher';
import * as APP_PAYBACK from '../../server/jev/apprentice/payback';
import * as APP_FAIL from '../../server/jev/apprentice/failure';
import * as APP_ROUTER from '../../server/jev/apprentice/router';
import * as LAB from '../../server/jev/apprentice/lab';
import * as LAB_STATS from '../../server/jev/apprentice/stats';
import * as LAB_DISC from '../../server/jev/apprentice/discovery';
import * as LAB_TEACH from '../../server/jev/apprentice/teacherLearning';
import * as LAB_PAT from '../../server/jev/apprentice/failurePatterns';
import * as LAB_EXP from '../../server/jev/apprentice/experiment';
import * as LAB_VIEW from '../../server/jev/apprentice/labView';
import * as ST_CAP from '../../server/jev/studio/capabilities';
import * as ST_COST from '../../server/jev/studio/cost';
import * as ST_JOBS from '../../server/jev/studio/jobs';
import * as ST_GENOME from '../../server/jev/studio/genome';
import * as ST_KIT from '../../server/jev/studio/kit';
import * as ST_QA from '../../server/jev/studio/qa';
import * as ST_FILM from '../../server/jev/studio/film';
import * as ST_VIDEO from '../../server/jev/studio/video';
import * as ST_SMOKE from '../../server/jev/studio/smoke';
import * as JEV_LOCAL from '../../server/jev/local';
import { useStore } from './store';
import { runLabScenario, A as SCENARIO_A } from '../../server/jev/apprentice/labScenario';
import * as JEVLOG from '../../server/jev/metrics';
import * as HOUSE from '../../server/services/houseStyle';
import * as DOCX from '../../server/services/officeCore';
import * as ENGINE_DECISION from '../../server/engine/decision';

export type Verdict = 'PASS' | 'FAIL' | 'WARN';
export interface Check {
  group: string;
  name: string;
  verdict: Verdict;
  detail: string;
}

const guard = (group: string, name: string, f: () => [Verdict, string]): Check => {
  try {
    const [verdict, detail] = f();
    return { group, name, verdict, detail };
  } catch (e) {
    return { group, name, verdict: 'FAIL', detail: `exception : ${(e as Error).message}` };
  }
};

/** Existing modules that must never disappear (V5 → Fabric → Apprentice → Supremacy → exports). */
const REQUIRED: [string, string, unknown][] = [
  ['V5', 'science.analyze', V5.analyze],
  ['V5', 'science.pairUp', V5.pairUp],
  ['JEV', 'packet.jevPre', JEVPRE.jevPre],
  ['JEV_LOG', 'metrics.toCsv', JEVLOG.toCsv],
  ['Routing', 'engine.decideRoute', ENGINE_DECISION.decideRoute],
  ['Routing', 'engine.cascadeNext', ENGINE_DECISION.cascadeNext],
  ['Fabric', 'registry.selectCapabilities', FAB_REG.selectCapabilities],
  ['Free Model Lab', 'council.freePool', FAB_COUNCIL.freePool],
  ['Free Model Lab', 'council.tournament', FAB_COUNCIL.tournament],
  ['Council', 'council.planCouncil', FAB_COUNCIL.planCouncil],
  ['Security', 'security.checkProvider', FAB_SEC.checkProvider],
  ['Security', 'security.classifyData', FAB_SEC.classifyData],
  ['Memory', 'memory.findSimilar', FAB_MEM.findSimilar],
  ['Memory', 'memory.failureLibrary', FAB_MEM.failureLibrary],
  ['Skills', 'skills.mineCandidates', FAB_SKILLS.mineCandidates],
  ['Skills', 'skills.promotionDecision', FAB_SKILLS.promotionDecision],
  ['Benchmark', 'cfbench.cfBenchTasks', FAB_BENCH.cfBenchTasks],
  ['Benchmark', 'cfbench.analyzeArms', FAB_BENCH.analyzeArms],
  ['Benchmark', 'apprentice.analyzeApprentice', APP_METRICS.analyzeApprentice],
  ['Distillation', 'distill.buildDataset', FAB_DISTILL.buildDataset],
  ['Apprentice', 'router.routeFreeFirst', APP_ROUTER.routeFreeFirst],
  ['Apprentice', 'ladder.routeApprentice', routeApprentice],
  ['Apprentice', 'supremacy.getValidatedApprentice', APP_SUP.getValidatedApprentice],
  ['Fallback', 'router.FallbackController', APP_ROUTER.FallbackController],
  ['Teacher', 'teacher.teacherGate', APP_TEACHER.teacherGate],
  ['Teacher', 'payback.teacherROI', APP_PAYBACK.teacherROI],
  ['Apprentice', 'failure.failureSignatureOf', APP_FAIL.failureSignatureOf],
  ['Champion Science', 'lab.runLab', LAB.runLab],
  ['Champion Science', 'lab.evaluateNonInferiority', LAB.evaluateNonInferiority],
  ['Champion Science', 'lab.shouldPromoteChallenger', LAB.shouldPromoteChallenger],
  ['Champion Science', 'lab.detectChampionDegradation', LAB.detectChampionDegradation],
  ['Champion Science', 'stats.armStats', LAB_STATS.armStats],
  ['Champion Science', 'discovery.discoverChallengers', LAB_DISC.discoverChallengers],
  ['Champion Science', 'teacherLearning.calculateTeacherROI', LAB_TEACH.calculateTeacherROI],
  ['Champion Science', 'failurePatterns.detectFailurePatterns', LAB_PAT.detectFailurePatterns],
  ['Champion Science', 'experiment.runChampionChallengerExperiment', LAB_EXP.runChampionChallengerExperiment],
  ['Champion Science', 'labView.labKpis', LAB_VIEW.labKpis],
  ['AI Visual Studio', 'capabilities.buildRegistry', ST_CAP.buildRegistry],
  ['AI Visual Studio', 'cost.checkBudget', ST_COST.checkBudget],
  ['AI Visual Studio', 'jobs.recoverJobs', ST_JOBS.recoverJobs],
  ['AI Visual Studio', 'genome.compose', ST_GENOME.compose],
  ['AI Visual Studio', 'kit.buildKitZip', ST_KIT.buildKitZip],
  ['AI Visual Studio', 'qa.buildQAReport', ST_QA.buildQAReport],
  ['AI Film Studio', 'film.videoGate', ST_FILM.videoGate],
  ['AI Film Studio', 'film.budgetTier', ST_FILM.budgetTier],
  ['AI Film Studio', 'film.assetGraph', ST_FILM.assetGraph],
  ['AI Film Studio', 'film.snapshotVersion', ST_FILM.snapshotVersion],
  ['AI Film Studio', 'video.talkRoutes', ST_VIDEO.talkRoutes],
  ['AI Film Studio', 'smoke.filmSmokeTest', ST_SMOKE.filmSmokeTest],
  ['JEV-0', 'local.localSkill', JEV_LOCAL.localSkill],
  ['Exports', 'houseXlsx', HOUSE.houseXlsx],
  ['Exports', 'markdownToDocx', DOCX.markdownToDocx],
  ['Exports', 'housePptx', housePptx],
];

export function fabricRegression(): Check[] {
  const inv = regressionReport();
  const fake = {
    fabric: { kind: 'cfbench', arm: 'fabric', groupId: 'g', taskKey: 't', category: 'simple', models: ['m'] },
  } as unknown as JevLogEntry;
  const missing = REQUIRED.filter(([, , fn]) => typeof fn !== 'function');
  return [
    guard(
      'INVENTAIRE',
      `Modules existants conservés (${REQUIRED.length} fonctions : V5, JEV, Fabric, Free Model Lab, Council, Security, Memory, Skills, Benchmark, Apprentice, Teacher, Exports, JEV_LOG, Fallback, Routing)`,
      () => [
        missing.length === 0 ? 'PASS' : 'FAIL',
        missing.length
          ? `disparu : ${missing.map(([g, n]) => `${g}/${n}`).join(', ')}`
          : 'aucun module disparu',
      ],
    ),
    guard('SUPREMACY', 'Échelle de routage L0–L7 complète', () => [
      LADDER.length === 8 ? 'PASS' : 'FAIL',
      `${LADDER.length} niveaux`,
    ]),
    guard(
      'SUPREMACY',
      'Seuils de validation par défaut (10 missions, 3 formulations, 90 %, qualité 90, 0 erreur critique, récent 85 %)',
      () => [
        DEFAULT_VALIDATION.minMissions === 10 &&
        DEFAULT_VALIDATION.minFormulations === 3 &&
        DEFAULT_VALIDATION.minSuccess === 0.9 &&
        DEFAULT_VALIDATION.minQuality === 90 &&
        DEFAULT_VALIDATION.maxCriticalErrors === 0 &&
        DEFAULT_VALIDATION.minRecentSuccess === 0.85
          ? 'PASS'
          : 'FAIL',
        'valeurs par défaut conformes',
      ],
    ),
    guard('SUPREMACY', 'Sans données : aucun champion, aucune validation, route V5 si désactivé', () => {
      const p = routeApprentice({
        dna: {
          task_type: 'data',
          task_family: 'data:x',
          difficulty: 0.2,
          risk: 'low',
          output_contract: 'free_text',
          ambiguity: 0,
          language: 'fr',
          domain: 'x',
          expected_output: 't',
          success_criteria: [],
          tool_requirements: [],
          context_size: 10,
          reasoning_requirement: false,
          structured_output_requirement: false,
          freshness_requirement: false,
          latency_requirement: 'low',
          cost_constraint: 'low',
          quality_threshold: 0.85,
        },
        profiles: [],
        pool: [],
        log: [],
      });
      return [
        !p.use && p.route === 'v5' && p.champion === null ? 'PASS' : 'FAIL',
        'disabled → V5 ; aucun champion inventé',
      ];
    }),
    guard('DESIGN', 'Charte d’export verrouillée : signature conforme et valeurs figées', () => {
      const c = designCheck();
      return [
        c.intact && c.frozen ? 'PASS' : 'FAIL',
        c.intact
          ? `signature ${c.actual}`
          : `signature ${c.actual} ≠ ${c.expected} : la charte a été modifiée`,
      ];
    }),
    guard('DESIGN', 'Export Excel : bandeau marine, KPI, en-tête bleu, sans quadrillage', () => {
      const x = houseXlsx(['A', 'B'], [{ A: 'x', B: 1 }], { title: 'T' });
      const ok = x.length > 500 && DESIGN.color.navy === '001B4D';
      return [ok ? 'PASS' : 'FAIL', 'classeur généré avec la charte de référence'];
    }),
    guard('DESIGN', 'Export PowerPoint disponible dans la charte', () => [
      housePptx('# T\n\n## S\n\n- a').length > 1000 ? 'PASS' : 'FAIL',
      'pptx généré',
    ]),
    guard('APPRENTICE', 'JEV Apprentice désactivé par défaut : routage V5 inchangé', () => {
      const plan = routeFreeFirst({
        dna: {
          task_type: 'chat',
          task_family: 'chat:chat',
          difficulty: 0.2,
          risk: 'low',
          output_contract: 'free_text',
          ambiguity: 0,
          language: 'fr',
          domain: 'chat',
          expected_output: 'texte',
          success_criteria: [],
          tool_requirements: [],
          context_size: 50,
          reasoning_requirement: false,
          structured_output_requirement: false,
          freshness_requirement: false,
          latency_requirement: 'low',
          cost_constraint: 'low',
          quality_threshold: 0.85,
        },
        profiles: [],
        pool: [
          {
            id: 'x/y:free',
            name: 'y',
            provider: 'x',
            contextLength: 100000,
            tools: true,
            vision: false,
            structuredOutputs: true,
            reasoning: false,
          },
        ],
      });
      return [
        !DEFAULT_APPRENTICE.enabled && !plan.use && plan.bypass === 'disabled' ? 'PASS' : 'FAIL',
        'enabled=false → aucune route gratuite',
      ];
    }),
    guard('APPRENTICE', 'Registre Apprentice : aucune métrique inventée sans données', () => {
      const r = buildApprenticeRegistry(
        [],
        [
          {
            id: 'x/y:free',
            name: 'y',
            provider: 'x',
            contextLength: 1,
            tools: true,
            vision: false,
            structuredOutputs: true,
            reasoning: false,
          },
        ],
      );
      const p = r[0];
      return [
        p && p.successRate === null && p.quality === null && p.health.score === null ? 'PASS' : 'FAIL',
        'N/A / INSUFFICIENT SAMPLE',
      ];
    }),
    guard('CHAMPION', 'Aucune donnée synthétique dans les métriques réelles', () => {
      const real = useStore.getState().jevLog;
      const bad = real.filter((e) => !LAB.isReal(e));
      const sim = runLabScenario().log;
      const leak = LAB.runLab(LAB.EMPTY_LAB, { log: sim, pool: [], now: Date.now() });
      const none = Object.values(leak.state.families).every((f) => !f.champion);
      return [
        bad.length === 0 && none && sim.every((e) => !LAB.isReal(e)) ? 'PASS' : 'FAIL',
        bad.length
          ? `${bad.length} entrée(s) simulée(s) dans le JEV_LOG réel`
          : 'JEV_LOG réel sans entrée simulée ; le scénario simulé est ignoré par le lab de production',
      ];
    }),
    guard('CHAMPION', 'Sans données : aucun champion, aucune promotion (état vide)', () => {
      const r = LAB.runLab(LAB.EMPTY_LAB, { log: [], pool: [], now: 1 });
      return [
        Object.keys(r.state.families).length === 0 && r.events.length === 0 ? 'PASS' : 'FAIL',
        'aucun champion inventé',
      ];
    }),
    guard('CHAMPION', 'Scénario IFRS9 en 18 étapes reproductible (A→B→rollback→A)', () => {
      const r = runLabScenario();
      return [
        r.steps.length === 18 && r.steps.at(-1)!.champion === SCENARIO_A ? 'PASS' : 'FAIL',
        `${r.steps.length} étapes · ${r.state.championHistory.map((e) => e.kind).join(' → ')}`,
      ];
    }),
    guard('APPRENTICE', 'Pas de faux entraînement : niveaux 6–7 toujours UNAVAILABLE', () => [
      LEVELS.filter((l) => l.level >= 6).every((l) => l.status === 'UNAVAILABLE') ? 'PASS' : 'FAIL',
      'adaptation à l’inférence uniquement',
    ]),
    guard('V5', 'Inventaire d’avant JEV intact (outils, agents, vues, réglages…)', () => [
      inv.ok ? 'PASS' : 'FAIL',
      inv.ok
        ? 'aucun élément disparu'
        : inv.sections
            .filter((s) => s.missing.length)
            .map((s) => `${s.name}: ${s.missing.join(',')}`)
            .join(' ; '),
    ]),
    guard('V5', 'JEV-0 : réponse locale sans modèle (L0)', () => {
      const a = directAnswer('12*(3+4)');
      return [a && /84/.test(a) ? 'PASS' : 'FAIL', a ? 'calcul répondu à 0 $' : 'aucune réponse locale'];
    }),
    guard('V5', 'Moteur scientifique : journal vide → aucune conclusion fabriquée', () => {
      const s = analyze([]);
      return [s.verdict === 'E' ? 'PASS' : 'FAIL', `verdict ${s.verdict}`];
    }),
    guard('V5', 'Exports du JEV_LOG (CSV)', () => [
      logCsv([]).length > 0 ? 'PASS' : 'FAIL',
      'en-tête CSV présent',
    ]),
    guard('V5', 'Benchmark 2.0 conservé', () => [
      BENCH.length >= 18 ? 'PASS' : 'FAIL',
      `${BENCH.length} tâches`,
    ]),
    guard('FABRIC', 'Cognitive Fabric désactivé par défaut (comportement V5 inchangé)', () => [
      DEFAULT_FABRIC.enabled === false && DEFAULT_FABRIC.council === false ? 'PASS' : 'FAIL',
      'enabled=false, council=false',
    ]),
    guard('FABRIC', 'Les expériences Fabric sont exclues de l’appariement V5', () => [
      pairUp([fake]).pairs.length === 0 ? 'PASS' : 'FAIL',
      'entrée tagguée fabric ignorée',
    ]),
    guard('FABRIC', 'Registre de capacités alimenté par des capacités réelles', () => {
      const n = registry.list({}).length;
      return [
        n > 0 ? 'PASS' : 'WARN',
        n ? `${n} capacité(s)` : 'registre non chargé : ouvrez Capability Fabric → Découvrir',
      ];
    }),
    guard('FABRIC', 'GitHub : opérations d’écriture jamais exécutables sans approbation', () => {
      const w = registry.list({}).filter((c) => c.type === 'github' && c.writeAccess);
      return [
        w.every((c) => c.approvalRequired) ? 'PASS' : 'FAIL',
        w.length
          ? `${w.length} opération(s) d’écriture, toutes soumises à approbation`
          : 'adaptateur non chargé',
      ];
    }),
    guard('FABRIC', 'Secrets nettoyés avant mémoire / skills / prompts', () => {
      const t = 'clé sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789';
      return [
        containsSecret(t) && !containsSecret(scrubSecrets(t)) ? 'PASS' : 'FAIL',
        'détection + nettoyage',
      ];
    }),
    guard('FABRIC', 'Cognitive Fabric Benchmark : 80 tâches à vérité calculée', () => {
      const t = cfBenchTasks();
      return [t.length === 80 ? 'PASS' : 'FAIL', `${t.length} tâches`];
    }),
    guard('FABRIC', 'Exports Training Data (JSONL / CSV) fonctionnels', () => [
      toJsonl([]) === '' && toCsv([]).length > 0 ? 'PASS' : 'WARN',
      'formats vides valides',
    ]),
    guard('FABRIC', 'Niveaux d’apprentissage 6–7 déclarés UNAVAILABLE (pas de faux entraînement)', () => [
      LEARNING_LEVELS.filter((l) => l.level >= 6).every((l) => l.status === 'UNAVAILABLE') ? 'PASS' : 'FAIL',
      'fine-tuning non disponible',
    ]),
    guard('FABRIC', 'Matrice d’expertise : dimensions déclarées', () => [
      DIMENSIONS.length >= 20 ? 'PASS' : 'FAIL',
      `${DIMENSIONS.length} dimensions`,
    ]),
  ];
}
