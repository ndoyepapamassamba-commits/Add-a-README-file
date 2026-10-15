// FOURNISSEURS & COÛTS — coffre-fort de clés chiffré (mot de passe maître), routeur universel (Anthropic, OpenAI,
// Gemini, Mistral, Groq, DeepSeek, Ollama, LM Studio), tableau de bord financier et télémétrie (TTFT, tokens / s).
import { useEffect, useState } from 'react';
import { PROVIDERS, PROVIDER_IDS, noKeyNeeded, type ProviderId } from '../../server/llm/universal';
import {
  directChat,
  localBase,
  refreshProviderModels,
  setLocalBase,
  telemetry,
  vault,
  directModelIds,
} from '../lib/providers';
import { loadCatalog } from '../lib/llm';
import { useStore } from '../lib/store';

const btn =
  'rounded-lg border border-line bg-elev px-3 py-1.5 text-[12.5px] hover:bg-hover disabled:opacity-50';
const btnMain =
  'rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg disabled:opacity-50';
const usd = (v: number) => (v === 0 ? '0 $' : v < 0.01 ? `${v.toFixed(5)} $` : `${v.toFixed(3)} $`);
const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`);

function useTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => telemetry.subscribe(() => setN((x) => x + 1)), []);
  return n;
}

function Vault({ onChange }: { onChange: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [prov, setProv] = useState<ProviderId>('anthropic');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [, force] = useState(0);
  const refresh = () => (force((x) => x + 1), onChange());
  if (!vault.unlocked)
    return (
      <section data-testid="vault-locked" className="rounded-xl border border-line p-4">
        <h2 className="mb-1 text-[13.5px] font-semibold">Coffre-fort de clés</h2>
        <p className="mb-3 text-[12.5px] text-muted">
          {vault.exists
            ? 'Saisissez votre mot de passe maître pour ouvrir le coffre.'
            : 'Choisissez un mot de passe maître (8 caractères minimum) : vos clés seront chiffrées (AES-256-GCM, clé dérivée PBKDF2-SHA-256, 310 000 itérations) avant d’être stockées dans ce navigateur. Le mot de passe n’est jamais enregistré : s’il est perdu, les clés aussi.'}
        </p>
        <div className="flex gap-2">
          <input
            data-testid="vault-password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="mot de passe maître"
            className="w-72 rounded-lg border border-line bg-elev px-2 py-1.5 text-[12.5px]"
          />
          <button
            data-testid="vault-unlock"
            className={btnMain}
            onClick={async () => {
              try {
                const ok = await vault.unlock(pw);
                setMsg(ok ? '' : 'Mot de passe incorrect.');
                setPw('');
                if (ok) refresh();
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            {vault.exists ? 'Ouvrir' : 'Créer le coffre'}
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] text-red-400">{msg}</p>}
      </section>
    );
  const keys = vault.list();
  return (
    <section data-testid="vault" className="rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[13.5px] font-semibold">Coffre-fort de clés (ouvert)</h2>
        <span className="text-[12px] text-muted">
          clés affichées masquées · rotation automatique : la clé utilisée il y a le plus longtemps d’abord ;
          une clé limitée (429) se repose, une clé refusée (401/403) est écartée
        </span>
        <div className="flex-1" />
        <button className={btn} onClick={() => (vault.lock(), refresh())}>
          Verrouiller
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          data-testid="vault-provider"
          value={prov}
          onChange={(e) => setProv(e.target.value as ProviderId)}
          className={btn}
        >
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].label}
            </option>
          ))}
        </select>
        {!noKeyNeeded(prov) && (
          <input
            data-testid="vault-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={PROVIDERS[prov].keyHint}
            className="w-72 rounded-lg border border-line bg-elev px-2 py-1.5 text-[12.5px]"
          />
        )}
        {PROVIDERS[prov].local && PROVIDERS[prov].kind !== 'browser' && (
          <input
            value={localBase(prov) ?? PROVIDERS[prov].base}
            onChange={(e) => (setLocalBase(prov, e.target.value), refresh())}
            className="w-72 rounded-lg border border-line bg-elev px-2 py-1.5 text-[12.5px]"
          />
        )}
        {!noKeyNeeded(prov) && (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="libellé (facultatif)"
            className="w-40 rounded-lg border border-line bg-elev px-2 py-1.5 text-[12.5px]"
          />
        )}
        {PROVIDERS[prov].keyless && (
          <span className="self-center text-[12px] text-ok">Gratuit, sans clé : rien à saisir.</span>
        )}
        {!noKeyNeeded(prov) && (
          <button
            data-testid="vault-add"
            className={btnMain}
            disabled={!key.trim()}
            onClick={async () => {
              await vault.add(prov, key, label);
              setKey('');
              setLabel('');
              refresh();
            }}
          >
            Ajouter la clé
          </button>
        )}
        <button
          data-testid="vault-models"
          className={btn}
          disabled={!!busy}
          onClick={async () => {
            setBusy('modèles');
            try {
              const ids = await refreshProviderModels(prov);
              useStore.setState({ models: await loadCatalog() });
              setMsg(
                `${ids.length} modèle(s) ${PROVIDERS[prov].label} ajoutés aux sélecteurs (identifiant « ${prov}:… »).`,
              );
            } catch (e) {
              setMsg(
                `${PROVIDERS[prov].label} : ${(e as Error).message}${PROVIDERS[prov].local ? ' — serveur local démarré ? Pour Ollama, autorisez l’origine (OLLAMA_ORIGINS=*).' : ''}`,
              );
            }
            setBusy('');
          }}
        >
          Charger les modèles
        </button>
        <button
          data-testid="vault-test"
          className={btn}
          disabled={!!busy || !directModelIds()[prov]?.length}
          onClick={async () => {
            setBusy('test');
            const m = directModelIds()[prov]![0]!;
            try {
              const r = await directChat(
                {
                  model: `${prov}:${m}`,
                  messages: [{ role: 'user', content: 'Réponds seulement : OK' }],
                  maxTokens: 16,
                },
                {},
                'test',
              );
              setMsg(
                `Test ${prov}:${m} → « ${r.content.trim().slice(0, 40)} » · coût ${r.costKnown ? usd(r.cost) : 'inconnu (prix non publié)'}`,
              );
            } catch (e) {
              setMsg(`Test ${prov}:${m} : ${(e as Error).message}`);
            }
            setBusy('');
            refresh();
          }}
        >
          Tester un appel
        </button>
      </div>
      {msg && (
        <p data-testid="vault-msg" className="mb-2 text-[12px]">
          {msg}
        </p>
      )}
      <table className="w-full text-[12px]">
        <thead className="text-left text-muted">
          <tr>
            <th>Fournisseur</th>
            <th>Libellé</th>
            <th>Clé</th>
            <th>Appels</th>
            <th>Tokens</th>
            <th>Coût</th>
            <th>Quota restant (fournisseur)</th>
            <th>État</th>
            <th />
          </tr>
        </thead>
        <tbody data-testid="vault-keys">
          {keys.map((k) => (
            <tr key={k.id} className="border-t border-line">
              <td>{k.provider in PROVIDERS ? PROVIDERS[k.provider as ProviderId].label : k.provider}</td>
              <td>{k.label}</td>
              <td className="font-mono">{k.masked}</td>
              <td>{k.usage.calls}</td>
              <td>
                {k.usage.tokensIn} / {k.usage.tokensOut}
              </td>
              <td>{usd(k.usage.costUsd)}</td>
              <td>
                {k.usage.remainingRequests ?? '—'} req · {k.usage.remainingTokens ?? '—'} tok
              </td>
              <td>
                {k.usage.refused
                  ? '✗ refusée'
                  : k.usage.restUntil > Date.now()
                    ? `au repos (${Math.ceil((k.usage.restUntil - Date.now()) / 1000)} s)`
                    : '✓ active'}
              </td>
              <td className="space-x-1">
                {(k.usage.refused || k.usage.restUntil > Date.now()) && (
                  <button className={btn} onClick={() => (vault.reset(k.id), refresh())}>
                    Réactiver
                  </button>
                )}
                <button className={btn} onClick={async () => (await vault.remove(k.id), refresh())}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {!keys.length && (
            <tr>
              <td colSpan={9} className="py-2 text-muted">
                Aucune clé : ajoutez-en une ci-dessus (OpenRouter reste configuré dans Paramètres).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Finance() {
  useTick();
  const [range, setRange] = useState<'24h' | '7j' | 'tout'>('7j');
  const since = range === '24h' ? Date.now() - 864e5 : range === '7j' ? Date.now() - 7 * 864e5 : 0;
  const tot = telemetry.totals(since);
  const rows = telemetry.byModel(since);
  const days = telemetry.byDay(since);
  const recent = telemetry.all(since).slice(-60);
  const maxDay = Math.max(1e-9, ...days.map((d) => d.costUsd));
  const maxT = Math.max(1, ...recent.map((c) => c.ttftMs ?? 0));
  return (
    <section data-testid="finance" className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13.5px] font-semibold">Tableau de bord financier & télémétrie</h2>
        <div className="flex-1" />
        {(['24h', '7j', 'tout'] as const).map((r) => (
          <button key={r} onClick={() => setRange(r)} className={r === range ? btnMain : btn}>
            {r}
          </button>
        ))}
        <button className={btn} onClick={() => telemetry.clear()}>
          Effacer
        </button>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {[
          ['Dépense', usd(tot.costUsd)],
          ['Appels', String(tot.calls)],
          ['Coût inconnu', `${tot.unknownCost} appel(s)`],
          ['Génération 3D', usd((tot.purposes['3d-generation'] ?? 0) + (tot.purposes['3d-fix'] ?? 0))],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line p-2">
            <div className="text-[11px] text-muted">{k}</div>
            <div data-testid={`finance-${k}`} className="text-[16px] font-semibold">
              {v}
            </div>
          </div>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[12px] text-muted">Dépense par jour</div>
          <div className="flex h-24 items-end gap-1 border-b border-line">
            {days.map((d) => (
              <div
                key={d.day}
                title={`${d.day} : ${usd(d.costUsd)} · ${d.calls} appels`}
                className="flex-1 rounded-t bg-accent"
                style={{ height: `${Math.max(2, (d.costUsd / maxDay) * 100)}%` }}
              />
            ))}
            {!days.length && <span className="text-[12px] text-muted">aucun appel</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">TTFT des 60 derniers appels (rouge = erreur)</div>
          <div className="flex h-24 items-end gap-[2px] border-b border-line">
            {recent.map((c, i) => (
              <div
                key={i}
                title={`${c.provider}:${c.model} · TTFT ${ms(c.ttftMs)} · ${c.tokensPerS ?? '—'} tok/s`}
                className={c.ok ? 'flex-1 bg-emerald-500/70' : 'flex-1 bg-red-500/80'}
                style={{ height: `${c.ok ? Math.max(3, ((c.ttftMs ?? 0) / maxT) * 100) : 100}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      <table data-testid="finance-models" className="w-full text-[12px]">
        <thead className="text-left text-muted">
          <tr>
            <th>Fournisseur</th>
            <th>Modèle</th>
            <th>Appels</th>
            <th>Erreurs</th>
            <th>Tokens entrée / sortie</th>
            <th>Coût</th>
            <th>TTFT médian / p95</th>
            <th>Vitesse médiane</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td>{r.provider}</td>
              <td className="font-mono">{r.model}</td>
              <td>{r.calls}</td>
              <td>{r.errors}</td>
              <td>
                {r.tokensIn} / {r.tokensOut}
              </td>
              <td>
                {usd(r.costUsd)}
                {r.unknownCost ? ` + ${r.unknownCost} inconnu(s)` : ''}
              </td>
              <td>
                {ms(r.ttftP50)} / {ms(r.ttftP95)}
              </td>
              <td>{r.tpsMedian === null ? '—' : `${r.tpsMedian} tok/s`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11.5px] text-muted">
        Coûts : mesurés par OpenRouter quand il les renvoie, sinon calculés avec le prix public du même modèle
        (catalogue OpenRouter). Sans prix connu, le coût est compté « inconnu » — jamais 0 $. TTFT = temps
        jusqu’au premier token ; vitesse = tokens générés / durée de génération.
      </p>
    </section>
  );
}

export function ProvidersView() {
  const [, force] = useState(0);
  return (
    <div data-testid="providers" className="h-full space-y-3 overflow-auto p-4">
      <h1 className="text-[15px] font-semibold">Fournisseurs & coûts</h1>
      <Vault onChange={() => force((x) => x + 1)} />
      <Finance />
    </div>
  );
}
