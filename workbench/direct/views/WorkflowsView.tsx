import { useState } from 'react';
import { Copy, Pencil, Play, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Textarea } from '../../web/components/ui';
import { fmtRelative } from '../../web/lib/format';
import { allAgents } from '../lib/roles';
import { uid, useStore } from '../lib/store';
import type { Attachment, Workflow } from '../lib/types';
import { allWorkflows, newWorkflow, runWorkflow } from '../lib/workflows';

export function WorkflowsView() {
  const workflows = useStore((s) => s.workflows);
  const files = useStore((s) => s.files);
  const setWorkflows = useStore((s) => s.setWorkflows);
  const [edit, setEdit] = useState<Workflow | null>(null);
  const [running, setRunning] = useState<Workflow | null>(null);
  const save = (w: Workflow) =>
    setWorkflows([...workflows.filter((x) => x.id !== w.id), { ...w, builtin: false }]);
  return (
    <div className="mx-auto h-full max-w-[920px] overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold">Workflows</h1>
          <div className="text-[13px] text-muted">
            Procédures récurrentes exécutées en un clic, en mode Mission (vérification et verdict à la fin).
          </div>
        </div>
        <Button variant="primary" onClick={() => setEdit(newWorkflow())}>
          <Plus size={14} /> Nouveau workflow
        </Button>
      </div>
      <div className="space-y-2">
        {allWorkflows(workflows).map((w) => (
          <div key={w.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="flex items-center gap-2">
              <WorkflowIcon size={14} className="text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{w.name}</div>
                <div className="truncate text-[12px] text-muted">{w.description}</div>
              </div>
              {w.builtin && <Badge>modèle</Badge>}
              {w.lastRunAt && (
                <span className="text-[11px] text-faint">lancé {fmtRelative(w.lastRunAt)}</span>
              )}
              <Button size="sm" variant="primary" onClick={() => setRunning(w)}>
                <Play size={12} /> Lancer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={w.builtin ? 'Dupliquer et modifier' : 'Modifier'}
                onClick={() =>
                  setEdit(w.builtin ? { ...w, id: uid(), name: `${w.name} (copie)`, builtin: false } : w)
                }
              >
                {w.builtin ? <Copy size={13} /> : <Pencil size={13} />}
              </Button>
              {!w.builtin && (
                <button
                  aria-label={`Supprimer ${w.name}`}
                  className="text-faint hover:text-err"
                  onClick={() =>
                    confirm(`Supprimer « ${w.name} » ?`) &&
                    setWorkflows(workflows.filter((x) => x.id !== w.id))
                  }
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <ol className="mt-2 flex flex-wrap gap-1 text-[11.5px] text-muted">
              {w.steps.map((s, i) => (
                <li key={i} className="rounded-md bg-hover px-1.5 py-0.5">
                  {i + 1}. {s.split(':')[0]!.slice(0, 40)}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {edit && (
        <WorkflowEditor wf={edit} onClose={() => setEdit(null)} onSave={(w) => (save(w), setEdit(null))} />
      )}
      {running && <RunDialog wf={running} files={Object.keys(files)} onClose={() => setRunning(null)} />}
    </div>
  );
}

function WorkflowEditor({
  wf,
  onClose,
  onSave,
}: {
  wf: Workflow;
  onClose: () => void;
  onSave: (w: Workflow) => void;
}) {
  const custom = useStore((s) => s.agents);
  const [w, setW] = useState(wf);
  const [steps, setSteps] = useState(wf.steps.join('\n'));
  return (
    <Modal
      open
      onClose={onClose}
      title={wf.name ? `Workflow : ${wf.name}` : 'Nouveau workflow'}
      width={720}
      footer={
        <Button
          variant="primary"
          disabled={!w.name.trim() || !steps.trim()}
          onClick={() =>
            onSave({
              ...w,
              steps: steps
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        >
          Enregistrer
        </Button>
      }
    >
      <Field label="Nom">
        <Input
          value={w.name}
          onChange={(e) => setW({ ...w, name: e.target.value })}
          placeholder="ex. Reporting mensuel"
        />
      </Field>
      <Field label="Description">
        <Input value={w.description} onChange={(e) => setW({ ...w, description: e.target.value })} />
      </Field>
      <Field label="Agent principal">
        <select
          value={w.agent}
          onChange={(e) => setW({ ...w, agent: e.target.value })}
          className="h-8 w-full rounded-lg border border-line bg-input px-2 text-[13px]"
        >
          {allAgents(custom).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Étapes (une par ligne)"
        hint="Ex. IMPORT DATA : … → DATA QUALITY : … → REPORT : … → QA : …"
      >
        <Textarea rows={10} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </Field>
    </Modal>
  );
}

function RunDialog({ wf, files, onClose }: { wf: Workflow; files: string[]; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const all = useStore((s) => s.files);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Lancer « ${wf.name} »`}
      width={640}
      footer={
        <Button
          variant="primary"
          onClick={() => {
            const att: Attachment[] = sel.map((p) => ({
              path: p,
              name: p.split('/').pop()!,
              mime: all[p]!.mime,
              size: all[p]!.size,
            }));
            runWorkflow(wf, att, extra);
            onClose();
          }}
        >
          <Play size={13} /> Lancer la mission
        </Button>
      }
    >
      <Field label="Fichiers à utiliser (espace de travail)">
        <div className="max-h-56 overflow-auto rounded-lg border border-line p-1">
          {!files.length && (
            <div className="p-2 text-[12px] text-faint">
              Aucun fichier : importez-en dans Fichiers ou Données.
            </div>
          )}
          {files
            .filter((p) => !p.startsWith('.ai/'))
            .map((p) => (
              <label
                key={p}
                className="flex items-center gap-2 rounded px-2 py-1 text-[12.5px] hover:bg-hover"
              >
                <input
                  type="checkbox"
                  checked={sel.includes(p)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, p] : sel.filter((x) => x !== p))}
                />
                {p}
              </label>
            ))}
        </div>
      </Field>
      <Field label="Précisions (optionnel)">
        <Textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
    </Modal>
  );
}
