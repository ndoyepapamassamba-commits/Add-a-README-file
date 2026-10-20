// MONÉTISATION — rubrique de l'app (18/10/2026) : programmes de rémunération par plateforme, progression des comptes de
// l'utilisateur (bilan importé, produit sur son poste par les API officielles), revenus notés au fil des mois. Le bilan
// et les revenus restent dans ce navigateur (aucun envoi) ; aucune clé ni aucun jeton n'entre dans la page.
import { useState } from 'react';
import { Check, Copy, Upload } from 'lucide-react';
import { Badge } from '@workbench/web/components/ui';
import { PageHeader } from '@workbench/direct/views/PageHeader';
import { PROGRAMMES, lisBilan, progression, totaux, type Bilan, type Plateforme, type Revenu } from '../navigateur/monetisation';

const CLE_BILAN = 'sv.monetisation.bilan';
const CLE_REVENUS = 'sv.monetisation.revenus';
const lit = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const ecrit = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* stockage indisponible : la page reste utilisable */
  }
};
const nf = (n: number) => n.toLocaleString('fr-FR');

const COMMANDES: [string, string][] = [
  ['Connecter TikTok (une fois)', 'python3 moteur-troupe/publie_tiktok.py connecte'],
  ['Connecter YouTube (une fois)', 'python3 moteur-troupe/diffuse.py connecte youtube'],
  ['Bilan de vos comptes (à importer ci-dessous)', 'python3 moteur-troupe/monetisation.py bilan > bilan.json'],
];

function Copie({ cmd }: { cmd: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-1 flex items-start gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-[12px]">{cmd}</code>
      <button
        type="button"
        className="shrink-0 text-faint hover:text-fg"
        title="Copier la commande"
        onClick={() => void navigator.clipboard?.writeText(cmd).then(() => (setOk(true), setTimeout(() => setOk(false), 1200)))}
      >
        {ok ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function Monetisation() {
  const [bilan, setBilan] = useState<Bilan | null>(() => lit<Bilan | null>(CLE_BILAN, null));
  const [revenus, setRevenus] = useState<Revenu[]>(() => lit<Revenu[]>(CLE_REVENUS, []));
  const [erreur, setErreur] = useState('');
  const [saisie, setSaisie] = useState<Revenu>({ mois: new Date().toISOString().slice(0, 7), plateforme: 'tiktok', montant: 0, devise: 'EUR' });
  const t = totaux(revenus);

  return (
    <div className="h-full overflow-auto" data-testid="monetisation">
      <PageHeader title="Monétisation" subtitle="Vos programmes de rémunération sur toutes les plateformes, par les voies officielles, compte public toujours." />
      <div className="mx-auto grid max-w-[980px] gap-4 p-4 md:p-6">
        <section className="rounded-xl border border-line bg-elev p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
            Bilan de vos comptes
            <Badge tone={bilan ? 'ok' : 'neutral'}>{bilan ? `du ${bilan.date}` : 'aucun bilan importé'}</Badge>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px]">
            <Upload size={14} /> Importer bilan.json
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="import-bilan"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then((txt) => {
                  try {
                    const b = lisBilan(txt);
                    setBilan(b);
                    ecrit(CLE_BILAN, b);
                    setErreur('');
                  } catch (x) {
                    setErreur((x as Error).message);
                  }
                });
              }}
            />
          </label>
          {erreur && <div className="mt-2 text-[12.5px] text-red-500">{erreur}</div>}
          <div className="mt-3 grid gap-1.5 text-[12.5px]">
            {COMMANDES.map(([l, c]) => (
              <div key={c}>
                <span className="text-muted">{l}</span>
                <Copie cmd={c} />
              </div>
            ))}
          </div>
        </section>

        {PROGRAMMES.map((p) => {
          const d = bilan?.plateformes[p.plateforme];
          const pr = progression(p, bilan);
          return (
            <section key={p.plateforme} className="rounded-xl border border-line bg-elev p-4" data-testid={`programme-${p.plateforme}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                {p.nom}
                <Badge tone={d?.connecte ? 'ok' : 'neutral'}>{d?.connecte ? 'compte connecté' : 'non connecté'}</Badge>
                {pr.some((v) => v.eligible) && <Badge tone="accent">seuils atteints</Badge>}
              </div>
              {pr.map((v, i) => (
                <div key={i} className="mt-2 grid gap-1.5">
                  {pr.length > 1 && <div className="text-[12px] text-muted">Voie {i + 1}</div>}
                  {v.voie.map((e) => (
                    <div key={e.libelle} className="text-[12.5px]">
                      <div className="flex justify-between">
                        <span>{e.libelle}</span>
                        <span className="tabular-nums text-muted">
                          {e.valeur === null ? '—' : nf(e.valeur)} / {nf(e.seuil)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-panel">
                        <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(e.part * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <ul className="mt-2 list-disc pl-5 text-[12.5px] text-muted">
                {p.regles.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="mt-1 text-[12px] text-faint">Règle à jour : {p.verifier}</div>
            </section>
          );
        })}

        <section className="rounded-xl border border-line bg-elev p-4" data-testid="revenus">
          <div className="mb-2 text-[13.5px] font-semibold">Revenus notés</div>
          <div className="flex flex-wrap items-end gap-2 text-[12.5px]">
            <input type="month" value={saisie.mois} onChange={(e) => setSaisie({ ...saisie, mois: e.target.value })} className="rounded border border-line bg-panel px-2 py-1" />
            <select value={saisie.plateforme} onChange={(e) => setSaisie({ ...saisie, plateforme: e.target.value as Plateforme })} className="rounded border border-line bg-panel px-2 py-1">
              {PROGRAMMES.map((p) => (
                <option key={p.plateforme} value={p.plateforme}>
                  {p.plateforme}
                </option>
              ))}
            </select>
            <input type="number" min={0} step="0.01" value={saisie.montant} onChange={(e) => setSaisie({ ...saisie, montant: Number(e.target.value) })} className="w-28 rounded border border-line bg-panel px-2 py-1" />
            <select value={saisie.devise} onChange={(e) => setSaisie({ ...saisie, devise: e.target.value })} className="rounded border border-line bg-panel px-2 py-1">
              {['EUR', 'USD', 'XOF'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-lg border border-line bg-panel px-3 py-1"
              onClick={() => {
                if (!(saisie.montant > 0)) return;
                const r = [...revenus, saisie];
                setRevenus(r);
                ecrit(CLE_REVENUS, r);
              }}
            >
              Ajouter
            </button>
          </div>
          <ul className="mt-2 grid gap-0.5 text-[12.5px]">
            {Object.entries(t).map(([k, v]) => (
              <li key={k}>
                <b>{k}</b> : {v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              </li>
            ))}
            {!revenus.length && <li className="text-muted">Aucun revenu noté.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
