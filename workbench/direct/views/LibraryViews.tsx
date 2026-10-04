import { useRef, useState } from 'react';
import { Bot, Plus, Puzzle, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Empty, Field, Input, Modal, Textarea, Toggle } from '../../web/components/ui';
import { Markdown } from '../../web/components/rich';
import { BUILTIN_AGENTS } from '../lib/roles';
import { DIRECT_TOOLS, agentId, importAgentFile, importSkillFile } from '../lib/skills';
import { extractTriggers } from '../../server/services/skillsCore';
import { useStore } from '../lib/store';
import type { AgentDef, SkillDef } from '../lib/types';

export function SkillsView() {
  const skills = useStore((s) => s.skills);
  const setSkills = useStore((s) => s.setSkills);
  const autoSkills = useStore((s) => s.settings.autoSkills);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<SkillDef | null>(null);
  const [creating, setCreating] = useState(false);

  const add = (list: SkillDef[]) => {
    const names = new Set(list.map((s) => s.name));
    setSkills(
      [...skills.filter((s) => !names.has(s.name)), ...list].sort((a, b) => a.name.localeCompare(b.name)),
    );
    useStore
      .getState()
      .toast('ok', `${list.length} skill(s) importé(s) : ${list.map((s) => s.name).join(', ')}`);
  };

  return (
    <div className="mx-auto h-full max-w-[920px] overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold">Skills</h1>
          <div className="text-[13px] text-muted">
            Format Claude (SKILL.md). L’IA applique un skill comme des instructions obligatoires dès qu’il
            correspond à la demande, ou quand vous l’épinglez dans la session.
          </div>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".md,.zip,.skill"
          onChange={async (e) => {
            const fl = Array.from(e.target.files ?? []);
            e.target.value = '';
            const out: SkillDef[] = [];
            for (const f of fl) {
              try {
                out.push(...(await importSkillFile(f)));
              } catch (err) {
                useStore.getState().toast('err', (err as Error).message);
              }
            }
            if (out.length) add(out);
          }}
        />
        <Button onClick={() => input.current?.click()}>
          <Upload size={14} /> Importer (.zip, .skill, SKILL.md)
        </Button>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Créer
        </Button>
      </div>
      <div className="mb-4 rounded-xl border border-line bg-panel p-3">
        <Toggle
          checked={autoSkills}
          onChange={(v) => useStore.getState().patchSettings({ autoSkills: v })}
          label="Détection automatique : activer les skills dont les mots-clés apparaissent dans la demande"
        />
      </div>
      {!skills.length ? (
        <Empty icon={<Puzzle size={28} />} title="Aucun skill">
          Importez vos skills Claude (dossier zippé contenant SKILL.md, fichier .skill ou SKILL.md seul) ou
          créez-en un.
        </Empty>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {skills.map((s) => (
            <div key={s.name} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <Puzzle size={14} className="text-accent" />
                <button
                  className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium hover:underline"
                  onClick={() => setOpen(s)}
                >
                  {s.name}
                </button>
                <Toggle
                  checked={s.enabled}
                  onChange={(v) =>
                    setSkills(skills.map((x) => (x.name === s.name ? { ...x, enabled: v } : x)))
                  }
                />
                <button
                  aria-label={`Supprimer ${s.name}`}
                  className="text-faint hover:text-err"
                  onClick={() =>
                    confirm(`Supprimer le skill ${s.name} ?`) &&
                    setSkills(skills.filter((x) => x.name !== s.name))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-1 line-clamp-3 text-[12.5px] text-muted">{s.description}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.triggers.slice(0, 6).map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
                {Object.keys(s.files).length > 0 && (
                  <Badge tone="info">{Object.keys(s.files).length} fichier(s)</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name ?? ''} width={860}>
        {open && <Markdown text={open.body} />}
      </Modal>
      <SkillEditor open={creating} onClose={() => setCreating(false)} onSave={(s) => add([s])} />
    </div>
  );
}

function SkillEditor({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (s: SkillDef) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const valid = name.trim() && description.trim() && body.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouveau skill"
      width={760}
      footer={
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() => {
            const n = agentId(name) || 'skill';
            onSave({
              name: n,
              description: description.trim(),
              body: body.trim(),
              files: {},
              triggers: extractTriggers(description, n),
              enabled: true,
            });
            onClose();
          }}
        >
          Enregistrer
        </Button>
      }
    >
      <Field label="Nom">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. rapport-mensuel" />
      </Field>
      <Field
        label="Description (quand l’utiliser)"
        hint='Mettez les mots déclencheurs entre guillemets : Se déclenche avec "rapport mensuel", "synthèse du mois".'
      >
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Instructions (Markdown)">
        <Textarea
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Étapes, format attendu, règles à respecter…"
        />
      </Field>
    </Modal>
  );
}

export function AgentsView() {
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const [edit, setEdit] = useState<AgentDef | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = (a: AgentDef) =>
    setAgents([...agents.filter((x) => x.id !== a.id), a].sort((x, y) => x.name.localeCompare(y.name)));
  return (
    <div className="mx-auto h-full max-w-[920px] overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold">Agents</h1>
          <div className="text-[13px] text-muted">
            Choisissez l’agent dans la barre de saisie. Un agent personnalisé suit strictement ses
            instructions, ses outils autorisés et ses skills.
          </div>
        </div>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept=".md"
          onChange={async (e) => {
            for (const f of Array.from(e.target.files ?? [])) {
              try {
                save(await importAgentFile(f));
                useStore.getState().toast('ok', `Agent importé : ${f.name}`);
              } catch (err) {
                useStore.getState().toast('err', (err as Error).message);
              }
            }
            e.target.value = '';
          }}
        />
        <Button onClick={() => input.current?.click()}>
          <Upload size={14} /> Importer (.md Claude Code)
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            setEdit({
              id: '',
              name: '',
              description: '',
              prompt: '',
              tools: null,
              model: null,
              effort: null,
              skills: [],
            })
          }
        >
          <Plus size={14} /> Créer
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[...BUILTIN_AGENTS, ...agents].map((a) => (
          <div key={a.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-accent" />
              <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{a.name}</div>
              {a.builtin ? (
                <Badge>intégré</Badge>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>
                    Modifier
                  </Button>
                  <button
                    aria-label={`Supprimer ${a.name}`}
                    className="text-faint hover:text-err"
                    onClick={() =>
                      confirm(`Supprimer l’agent ${a.name} ?`) &&
                      setAgents(agents.filter((x) => x.id !== a.id))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
            <div className="mt-1 text-[12.5px] text-muted">{a.description}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge>{a.tools ? `${a.tools.length} outils` : 'tous les outils'}</Badge>
              {a.model && <Badge tone="info">{a.model}</Badge>}
              {a.skills.map((s) => (
                <Badge key={s} tone="accent">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <AgentEditor
          agent={edit}
          onClose={() => setEdit(null)}
          onSave={(a) => {
            save(a);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function AgentEditor({
  agent,
  onClose,
  onSave,
}: {
  agent: AgentDef;
  onClose: () => void;
  onSave: (a: AgentDef) => void;
}) {
  const skills = useStore((s) => s.skills);
  const [a, setA] = useState<AgentDef>(agent);
  const [restrict, setRestrict] = useState(agent.tools !== null);
  const toggleTool = (t: string) =>
    setA({
      ...a,
      tools: (a.tools ?? []).includes(t) ? (a.tools ?? []).filter((x) => x !== t) : [...(a.tools ?? []), t],
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={agent.id ? `Modifier ${agent.name}` : 'Nouvel agent'}
      width={780}
      footer={
        <Button
          variant="primary"
          disabled={!a.name.trim() || !a.prompt.trim()}
          onClick={() =>
            onSave({
              ...a,
              id: a.id || agentId(a.name) || `agent-${Date.now()}`,
              tools: restrict ? (a.tools ?? []) : null,
            })
          }
        >
          Enregistrer
        </Button>
      }
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Nom">
          <Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
        </Field>
        <Field
          label="Modèle préféré (optionnel)"
          hint="ID OpenRouter (ex. anthropic/claude-sonnet-4.5) ou haiku / sonnet / opus"
        >
          <Input
            value={a.model ?? ''}
            onChange={(e) => setA({ ...a, model: e.target.value.trim() || null })}
          />
        </Field>
      </div>
      <Field label="Description (quand l’utiliser)">
        <Input value={a.description} onChange={(e) => setA({ ...a, description: e.target.value })} />
      </Field>
      <Field label="Instructions (rôle, méthode, format de sortie)">
        <Textarea rows={9} value={a.prompt} onChange={(e) => setA({ ...a, prompt: e.target.value })} />
      </Field>
      <div className="mb-2">
        <Toggle checked={restrict} onChange={setRestrict} label="Limiter les outils" />
      </div>
      {restrict && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIRECT_TOOLS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTool(t)}
              className={`rounded-md border px-2 py-0.5 font-mono text-[11.5px] ${(a.tools ?? []).includes(t) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'}`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => toggleTool('mcp.*')}
            className={`rounded-md border px-2 py-0.5 font-mono text-[11.5px] ${(a.tools ?? []).includes('mcp.*') ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'}`}
          >
            mcp.* (plugins)
          </button>
        </div>
      )}
      {skills.length > 0 && (
        <Field label="Skills toujours appliqués par cet agent">
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <button
                key={s.name}
                onClick={() =>
                  setA({
                    ...a,
                    skills: a.skills.includes(s.name)
                      ? a.skills.filter((x) => x !== s.name)
                      : [...a.skills, s.name],
                  })
                }
                className={`rounded-md border px-2 py-0.5 text-[12px] ${a.skills.includes(s.name) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </Field>
      )}
    </Modal>
  );
}
