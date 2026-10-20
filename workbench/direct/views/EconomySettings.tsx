// Réglages « Économie JEV ÷100 » (v64) : le modèle payant ultra puissant ne fait plus le travail entier — les modèles
// gratuits écrivent, il vérifie et corrige par patchs. Les chiffres affichés sont MESURÉS sur cet appareil : prix
// standard (requête brute au tarif public, sans cache) contre prix réellement facturé.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Coins, Trash2 } from 'lucide-react';
import { Button, Field, Select, Toggle } from '../../web/components/ui';
import {
  clearEconomyNote,
  economyOptions,
  economyState,
  onEconomyChange,
  resetEconomyLedger,
  setEconomyOptions,
} from '../lib/economy';
import { useStore } from '../lib/store';
import {
  ecoStats,
  effectiveSavingsRate,
  factorLabel,
  isPremium,
  rulerPosition,
  wilsonLower,
  type EcoPath,
  type EcoStats,
} from '../../server/jev/economy';
import { isAnonFree } from '../../server/llm/freeRoute';

const PATH_LABEL: Record<EcoPath, string> = {
  free: 'Brouillon gratuit servi (famille fiable)',
  'free-tools': 'Étape d’outils écrite par un modèle gratuit',
  'free-verified': 'Brouillon gratuit validé par le modèle payant',
  'free-patched': 'Brouillon gratuit corrigé par patchs',
  'free-crosschecked': 'Relu par un second modèle gratuit',
  'premium-redo': 'Brouillon refusé → réponse du modèle payant',
  'premium-direct': 'Sans brouillon possible (données, images…)',
};
const usd = (n: number) => {
  const d = n < 0.01 ? 5 : 3;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} $`;
};
const pct = (r: number) => `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
/** Ce qu'il reste à diviser pour atteindre ÷100 (ex. « ÷1,1 »). */
const factorGap = (s: Pick<EcoStats, 'standardUsd' | 'paidUsd'>) =>
  `÷${((100 * s.paidUsd) / s.standardUsd).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`;
/** Zones du bullet chart, nommées par leur sens (jamais par la seule couleur). */
const ZONES = [
  { name: 'faible', range: '< ÷10', cls: 'bg-err/20' },
  { name: 'bon', range: '÷10 à ÷100', cls: 'bg-warn/25' },
  { name: 'objectif', range: '≥ ÷100', cls: 'bg-ok/30' },
];

export function EconomySettings() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onEconomyChange(rerender), []);
  const [state, setState] = useState<Awaited<ReturnType<typeof economyState>> | null>(null);
  useEffect(() => {
    void economyState().then(setState);
    return onEconomyChange(() => void economyState().then(setState));
  }, []);
  const o = economyOptions();
  const models = useStore((s) => s.models);
  const defaultModel = useStore((s) => s.settings.defaultModel);
  const premium = useMemo(
    () =>
      models
        .filter(
          (m) => isPremium(m) && !isAnonFree(m.id) && m.capabilities.tools && !/:batch$|image/.test(m.id),
        )
        .sort((a, b) => (b.outputPrice ?? 0) - (a.outputPrice ?? 0)),
    [models],
  );
  const paid = state ? state.ledger.filter((e) => e.premium !== '—') : [];
  const s = ecoStats(paid);
  const pos = rulerPosition(s);
  const esr = effectiveSavingsRate(s);
  const zoneName = ZONES[pos === null ? 0 : Math.min(2, Math.floor(pos * 3 + 1e-9))]?.name ?? 'faible';
  const cross = state ? state.ledger.filter((e) => e.path === 'free-crosschecked').length : 0;

  return (
    <div
      className="grid gap-x-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2"
      data-testid="economy-panel"
    >
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium sm:col-span-2">
        <Coins size={15} className="text-accent" /> Économie JEV ÷100 : le modèle payant vérifie au lieu
        d’écrire
      </div>
      <Field
        label="Activer l’économie ÷100"
        hint="Les gros modèles gratuits (OpenRouter avec votre clé : Nemotron 3 Ultra 550B, Super 120B… ; sinon les services sans clé) écrivent le brouillon, nourris par JEV. Le modèle payant choisi ne fait que valider ou corriger par patchs — quelques dizaines de jetons — et ne réécrit tout que si le brouillon est faux. Vos données (fichiers, résultats d’analyse) ne vont jamais vers un modèle gratuit sans votre accord : ces demandes passent directement par le modèle payant."
      >
        <span data-testid="economy-toggle">
          <Toggle checked={o.enabled} onChange={(v) => setEconomyOptions({ enabled: v })} />
        </span>
      </Field>
      <Field
        label="Modèle payant ultra puissant"
        hint="Devient le modèle par défaut du chat. Il est appelé comme vérificateur (sans outils ni historique) et pour les réponses refusées."
      >
        <Select<string>
          value={defaultModel}
          onChange={(v) => useStore.getState().patchSettings({ defaultModel: v })}
          options={[
            { value: 'auto', label: 'Auto (routeur de l’app)' },
            ...premium.slice(0, 40).map((m) => ({
              value: m.id,
              label: `${m.name} — ${m.inputPrice} $ / ${m.outputPrice} $ par M jetons`,
            })),
          ]}
        />
      </Field>
      <Field
        label="Vérification"
        hint="Intelligente : une famille de demandes dont les brouillons ont été validés au moins 8 fois (borne basse ≥ 80 %) n’est plus vérifiée qu’une fois sur 5 ; les sujets à risque (chiffres, réglementation, décision, contrat, santé) le sont toujours."
      >
        <Select<'smart' | 'always'>
          value={o.verify}
          onChange={(v) => setEconomyOptions({ verify: v })}
          options={[
            { value: 'smart', label: 'Intelligente (confiance apprise + sondage)' },
            { value: 'always', label: 'Toujours (chaque réponse finale)' },
          ]}
        />
      </Field>
      <Field
        label="Sans modèle payant : contre-vérification gratuite"
        hint="Sans clé, un second modèle gratuit d’une autre famille relit la réponse du premier et JEV applique ses corrections (0 $, mais consomme les quotas gratuits)."
      >
        <Toggle checked={o.crossCheck} onChange={(v) => setEconomyOptions({ crossCheck: v })} />
      </Field>

      <div
        className="mb-2 rounded-lg border border-line bg-elev p-3 text-[12px] text-muted sm:col-span-2"
        data-testid="economy-stats"
      >
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
          <b className="text-fg">Mesuré sur cet appareil</b>
          <span>
            Facteur :{' '}
            <b className="text-[15px] text-accent" data-testid="economy-factor">
              {factorLabel(s)}
            </b>{' '}
            (objectif ÷100)
          </span>
          <span>
            {s.n} demande(s) au modèle payant · prix standard {usd(s.standardUsd)} · payé {usd(s.paidUsd)} ·{' '}
            {Math.round(s.freeShare * 100)} % à 0 $
          </span>
          {cross > 0 && <span>· {cross} réponse(s) gratuite(s) contre-vérifiée(s)</span>}
        </div>
        {s.n > 0 && pos !== null && (
          <div className="my-2" data-testid="economy-bars" data-pos={pos.toFixed(3)}>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-[12.5px] text-fg">
              <span>
                Par réponse : <b>{usd(s.paidUsd / s.n)}</b> payés au lieu de {usd(s.standardUsd / s.n)}
              </span>
              {esr !== null && (
                <span title="Taux d’économie effectif (ESR, FinOps Foundation) : part du prix standard qui n’a pas été payée.">
                  Économie effective : <b data-testid="economy-esr">{pct(esr)}</b>
                </span>
              )}
            </div>
            {/* Règle par décades (échelle log) façon bullet chart : bandes qualitatives en fond, mesure en barre fine et
                contrastée, objectif ÷100 en trait. Une barre linéaire rendait « payé » invisible dès ÷50. */}
            <div
              className="relative mt-3 flex h-4 overflow-hidden rounded"
              role="img"
              aria-label={`Facteur ${factorLabel(s)} sur une règle allant de ÷1 à ÷1000, zone ${zoneName}, objectif ÷100`}
            >
              {ZONES.map((z) => (
                <div key={z.name} className={`h-full flex-1 ${z.cls}`} />
              ))}
              <div
                className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-r bg-fg"
                style={{ width: `${Math.max(1.5, pos * 100)}%` }}
              />
              <div
                className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-accent"
                style={{ left: '66.667%' }}
                title="Objectif ÷100"
              />
            </div>
            <div className="relative mt-1 h-4 text-[10.5px]">
              {['÷1', '÷10', '÷100', '÷1000'].map((t, i) => (
                <span
                  key={t}
                  className={`absolute ${i === 0 ? '' : i === 3 ? '-translate-x-full' : '-translate-x-1/2'} ${t === '÷100' ? 'font-semibold text-accent' : ''}`}
                  style={{ left: `${(i / 3) * 100}%` }}
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[11px]">
              <span className="text-fg" data-testid="economy-zone">
                {pos >= 2 / 3
                  ? 'Objectif ÷100 atteint.'
                  : `Zone « ${zoneName} » — encore ${factorGap(s)} pour atteindre ÷100.`}
              </span>
              <span>{ZONES.map((z) => `${z.name} ${z.range}`).join(' · ')}</span>
            </div>
          </div>
        )}
        <div className="text-[11.5px]">
          Prix standard = la requête brute (messages, outils, réponse) envoyée telle quelle au modèle payant,
          au tarif public, sans cache — c’est une estimation ; « payé » = ce que le fournisseur a facturé.
        </div>
        {s.n > 0 && (
          <table className="mt-2 w-full text-[11.5px]" data-testid="economy-paths">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-faint">
                <th className="py-0.5 pr-2 text-left font-medium">Chemin</th>
                <th className="pr-2 text-right font-medium">Demandes</th>
                <th className="pr-2 text-right font-medium">Prix standard</th>
                <th className="pr-2 text-right font-medium">Payé</th>
                <th className="text-right font-medium">Facteur</th>
              </tr>
            </thead>
            <tbody>
              {(
                Object.entries(s.byPath) as [EcoPath, { n: number; standardUsd: number; paidUsd: number }][]
              ).map(([p, b]) => (
                <tr key={p} className="border-t border-line">
                  <td className="py-0.5 pr-2">{PATH_LABEL[p]}</td>
                  <td className="pr-2 text-right">{b.n}</td>
                  <td className="pr-2 text-right">{usd(b.standardUsd)}</td>
                  <td className="pr-2 text-right">{usd(b.paidUsd)}</td>
                  <td className="text-right font-semibold text-fg">{factorLabel(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {state?.lastDrafters && (
          <div className="mt-2" data-testid="economy-drafters">
            <b>Rédacteurs gratuits de la dernière demande</b> ({state.lastDrafters.why}) :{' '}
            {state.lastDrafters.chain.join(' → ') || 'aucun'}
            {state.lastDrafters.failures?.length ? (
              <div className="text-[11px]">Indisponibles : {state.lastDrafters.failures.join(' · ')}</div>
            ) : null}
          </div>
        )}
        {state && state.trust.length > 0 && (
          <div className="mt-2">
            <b>Familles fiables</b> :{' '}
            {state.trust
              .slice(0, 8)
              .map(
                (t) =>
                  `${t.family.replace(/^chat:/, '')} ${Math.round(t.ok)}/${t.n} (borne ${Math.round(wilsonLower(t.ok, t.n) * 100)} %)`,
              )
              .join(' · ')}
          </div>
        )}
        {state && state.notes.length > 0 && (
          <div className="mt-2">
            <b>Points de vigilance relevés par le modèle payant</b> (donnés aux modèles gratuits sur les
            demandes proches) :
            <ul className="mt-1">
              {state.notes.slice(-8).map((n) => (
                <li key={n.id} className="flex items-start gap-1">
                  <button
                    className="mt-0.5 text-muted hover:text-err"
                    title="Oublier ce point"
                    onClick={() => clearEconomyNote(n.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.n > 0 && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => resetEconomyLedger()}>
            Remettre le registre à zéro
          </Button>
        )}
      </div>
    </div>
  );
}
