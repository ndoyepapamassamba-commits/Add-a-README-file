// Réglages › HARNESS (23/10/2026) : what turns the Workbench into a complete agent harness — skills of the session,
// free output formats, instruction files, permission rules, hooks (or the Claude Code settings.json imported as is),
// and the local bridge that brings REA and the user's own computer to the agent.
import { useEffect, useMemo, useState } from 'react';
import { Plug, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Field, Input, Select, Textarea, Toggle } from '../../web/components/ui';
import {
  harnessOf,
  HOOK_EVENTS,
  importClaudeSettings,
  type HookAction,
  type HookDef,
  type HookEvent,
} from '../lib/harness';
import { connect, disconnect, mcpState, onMcpChange } from '../lib/mcp';
import { installSkillPack, loadSkillPack } from '../lib/skillPack';
import { useStore } from '../lib/store';
import type { McpServerDef } from '../lib/types';

const ACTIONS: { value: HookAction; label: string }[] = [
  { value: 'deny', label: 'Refuser' },
  { value: 'ask', label: 'Demander' },
  { value: 'allow', label: 'Autoriser' },
  { value: 'context', label: 'Ajouter un contexte' },
  { value: 'js', label: 'JavaScript (bac à sable)' },
  { value: 'shell', label: 'Commande (pont local)' },
];
const lines = (t: string) =>
  t
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export function HarnessSettings() {
  const settings = useStore((s) => s.settings);
  const skills = useStore((s) => s.skills);
  const agents = useStore((s) => s.agents);
  const mcp = useStore((s) => s.mcp);
  const h = harnessOf(settings.harness);
  const save = (p: Partial<typeof h>) => useStore.getState().patchSettings({ harness: { ...h, ...p } });
  const [rules, setRules] = useState({
    allow: h.permissions.allow.join('\n'),
    ask: h.permissions.ask.join('\n'),
    deny: h.permissions.deny.join('\n'),
  });
  const [always, setAlways] = useState(h.alwaysSkills.join(', '));
  const [draft, setDraft] = useState<HookDef>({ id: '', event: 'PreToolUse', action: 'deny', enabled: true });
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState('');
  const [port, setPort] = useState('7821');
  const [busy, setBusy] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onMcpChange(() => tick((n) => n + 1));
    return () => {
      off();
    };
  }, []);
  const bridge = useMemo(() => mcp.filter((m) => m.name === 'rea' || m.name === 'poste'), [mcp]);

  const pair = async () => {
    const base = `http://127.0.0.1:${Number(port) || 7821}`;
    const headers = { Authorization: `Bearer ${pairing.trim()}` };
    const defs: McpServerDef[] = [
      {
        name: 'rea',
        url: `${base}/rea`,
        headers,
        enabled: true,
        autoApprove: true,
        description:
          'REA sur votre ordinateur (pont local) : démontage d’apps, paquets, binaires, WASM, SQLite, captures.',
      },
      {
        name: 'poste',
        url: `${base}/poste`,
        headers,
        enabled: true,
        autoApprove: false,
        description:
          'Votre ordinateur (pont local) : shell réel et fichiers du dossier choisi — chaque action vous est demandée.',
      },
    ];
    useStore.getState().setMcp([...mcp.filter((m) => m.name !== 'rea' && m.name !== 'poste'), ...defs]);
    setBusy('connexion…');
    for (const d of defs) {
      await disconnect(d.name);
      await connect(d);
    }
    setBusy('');
    const ok = defs.every((d) => mcpState(d.name).status === 'connected');
    useStore
      .getState()
      .toast(
        ok ? 'ok' : 'err',
        ok
          ? 'Pont local connecté : REA et votre ordinateur sont disponibles pour l’agent.'
          : `Pont local injoignable : ${mcpState('poste').error ?? mcpState('rea').error ?? 'vérifiez qu’il tourne et le code'}`,
      );
  };

  return (
    <div className="space-y-4 rounded-xl border border-line bg-panel p-4" data-testid="harness-settings">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge>{skills.length} compétences</Badge>
        <Badge>{skills.filter((s) => s.enabled).length} actives</Badge>
        <Badge>{h.commands.length} commandes</Badge>
        <Badge>{agents.length} agents importés</Badge>
        <span className="text-faint">paquet {h.packVersion ?? 'non installé'}</span>
        <Button
          size="sm"
          variant="ghost"
          data-testid="harness-pack-reload"
          onClick={async () => {
            setBusy('paquet…');
            const parts = await loadSkillPack();
            const r = parts ? await installSkillPack(parts, true) : null;
            setBusy('');
            useStore
              .getState()
              .toast(
                r ? 'ok' : 'err',
                r
                  ? `${r.skills} compétences (${r.added} nouvelles), ${r.commands} commandes, ${r.agents} agents installés.`
                  : 'massamba-skills.js introuvable à côté de l’application.',
              );
          }}
        >
          Recharger le paquet de compétences
        </Button>
        {busy && <span className="text-faint">{busy}</span>}
      </div>

      <Field
        label="Formats de sortie"
        hint="Libres : l’agent livre dans le format demandé (md, csv, json, html, svg, png, pdf, docx, xlsx, pptx, py, zip…). Les exporteurs maison restent disponibles, jamais imposés."
      >
        <Toggle
          checked={settings.designPicker !== false}
          onChange={(v) => useStore.getState().patchSettings({ designPicker: v })}
          label="Proposer la galerie de design avant un livrable Office (choix de couleurs, sans format imposé)"
        />
      </Field>

      <Field
        label="Compétences toujours actives"
        hint="Injectées à chaque requête (noms séparés par des virgules). Par défaut : REA d’abord."
      >
        <div className="flex gap-2">
          <Input
            value={always}
            onChange={(e) => setAlways(e.target.value)}
            list="harness-skill-names"
            data-testid="harness-always"
          />
          <Button
            size="sm"
            onClick={() =>
              save({
                alwaysSkills: always
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          >
            Enregistrer
          </Button>
        </div>
        <datalist id="harness-skill-names">
          {skills.map((s) => (
            <option key={s.name} value={s.name} />
          ))}
        </datalist>
      </Field>

      <Toggle
        checked={h.instructions}
        onChange={(v) => save({ instructions: v })}
        label="Lire MASSAMBA.md, CLAUDE.md et AGENTS.md de l’espace de travail à chaque tour"
      />

      <Field
        label="Règles de permission"
        hint="Une règle par ligne, syntaxe Claude Code : Bash(git *), filesystem.write(outputs/**), Read(.env), mcp__rea… Ordre : refuser > demander > autoriser, avant le mode."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(['deny', 'ask', 'allow'] as const).map((k) => (
            <div key={k}>
              <div className="mb-1 text-[11.5px] font-medium text-muted">
                {k === 'deny' ? 'Refuser' : k === 'ask' ? 'Demander' : 'Autoriser'}
              </div>
              <Textarea
                rows={4}
                value={rules[k]}
                onChange={(e) => setRules({ ...rules, [k]: e.target.value })}
                data-testid={`harness-rules-${k}`}
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-2"
          data-testid="harness-rules-save"
          onClick={() =>
            save({
              permissions: { allow: lines(rules.allow), ask: lines(rules.ask), deny: lines(rules.deny) },
            })
          }
        >
          Enregistrer les règles
        </Button>
      </Field>

      <Field
        label="Hooks"
        hint="Avant / après chaque outil, à chaque requête, au début d’une session, à la fin d’un tour. JavaScript : reçoit input, retourne { decision, reason, context, args }. Commande : lancée par le pont local (sortie 2 = refus, comme Claude Code)."
      >
        <div className="space-y-1.5" data-testid="harness-hooks">
          {h.hooks.map((x) => (
            <div
              key={x.id}
              className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-[12.5px]"
            >
              <Toggle
                checked={x.enabled}
                onChange={(v) =>
                  save({ hooks: h.hooks.map((y) => (y.id === x.id ? { ...y, enabled: v } : y)) })
                }
              />
              <span className="font-mono text-accent">{x.event}</span>
              {x.matcher && <span className="font-mono text-muted">[{x.matcher}]</span>}
              <span>→ {ACTIONS.find((a) => a.value === x.action)?.label}</span>
              <span className="min-w-0 flex-1 truncate text-faint">
                {x.message ?? x.command ?? x.code ?? ''}
              </span>
              <button
                aria-label="Supprimer le hook"
                onClick={() => save({ hooks: h.hooks.filter((y) => y.id !== x.id) })}
                className="text-faint hover:text-err"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Select
            value={draft.event}
            onChange={(v) => setDraft({ ...draft, event: v as HookEvent })}
            options={HOOK_EVENTS.map((e) => ({ value: e, label: e }))}
          />
          <Input
            placeholder="Outil (ex. Write|Edit, terminal.execute)"
            value={draft.matcher ?? ''}
            onChange={(e) => setDraft({ ...draft, matcher: e.target.value })}
            data-testid="hook-matcher"
          />
          <Input
            placeholder="Si les arguments contiennent (regex)"
            value={draft.when ?? ''}
            onChange={(e) => setDraft({ ...draft, when: e.target.value })}
            data-testid="hook-when"
          />
          <Select
            value={draft.action}
            onChange={(v) => setDraft({ ...draft, action: v as HookAction })}
            options={ACTIONS}
          />
        </div>
        <Textarea
          rows={2}
          className="mt-2"
          placeholder={
            draft.action === 'js'
              ? 'return input.args.path?.endsWith(".env") ? { decision: "deny", reason: "pas de .env" } : null;'
              : draft.action === 'shell'
                ? './verifier.sh'
                : 'Message (motif ou contexte ajouté)'
          }
          value={code}
          onChange={(e) => setCode(e.target.value)}
          data-testid="hook-body"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            data-testid="hook-add"
            onClick={() => {
              const hook: HookDef = {
                ...draft,
                id: `hook-${Date.now().toString(36)}`,
                matcher: draft.matcher?.trim() || undefined,
                when: draft.when?.trim() || undefined,
                ...(draft.action === 'js'
                  ? { code }
                  : draft.action === 'shell'
                    ? { command: code }
                    : { message: code }),
              };
              save({ hooks: [...h.hooks, hook] });
              setCode('');
            }}
          >
            Ajouter le hook
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12.5px] hover:bg-hover">
            <Upload size={13} /> Importer le settings.json de Claude Code
            <input
              type="file"
              accept=".json,application/json"
              hidden
              data-testid="harness-import"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const r = importClaudeSettings(JSON.parse(await f.text()));
                  save({
                    hooks: [...h.hooks, ...r.hooks],
                    permissions: {
                      allow: [...new Set([...h.permissions.allow, ...r.permissions.allow])],
                      ask: [...new Set([...h.permissions.ask, ...r.permissions.ask])],
                      deny: [...new Set([...h.permissions.deny, ...r.permissions.deny])],
                    },
                  });
                  setRules({
                    allow: [...new Set([...h.permissions.allow, ...r.permissions.allow])].join('\n'),
                    ask: [...new Set([...h.permissions.ask, ...r.permissions.ask])].join('\n'),
                    deny: [...new Set([...h.permissions.deny, ...r.permissions.deny])].join('\n'),
                  });
                  useStore
                    .getState()
                    .toast(
                      'ok',
                      `${r.hooks.length} hook(s) et ${r.permissions.allow.length + r.permissions.ask.length + r.permissions.deny.length} règle(s) importés.`,
                    );
                } catch (err) {
                  useStore.getState().toast('err', `settings.json illisible : ${(err as Error).message}`);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </Field>

      <Field
        label="Pont local — REA et votre ordinateur"
        hint="Dans un terminal, dans le dossier de travail : node massamba-pont.mjs (livré avec l’application ; Node 22.19+ pour REA). Collez ici le code affiché. Il n’écoute que sur cet ordinateur."
      >
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-[220px]"
            type="password"
            placeholder="Code d’appairage"
            value={pairing}
            onChange={(e) => setPairing(e.target.value)}
            data-testid="bridge-code"
          />
          <Input
            className="max-w-[90px]"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            data-testid="bridge-port"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!pairing.trim()}
            onClick={() => void pair()}
            data-testid="bridge-connect"
          >
            <Plug size={13} /> Connecter
          </Button>
        </div>
        <div className="mt-2 space-y-1 text-[12.5px]" data-testid="bridge-status">
          {bridge.length === 0 && <div className="text-faint">Pas encore appairé.</div>}
          {bridge.map((m) => (
            <div key={m.name}>
              <span className="font-mono">{m.name}</span> — {mcpState(m.name).status}
              {mcpState(m.name).tools.length ? ` · ${mcpState(m.name).tools.length} outils` : ''}
              {mcpState(m.name).error ? <span className="text-err"> · {mcpState(m.name).error}</span> : null}
            </div>
          ))}
        </div>
      </Field>
    </div>
  );
}
