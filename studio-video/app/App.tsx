// MASSAMBA STUDIO VIDÉO — l'application vidéo, séparée de Workbench le 16/10/2026 : Film Autopilot (studio de film IA),
// Vidéo IA, bac à sable « Réalisation », Studio 3D, moteur de la troupe et réglages propres à la vidéo. Elle s'appuie sur
// le socle de Workbench (client OpenRouter, JEV, composants) sans en contenir les écrans.
import { useEffect, useState } from 'react';
import { Box, Clapperboard, Film, ImagePlay, KeyRound, Moon, Settings as SettingsIcon, Sparkles, Sun, Wand2, Workflow } from 'lucide-react';
import { Button, Field, IconButton, Input, Spinner, Toggle } from '@workbench/web/components/ui';
import { cx } from '@workbench/web/lib/format';
import { getKey, loadCatalog, maskKey, provider, setKey } from '@workbench/direct/lib/llm';
import { getJevKey, setJevKey } from '@workbench/direct/lib/jev';
import { freeOptions, setFreeOptions } from '@workbench/direct/lib/freeMode';
import { hydrate, useStore } from '@workbench/direct/lib/store';
import { PageHeader } from '@workbench/direct/views/PageHeader';
import { StudioView } from '../interface/studio/StudioView';
import { VideoGenView } from '../interface/VideoGenView';
import { AnimerImage } from '../interface/AnimerImage';
import { RealizeView } from '../interface/RealizeView';
import { Lab3DView } from '../interface/Lab3DView';
import { MoteurTroupe } from '../interface/MoteurTroupe';
import { CHAMPS, useReglages, type ReglagesVideo } from '../navigateur/reglages';
import { reprendreDeWorkbench } from './reprise';
import { ECRANS, type Ecran } from './ecrans';

const ICONES: Record<Ecran, React.ReactNode> = {
  animer: <ImagePlay size={17} />,
  film: <Clapperboard size={17} />,
  videogen: <Film size={17} />,
  realize: <Wand2 size={17} />,
  lab3d: <Box size={17} />,
  troupe: <Workflow size={17} />,
  reglages: <SettingsIcon size={17} />,
};
const ECRAN = 'sv.ecran';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M12 9l11 7-11 7z" fill="var(--accent-fg)" />
    </svg>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);
  const [hasKey, setHasKey] = useState(() => Boolean(getKey()) || freeOptions().started);
  useEffect(() => {
    void hydrate().then(async () => {
      void loadCatalog()
        .then((models) => useStore.setState({ models, modelsError: null }))
        .catch((e: Error) => useStore.setState({ modelsError: e.message }));
      const r = await reprendreDeWorkbench().catch(() => null);
      if (r)
        useStore
          .getState()
          .toast('ok', `Repris de Workbench : ${r.cles} élément(s) du studio${r.reglages ? ` et ${r.reglages} réglage(s) vidéo` : ''}.`);
    });
  }, []);
  if (!ready)
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner /> Chargement…
      </div>
    );
  return (
    <>
      {hasKey ? <Coquille /> : <Accueil onDone={() => setHasKey(true)} />}
      <Toasts />
    </>
  );
}

/** Messages de l'app, visibles sur tous les écrans (y compris l'accueil : la reprise depuis Workbench s'y annonce). */
function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'wb-in pointer-events-auto max-w-[380px] rounded-xl border px-3 py-2 text-[13px] shadow-pop',
            t.tone === 'err' ? 'border-err/40 bg-elev text-err' : t.tone === 'ok' ? 'border-ok/40 bg-elev text-fg' : 'border-line bg-elev text-fg',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Accueil({ onDone }: { onDone: () => void }) {
  const [key, setK] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    setKey(key, remember);
    const st = await provider.keyStatus();
    setBusy(false);
    if (!st.connected) return setErr(st.error === 'Clé absente ou invalide (401)' ? 'Clé refusée par OpenRouter. Vérifiez-la sur openrouter.ai/keys.' : `Connexion impossible : ${st.error ?? 'erreur'}`);
    useStore.getState().patchSettings({ rememberKey: remember });
    onDone();
  };
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="wb-in w-full max-w-[540px]">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="text-[18px] font-semibold">MASSAMBA Studio Vidéo</div>
            <div className="text-[13px] text-muted">Films de la troupe, vidéo IA, bacs à sable 3D — aucune installation</div>
          </div>
        </div>
        <form
          className="rounded-2xl border border-line bg-elev p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Votre clé API OpenRouter" hint="La même que dans Workbench (déjà reconnue si elle y est enregistrée). Elle reste dans ce navigateur et n’est envoyée qu’à openrouter.ai.">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-faint" />
              <Input type="password" value={key} onChange={(e) => setK(e.target.value)} placeholder="sk-or-v1-…" autoFocus />
            </div>
          </Field>
          <div className="mb-4">
            <Toggle checked={remember} onChange={setRemember} label="Se souvenir de la clé sur cet ordinateur" />
          </div>
          {err && <div className="mb-3 rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[13px] text-err">{err}</div>}
          <Button type="submit" variant="primary" className="w-full" disabled={!key.trim().startsWith('sk-') || busy}>
            {busy ? <Spinner /> : null} Commencer
          </Button>
        </form>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          data-testid="start-free"
          onClick={() => {
            setFreeOptions({ started: true });
            onDone();
          }}
        >
          Utiliser sans clé — moteurs gratuits seulement (0 $)
        </Button>
      </div>
    </div>
  );
}

function lireEcran(): Ecran {
  try {
    const v = localStorage.getItem(ECRAN) as Ecran | null;
    return v && ECRANS.some((e) => e.id === v) ? v : 'film';
  } catch {
    return 'film';
  }
}

function Coquille() {
  const [ecran, setEcran] = useState<Ecran>(lireEcran);
  const theme = useStore((s) => s.settings.theme);
  const patchSettings = useStore((s) => s.patchSettings);
  const aller = (e: Ecran) => {
    setEcran(e);
    try {
      localStorage.setItem(ECRAN, e);
    } catch {
      /* fenêtre privée */
    }
  };
  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-elev px-2 sm:px-3">
        <Logo size={24} />
        <span className="truncate text-[14px] font-semibold">MASSAMBA Studio Vidéo</span>
        <span className="hidden rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent sm:inline">séparé de Workbench</span>
        <div className="flex-1" />
        <IconButton label="Thème" onClick={() => patchSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          data-testid="main-nav"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-elev p-2 md:w-[220px] md:flex-col md:overflow-visible md:border-b-0 md:border-r"
        >
          {ECRANS.map((e) => (
            <button
              key={e.id}
              type="button"
              title={e.aide}
              onClick={() => aller(e.id)}
              className={cx(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium',
                ecran === e.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
              )}
            >
              {ICONES[e.id]}
              <span>{e.label}</span>
            </button>
          ))}
        </nav>
        <main className="min-h-0 min-w-0 flex-1">
          {ecran === 'animer' && <AnimerImage />}
          {ecran === 'film' && <StudioView />}
          {ecran === 'videogen' && <VideoGenView />}
          {ecran === 'realize' && <RealizeView />}
          {ecran === 'lab3d' && <Lab3DView />}
          {ecran === 'troupe' && <MoteurTroupe />}
          {ecran === 'reglages' && <Reglages />}
        </main>
      </div>
    </div>
  );
}

const LIBELLES: Record<keyof ReglagesVideo, [string, string, string]> = {
  pollinationsKey: ['Clé Pollinations (≈ 0,05 $ le plan de 5 s)', 'enter.pollinations.ai → compte → clé sk_… et un petit solde. Moteur : Wan 2.2 Fast, image → vidéo.', 'sk_…'],
  hfToken: ['Jeton Hugging Face (option gratuite, selon quota)', 'huggingface.co → Settings → Access Tokens (lecture). Space gratuit « Wan 2.2 14B Fast » dans la limite du quota GPU du compte.', 'hf_…'],
  falKey: ['Clé fal.ai (acteur 3D → personnage, ≈ 0,04–0,08 $ / s)', 'fal.ai → Dashboard → Keys. Wan2.2-Animate transfère le jeu de l’acteur 3D au personnage.', 'clé fal'],
  blenderBridgeUrl: ['Pont Blender local (rendu 3D sur votre machine, 0 $)', 'Sur votre PC : python3 blender/blender-bridge.py --blender <chemin de blender>. Rien ne quitte votre machine.', 'http://127.0.0.1:8765'],
  blenderBridgeToken: ['Jeton du pont Blender (si démarré avec --token)', 'Envoyé seulement au pont, dans l’en-tête X-Bridge-Token.', '(optionnel)'],
};

function Reglages() {
  const r = useReglages();
  const [cle, setCle] = useState('');
  const [jev, setJev] = useState('');
  const k = getKey();
  const secret = (c: keyof ReglagesVideo) => c !== 'blenderBridgeUrl';
  return (
    <div className="h-full overflow-auto" data-testid="reglages">
      <PageHeader title="Réglages" subtitle="Tout reste dans ce navigateur ; chaque clé n’est envoyée qu’au service qu’elle ouvre." />
      <div className="mx-auto grid max-w-[860px] gap-4 p-4 md:p-6">
        <section className="rounded-xl border border-line bg-elev p-4">
          <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold">
            <Sparkles size={15} /> Clés partagées avec Workbench
          </div>
          <Field label="Clé OpenRouter" hint={k ? `Enregistrée : ${maskKey(k)}` : 'Aucune clé : seuls les moteurs gratuits travaillent.'}>
            <div className="flex gap-2">
              <Input type="password" value={cle} onChange={(e) => setCle(e.target.value)} placeholder="sk-or-v1-…" data-testid="sv-openrouter-key" />
              <Button
                disabled={!cle.trim().startsWith('sk-')}
                onClick={() => {
                  setKey(cle, true);
                  setCle('');
                  useStore.getState().toast('ok', 'Clé OpenRouter enregistrée');
                }}
              >
                Enregistrer
              </Button>
            </div>
          </Field>
          <Field label="Clé JEV (TypeSafe)" hint={getJevKey() ? 'Enregistrée dans ce navigateur.' : 'Sans clé, l’œil de JEV ne juge pas les images (le reste fonctionne).'}>
            <div className="flex gap-2">
              <Input type="password" value={jev} onChange={(e) => setJev(e.target.value)} placeholder="clé JEV" data-testid="sv-jev-key" />
              <Button
                disabled={!jev.trim()}
                onClick={() => {
                  setJevKey(jev, true);
                  setJev('');
                  useStore.getState().toast('ok', 'Clé JEV enregistrée');
                }}
              >
                Enregistrer
              </Button>
            </div>
          </Field>
        </section>
        <section className="rounded-xl border border-line bg-elev p-4">
          <div className="mb-3 text-[13.5px] font-semibold">Moteurs vidéo et pont Blender</div>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {CHAMPS.map((c) => (
              <Field key={c} label={LIBELLES[c][0]} hint={LIBELLES[c][1]}>
                <Input
                  type={secret(c) ? 'password' : 'text'}
                  value={r[c] ?? ''}
                  onChange={(e) => r.patch({ [c]: e.target.value.trim() })}
                  placeholder={LIBELLES[c][2]}
                  data-testid={`sv-${c}`}
                />
              </Field>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
