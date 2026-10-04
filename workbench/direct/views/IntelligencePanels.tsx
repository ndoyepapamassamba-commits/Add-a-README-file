import { useEffect, useState } from 'react';
import { Brain, History, RotateCcw, Trash2 } from 'lucide-react';
import { regressionSuite } from '../../server/agent/intelligence';
import { Button } from '../../web/components/ui';
import { Markdown } from '../../web/components/rich';
import { fmtCost, fmtRelative } from '../../web/lib/format';
import { useStore } from '../lib/store';
import { diffCheckpoint, listCheckpoints, restoreCheckpoint, type Checkpoint } from '../lib/timemachine';

/** Mission Control: what the Intelligence Engine has learnt (ledger, manual, regression suite). */
export function IntelligencePanel() {
  const ledger = useStore((s) => s.ledger);
  const manual = useStore((s) => s.manual);
  const setManual = useStore((s) => s.setManual);
  const e = ledger.entries;
  const passed = e.filter((x) => x.verdict === 'PASSED').length;
  const byClass = new Map<string, number>();
  for (const x of e) byClass.set(x.dna.cls, (byClass.get(x.dna.cls) ?? 0) + 1);
  const suite = regressionSuite(ledger);
  const [rule, setRule] = useState('');
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">
        <Brain size={13} /> Intelligence (apprentissage)
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-[12.5px]">
        <div className="mb-1">
          {e.length} mission(s) mémorisée(s) · {e.length ? Math.round((passed / e.length) * 100) : 0} %
          réussies · {byClass.size} type(s) de tâche · {suite.length} contrôle(s) de non-régression · coût
          cumulé {fmtCost(e.reduce((a, x) => a + x.cost, 0))}
        </div>
        {e
          .slice(-4)
          .reverse()
          .map((x) => (
            <div key={x.id} className="truncate text-[11.5px] text-muted">
              {x.verdict} · {x.tier} · {x.model.split('/').pop()} — {x.goal.slice(0, 70)} ({fmtRelative(x.at)}
              )
            </div>
          ))}
        <div className="mt-2 font-medium">Manuel personnel ({manual.length})</div>
        {manual.slice(-8).map((m) => (
          <div key={m.id} className="flex items-center gap-1 text-[12px]">
            <span className="text-faint">{m.kind}</span>
            <span className="min-w-0 flex-1 truncate" title={m.rule}>
              {m.rule}
            </span>
            <button
              className="text-faint hover:text-err"
              title="Supprimer"
              onClick={() => setManual(manual.filter((r) => r.id !== m.id))}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <form
          className="mt-1 flex gap-1"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!rule.trim()) return;
            setManual([
              ...manual,
              {
                id: Math.random().toString(36).slice(2),
                kind: 'standard',
                rule: rule.trim(),
                at: Date.now(),
                source: 'user',
              },
            ]);
            setRule('');
          }}
        >
          <input
            value={rule}
            onChange={(ev) => setRule(ev.target.value)}
            placeholder="Ajouter une règle (ex. : toujours citer la source des chiffres)"
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-input px-2 text-[12px] outline-none"
          />
          <Button size="sm" type="submit">
            Ajouter
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Files view: restorable states before each task, functional diff, restore. */
export function TimeMachinePanel() {
  const [list, setList] = useState<Checkpoint[]>([]);
  const [diff, setDiff] = useState<{ id: string; text: string } | null>(null);
  const reload = () => void listCheckpoints().then(setList);
  useEffect(reload, []);
  return (
    <div className="border-t border-line p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
        <History size={12} /> Time Machine
        <button className="ml-auto text-[11px] normal-case text-accent" onClick={reload}>
          actualiser
        </button>
      </div>
      <div className="max-h-56 overflow-auto">
        {!list.length && (
          <div className="px-1 text-[11.5px] text-faint">
            Un point de restauration est créé avant chaque tâche qui modifie des fichiers.
          </div>
        )}
        {list.map((c) => (
          <div key={c.id} className="rounded-md px-1 py-1 text-[12px] hover:bg-hover/60">
            <div className="truncate" title={c.goal}>
              {c.goal}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-faint">
              <span className="flex-1">
                {new Date(c.at).toLocaleString('fr-FR')} · {Object.keys(c.before).length} fichier(s)
              </span>
              <button
                className="text-accent"
                onClick={() => void diffCheckpoint(c.id).then((text) => setDiff({ id: c.id, text }))}
              >
                diff
              </button>
              <button
                className="flex items-center gap-0.5 text-warn"
                onClick={() => {
                  if (
                    !confirm(
                      `Restaurer l’état d’avant « ${c.goal.slice(0, 60)} » ? Les fichiers touchés par cette tâche reviennent à leur version précédente.`,
                    )
                  )
                    return;
                  void restoreCheckpoint(c.id).then((r) =>
                    useStore.getState().toast('ok', `${r.length} fichier(s) restauré(s)`),
                  );
                }}
              >
                <RotateCcw size={10} /> restaurer
              </button>
            </div>
            {diff?.id === c.id && (
              <div className="mt-1 rounded-md bg-code p-2 text-[11.5px]">
                <Markdown text={diff.text} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
