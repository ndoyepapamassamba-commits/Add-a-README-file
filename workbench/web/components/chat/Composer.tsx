import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Paperclip,
  Square,
  X,
  Rocket,
} from 'lucide-react';
import type { EffortSetting, PermissionMode } from '@shared/types';
import { FIX_EVERYTHING } from '../../../server/agent/mission';
import { api } from '../../lib/api';
import { basename, cx, fmtCost, shortModel } from '../../lib/format';
import { isActiveStatus } from '../../lib/transcript';
import { useApp } from '../../store/app';
import { useBrowser } from '../../store/runtime';
import { useCode } from '../../store/code';
import { useSession } from '../../store/session';
import { Chip, Kbd } from '../ui';
import { AgentPicker, EffortPicker, ModePicker, ModelPicker, SkillsPicker, EFFORT_LABEL } from './Pickers';

interface Attachment {
  path: string;
  kind: string;
  size: number;
  uploading?: boolean;
  name: string;
}

interface SlashCommand {
  name: string;
  args?: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Afficher les commandes et raccourcis' },
  { name: 'clear', description: 'Nouvelle session (contexte vierge)' },
  { name: 'model', args: '<id|auto>', description: 'Changer de modèle' },
  { name: 'agent', args: '<id>', description: "Changer d'agent" },
  { name: 'skill', args: '<nom>', description: 'Épingler / retirer un skill pour la session' },
  { name: 'effort', args: '<auto|low|medium|high|xhigh|max>', description: "Niveau d'effort du modèle" },
  { name: 'plan', description: 'Basculer le mode Plan (plan → validation → exécution)' },
  { name: 'mission', description: 'Basculer le mode Mission autonome (jusqu’au résultat validé)' },
  { name: 'fix', description: 'Mission « Répare tout » : détecter, diagnostiquer, corriger, tester' },
  { name: 'mode', args: '<safe|normal|auto>', description: 'Mode de permissions' },
  { name: 'review', args: '[focus]', description: 'Faire relire le travail par un second agent' },
  { name: 'compact', description: 'Résumer l’historique pour libérer du contexte' },
  { name: 'cost', description: 'Afficher la consommation et les crédits' },
  { name: 'init', description: 'Analyser le projet et écrire PROJECT_CONTEXT.md' },
  { name: 'memory', description: 'Ouvrir la mémoire du projet' },
  { name: 'export', args: '[md|json|pdf]', description: 'Exporter la session' },
  { name: 'browser', args: '[url]', description: 'Ouvrir le navigateur intégré' },
  { name: 'terminal', description: 'Ouvrir le terminal' },
  { name: 'plugins', description: 'Gérer les plugins MCP (Blender, Canva…)' },
];

const MODES: PermissionMode[] = ['safe', 'normal', 'autonomous'];
let fileCache: { projectId: string; files: string[]; at: number } | null = null;

async function projectFiles(projectId: string): Promise<string[]> {
  if (fileCache && fileCache.projectId === projectId && Date.now() - fileCache.at < 30_000)
    return fileCache.files;
  const files = await api<string[]>(`/api/projects/${projectId}/all-files`);
  fileCache = { projectId, files, at: Date.now() };
  return files;
}

function fuzzy(query: string, items: string[], limit = 12): string[] {
  const q = query.toLowerCase();
  if (!q) return items.slice(0, limit);
  const scored: [string, number][] = [];
  for (const it of items) {
    const s = it.toLowerCase();
    const idx = s.indexOf(q);
    if (idx >= 0) {
      scored.push([it, idx - (s.lastIndexOf('/') < idx ? 50 : 0) + s.length / 100]);
      continue;
    }
    let j = 0;
    for (const ch of s) if (ch === q[j]) j++;
    if (j === q.length) scored.push([it, 100 + s.length]);
  }
  return scored
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([x]) => x);
}

export function Composer({ compact = false, autoFocus = true }: { compact?: boolean; autoFocus?: boolean }) {
  const app = useApp();
  const session = useSession();
  const detail = session.detail;
  const active = session.activeRunId ? session.runs[session.activeRunId] : undefined;
  const running = Boolean(active && isActiveStatus(active.status));
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{
    kind: 'slash' | 'mention';
    query: string;
    start: number;
    items: string[];
    index: number;
  } | null>(null);
  const [estimate, setEstimate] = useState<{ perStep: number | null; model: string; reason: string } | null>(
    null,
  );
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const historyIdx = useRef(-1);

  const projectId = app.projectId;
  const model = detail?.session.model ?? 'auto';
  const role = detail?.settings.role ?? 'general';
  const mode = detail?.session.permissionMode ?? 'normal';
  const pinned = detail?.settings.skills ?? [];
  const modelInfo = app.models.find((m) => m.id === model);

  // Pre-filled requests from other views ("Ask AI", data, etc.)
  useEffect(() => {
    const d = app.draft;
    if (!d) return;
    app.setDraft(null);
    if (d.text) setText(d.text);
    if (d.attachments?.length)
      setAttachments((a) => [
        ...a,
        ...d.attachments!.map((p) => ({ path: p, kind: 'file', size: 0, name: basename(p) })),
      ]);
    if (d.role) void session.patchSession({ role: d.role });
    if (d.send && d.text) void submit(d.text, d.attachments ?? [], d.ui);
    else taRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.draft]);

  // Autosize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  // Cost estimate (debounced)
  useEffect(() => {
    if (!detail || !text.trim()) {
      setEstimate(null);
      return;
    }
    const t = window.setTimeout(() => {
      api<{ perStep: number | null; model: string; reason: string }>('/api/estimate', {
        body: { sessionId: detail.session.id, text, model, role },
      })
        .then(setEstimate)
        .catch(() => setEstimate(null));
    }, 600);
    return () => window.clearTimeout(t);
  }, [text, model, role, detail]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!projectId || !files.length) return;
      const temp: Attachment[] = files.map((f) => ({
        path: `__uploading__/${f.name}-${Math.random()}`,
        kind: f.type.startsWith('image/') ? 'image' : 'file',
        size: f.size,
        uploading: true,
        name: f.name || 'fichier',
      }));
      setAttachments((a) => [...a, ...temp]);
      const fd = new FormData();
      for (const f of files)
        fd.append(
          'file',
          f,
          f.name || `collé-${Date.now()}.${(f.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')}`,
        );
      try {
        const saved = await api<{ path: string; size: number; kind: string }[]>(
          `/api/projects/${projectId}/upload`,
          { body: fd },
        );
        setAttachments((a) => [
          ...a.filter((x) => !temp.includes(x)),
          ...saved.map((s) => ({ ...s, name: basename(s.path) })),
        ]);
      } catch (err) {
        setAttachments((a) => a.filter((x) => !temp.includes(x)));
        app.toast('error', (err as Error).message);
      }
    },
    [projectId, app],
  );

  const ui = (): {
    openFile?: string;
    selection?: { text: string; startLine: number; endLine: number };
    dataset?: string;
    browserUrl?: string;
  } => {
    const code = useCode.getState();
    const b = useBrowser.getState();
    const openFile =
      app.view === 'code' ? ((code.focusSplit ? code.split : code.active) ?? undefined) : undefined;
    return {
      openFile,
      selection: openFile && code.selection?.text ? code.selection : undefined,
      browserUrl: app.view === 'browser' && b.state?.url ? b.state.url : undefined,
    };
  };

  async function runSlash(raw: string): Promise<boolean> {
    const [cmd, ...rest] = raw.slice(1).trim().split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case 'help':
        app.openPalette('commands');
        return true;
      case 'clear':
        await app.newSession({ role });
        return true;
      case 'model':
        if (arg) await session.patchSession({ model: arg });
        else app.setView('models');
        return true;
      case 'agent':
        if (arg) await session.patchSession({ role: arg });
        else app.setView('agents');
        return true;
      case 'skill': {
        if (!arg) {
          app.setView('skills');
          return true;
        }
        const next = pinned.includes(arg) ? pinned.filter((s) => s !== arg) : [...pinned, arg];
        await session.patchSession({ skills: next });
        app.toast('info', pinned.includes(arg) ? `Skill ${arg} retiré` : `Skill ${arg} épinglé`);
        return true;
      }
      case 'effort':
        if (arg && arg in EFFORT_LABEL) app.setPrefs({ effort: arg as EffortSetting });
        return true;
      case 'plan':
        app.setPrefs({ agentMode: app.prefs.agentMode === 'plan' ? 'chat' : 'plan' });
        return true;
      case 'mission':
        app.setPrefs({ agentMode: app.prefs.agentMode === 'mission' ? 'chat' : 'mission' });
        return true;
      case 'fix': {
        app.setPrefs({ agentMode: 'mission' });
        let sid = session.sessionId;
        if (!sid) sid = await app.newSession();
        if (!sid) return true;
        if (useSession.getState().sessionId !== sid) await useSession.getState().load(sid);
        await useSession.getState().send({
          text: `${FIX_EVERYTHING}${arg ? `\n\nPrécision : ${arg}` : ''}`,
          attachments: [],
          model: model === 'auto' ? undefined : model,
          effort: app.prefs.effort,
          role,
          agentMode: 'mission',
          ui: ui(),
        });
        return true;
      }
      case 'mode': {
        const m = arg === 'auto' ? 'autonomous' : arg;
        if (MODES.includes(m as PermissionMode)) await session.patchSession({ permissionMode: m });
        return true;
      }
      case 'review':
        await session.review(arg || undefined);
        return true;
      case 'compact':
        await session.compact();
        return true;
      case 'cost':
        window.dispatchEvent(new CustomEvent('wb:open-credits'));
        return true;
      case 'init':
        await submit(
          "Analyse ce projet en profondeur (structure, stack, scripts, conventions, points d'entrée, tests) puis écris ou mets à jour PROJECT_CONTEXT.md avec une synthèse utile pour les prochaines tâches. Enregistre aussi les faits durables avec memory.add.",
          [],
        );
        return true;
      case 'memory':
        app.setView('projects');
        return true;
      case 'export':
        window.dispatchEvent(new CustomEvent('wb:export', { detail: arg || 'md' }));
        return true;
      case 'browser':
        app.setView('browser');
        if (arg) window.dispatchEvent(new CustomEvent('wb:browser-navigate', { detail: arg }));
        return true;
      case 'terminal':
        app.setView('terminal');
        return true;
      case 'plugins':
        app.setView('plugins');
        return true;
    }
    return false;
  }

  async function submit(
    value = text,
    extra: string[] = attachments.filter((a) => !a.uploading).map((a) => a.path),
    uiCtx = ui(),
  ) {
    const t = value.trim();
    if (!t || running) return;
    if (attachments.some((a) => a.uploading)) {
      app.toast('info', 'Envoi des fichiers en cours…');
      return;
    }
    if (t.startsWith('/') && !t.includes('\n')) {
      if (await runSlash(t)) {
        setText('');
        return;
      }
    }
    let sessionId = session.sessionId;
    if (!sessionId) sessionId = await app.newSession();
    if (!sessionId) return;
    if (useSession.getState().sessionId !== sessionId) await useSession.getState().load(sessionId);
    // Very long pasted text goes in as a file attachment to keep the prompt readable.
    let body = t;
    const files = [...extra];
    if (t.length > 20_000 && projectId) {
      const saved = await api<{ path: string }>(`/api/projects/${projectId}/paste`, { body: { text: t } });
      files.push(saved.path);
      body = `Voir le texte joint (${basename(saved.path)}).`;
    }
    const ok = await useSession.getState().send({
      text: body,
      attachments: files,
      model: model === 'auto' ? undefined : model,
      effort: app.prefs.effort,
      role,
      agentMode: app.prefs.agentMode,
      ui: uiCtx,
    });
    if (ok) {
      setText('');
      setAttachments([]);
      setMenu(null);
      historyIdx.current = -1;
    }
  }

  // Slash / mention menus
  async function updateMenu(value: string, caret: number) {
    const before = value.slice(0, caret);
    if (/^\/[\w-]*$/.test(before)) {
      const q = before.slice(1);
      const items = SLASH_COMMANDS.filter((c) => c.name.startsWith(q)).map((c) => c.name);
      setMenu(items.length ? { kind: 'slash', query: q, start: 0, items, index: 0 } : null);
      return;
    }
    const m = /(^|\s)@([^\s@]*)$/.exec(before);
    if (m && projectId) {
      const start = before.length - m[2]!.length - 1;
      const files = await projectFiles(projectId).catch(() => []);
      const items = fuzzy(m[2]!, files);
      setMenu(items.length ? { kind: 'mention', query: m[2]!, start, items, index: 0 } : null);
      return;
    }
    setMenu(null);
  }

  function pickMenu(item: string) {
    if (!menu) return;
    if (menu.kind === 'slash') {
      const cmd = SLASH_COMMANDS.find((c) => c.name === item);
      setText(`/${item}${cmd?.args ? ' ' : ''}`);
      setMenu(null);
      if (!cmd?.args) void runSlash(`/${item}`).then((done) => done && setText(''));
    } else {
      const next = `${text.slice(0, menu.start)}@${item} ${text.slice(menu.start + 1 + menu.query.length)}`;
      setText(next);
      setAttachments((a) =>
        a.some((x) => x.path === item)
          ? a
          : [...a, { path: item, kind: 'file', size: 0, name: basename(item) }],
      );
      setMenu(null);
    }
    taRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index + 1) % menu.items.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index - 1 + menu.items.length) % menu.items.length });
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        pickMenu(menu.items[menu.index]!);
        return;
      }
      if (e.key === 'Escape') {
        setMenu(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'Escape' && running) {
      e.preventDefault();
      void session.cancel();
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]!;
      void session.patchSession({ permissionMode: next });
      return;
    }
    if (e.key === 'ArrowUp' && !text) {
      const users = session.order
        .map((id) => session.runs[id]?.items.find((i) => i.kind === 'user'))
        .filter(Boolean) as { text: string }[];
      if (users.length) {
        historyIdx.current = Math.min(users.length - 1, historyIdx.current + 1);
        setText(users[users.length - 1 - historyIdx.current]!.text);
        e.preventDefault();
      }
    }
  }

  const slashInfo = useMemo(() => Object.fromEntries(SLASH_COMMANDS.map((c) => [c.name, c])), []);

  return (
    <div className={cx('relative mx-auto w-full', compact ? 'px-2 pb-2' : 'max-w-[860px] px-5 pb-4')}>
      {menu && (
        <div className="wb-in absolute bottom-full left-5 right-5 z-30 mb-1 max-h-72 overflow-auto rounded-xl border border-line bg-elev p-1 shadow-pop">
          {menu.items.map((it, i) => (
            <button
              key={it}
              onMouseDown={(e) => {
                e.preventDefault();
                pickMenu(it);
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]',
                i === menu.index && 'bg-hover',
              )}
            >
              {menu.kind === 'slash' ? (
                <>
                  <span className="font-mono text-accent">/{it}</span>
                  {slashInfo[it]?.args && (
                    <span className="font-mono text-[11.5px] text-faint">{slashInfo[it]!.args}</span>
                  )}
                  <span className="ml-auto text-[12px] text-muted">{slashInfo[it]?.description}</span>
                </>
              ) : (
                <span className="truncate font-mono text-[12.5px]">{it}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div
        className={cx(
          'rounded-2xl border bg-input shadow-sm transition-colors',
          dragging ? 'border-accent' : 'border-line focus-within:border-line-strong',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload([...e.dataTransfer.files]);
        }}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {attachments.map((a) => (
              <span
                key={a.path}
                className="inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-[12px]"
              >
                {a.uploading ? (
                  <Loader2 size={12} className="wb-spin" />
                ) : a.kind === 'image' ? (
                  <ImageIcon size={12} className="text-info" />
                ) : (
                  <FileText size={12} className="text-muted" />
                )}
                <span className="truncate">{a.name}</span>
                <button
                  aria-label="Retirer"
                  className="text-faint hover:text-err"
                  onClick={() => setAttachments((x) => x.filter((y) => y.path !== a.path))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          autoFocus={autoFocus}
          rows={compact ? 2 : 2}
          value={text}
          placeholder={
            running
              ? 'L’agent travaille… (Échap pour interrompre)'
              : 'Demandez à l’agent…  / commandes · @ fichiers · glissez vos fichiers, photos, documents'
          }
          onChange={(e) => {
            setText(e.target.value);
            void updateMenu(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
          className="block max-h-[40vh] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[14px] leading-[1.55] outline-none placeholder:text-faint"
        />
        <div className="flex flex-wrap items-center gap-0.5 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) =>
              void upload([...(e.target.files ?? [])]).then(() => e.target && (e.target.value = ''))
            }
          />
          <Chip
            title="Joindre des fichiers, photos, documents (ou glisser-déposer / coller)"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={14} />
          </Chip>
          <AgentPicker
            value={role}
            agents={app.agents}
            onChange={(id) => void session.patchSession({ role: id })}
          />
          {!compact && (
            <SkillsPicker
              selected={pinned}
              skills={app.skills}
              onToggle={(name) =>
                void session.patchSession({
                  skills: pinned.includes(name) ? pinned.filter((s) => s !== name) : [...pinned, name],
                })
              }
            />
          )}
          <Chip
            title="Mode Plan : l'agent propose un plan à valider avant d'agir"
            active={app.prefs.agentMode === 'plan'}
            onClick={() => app.setPrefs({ agentMode: app.prefs.agentMode === 'plan' ? 'chat' : 'plan' })}
          >
            <ListChecks size={14} /> Plan
          </Chip>
          <Chip
            title="Mode Mission : l'agent travaille en autonomie (analyse → plan → exécution → test → review → correction → validation → livraison) jusqu'à un résultat vérifié, avec verdict PASSED / PARTIAL / FAILED"
            active={app.prefs.agentMode === 'mission'}
            onClick={() =>
              app.setPrefs({ agentMode: app.prefs.agentMode === 'mission' ? 'chat' : 'mission' })
            }
          >
            <Rocket size={14} /> Mission
          </Chip>
          <ModePicker value={mode} onChange={(m) => void session.patchSession({ permissionMode: m })} />
          <div className="ml-auto flex items-center gap-0.5">
            {estimate?.perStep !== null && estimate && text.trim() && (
              <span
                className="hidden px-1 text-[11.5px] text-faint sm:inline"
                title={`Estimation (prix publiés par OpenRouter) pour ${estimate.model} — ${estimate.reason}. Une tâche agent fait souvent plusieurs étapes ; le cache de prompt réduit le coût réel.`}
              >
                ≈ {fmtCost(estimate.perStep)}/étape
                {model === 'auto' ? ` · ${shortModel(estimate.model)}` : ''}
              </span>
            )}
            <ModelPicker
              value={model}
              models={app.models}
              onChange={(id) => void session.patchSession({ model: id })}
            />
            {!compact && (
              <EffortPicker
                value={app.prefs.effort}
                model={modelInfo}
                onChange={(effort) => app.setPrefs({ effort })}
              />
            )}
            {running ? (
              <button
                onClick={() => void session.cancel()}
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg hover:opacity-85"
                aria-label="Interrompre (Échap)"
                title="Interrompre (Échap)"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={!text.trim()}
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg transition disabled:opacity-35"
                aria-label="Envoyer (Entrée)"
                title="Envoyer (Entrée)"
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>
      {!compact && (
        <div className="mt-1.5 flex justify-between px-1 text-[11px] text-faint">
          <span>
            <Kbd>Entrée</Kbd> envoyer · <Kbd>Maj+Entrée</Kbd> nouvelle ligne · <Kbd>Maj+Tab</Kbd> mode ·{' '}
            <Kbd>Ctrl+K</Kbd> commandes
          </span>
          {pinned.length > 0 && <span className="truncate">Skills épinglés : {pinned.join(', ')}</span>}
        </div>
      )}
    </div>
  );
}
