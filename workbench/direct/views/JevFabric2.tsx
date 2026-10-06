// JEV COGNITIVE CONTROL CENTER — part 2: distillation lab, training data, policy engine
// (+ economic governor, configurations, intelligence graph, cognitive cache), free model lab,
// security, health & cognitive score, cognitive fabric benchmark.
import { useMemo, useRef, useState } from 'react';
import { Download, Play, Square } from 'lucide-react';
import { Badge, Button, Input, Select, Toggle } from '../../web/components/ui';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { addDistilled, cognitiveCache, fabricSettings, registry, relearnPolicies } from '../lib/fabric';
import { runCfBench, runTournament } from '../lib/fabricRun';
import { CES_FORMULA, analyze } from '../../server/jev/science';
import {
  ARM_LABEL,
  CF_CATEGORIES,
  CF_LABEL,
  analyzeArms,
  cfBenchTasks,
} from '../../server/jev/fabric/cfbench';
import { FREE_LIMITATIONS, freePool, freeStats, tournament } from '../../server/jev/fabric/council';
import {
  LEARNING_LEVELS,
  TRAINING_NOTICE,
  buildDataset,
  distillSkills,
  teacherTraces,
  toCsv,
  toJson,
  toJsonl,
} from '../../server/jev/fabric/distill';
import {
  GOVERNOR_RATIO,
  GOVERNOR_VALUE_FACTOR,
  activate,
  economicGovernor,
  jevHealth,
  rollbackPolicy,
  type GovMode,
} from '../../server/jev/fabric/learning';
import {
  configStats,
  failureLibrary,
  intelligenceGraph,
  reusableStrategies,
} from '../../server/jev/fabric/memory';
import {
  classifyData,
  containsSecret,
  governanceReport,
  scrubSecrets,
  type ProviderPolicy,
} from '../../server/jev/fabric/security';
import { DEFAULT_FABRIC } from '../../server/jev/fabric/types';
import { LabThresholds, Scenario } from './JevChampion';
import { Empty, NM, Section, StatusBadge, Table, fmt } from './fabricUi';

const useSettings = () => {
  const s = useStore((x) => x.settings);
  const patch = useStore((x) => x.patchSettings);
  const cur = { ...DEFAULT_FABRIC, ...s.fabric };
  return [cur, (p: Partial<typeof cur>) => patch({ fabric: { ...s.fabric, ...p } })] as const;
};
const cheapModels = (models: ReturnType<typeof useStore.getState>['models']) =>
  models
    .filter((m) => m.capabilities.tools && (m.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(m.id))
    .sort((a, b) => (a.inputPrice ?? 0) - (b.inputPrice ?? 0))
    .slice(0, 80);

// ───────────────────────── distillation lab ─────────────────────────

export function DistillPanel() {
  const log = useStore((s) => s.jevLog);
  const skills = useStore((s) => s.fabric.skills);
  const toast = useStore((s) => s.toast);
  const teachers = [...new Set(log.filter((e) => e.success).map((e) => e.model))];
  const [teacher, setTeacher] = useState('');
  const t = teacher || teachers[0] || '';
  const traces = useMemo(() => teacherTraces(log, { teachers: t ? [t] : [] }), [log, t]);
  return (
    <div className="space-y-3" data-testid="distill">
      <Section
        title="Ce que JEV peut — et ne peut pas — faire (distinction obligatoire)"
        hint="Aucun poids de modèle n’est modifié par cet écran. Les niveaux 1 à 5 améliorent le SYSTÈME autour du modèle ; les niveaux 6 et 7 sont un pipeline séparé."
      >
        <Table
          testId="levels"
          head={['Niveau', 'Nom', 'État', 'Détail']}
          rows={LEARNING_LEVELS.map((l) => [l.level, l.name, <StatusBadge key="s" s={l.status} />, l.detail])}
        />
      </Section>
      <Section
        title="TEACHER → EXPERT TRACE → STRATEGY → SKILL → STUDENT"
        hint="Le professeur est un modèle fort : ses missions réussies deviennent des traces structurées (plan, décisions, outils, critères, validations, résultat, erreurs évitées) — jamais ses chaînes de raisonnement privées. Les skills distillées restent candidates tant que le Skill Lab ne les a pas validées sur le modèle étudiant."
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
          Professeur
          <Select
            value={t}
            onChange={setTeacher}
            options={teachers.map((m) => ({ value: m, label: m }))}
            title="Modèle professeur"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!t}
            onClick={() => {
              const r = distillSkills(log, skills, t);
              const n = addDistilled(r.candidates);
              toast(n ? 'ok' : 'info', `${n} skill(s) distillée(s) (candidates)`);
            }}
          >
            Distiller en skills candidates
          </Button>
          <span className="text-muted">
            Évaluation sur un modèle étudiant : « Skill Lab » (même tâche, avec / sans la skill, modèle
            étudiant imposé).
          </span>
        </div>
        {traces.length ? (
          <Table
            head={['Tâche', 'Type', 'Plan', 'Décisions JEV', 'Critères', 'Résultat', 'Erreurs évitées']}
            rows={traces
              .slice(0, 15)
              .map((x) => [
                x.task.slice(0, 70),
                x.taskType,
                x.plan.join(' → '),
                x.decisions.join(' ; ') || '—',
                x.criteria.join(', ') || '—',
                `${x.result.quality ?? NM} · ${fmt.usd(x.result.costUsd)}`,
                x.errorsAvoided.join(' ; ') || '—',
              ])}
          />
        ) : (
          <Empty>
            Aucune trace d’expert : il faut des missions réussies (qualité ≥ 80) d’un modèle professeur.
          </Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── training data ─────────────────────────

export function DatasetPanel() {
  const log = useStore((s) => s.jevLog);
  const [fab, setFab] = useSettings();
  const teachers = [...new Set(log.map((e) => e.model))].filter(Boolean);
  const [teacher, setTeacher] = useState('');
  const [student, setStudent] = useState('');
  const [minQ, setMinQ] = useState(75);
  const [rej, setRej] = useState(false);
  const d = useMemo(
    () =>
      buildDataset(log, {
        teachers: teacher ? [teacher] : [],
        student: student || null,
        minQuality: minQ,
        includeRejected: rej,
      }),
    [log, teacher, student, minQ, rej],
  );
  return (
    <div className="space-y-3" data-testid="dataset">
      <Section title="TRAINING_DATASET_FACTORY" hint={TRAINING_NOTICE}>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          <Toggle
            checked={fab.captureExamples}
            onChange={(v) => setFab({ captureExamples: v })}
            label="Conserver une copie redactée des consignes et réponses dans le JEV_LOG (nécessaire aux datasets ; stockée sur cet ordinateur uniquement)"
          />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">
            Professeur
            <Select
              value={teacher}
              onChange={setTeacher}
              options={[{ value: '', label: 'tous' }, ...teachers.map((m) => ({ value: m, label: m }))]}
              title="Professeur"
            />
          </label>
          <label className="flex items-center gap-1">
            Modèle étudiant visé
            <Input
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              className="w-56"
              aria-label="Modèle étudiant"
            />
          </label>
          <label className="flex items-center gap-1">
            Qualité min.
            <Input
              type="number"
              value={minQ}
              onChange={(e) => setMinQ(Number(e.target.value) || 0)}
              className="w-16"
              aria-label="Qualité minimale"
            />
          </label>
          <Toggle checked={rej} onChange={setRej} label="Inclure les échecs (étiquetés rejected)" />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]" data-testid="dataset-counts">
          <Badge tone="ok">{d.rows.length} exemple(s)</Badge>
          <span>
            {d.rows.filter((r) => r.validation_status === 'validated').length} validé(s) par vérité terrain
          </span>
          <span className="text-muted">
            Écartés : {d.skipped.noExample} sans exemple capturé, {d.skipped.rejected} échec(s),{' '}
            {d.skipped.lowQuality} sous le seuil, {d.skipped.unjudged} non jugé(s).
          </span>
        </div>
        <div className="mb-2 flex gap-2">
          <Button
            size="sm"
            disabled={!d.rows.length}
            onClick={() => download('massamba-training.jsonl', toJsonl(d.rows), 'application/jsonl')}
          >
            <Download size={13} /> JSONL
          </Button>
          <Button
            size="sm"
            disabled={!d.rows.length}
            onClick={() => download('massamba-training.json', toJson(d.rows), 'application/json')}
          >
            <Download size={13} /> JSON
          </Button>
          <Button
            size="sm"
            disabled={!d.rows.length}
            onClick={() => download('massamba-training.csv', toCsv(d.rows), 'text/csv')}
          >
            <Download size={13} /> CSV
          </Button>
        </div>
        {d.rows.length ? (
          <Table
            head={[
              'instruction',
              'expected_output',
              'task_type',
              'quality',
              'teacher_model',
              'validation_status',
            ]}
            rows={d.rows
              .slice(0, 6)
              .map((r) => [
                r.instruction.slice(0, 80),
                r.expected_output.slice(0, 80),
                r.task_type,
                r.quality ?? NM,
                r.teacher_model,
                r.validation_status,
              ])}
          />
        ) : (
          <Empty>
            Aucun exemple : activez la capture, ou lancez un benchmark (qui conserve toujours ses exemples non
            sensibles).
          </Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── policy engine ─────────────────────────

export function PolicyPanel() {
  const log = useStore((s) => s.jevLog);
  const policies = useStore((s) => s.fabric.policies);
  const setFabric = useStore((s) => s.setFabric);
  const toast = useStore((s) => s.toast);
  const [fab, setFab] = useSettings();
  const [gain, setGain] = useState(4);
  const [cost, setCost] = useState(0.01);
  const [mode, setMode] = useState<GovMode>('balanced');
  const cs = useMemo(() => configStats(log), [log]);
  const lib = useMemo(() => failureLibrary(log), [log]);
  const graph = useMemo(() => intelligenceGraph(log, lib.strategies), [log, lib]);
  const reusable = reusableStrategies(cs);
  const dec = economicGovernor({
    action: 'consulter un second modèle',
    mode,
    expectedQualityGain: gain,
    gainSource: 'PROJECTED',
    expectedCost: cost,
    risk: 0.3,
    valuePerPoint: fab.valuePerPoint,
  });
  const cache = cognitiveCache.report();
  return (
    <div className="space-y-3" data-testid="policy">
      <Section
        title="Cognitive Fabric — interrupteur principal"
        hint="Désactivé par défaut : tant qu’il n’a pas été validé par le Cognitive Benchmark, le comportement V5 est inchangé. Actif : sélection minimale de capacités, skills validées, leçons des échecs passés, préférence de modèle apprise avec exploration contrôlée."
      >
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          <Toggle
            checked={fab.enabled}
            onChange={(v) => setFab({ enabled: v })}
            label="Appliquer le Cognitive Fabric aux missions"
          />
          <Toggle
            checked={fab.council}
            onChange={(v) => setFab({ council: v })}
            label="Conseil de modèles (tâches simples sans outil ; appels supplémentaires, filtrés par le gouverneur)"
          />
          <label className="flex items-center gap-1">
            Exploration ε
            <Input
              type="number"
              step="0.05"
              min={0}
              max={0.5}
              value={fab.epsilon}
              onChange={(e) => setFab({ epsilon: Math.max(0, Math.min(0.5, Number(e.target.value) || 0)) })}
              className="w-20"
              aria-label="Exploration"
            />
          </label>
          <label className="flex items-center gap-1">
            Capacités max
            <Input
              type="number"
              min={3}
              max={20}
              value={fab.maxCapabilities}
              onChange={(e) =>
                setFab({ maxCapabilities: Math.max(3, Math.min(20, Number(e.target.value) || 8)) })
              }
              className="w-16"
              aria-label="Capacités maximales"
            />
          </label>
        </div>
      </Section>
      <Section
        title="JEV POLICY STORE"
        hint="Politiques apprises des expériences réelles (n ≥ 5 par comparaison). Une politique « proposée » n’a aucun effet ; elle n’agit qu’une fois activée, et reste annulable."
      >
        <div className="mb-2 flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => toast('ok', `${relearnPolicies()} politique(s) apprise(s)`)}
          >
            Apprendre des expériences
          </Button>
          <Badge>{policies.length} politique(s)</Badge>
        </div>
        {policies.length ? (
          <Table
            testId="policies"
            head={['Politique', 'Preuves', 'Confiance', 'n', 'Validée le', 'Effet', 'État', 'Actions']}
            rows={policies.map((p) => [
              p.policy,
              Object.entries(p.evidence)
                .slice(0, 4)
                .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 1000) / 1000 : v}`)
                .join(' · '),
              p.confidence,
              p.sampleSize,
              new Date(p.lastValidated).toLocaleDateString('fr-FR'),
              p.effect,
              <StatusBadge key="s" s={p.status} />,
              <div key="a" className="flex gap-1">
                <button
                  className="rounded bg-hover px-1.5"
                  disabled={p.status === 'active'}
                  onClick={() =>
                    setFabric({ policies: policies.map((x) => (x.id === p.id ? activate(x) : x)) })
                  }
                >
                  ACTIVER
                </button>
                <button
                  className="rounded bg-hover px-1.5"
                  disabled={p.status !== 'active'}
                  onClick={() =>
                    setFabric({
                      policies: policies.map((x) =>
                        x.id === p.id ? rollbackPolicy(x, 'annulée par l’utilisateur') : x,
                      ),
                    })
                  }
                >
                  ROLLBACK
                </button>
              </div>,
            ])}
          />
        ) : (
          <Empty>Aucune politique : il faut au moins 5 missions par modèle / outil / skill comparés.</Empty>
        )}
      </Section>
      <Section
        title="JEV ECONOMIC GOVERNOR"
        hint="« Je pourrais utiliser 3 modèles, mais cela ne vaut pas la peine. » Le bénéfice attendu (points de qualité × valeur d’un point × facteur de mode × (1 + risque)) doit dépasser le coût × le ratio du mode. La valeur d’un point est un paramètre de politique réglable, pas une mesure ; le gain attendu est étiqueté PROJECTED tant qu’il ne vient pas de mesures."
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">
            Valeur d’un point de qualité ($)
            <Input
              type="number"
              step="0.001"
              value={fab.valuePerPoint}
              onChange={(e) => setFab({ valuePerPoint: Math.max(0, Number(e.target.value) || 0) })}
              className="w-24"
              aria-label="Valeur d'un point"
            />
          </label>
          <label className="flex items-center gap-1">
            Mode
            <Select
              value={mode}
              onChange={(v) => setMode(v as GovMode)}
              options={(['eco', 'balanced', 'performance', 'max'] as GovMode[]).map((m) => ({
                value: m,
                label: m.toUpperCase(),
              }))}
              title="Mode"
            />
          </label>
          <label className="flex items-center gap-1">
            Gain attendu (pts)
            <Input
              type="number"
              value={gain}
              onChange={(e) => setGain(Number(e.target.value) || 0)}
              className="w-16"
              aria-label="Gain attendu"
            />
          </label>
          <label className="flex items-center gap-1">
            Coût ($)
            <Input
              type="number"
              step="0.001"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value) || 0)}
              className="w-20"
              aria-label="Coût attendu"
            />
          </label>
        </div>
        <div className="rounded-lg border border-line p-2 text-[12.5px]" data-testid="governor">
          <Badge tone={dec.use ? 'ok' : 'warn'}>{dec.use ? 'USE' : 'SKIP'}</Badge> {dec.reason}
        </div>
        <div className="mt-1 text-[11.5px] text-faint">
          Ratios exigés :{' '}
          {(Object.keys(GOVERNOR_RATIO) as GovMode[])
            .map((m) => `${m.toUpperCase()} ${GOVERNOR_RATIO[m]}× (valeur ×${GOVERNOR_VALUE_FACTOR[m]})`)
            .join(' · ')}
          . MAX signifie « toutes les capacités que leur valeur attendue justifie », pas « tout utiliser ».
        </div>
      </Section>
      <Section
        title="Configurations cognitives mesurées et stratégies réutilisables"
        hint="Modèle + skills + familles d’outils + évaluateur + conseil, comparés sur qualité / coût / latence / réussite. Une configuration qui réussit ≥ 80 % sur ≥ 3 missions devient une stratégie réutilisable."
      >
        {cs.length ? (
          <Table
            head={[
              'Tâche',
              'Configuration',
              'Missions',
              'Réussite',
              'Qualité',
              'Coût',
              'Latence',
              'Réutilisable',
            ]}
            rows={cs
              .sort((a, b) => b.runs - a.runs)
              .slice(0, 15)
              .map((c) => [
                c.taskType,
                c.configKey,
                c.runs,
                fmt.pct(c.successRate),
                fmt.num(c.quality, 0),
                fmt.usd(c.cost),
                fmt.ms(c.latencyMs),
                reusable.includes(c) ? (
                  <Badge key="r" tone="ok">
                    oui
                  </Badge>
                ) : (
                  'non'
                ),
              ])}
          />
        ) : (
          <Empty>Aucune configuration enregistrée.</Empty>
        )}
      </Section>
      <Section
        title="Intelligence Graph"
        hint="TASK ↔ MODEL ↔ SKILL ↔ TOOL ↔ STRATEGY ↔ RESULT ↔ ERROR ↔ CORRECTION, avec le poids mesuré de chaque relation."
      >
        {graph.edges.length ? (
          <Table
            head={['De', 'Relation', 'Vers', 'Missions', 'Réussite', 'Coût', 'Qualité']}
            rows={graph.edges
              .sort((a, b) => b.runs - a.runs)
              .slice(0, 25)
              .map((e) => [
                e.from,
                e.relation,
                e.to,
                e.runs,
                fmt.pct(e.successRate),
                fmt.usd(e.cost),
                fmt.num(e.quality, 0),
              ])}
          />
        ) : (
          <Empty>Graphe vide.</Empty>
        )}
      </Section>
      <Section
        title="Cognitive cache L0–L6"
        hint="Chaque entrée a un TTL, une version, une provenance et une confiance ; invalidable par niveau."
      >
        <Table
          head={['Niveau', 'Contenu', 'Entrées', 'Succès', 'Échecs', 'Taux', 'TTL (min)', '']}
          rows={cache.map((c) => [
            c.level,
            c.label,
            c.entries,
            c.hits,
            c.misses,
            fmt.pct(c.hitRate),
            c.ttlMin,
            <button
              key="i"
              className="rounded bg-hover px-1.5"
              onClick={() => {
                cognitiveCache.invalidate(c.level);
                toast('ok', `${c.level} invalidé`);
              }}
            >
              invalider
            </button>,
          ])}
        />
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => {
            cognitiveCache.invalidate();
            toast('ok', 'Cache cognitif vidé');
          }}
        >
          Tout invalider
        </Button>
      </Section>
      <LabThresholds />
    </div>
  );
}

// ───────────────────────── free model lab ─────────────────────────

export function FreeLabPanel() {
  const models = useStore((s) => s.models);
  const log = useStore((s) => s.jevLog);
  const pool = useMemo(() => freePool(models), [models]);
  const stats = useMemo(() => freeStats(log, pool), [log, pool]);
  const t = useMemo(() => tournament(log.filter((e) => e.fabric?.kind === 'freebench')), [log]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>(['simple', 'coding', 'data']);
  const [reps, setReps] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef({ stop: false });
  const tasks = cfBenchTasks()
    .filter((x) => cats.includes(x.category))
    .slice(0, 12);
  const run = async () => {
    if (
      !confirm(
        `Free-model tournament : ${tasks.length} tâche(s) × ${chosen.length} modèle(s) × ${reps} = ${tasks.length * chosen.length * reps} exécutions RÉELLES. Les modèles gratuits ont des limites de débit : des échecs 429 seront mesurés, pas masqués.`,
      )
    )
      return;
    stop.current.stop = false;
    await runTournament({ tasks, models: chosen, reps, kind: 'freebench' }, (m) => setBusy(m), stop.current);
    setBusy(null);
  };
  return (
    <div className="space-y-3" data-testid="freelab">
      <Section
        title="FREE MODEL LAB"
        hint="Distinction capitale : prix d’inférence de 0 $ ≠ disponibilité illimitée."
      >
        <ul className="mb-2 space-y-0.5 text-[12px]" data-testid="free-limits">
          {FREE_LIMITATIONS.map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ul>
        <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4 text-[12px]">
          {[
            ['Models discovered', pool.length],
            ['Models tested', stats.length],
            ['Models validated', stats.filter((s) => (s.successRate ?? 0) >= 0.8 && s.runs >= 5).length],
            ['Rate-limited runs', stats.reduce((a, s) => a + s.rateLimited, 0)],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg border border-line p-2">
              <div className="text-faint">{k}</div>
              <div className="text-[15px] font-medium">{String(v)}</div>
            </div>
          ))}
        </div>
        {pool.length ? (
          <Table
            testId="free-pool"
            head={[
              '',
              'Modèle',
              'Fournisseur',
              'Contexte',
              'Outils',
              'Vision',
              'Sortie structurée',
              'Politique du fournisseur',
              'Testé',
            ]}
            rows={pool.slice(0, 60).map((m) => {
              const s = stats.find((x) => x.model === m.id);
              return [
                <input
                  key="c"
                  type="checkbox"
                  checked={chosen.includes(m.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked ? [...chosen, m.id].slice(0, 6) : chosen.filter((x) => x !== m.id),
                    )
                  }
                  aria-label={`Choisir ${m.id}`}
                />,
                m.id,
                m.provider,
                m.contextLength.toLocaleString('fr-FR'),
                m.tools ? 'oui' : 'non',
                m.vision ? 'oui' : 'non',
                m.structuredOutputs ? 'oui' : 'non',
                'NON RENSEIGNÉE (non exposée par le catalogue)',
                s
                  ? `${s.runs} run(s), réussite ${fmt.pct(s.successRate)}, 429 : ${s.rateLimited}, disponibilité ${fmt.pct(s.availability)}`
                  : 'non testé',
              ];
            })}
          />
        ) : (
          <Empty>Aucun modèle gratuit dans le catalogue chargé.</Empty>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
          {CF_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={cats.includes(c)}
                onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))}
                aria-label={`Catégorie ${CF_LABEL[c]}`}
              />
              {CF_LABEL[c]}
            </label>
          ))}
          <label className="flex items-center gap-1">
            Répétitions
            <Select
              value={String(reps)}
              onChange={(v) => setReps(Number(v))}
              options={[1, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
              title="Répétitions"
            />
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(busy) || chosen.length < 2}
            onClick={() => void run()}
          >
            <Play size={13} /> Lancer le tournoi ({tasks.length * chosen.length * reps})
          </Button>
          {busy && (
            <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
              <Square size={13} /> Arrêter
            </Button>
          )}
          {busy && <span className="text-info">{busy}</span>}
        </div>
      </Section>
      <Section title="Free-model tournament — meilleur modèle par domaine (mesuré)">
        {Object.keys(t).length ? (
          Object.entries(t).map(([c, rows]) => (
            <div key={c} className="mb-2">
              <div className="text-[12.5px] font-medium">{CF_LABEL[c as keyof typeof CF_LABEL] ?? c}</div>
              <Table
                head={['#', 'Modèle', 'Missions', 'Réussite', 'Qualité', 'Coût', 'Latence', 'Robustesse']}
                rows={rows.map((r) => [
                  r.rank,
                  r.model,
                  r.runs,
                  fmt.pct(r.successRate),
                  fmt.num(r.quality, 0),
                  fmt.usd(r.cost),
                  fmt.ms(r.latencyMs),
                  fmt.pct(r.robustness),
                ])}
              />
            </div>
          ))
        ) : (
          <Empty>Aucun tournoi lancé : aucun classement n’est affiché sans exécution réelle.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── security ─────────────────────────

export function SecurityPanel() {
  const [fab, setFab] = useSettings();
  const policies = useStore((s) => s.fabric.providerPolicies);
  const setFabric = useStore((s) => s.setFabric);
  const [text, setText] = useState('');
  const [prov, setProv] = useState('');
  const c = text.trim() ? classifyData(text, []) : null;
  const gov = governanceReport(
    registry.list({
      types: [
        'tool',
        'filesystem',
        'spreadsheet',
        'terminal',
        'code',
        'browser',
        'github',
        'mcp',
        'plugin',
        'web',
        'document',
        'image',
        'memory',
        'data',
      ],
    }),
  )
    .filter((g) => g.approvalRequired || g.writeAccess)
    .slice(0, 40);
  const upd = (p: ProviderPolicy) =>
    setFabric({ providerPolicies: [...policies.filter((x) => x.provider !== p.provider), p] });
  return (
    <div className="space-y-3" data-testid="security">
      <Section
        title="Politique de données"
        hint="PUBLIC · INTERNAL · CONFIDENTIAL · HIGHLY_CONFIDENTIAL. Une politique de fournisseur inconnue n’est jamais lue comme sûre : CONFIDENTIAL → avertissement, HIGHLY_CONFIDENTIAL → envoi bloqué, sauf politique « sans entraînement ni conservation » déclarée ci-dessous. Les secrets n’entrent jamais dans un prompt, une skill, la mémoire, un log, un benchmark ou le conseil."
      >
        <Toggle
          checked={fab.securityEnforce}
          onChange={(v) => setFab({ securityEnforce: v })}
          label="Appliquer la protection avant l’envoi à un fournisseur"
        />
        <div className="mt-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Collez un texte pour voir sa classification (rien n’est envoyé nulle part)…"
            className="w-full rounded-lg border border-line bg-panel p-2 text-[12.5px]"
            aria-label="Texte à classifier"
          />
          {c && (
            <div className="mt-1 text-[12.5px]" data-testid="classification">
              <Badge tone={c.level === 'PUBLIC' ? 'ok' : c.level === 'INTERNAL' ? 'info' : 'warn'}>
                {c.level}
              </Badge>{' '}
              {c.reasons.join(' ; ') || 'aucun indice de confidentialité'}
              {containsSecret(text) && (
                <div className="text-err">
                  Secret détecté — version nettoyée : {scrubSecrets(text).slice(0, 120)}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>
      <Section
        title="Politiques des fournisseurs (renseignées par vous)"
        hint="Le catalogue n’expose pas la rétention ni l’entraînement : à renseigner d’après la politique réelle du fournisseur."
      >
        <div className="mb-2 flex gap-2 text-[12px]">
          <Input
            value={prov}
            onChange={(e) => setProv(e.target.value)}
            placeholder="fournisseur (ex. openai, anthropic)"
            aria-label="Fournisseur"
            className="w-64"
          />
          <Button
            size="sm"
            disabled={!prov.trim()}
            onClick={() => {
              upd({ provider: prov.trim(), retention: 'unknown', training: 'unknown', source: 'user' });
              setProv('');
            }}
          >
            Ajouter
          </Button>
        </div>
        {policies.length ? (
          <Table
            head={['Fournisseur', 'Conservation', 'Entraînement', '']}
            rows={policies.map((p) => [
              p.provider,
              <Select
                key="r"
                value={p.retention}
                onChange={(v) => upd({ ...p, retention: v as ProviderPolicy['retention'], source: 'user' })}
                options={['unknown', 'none', 'short', 'long'].map((x) => ({ value: x, label: x }))}
                title={`Conservation ${p.provider}`}
              />,
              <Select
                key="t"
                value={p.training}
                onChange={(v) => upd({ ...p, training: v as ProviderPolicy['training'], source: 'user' })}
                options={['unknown', 'no', 'yes'].map((x) => ({ value: x, label: x }))}
                title={`Entraînement ${p.provider}`}
              />,
              <button
                key="d"
                className="rounded bg-hover px-1.5"
                onClick={() =>
                  setFabric({ providerPolicies: policies.filter((x) => x.provider !== p.provider) })
                }
              >
                retirer
              </button>,
            ])}
          />
        ) : (
          <Empty>Aucune politique renseignée : tous les fournisseurs sont « non renseignés ».</Empty>
        )}
      </Section>
      <Section
        title="Plugin governance — ce qui demande une approbation"
        hint="Les opérations destructrices (DELETE, PUSH, MERGE, SEND, PUBLISH, MODIFY_EXTERNAL_DATA) sont préparées par JEV, jamais exécutées silencieusement."
      >
        {gov.length ? (
          <Table
            head={[
              'Capacité',
              'Type',
              'Risque',
              'Approbation',
              'Données',
              'Écriture',
              'Réseau',
              'Permissions',
              'État',
            ]}
            rows={gov.map((g) => [
              g.name,
              g.type,
              g.risk,
              g.approvalRequired ? 'oui' : 'non',
              g.dataAccess ? 'oui' : 'non',
              g.writeAccess ? 'oui' : 'non',
              g.networkAccess ? 'oui' : 'non',
              g.permissions,
              <StatusBadge key="s" s={g.status} />,
            ])}
          />
        ) : (
          <Empty>Registre non chargé : ouvrez « Capability Fabric » et cliquez « Découvrir ».</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── health & cognitive score ─────────────────────────

export function HealthPanel() {
  const log = useStore((s) => s.jevLog);
  const skills = useStore((s) => s.fabric.skills);
  const policies = useStore((s) => s.fabric.policies);
  const lib = useMemo(() => failureLibrary(log), [log]);
  const h = jevHealth({ log, skills, policies, failureSignatures: lib.signatures.length });
  const sci = useMemo(() => analyze(log), [log]);
  return (
    <div className="space-y-3" data-testid="health">
      <Section
        title={`JEV HEALTH SCORE — ${h.overall === null ? NM : `${h.overall} / 100`}`}
        hint={h.formula}
      >
        <Table
          head={['Composante', 'Score', 'Formule', 'Détail', 'n']}
          rows={h.parts.map((p) => [
            p.label,
            p.score === null ? NM : `${p.score}`,
            p.formula,
            p.detail,
            p.samples,
          ])}
        />
      </Section>
      <Section
        title="Cognitive Efficiency Score (interne, décomposable)"
        hint={`${CES_FORMULA} Ce score est un indicateur interne relatif à OFF, pas une mesure scientifique universelle : il est calculé seulement à partir d’expériences appariées.`}
      >
        {Object.keys(sci.deltas).length ? (
          <Table
            head={['Variante', 'Score (OFF = 100)', 'Composantes (ratio > 1 = mieux que OFF)']}
            rows={Object.entries(sci.deltas).map(([v, d]) => [
              v.toUpperCase(),
              d?.ces?.score ?? NM,
              d?.ces?.parts
                .map((p) => `${p.label} : ${p.ratio === null ? NM : p.ratio.toFixed(2)}`)
                .join(' · ') ?? '',
            ])}
          />
        ) : (
          <Empty>Aucune expérience appariée : le score n’est pas calculable (ÉCHANTILLON INSUFFISANT).</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── cognitive fabric benchmark ─────────────────────────

export function CfBenchPanel() {
  const models = useStore((s) => s.models);
  const log = useStore((s) => s.jevLog);
  const toast = useStore((s) => s.toast);
  const [cats, setCats] = useState<string[]>([...CF_CATEGORIES]);
  const [per, setPer] = useState(10);
  const [reps, setReps] = useState(1);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef({ stop: false });
  const cheap = useMemo(() => cheapModels(models), [models]);
  const fixed = model || cheap[0]?.id || '';
  const all = useMemo(() => cfBenchTasks(), []);
  const tasks = all
    .filter((t) => cats.includes(t.category))
    .filter((t) => Number(t.key.slice(1)) <= per || !/\d/.test(t.key));
  const picked = CF_CATEGORIES.flatMap((c) =>
    all.filter((t) => t.category === c && cats.includes(c)).slice(0, per),
  );
  const r = useMemo(() => analyzeArms(log), [log]);
  const runs = picked.length * 3 * reps;
  const go = async () => {
    if (
      !confirm(
        `COGNITIVE FABRIC BENCHMARK : ${picked.length} tâche(s) × 3 bras (BASELINE, JEV V5, FABRIC) × ${reps} = ${runs} exécutions RÉELLES facturées (modèle imposé ${fixed}). Vous pouvez arrêter à tout moment.`,
      )
    )
      return;
    stop.current.stop = false;
    await runCfBench({ tasks: picked, reps, model: fixed }, (m) => setBusy(m), stop.current);
    setBusy(null);
    toast('ok', 'Benchmark terminé.');
  };
  void tasks;
  return (
    <div className="space-y-3" data-testid="cfbench">
      <Section
        title="COGNITIVE FABRIC BENCHMARK"
        hint={`80 tâches (10 par catégorie) dont les réponses attendues sont CALCULÉES par le générateur : simples, intermédiaires, complexes, coding, data, reasoning, document, multi-tool. Trois bras sur la même tâche, le même modèle imposé et le même espace de travail, dans un ordre mélangé : BASELINE (JEV OFF), JEV V5, JEV COGNITIVE FABRIC. Lancé uniquement par vous ; aucun résultat n’est fabriqué.`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          {CF_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={cats.includes(c)}
                onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))}
                aria-label={`Catégorie ${CF_LABEL[c]}`}
              />
              {CF_LABEL[c]}
            </label>
          ))}
          <label className="flex items-center gap-1">
            Tâches / catégorie
            <Select
              value={String(per)}
              onChange={(v) => setPer(Number(v))}
              options={[2, 5, 10].map((n) => ({ value: String(n), label: String(n) }))}
              title="Tâches par catégorie"
            />
          </label>
          <label className="flex items-center gap-1">
            Répétitions
            <Select
              value={String(reps)}
              onChange={(v) => setReps(Number(v))}
              options={[1, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
              title="Répétitions"
            />
          </label>
          <label className="flex items-center gap-1">
            Modèle
            <Select
              value={fixed}
              onChange={setModel}
              options={cheap.map((m) => ({ value: m.id, label: `${m.id} (${m.inputPrice}$/M)` }))}
              title="Modèle imposé"
            />
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(busy) || !fixed || !picked.length}
            onClick={() => void go()}
          >
            <Play size={13} /> Lancer ({runs} exécutions)
          </Button>
          {busy && (
            <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
              <Square size={13} /> Arrêter
            </Button>
          )}
          {busy && <span className="text-info">{busy}</span>}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              download(
                'cognitive-fabric-benchmark.json',
                JSON.stringify(r, (_k, v) => (v instanceof RegExp ? String(v) : v), 2),
                'application/json',
              )
            }
          >
            <Download size={13} /> Exporter
          </Button>
        </div>
      </Section>
      {r.groups ? (
        <>
          <Section
            title={`Résultats appariés — ${r.tasks} tâche(s), ${r.groups} groupe(s), modèle(s) : ${r.models.join(', ')}`}
          >
            <Table
              testId="cf-arms"
              head={[
                'Bras',
                'n',
                'Réussite',
                'Qualité',
                'Tokens / mission',
                'Coût / mission',
                'Coût / réussie',
                'Latence',
                'Coût JEV',
              ]}
              rows={r.arms.map((a) => [
                ARM_LABEL[a.arm],
                a.n,
                fmt.pct(a.successRate),
                a.quality === null ? NM : a.quality.toFixed(1),
                a.tokens === null ? NM : Math.round(a.tokens),
                fmt.usd(a.cost),
                fmt.usd(a.costPerSuccess),
                fmt.ms(a.latencyMs),
                fmt.usd(a.jevCost, 6),
              ])}
            />
            <Table
              testId="cf-cmp"
              className="mt-2"
              head={[
                'Comparaison',
                'Paires (n)',
                'Δ réussite',
                'Δ qualité',
                'Δ tokens',
                'Δ coût / réussie',
                'Verdict',
              ]}
              rows={r.comparisons.map((c) => [
                `${ARM_LABEL[c.from]} → ${ARM_LABEL[c.to]}`,
                <span key="n">
                  {c.pairs}{' '}
                  <Badge tone={c.label === 'MEASURED' ? 'ok' : 'neutral'}>
                    {c.label === 'MEASURED' ? 'MEASURED' : 'ÉCHANTILLON INSUFFISANT'}
                  </Badge>
                </span>,
                c.dSuccess.n ? `${((c.dSuccess.meanDelta ?? 0) * 100).toFixed(0)} pts` : NM,
                c.dQuality.n ? (c.dQuality.meanDelta ?? 0).toFixed(1) : NM,
                c.dTokens.n ? Math.round(c.dTokens.meanDelta ?? 0) : NM,
                c.costPerSuccessChange === null ? NM : `${(c.costPerSuccessChange * 100).toFixed(0)} %`,
                <Badge
                  key="v"
                  tone={c.verdict === 'improves' ? 'ok' : c.verdict === 'worsens' ? 'err' : 'neutral'}
                >
                  {c.verdict === 'improves'
                    ? 'améliore'
                    : c.verdict === 'worsens'
                      ? 'détériore'
                      : c.verdict === 'neutral'
                        ? 'neutre'
                        : 'insuffisant'}
                </Badge>,
              ])}
            />
          </Section>
          <Section title="Par catégorie">
            <Table
              head={[
                'Catégorie',
                'Groupes complets',
                'BASELINE → FABRIC (verdict)',
                'V5 → FABRIC (verdict)',
                'BASELINE → V5 (verdict)',
              ]}
              rows={Object.entries(r.byCategory).map(([c, x]) => {
                const v = (f: string, t: string) => {
                  const k = x.comparisons.find((y) => y.from === f && y.to === t)!;
                  return `${k.verdict} (n=${k.pairs}${k.costPerSuccessChange === null ? '' : `, ${(k.costPerSuccessChange * 100).toFixed(0)} %`})`;
                };
                return [
                  CF_LABEL[c as keyof typeof CF_LABEL] ?? c,
                  x.arms[0]!.n,
                  v('baseline', 'fabric'),
                  v('v5', 'fabric'),
                  v('baseline', 'v5'),
                ];
              })}
            />
          </Section>
          {r.nonComparable.length > 0 && (
            <Section title="Paires NON COMPARABLES">
              <ul className="text-[12px]">
                {r.nonComparable.slice(0, 10).map((n, i) => (
                  <li key={i}>
                    {n.groupId} ({n.arm}) : {n.reasons.join(' ; ')}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <Empty>
          Aucun benchmark cognitif exécuté : « ÉCHANTILLON INSUFFISANT ». Les tests automatisés n’en
          produisent pas.
        </Empty>
      )}
      <Scenario focus="benchmark" />
    </div>
  );
}

export { fabricSettings };
