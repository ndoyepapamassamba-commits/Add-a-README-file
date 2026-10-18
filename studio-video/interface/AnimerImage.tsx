// ANIMER MON IMAGE (idée de l'utilisateur, 17/10/2026) — « la WebApp ressemble à une application possédant son propre
// GPU : quand on clique sur « Animer mon image », elle transmet l'image et la consigne à un serveur qui exécute un modèle
// vidéo sur un véritable GPU distant ». Rien de payant : Space ZeroGPU « Wan 2.2 14B Fast » (Wan-AI, Apache-2.0) appelé
// par CE navigateur, sur le quota du jour de l'utilisateur (2 min sans compte, 5 min avec un compte gratuit).
// Au-delà des références (veille du 18/10/2026) : consigne « un seul temps » (action → caméra → rythme), quota exact
// réservé AVANT le clic (formule du Space), registre local avec la remise à zéro de ZeroGPU, et chaque clip jugé par
// l'œil de JEV (identité, mouvement, déformations : chaque probabilité > 0,5, sinon « Refaire »).
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Cpu, Download, ImagePlus, KeyRound, Pin, RotateCcw, Sparkles, UserPlus, XCircle } from 'lucide-react';
import { Button, Chip, Gauge, Input, Spinner, Textarea } from '@workbench/web/components/ui';
import { cx } from '@workbench/web/lib/format';
import { getJevKey } from '@workbench/direct/lib/jev';
import { useStore } from '@workbench/direct/lib/store';
import { download } from '@workbench/direct/lib/vfs';
import { PageHeader } from '@workbench/direct/views/PageHeader';
import {
  ACTIONS,
  CAMERAS,
  ErreurQuotaGpu,
  QUOTA_JOUR_S,
  RYTHMES,
  animerSurGpuDistant,
  bilanQuota,
  clipsRestants,
  consigneWan,
  quotaClip,
  tailleSpace,
  verifierJetonHf,
  type EtatGpu,
  type UsageGpu,
} from '../coeur/videogen/gpuDistant';
import { gpuParClipUtilisable, type VerdictClip } from '../coeur/videogen/jugeClip';
import { jugerClip } from '../navigateur/videogen/jugeClip';
import { useReglages } from '../navigateur/reglages';

const REGISTRE = 'sv.gpu.registre';
const COMPTE = 'sv.hf.compte';
const ETAPES = 4; // réglage natif du LoRA Lightx2v du Space (4 étapes)
const DUREES = [2, 3, 5];

interface Essai {
  id: number;
  url: string;
  blob: Blob;
  consigne: string;
  graine?: number;
  reserveS: number;
  secondes: number;
  verdict: VerdictClip | null;
  jugement: 'en cours' | 'fait' | 'sans JEV';
}

function lireRegistre(): UsageGpu[] {
  try {
    const v = JSON.parse(localStorage.getItem(REGISTRE) ?? '[]') as UsageGpu[];
    return Array.isArray(v) ? v.filter((u) => typeof u.t === 'number' && typeof u.s === 'number') : [];
  } catch {
    return [];
  }
}
function ecrireRegistre(r: UsageGpu[]) {
  try {
    localStorage.setItem(REGISTRE, JSON.stringify(r.slice(-200)));
  } catch {
    /* fenêtre privée : le registre vaut pour l'onglet */
  }
}
function lireCompte(): { nom: string; pro: boolean } | null {
  try {
    return JSON.parse(localStorage.getItem(COMPTE) ?? 'null') as { nom: string; pro: boolean } | null;
  } catch {
    return null;
  }
}
const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const pct = (p: number) => `${Math.round(p * 100)} %`;

function dimensions(f: Blob): Promise<[number, number]> {
  return createImageBitmap(f).then((b) => {
    const d: [number, number] = [b.width, b.height];
    b.close();
    return d;
  });
}

export function AnimerImage() {
  const toast = useStore((s) => s.toast);
  const hfToken = useReglages((s) => s.hfToken);
  const patch = useReglages((s) => s.patch);
  const [image, setImage] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [dims, setDims] = useState<[number, number]>([1080, 1920]);
  const [action, setAction] = useState('Parle en souriant');
  const [camera, setCamera] = useState('Plan fixe');
  const [rythme, setRythme] = useState('Naturel');
  const [libre, setLibre] = useState('');
  const [duree, setDuree] = useState(3);
  const [graine, setGraine] = useState<number | null>(null);
  const [etat, setEtat] = useState<EtatGpu | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essais, setEssais] = useState<Essai[]>([]);
  const [registre, setRegistre] = useState<UsageGpu[]>(lireRegistre);
  const [compte, setCompte] = useState(lireCompte);
  const [jetonSaisi, setJetonSaisi] = useState('');
  const [verif, setVerif] = useState(false);
  const [maintenant, setMaintenant] = useState(Date.now());
  const arret = useRef<AbortController | null>(null);
  const depot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => essais.forEach((e) => URL.revokeObjectURL(e.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const avecCompte = Boolean(hfToken?.trim());
  const quotaJour = avecCompte ? (compte?.pro ? 2400 : QUOTA_JOUR_S.gratuit) : QUOTA_JOUR_S.anonyme;
  const parClip = quotaClip(duree, ETAPES, dims[0], dims[1]);
  const bilan = bilanQuota(registre, maintenant);
  const restants = clipsRestants(quotaJour, bilan.utiliseS, parClip);
  const consigne = useMemo(() => consigneWan({ action, camera, rythme, libre }), [action, camera, rythme, libre]);
  const [l, h] = tailleSpace(dims[0], dims[1]);
  const coutUtile = gpuParClipUtilisable(essais.map((e) => ({ reserveS: e.reserveS, conforme: e.verdict ? e.verdict.conforme : null })));
  const dernier = essais[0];

  const choisir = async (f: File | null | undefined) => {
    if (!f || !/^image\//.test(f.type)) return;
    if (apercu) URL.revokeObjectURL(apercu);
    setImage(f);
    setApercu(URL.createObjectURL(f));
    try {
      setDims(await dimensions(f));
    } catch {
      setDims([1080, 1920]);
    }
  };

  const enregistrerJeton = async () => {
    const j = jetonSaisi.trim();
    if (!j) return;
    setVerif(true);
    try {
      const c = await verifierJetonHf(j);
      patch({ hfToken: j });
      setCompte({ nom: c.nom, pro: c.pro });
      localStorage.setItem(COMPTE, JSON.stringify({ nom: c.nom, pro: c.pro }));
      setJetonSaisi('');
      toast('ok', `Compte Hugging Face « ${c.nom} » relié : ${c.pro ? '40' : '5'} min de GPU par jour.`);
    } catch (e) {
      toast('err', (e as Error).message);
    } finally {
      setVerif(false);
    }
  };
  const verifierCompte = async () => {
    if (!hfToken) return;
    setVerif(true);
    try {
      const c = await verifierJetonHf(hfToken);
      setCompte({ nom: c.nom, pro: c.pro });
      localStorage.setItem(COMPTE, JSON.stringify({ nom: c.nom, pro: c.pro }));
      toast('ok', `Jeton valable : compte « ${c.nom} ».`);
    } catch (e) {
      toast('err', (e as Error).message);
    } finally {
      setVerif(false);
    }
  };
  const retirerJeton = () => {
    patch({ hfToken: '' });
    setCompte(null);
    try {
      localStorage.removeItem(COMPTE);
    } catch {
      /* rien */
    }
  };

  const animer = async (graineForcee?: number | null) => {
    if (!image || occupe) return;
    setOccupe(true);
    setErreur(null);
    setEtat({ phase: 'envoi' });
    const ac = new AbortController();
    arret.current = ac;
    const t0 = performance.now();
    let graineObtenue: number | undefined;
    const g = graineForcee === undefined ? graine : graineForcee;
    try {
      const clip = await animerSurGpuDistant(image, consigne, {
        jeton: hfToken?.trim() || undefined,
        dureeS: duree,
        etapes: ETAPES,
        graine: g ?? undefined,
        signal: ac.signal,
        onEtat: (e) => {
          setEtat(e);
          if (e.graine != null) graineObtenue = e.graine;
        },
      });
      const r = [...registre, { t: Date.now(), s: parClip }];
      setRegistre(r);
      ecrireRegistre(r);
      setMaintenant(Date.now()); // l'horloge du bilan suit le registre (sinon le clip compterait 30 s plus tard)
      const essai: Essai = {
        id: Date.now(),
        url: URL.createObjectURL(clip),
        blob: clip,
        consigne,
        graine: graineObtenue ?? g ?? undefined,
        reserveS: parClip,
        secondes: (performance.now() - t0) / 1000,
        verdict: null,
        jugement: getJevKey() ? 'en cours' : 'sans JEV',
      };
      setEssais((xs) => [essai, ...xs].slice(0, 12));
      if (getJevKey()) {
        const v = await jugerClip(image, clip, ACTIONS[action] ?? libre);
        setEssais((xs) => xs.map((x) => (x.id === essai.id ? { ...x, verdict: v, jugement: v ? 'fait' : 'sans JEV' } : x)));
      }
    } catch (e) {
      if (e instanceof ErreurQuotaGpu && e.resteS != null) {
        // le Space a dit ce qu'il reste : le registre local est recalé sur sa parole
        const recale = Math.max(0, quotaJour - e.resteS - bilanQuota(registre, Date.now()).utiliseS);
        const r = [...registre, { t: Date.now(), s: recale }];
        setRegistre(r);
        ecrireRegistre(r);
        setMaintenant(Date.now());
      }
      if ((e as Error).name !== 'AbortError') setErreur((e as Error).message);
    } finally {
      setOccupe(false);
      setEtat(null);
      arret.current = null;
    }
  };

  const phases: [EtatGpu['phase'], string][] = [
    ['envoi', 'Envoi de l’image'],
    ['file', 'File du GPU'],
    ['calcul', 'Calcul sur le GPU'],
    ['reception', 'Réception du clip'],
  ];
  const rangPhase = etat ? phases.findIndex(([p]) => p === etat.phase) : -1;

  return (
    <div className="h-full overflow-auto" data-testid="animer">
      <div className="mx-auto max-w-[1400px] space-y-3 p-3 sm:p-4">
        <PageHeader
          title="Animer mon image"
          subtitle="Votre image + un mouvement → un clip vidéo calculé sur un vrai GPU distant (Wan 2.2, gratuit, sur votre quota du jour). Chaque clip est jugé par JEV."
        />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ── Colonne gauche : image et mouvement ── */}
          <div className="space-y-3">
            <div
              className={cx('flex min-h-[260px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-panel', image ? 'border-line' : 'border-accent/50 hover:border-accent')}
              onClick={() => depot.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choisir(e.dataTransfer.files?.[0]);
              }}
              data-testid="animer-depot"
            >
              {apercu ? (
                <img src={apercu} alt="Image à animer" className="max-h-[420px] w-auto object-contain" />
              ) : (
                <div className="p-6 text-center text-muted">
                  <ImagePlus className="mx-auto mb-2" size={30} />
                  <div className="text-[14px] font-medium text-fg">Déposez votre image ici</div>
                  <div className="text-[12.5px]">ou cliquez pour la choisir (personnage, scène, dessin de la troupe…)</div>
                </div>
              )}
              <input ref={depot} type="file" accept="image/*" className="hidden" onChange={(e) => void choisir(e.target.files?.[0])} data-testid="animer-fichier" />
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-panel p-3">
              <div>
                <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">Mouvement — un seul temps par clip</div>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(ACTIONS).map((a) => (
                    <Chip key={a} active={action === a} onClick={() => setAction(action === a ? '' : a)}>
                      {a}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">Caméra</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(CAMERAS).map((c) => (
                      <Chip key={c} active={camera === c} onClick={() => setCamera(c)}>
                        {c}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">Rythme et durée</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(RYTHMES).map((r) => (
                      <Chip key={r} active={rythme === r} onClick={() => setRythme(r)}>
                        {r}
                      </Chip>
                    ))}
                    <span className="mx-1 self-center text-faint">·</span>
                    {DUREES.map((d) => (
                      <Chip key={d} active={duree === d} onClick={() => setDuree(d)}>
                        {d} s
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
              <Textarea rows={2} value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="Précision facultative (en anglais de préférence), ex. « she holds a calabash »" data-testid="animer-libre" />
              <div className="rounded-lg bg-hover px-2.5 py-2 font-mono text-[11.5px] leading-snug text-muted" title="Consigne envoyée au modèle">
                {consigne}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={!image || occupe} onClick={() => void animer()} data-testid="animer-go">
                  {occupe ? <Spinner /> : <Sparkles size={15} />} Animer mon image
                </Button>
                {occupe && (
                  <Button size="sm" variant="ghost" onClick={() => arret.current?.abort()}>
                    Annuler
                  </Button>
                )}
                <span className="text-[12px] text-muted">
                  réserve ≈ {Math.round(parClip)} s de GPU ({l} × {h}, {ETAPES} étapes) · reste ≈ <b className="text-fg">{restants}</b> clip{restants > 1 ? 's' : ''} aujourd’hui
                </span>
              </div>
              {graine != null && (
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <Pin size={13} /> Graine épinglée : {graine}
                  <button className="underline hover:text-fg" onClick={() => setGraine(null)}>
                    revenir au hasard
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Colonne droite : GPU, quota, résultat ── */}
          <div className="space-y-3">
            <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-[12.5px]" data-testid="animer-quota">
              <div className="flex items-center gap-2 font-medium">
                <Cpu size={15} className="text-accent" /> GPU distant · quota du jour {avecCompte ? (compte ? `de « ${compte.nom} »` : 'du compte') : 'sans compte'}
                <span className="ml-auto text-muted">
                  {Math.round(bilan.utiliseS)} / {quotaJour} s
                </span>
              </div>
              <Gauge value={bilan.utiliseS} max={quotaJour} />
              <div className="text-muted">
                {bilan.remiseA ? `Remise à zéro à ${heure(bilan.remiseA)} (24 h après la première utilisation). ` : 'Quota plein. '}
                Estimation prudente tenue sur cet appareil ; recalée sur le message du GPU quand il en envoie un.
                {coutUtile != null && <> · <b className="text-fg">{Math.round(coutUtile)} s</b> de GPU par clip validé par JEV.</>}
              </div>
              {avecCompte ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <CheckCircle2 size={14} className="text-ok" />
                  <span>Jeton enregistré dans ce navigateur (jamais affiché){compte ? ` · compte ${compte.nom}` : ''}.</span>
                  <Button size="sm" variant="ghost" disabled={verif} onClick={() => void verifierCompte()}>
                    {verif ? <Spinner /> : null} Vérifier
                  </Button>
                  <Button size="sm" variant="ghost" onClick={retirerJeton}>
                    Retirer
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-accent/40 bg-accent-soft/40 p-2.5" data-testid="animer-compte">
                  <div className="font-medium text-fg">5 min par jour au lieu de 2 : votre compte Hugging Face gratuit</div>
                  <ol className="list-decimal space-y-1 pl-5 text-muted">
                    <li>
                      <a className="text-accent underline" href="https://huggingface.co/join" target="_blank" rel="noopener noreferrer">
                        Créer mon compte gratuit
                      </a>{' '}
                      puis cliquer sur le lien de confirmation reçu par e-mail.
                    </li>
                    <li>
                      <a className="text-accent underline" href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">
                        Créer un jeton
                      </a>{' '}
                      (« Create new token », type <b>Read</b>).
                    </li>
                    <li>Le coller ici : il reste dans ce navigateur et n’est jamais affiché.</li>
                  </ol>
                  <div className="flex gap-2">
                    <Input type="password" value={jetonSaisi} onChange={(e) => setJetonSaisi(e.target.value)} placeholder="hf_…" autoComplete="off" data-testid="animer-jeton" />
                    <Button variant="primary" disabled={!jetonSaisi.trim() || verif} onClick={() => void enregistrerJeton()}>
                      {verif ? <Spinner /> : <KeyRound size={14} />} Relier
                    </Button>
                  </div>
                  <div className="flex items-center gap-1 text-[11.5px] text-faint">
                    <UserPlus size={12} /> Sans compte, l’app marche aussi : 2 min de GPU par jour.
                  </div>
                </div>
              )}
            </div>

            {(occupe || erreur) && (
              <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-[12.5px]" data-testid="animer-etat">
                {phases.map(([p, label], i) => (
                  <div key={p} className={cx('flex items-center gap-2', i < rangPhase ? 'text-ok' : i === rangPhase ? 'font-medium text-fg' : 'text-faint')}>
                    {i < rangPhase ? <CheckCircle2 size={14} /> : i === rangPhase ? <Spinner /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-line" />}
                    {label}
                    {p === 'file' && etat?.phase === 'file' && etat.rang != null && <span className="text-muted">· rang {etat.rang + 1}{etat.attenteS != null ? `, ≈ ${Math.round(etat.attenteS)} s` : ''}</span>}
                    {p === 'calcul' && etat?.phase === 'calcul' && etat.progression != null && <span className="text-muted">· {pct(etat.progression)}</span>}
                  </div>
                ))}
                {etat?.phase === 'calcul' && etat.progression != null && <Gauge value={etat.progression} max={1} tone="accent" />}
                {erreur && (
                  <div className="flex items-start gap-2 text-err">
                    <XCircle size={14} className="mt-0.5 shrink-0" /> {erreur}
                  </div>
                )}
              </div>
            )}

            {dernier ? (
              <div className="space-y-2 rounded-xl border border-line bg-panel p-3" data-testid="animer-resultat">
                <video key={dernier.url} src={dernier.url} controls autoPlay loop muted playsInline className="max-h-[520px] w-full rounded-lg bg-black object-contain" />
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <span>
                    {dernier.secondes.toFixed(0)} s de bout en bout · graine {dernier.graine ?? '—'} · {Math.round(dernier.reserveS)} s de GPU réservées
                  </span>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => void dernier.blob.arrayBuffer().then((b) => download(`clip-${dernier.id}.mp4`, new Uint8Array(b), 'video/mp4'))}>
                      <Download size={14} /> MP4
                    </Button>
                    {dernier.graine != null && (
                      <Button size="sm" variant="ghost" onClick={() => setGraine(dernier.graine!)} title="Garder cette graine pour les prochains clips">
                        <Pin size={14} /> Épingler
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={occupe || !image} onClick={() => void animer(null)} title="Nouvelle graine au hasard">
                      <RotateCcw size={14} /> Refaire
                    </Button>
                  </span>
                </div>
                <Verdict essai={dernier} />
              </div>
            ) : (
              !occupe && (
                <div className="rounded-xl border border-line bg-panel p-6 text-center text-[13px] text-muted">
                  Le clip apparaîtra ici, avec le jugement de JEV : même personnage, mouvement demandé, aucune déformation.
                </div>
              )
            )}

            {essais.length > 1 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {essais.slice(1).map((e) => (
                  <video key={e.id} src={e.url} muted loop playsInline onMouseEnter={(v) => void v.currentTarget.play()} onMouseLeave={(v) => v.currentTarget.pause()} className={cx('aspect-[9/16] w-full rounded-md bg-black object-cover ring-2', e.verdict?.conforme ? 'ring-ok/70' : e.verdict ? 'ring-err/60' : 'ring-line')} title={e.consigne} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Verdict({ essai }: { essai: Essai }) {
  if (essai.jugement === 'en cours')
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Spinner /> JEV regarde le clip (départ, milieu, fin)…
      </div>
    );
  if (!essai.verdict)
    return <div className="text-[12px] text-faint">JEV n’a pas jugé ce clip (clé JEV absente dans Réglages, ou budget du jour atteint).</div>;
  const v = essai.verdict;
  const ligne = (nom: string, p: number) => (
    <div className="flex items-center gap-2">
      <span className="w-40 shrink-0">{nom}</span>
      <Gauge value={p} max={1} tone="accent" className="flex-1" />
      <span className={cx('w-12 text-right tabular-nums', p > 0.5 ? 'text-ok' : 'text-err')}>{p.toFixed(2)}</span>
    </div>
  );
  return (
    <div className="space-y-1.5 rounded-lg bg-hover p-2.5 text-[12.5px]" data-testid="animer-verdict">
      <div className={cx('flex items-center gap-1.5 font-medium', v.conforme ? 'text-ok' : 'text-err')}>
        {v.conforme ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
        {v.conforme ? 'JEV : clip utilisable' : 'JEV : à refaire (une probabilité ne dépasse pas 0,5)'}
      </div>
      {ligne('Même personnage', v.identite)}
      {ligne('Mouvement demandé', v.mouvement)}
      {ligne('Aucune déformation', v.proprete)}
    </div>
  );
}
