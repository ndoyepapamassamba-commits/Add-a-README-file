import { useEffect, useState } from 'react';
import { Bot, FileSearch, Pencil, Plus, Trash2, Wrench, Play } from 'lucide-react';
import type { RunSummary } from '@shared/types';
import { api } from '../lib/api';
import { cx, fmtCost, fmtRelative, shortModel } from '../lib/format';
import type { AgentInfo } from '../lib/types';
import { useApp } from '../store/app';
import { useSession } from '../store/session';
import { EFFORT_LABEL, ModelPicker } from '../components/chat/Pickers';
import { Badge, Button, Field, Input, Modal, Section, Select, Textarea } from '../components/ui';

const TOOL_GROUPS: { label: string; tools: string[] }[] = [
  {
    label: 'Fichiers (lecture)',
    tools: [
      'filesystem.list',
      'filesystem.read',
      'filesystem.read_many',
      'filesystem.search',
      'filesystem.glob',
    ],
  },
  {
    label: 'Fichiers (écriture)',
    tools: [
      'filesystem.write',
      'filesystem.edit',
      'filesystem.multi_edit',
      'filesystem.delete',
      'filesystem.move',
    ],
  },
  { label: 'Terminal & code', tools: ['terminal.execute', 'terminal.output', 'terminal.kill', 'code.run'] },
  {
    label: 'Navigateur',
    tools: [
      'browser.open',
      'browser.navigate',
      'browser.click',
      'browser.type',
      'browser.press',
      'browser.scroll',
      'browser.back',
      'browser.forward',
      'browser.reload',
      'browser.screenshot',
      'browser.extract',
      'browser.console',
      'browser.download',
    ],
  },
  { label: 'Web', tools: ['web.search', 'web.fetch'] },
  {
    label: 'Données & graphiques',
    tools: ['data.inspect', 'data.query', 'data.transform', 'visualization.create'],
  },
  { label: 'Git', tools: ['git.status', 'git.diff', 'git.log', 'git.commit'] },
  {
    label: 'Mémoire, artefacts, plan',
    tools: [
      'memory.read',
      'memory.add',
      'memory.remove',
      'artifact.create',
      'project.analyze',
      'plan.update',
    ],
  },
  { label: 'Jev (TypeSafe)', tools: ['jev.judge'] },
  { label: 'Plugins MCP (tous)', tools: ['mcp.*'] },
  { label: 'Délégation', tools: ['agent.delegate'] },
];

interface Draft {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  model: string;
  effort: string;
  skills: string[];
}

const EMPTY: Draft = {
  name: '',
  description: '',
  prompt: '',
  tools: [],
  model: 'auto',
  effort: 'auto',
  skills: [],
};

export function AgentEditor({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: Draft;
}) {
  const models = useApp((s) => s.models);
  const skills = useApp((s) => s.skills);
  const loadAgents = useApp((s) => s.loadAgents);
  const toast = useApp((s) => s.toast);
  const [d, setD] = useState<Draft>(initial);
  const [restrict, setRestrict] = useState(initial.tools.length > 0);
  useEffect(() => {
    setD(initial);
    setRestrict(initial.tools.length > 0);
  }, [initial]);
  const toggle = (tools: string[], on: boolean) =>
    setD({
      ...d,
      tools: on ? [...new Set([...d.tools, ...tools])] : d.tools.filter((t) => !tools.includes(t)),
    });
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={820}
      title={initial.id ? `Modifier l'agent ${initial.name}` : 'Nouvel agent'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={
              d.name.trim().length < 2 || d.description.trim().length < 5 || d.prompt.trim().length < 10
            }
            onClick={async () => {
              try {
                await api('/api/agents', {
                  body: {
                    id: d.id,
                    name: d.name,
                    description: d.description,
                    prompt: d.prompt,
                    tools: restrict ? d.tools : undefined,
                    model: d.model === 'auto' ? undefined : d.model,
                    effort: d.effort === 'auto' ? undefined : d.effort,
                    skills: d.skills,
                  },
                });
                await loadAgents();
                toast('success', 'Agent enregistré');
                onClose();
              } catch (err) {
                toast('error', (err as Error).message);
              }
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Nom">
          <Input
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            placeholder="ex. Analyste crédit IFRS9"
          />
        </Field>
        <Field
          label="Modèle préféré"
          hint="Auto = le routeur choisit. Votre choix dans le chat reste prioritaire."
        >
          <div className="flex h-8 items-center rounded-lg border border-line bg-input px-1">
            <ModelPicker
              value={d.model}
              models={models}
              onChange={(model) => setD({ ...d, model })}
              placement="bottom"
            />
          </div>
        </Field>
      </div>
      <Field label="Description" hint="Sert à choisir l'agent et à la délégation automatique.">
        <Input
          value={d.description}
          onChange={(e) => setD({ ...d, description: e.target.value })}
          placeholder="Ce que fait l'agent et quand l'utiliser"
        />
      </Field>
      <Field
        label="Instructions (prompt système, imposées au modèle)"
        hint="Rôle, méthode, format de sortie, règles à respecter. Markdown accepté."
      >
        <Textarea
          rows={10}
          className="font-mono text-[12.5px]"
          value={d.prompt}
          onChange={(e) => setD({ ...d, prompt: e.target.value })}
          placeholder={'Tu es …\n\n## Méthode\n1. …\n\n## Format de réponse\n…'}
        />
      </Field>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Niveau d'effort">
          <Select
            value={d.effort}
            onChange={(effort) => setD({ ...d, effort })}
            options={Object.entries(EFFORT_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Skills toujours actifs pour cet agent">
          <select
            multiple
            value={d.skills}
            onChange={(e) => setD({ ...d, skills: [...e.target.selectedOptions].map((o) => o.value) })}
            className="h-24 w-full rounded-lg border border-line bg-input p-1 text-[12.5px]"
          >
            {skills.map((k) => (
              <option key={k.name} value={k.name}>
                {k.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mb-2 flex items-center gap-2 text-[12.5px]">
        <input
          id="restrict"
          type="checkbox"
          checked={restrict}
          onChange={(e) => setRestrict(e.target.checked)}
        />
        <label htmlFor="restrict">
          Restreindre les outils (sinon : tous les outils de l'agent principal + plugins MCP)
        </label>
      </div>
      {restrict && (
        <div className="grid gap-1.5 md:grid-cols-2">
          {TOOL_GROUPS.map((g) => {
            const all = g.tools.every((t) => d.tools.includes(t));
            return (
              <label
                key={g.label}
                className={cx(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]',
                  all ? 'border-accent bg-accent-soft' : 'border-line',
                )}
              >
                <input type="checkbox" checked={all} onChange={(e) => toggle(g.tools, e.target.checked)} />{' '}
                {g.label}
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function AgentsView() {
  const agents = useApp((s) => s.agents);
  const setView = useApp((s) => s.setView);
  const toast = useApp((s) => s.toast);
  const loadAgents = useApp((s) => s.loadAgents);
  const patch = useSession((s) => s.patchSession);
  const review = useSession((s) => s.review);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [subRuns, setSubRuns] = useState<RunSummary[]>([]);
  useEffect(() => {
    void loadAgents();
    void api<RunSummary[]>('/api/runs', { query: { limit: 300 } }).then((r) =>
      setSubRuns(r.filter((x) => x.parentRunId).slice(0, 30)),
    );
  }, [loadAgents]);

  const use = async (a: AgentInfo) => {
    await patch({ role: a.id });
    setView('chat');
    toast('info', `Agent actif : ${a.label}`);
  };
  const edit = async (a: AgentInfo) => {
    const full = await api<{
      id: string;
      name: string;
      description: string;
      prompt: string;
      tools: string[] | null;
      model: string | null;
      effort: string | null;
      skills: string[];
    }>(`/api/agents/${encodeURIComponent(a.id)}`);
    setEditing({
      id: full.id,
      name: full.name,
      description: full.description,
      prompt: full.prompt,
      tools: full.tools ?? [],
      model: full.model ?? 'auto',
      effort: full.effort ?? 'auto',
      skills: full.skills,
    });
  };

  const builtin = agents.filter((a) => !a.custom);
  const custom = agents.filter((a) => a.custom);
  const Card = ({ a }: { a: AgentInfo }) => (
    <div className="flex flex-col rounded-xl border border-line bg-panel p-3.5">
      <div className="mb-1 flex items-center gap-2">
        {a.custom ? <Wrench size={15} className="text-accent" /> : <Bot size={15} className="text-accent" />}
        <span className="font-semibold">{a.label}</span>
        <Badge>{a.custom ? a.source : 'intégré'}</Badge>
      </div>
      <div className="mb-2 line-clamp-3 flex-1 text-[12.5px] text-muted">{a.description}</div>
      <div className="mb-2 flex flex-wrap gap-1 text-[11px]">
        <Badge tone="info">{a.tools.length ? `${a.tools.length} outils` : 'tous les outils'}</Badge>
        {a.model && <Badge tone="accent">{shortModel(a.model)}</Badge>}
        {a.skills.map((s) => (
          <Badge key={s} tone="ok">
            {s}
          </Badge>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" onClick={() => void use(a)}>
          <Play size={13} /> Utiliser
        </Button>
        {a.custom && (
          <Button size="sm" onClick={() => void edit(a)}>
            <Pencil size={13} /> {a.editable ? 'Modifier' : 'Voir / dupliquer'}
          </Button>
        )}
        {a.editable && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Supprimer l'agent ${a.label} ?`)) return;
              await api(`/api/agents/${encodeURIComponent(a.id)}`, { method: 'DELETE' }).catch((e: Error) =>
                toast('error', e.message),
              );
              await loadAgents();
            }}
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Agents</h1>
            <div className="text-[13px] text-muted">
              Choisissez l'agent du chat, créez les vôtres, ou faites relire le travail par un second agent.
              Les instructions de chaque agent sont imposées au modèle connecté.
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => void review().then(() => setView('chat'))}>
              <FileSearch size={14} /> Review my work
            </Button>
            <Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>
              <Plus size={14} /> Nouvel agent
            </Button>
          </div>
        </div>
        <Section title="Agents spécialisés intégrés">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {builtin.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </div>
        </Section>
        <Section title={`Agents personnalisés (${custom.length})`}>
          {custom.length === 0 && (
            <div className="text-[13px] text-faint">
              Aucun agent personnalisé. Créez-en un, ou déposez des fichiers .md (format Claude Code) dans
              ~/.claude/agents ou workbench/agents.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </div>
        </Section>
        <Section title="Sous-agents récents (délégations)">
          {subRuns.length === 0 && (
            <div className="text-[13px] text-faint">
              Les tâches déléguées par l'agent principal apparaîtront ici.
            </div>
          )}
          <div className="divide-y divide-line rounded-xl border border-line">
            {subRuns.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                <Badge tone={r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'err' : 'neutral'}>
                  {r.status}
                </Badge>
                <span className="font-medium">{r.role}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{r.title}</span>
                <span className="text-faint">{shortModel(r.model)}</span>
                <span className="tabular-nums text-faint">{fmtCost(r.cost)}</span>
                <span className="text-faint">{fmtRelative(r.startedAt)}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      {editing && <AgentEditor open onClose={() => setEditing(null)} initial={editing} />}
    </div>
  );
}
