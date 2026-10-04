import { useEffect, useMemo, useState } from 'react';
import { FileText, Pin, PinOff, Puzzle, RefreshCw, Search, Trash2, Upload, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import type { SkillInfo } from '../lib/types';
import { useApp } from '../store/app';
import { useSession } from '../store/session';
import { Markdown, CodeBlock } from '../components/rich';
import { Badge, Button, Empty, Input, Section, Toggle } from '../components/ui';

export function SkillsView() {
  const skills = useApp((s) => s.skills);
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const loadSkills = useApp((s) => s.loadSkills);
  const toast = useApp((s) => s.toast);
  const detail = useSession((s) => s.detail);
  const patch = useSession((s) => s.patchSession);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [body, setBody] = useState<{ body: string; files: string[] } | null>(null);
  const [file, setFile] = useState<{ path: string; content: string } | null>(null);
  const [test, setTest] = useState('');
  const [matches, setMatches] = useState<{ name: string; matched: string[] }[] | null>(null);
  const pinned = detail?.settings.skills ?? [];

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);
  useEffect(() => {
    setFile(null);
    if (sel) void api<{ body: string; files: string[] }>(`/api/skills/${encodeURIComponent(sel)}`).then(setBody);
    else setBody(null);
  }, [sel]);

  const filtered = useMemo(() => skills.filter((k) => !q || `${k.name} ${k.description}`.toLowerCase().includes(q.toLowerCase())), [skills, q]);
  const current = skills.find((k) => k.name === sel);
  const disabled = settings?.skills.disabled ?? [];

  const toggleDisabled = (k: SkillInfo) => {
    if (!settings) return;
    const next = disabled.includes(k.name) ? disabled.filter((x) => x !== k.name) : [...disabled, k.name];
    void saveSettings({ skills: { ...settings.skills, disabled: next } }).then(loadSkills);
  };
  const importSkills = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.zip,.skill,.md';
    input.onchange = async () => {
      const fd = new FormData();
      for (const f of input.files ?? []) fd.append('file', f, f.name);
      try {
        const r = await api<{ imported: string[] }>('/api/skills/import', { body: fd });
        toast('success', `Importé : ${r.imported.join(', ')}`);
        await loadSkills();
      } catch (err) {
        toast('error', (err as Error).message);
      }
    };
    input.click();
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[340px] shrink-0 flex-col border-r border-line bg-elev">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <Puzzle size={16} className="text-accent" />
            <span className="font-semibold">Skills</span>
            <Badge>{skills.length}</Badge>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" title="Rescanner les dossiers" onClick={async () => {
                await api('/api/skills/rescan', { method: 'POST' });
                await loadSkills();
                toast('success', 'Skills rechargés');
              }}>
                <RefreshCw size={13} />
              </Button>
              <Button size="sm" onClick={importSkills}>
                <Upload size={13} /> Importer
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-input px-2">
            <Search size={13} className="text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un skill" className="h-7 flex-1 bg-transparent text-[12.5px] outline-none" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {filtered.map((k) => (
            <button key={k.name} onClick={() => setSel(k.name)} className={cx('w-full rounded-lg px-2.5 py-2 text-left hover:bg-hover', sel === k.name && 'bg-accent-soft')}>
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                <span className={cx('truncate', disabled.includes(k.name) && 'text-faint line-through')}>{k.name}</span>
                {pinned.includes(k.name) && <Pin size={11} className="text-accent" />}
                <span className="ml-auto text-[10.5px] text-faint">{k.source}</span>
              </div>
              <div className="line-clamp-2 text-[11.5px] text-muted">{k.description}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-4xl">
          <Section title="Comportement">
            <div className="grid gap-3 rounded-xl border border-line bg-panel p-3.5 md:grid-cols-2">
              {settings && (
                <>
                  <Toggle checked={settings.skills.autoActivate} onChange={(v) => void saveSettings({ skills: { ...settings.skills, autoActivate: v } })} label="Activation automatique selon la demande" />
                  <Toggle checked={settings.skills.showCatalog} onChange={(v) => void saveSettings({ skills: { ...settings.skills, showCatalog: v } })} label="Le modèle peut charger un skill lui-même (skill.use)" />
                  <Toggle checked={settings.jev.skills} onChange={(v) => void saveSettings({ jev: { ...settings.jev, skills: v } })} label="Détection sémantique par Jev (TypeSafe)" />
                  <label className="flex items-center gap-2 text-[13px]">
                    Skills auto max par message
                    <Input type="number" min={0} max={5} value={settings.skills.maxAuto} onChange={(e) => void saveSettings({ skills: { ...settings.skills, maxAuto: Number(e.target.value) } })} className="h-7 w-16" />
                  </label>
                </>
              )}
            </div>
            <div className="mt-2 text-[12px] text-faint">
              Un skill actif (épinglé, choisi, détecté ou chargé par le modèle) est injecté en entier dans le prompt système comme règles <b>obligatoires</b>, quel que soit le modèle OpenRouter.
            </div>
          </Section>
          <Section title="Tester la détection">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (test.trim()) void api<{ name: string; matched: string[] }[]>('/api/skills/match', { body: { text: test } }).then(setMatches);
              }}
            >
              <Input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Ex. « rédige un mail au COMEX sur le ratio NPL »" />
              <Button type="submit">
                <Wand2 size={13} /> Tester
              </Button>
            </form>
            {matches && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px]">
                {matches.length === 0 ? <span className="text-faint">Aucun skill détecté par mots-clés (Jev peut encore en détecter à l'exécution).</span> : matches.map((m) => <Badge key={m.name} tone="accent">{m.name} · {m.matched.join(', ')}</Badge>)}
              </div>
            )}
          </Section>
          {!current ? (
            <Empty icon={<Puzzle size={32} />} title="Sélectionnez un skill">Vos skills Claude (~/.claude/skills), ceux du dossier workbench/skills et ceux importés ici (data/skills, privé) sont listés à gauche.</Empty>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-[17px] font-semibold">{current.name}</h2>
                <Badge>{current.source}</Badge>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" onClick={() => void patch({ skills: pinned.includes(current.name) ? pinned.filter((x) => x !== current.name) : [...pinned, current.name] })} disabled={!detail}>
                    {pinned.includes(current.name) ? <PinOff size={13} /> : <Pin size={13} />} {pinned.includes(current.name) ? 'Désépingler' : 'Épingler pour la session'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleDisabled(current)}>
                    {disabled.includes(current.name) ? 'Réactiver' : 'Désactiver'}
                  </Button>
                  {current.source === 'imported' && (
                    <Button size="sm" variant="danger" onClick={async () => {
                      if (!confirm(`Supprimer le skill ${current.name} ?`)) return;
                      await api(`/api/skills/${encodeURIComponent(current.name)}`, { method: 'DELETE' });
                      setSel(null);
                      await loadSkills();
                    }}>
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>
              <div className="mb-3 text-[13px] text-muted">{current.description}</div>
              {current.triggers.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {current.triggers.slice(0, 30).map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
              {body && body.files.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {body.files.slice(0, 40).map((f) => (
                    <button key={f} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] hover:bg-hover" onClick={() => void api<{ path: string; content: string }>(`/api/skills/${encodeURIComponent(current.name)}/file`, { query: { path: f } }).then(setFile)}>
                      <FileText size={11} /> {f}
                    </button>
                  ))}
                </div>
              )}
              {file ? (
                <div>
                  <button className="mb-2 text-[12.5px] text-accent hover:underline" onClick={() => setFile(null)}>
                    ← SKILL.md
                  </button>
                  {file.path.endsWith('.md') ? <Markdown text={file.content} /> : <CodeBlock code={file.content} lang={file.path.split('.').pop()} />}
                </div>
              ) : (
                body && (
                  <div className="rounded-xl border border-line bg-panel p-4">
                    <Markdown text={body.body} />
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
