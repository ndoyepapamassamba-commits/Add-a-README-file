// 🧍 CASTING 3D — the library of reusable 3D actors: built once from the character sheets (or a .vrm model imported
// from VRoid Studio / VRoid Hub), reused in every film, editable by hand. A live preview shows the actor waving and
// talking (lip-sync). The option plays every scene without a clip with these actors in the montage — 0 $.
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Select, Toggle } from '@workbench/web/components/ui';
import { useStudio } from '../../navigateur/studio/store';
import { blobs } from '../../navigateur/studio/blobs';
import { castActors, webglOk } from '../../navigateur/studio/actorsCast';
import { lookFromSheet, type ActorLook3D, type BodyShape, type Footwear, type HairStyle, type Pattern, type Sleeves } from '../../coeur/studio/actor/cast3d';
import { TROUPE } from '../../coeur/studio/actor/troupe';
import { POSE_LABEL, POSE_ORDER, galleryNames, type PoseKind } from '../../coeur/studio/actor/sheet';
import { importSheet } from '../../navigateur/studio/sheetImport';
import { ensureTroupeKit, kitDecorCount, troupeKit } from '../../navigateur/studio/troupeKit';
import { UNIVERSE_SETS } from '../../coeur/studio/actor/universe';
import { speakerKey } from '../../coeur/studio/motion';

const HAIR: { value: HairStyle; label: string }[] = [
  { value: 'court', label: 'Cheveux courts' },
  { value: 'afro', label: 'Afro' },
  { value: 'tresses', label: 'Tresses' },
  { value: 'chignon', label: 'Chignon' },
  { value: 'foulard', label: 'Foulard / gélé' },
  { value: 'chauve', label: 'Crâne rasé' },
  { value: 'dégarni', label: 'Dégarni' },
  { value: 'twists', label: 'Twists' },
];
const SHAPES: { value: BodyShape; label: string }[] = [
  { value: 'courbes', label: 'En courbes' },
  { value: 'élancé', label: 'Élancé (membres fins)' },
  { value: 'rond', label: 'Rond' },
  { value: 'standard', label: 'Standard' },
];
const PATTERNS: { value: Pattern; label: string }[] = [
  { value: 'uni', label: 'Uni' },
  { value: 'wax', label: 'Wax' },
  { value: 'pois', label: 'À pois' },
  { value: 'fleurs', label: 'Fleurs' },
  { value: 'brodé', label: 'Brodé' },
  { value: 'maillot', label: 'Maillot de foot' },
];
const FEET: { value: Footwear; label: string }[] = [
  { value: 'tongs', label: 'Tongs' },
  { value: 'chaussures', label: 'Chaussures' },
  { value: 'baskets', label: 'Baskets' },
];
const SLEEVES: { value: Sleeves; label: string }[] = [
  { value: 'sans', label: 'Sans manches' },
  { value: 'courtes', label: 'Manches courtes' },
  { value: 'longues', label: 'Manches longues' },
];

function Preview({ look }: { look: ActorLook3D }) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!host.current) return;
    let raf = 0;
    let p: Awaited<ReturnType<typeof import('../../navigateur/studio/actors3d').actorPreview>> | null = null;
    let alive = true;
    void import('../../navigateur/studio/actors3d')
      .then(({ actorPreview }) => {
        if (!alive || !host.current) return;
        p = actorPreview(look, 200, 280, (id) => blobs.get(id));
        p.canvas.style.borderRadius = '10px';
        p.canvas.dataset.testid = 'actor-preview-canvas';
        // Visual control (Playwright): the preview object on its canvas — face states can be forced from a test.
        (p.canvas as unknown as { __preview?: unknown }).__preview = p;
        host.current.replaceChildren(p.canvas);
        const t0 = performance.now();
        const loop = () => {
          p?.tick((performance.now() - t0) / 1000);
          raf = requestAnimationFrame(loop);
        };
        void p.ready.then(() => alive && loop()).catch((e) => setErr((e as Error).message));
      })
      .catch((e) => setErr((e as Error).message));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      p?.dispose();
    };
  }, [look]);
  return (
    <div>
      <div ref={host} className="h-[280px] w-[200px] rounded-[10px] bg-black/10" data-testid="actor-preview" />
      {err && <div className="mt-1 max-w-[200px] text-[11px] text-err">{err}</div>}
    </div>
  );
}

/** TEST D'ANIMATION: the actor and a partner play a short dispute, live, in a set of the library. */
function DuoTest({ look }: { look: ActorLook3D }) {
  const actors = useStudio((s) => s.actors);
  const decors = useStudio((s) => s.decors);
  const partners = Object.values(actors).filter((a) => a.key !== look.key && a.sheet);
  const [partner, setPartner] = useState(partners[0]?.key ?? '');
  const sets = Object.entries(decors);
  const [decor, setDecor] = useState(sets.find(([k]) => k === 'salon')?.[0] ?? sets[0]?.[0] ?? '');
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const b = actors[partner];
  const d = decors[decor];
  useEffect(() => {
    if (!host.current || !b) return;
    let raf = 0;
    let p: ReturnType<typeof import('../../navigateur/studio/actors3d').duoPreview> | null = null;
    let alive = true;
    void (async () => {
      const { duoPreview } = await import('../../navigateur/studio/actors3d');
      const blob = d ? await blobs.get(d.assetId) : undefined;
      if (!alive || !host.current) return;
      p = duoPreview(look, b, 270, 480, (id) => blobs.get(id), blob ? { blob, location: d!.name, ...(d!.fit ? { fit: d!.fit } : {}) } : null);
      p.canvas.style.borderRadius = '12px';
      host.current.replaceChildren(p.canvas);
      const t0 = performance.now();
      const loop = () => {
        p?.tick((performance.now() - t0) / 1000);
        raf = requestAnimationFrame(loop);
      };
      await p.ready;
      if (alive) loop();
    })().catch((e) => setErr((e as Error).message));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      p?.dispose();
    };
  }, [look, b, d]);
  if (!partners.length) return <div className="text-faint">Le test d’animation demande un deuxième acteur avec sa planche.</div>;
  return (
    <div className="flex flex-col gap-1" data-testid="duo-test">
      <div className="flex flex-wrap items-center gap-1">
        avec
        <select className="rounded border border-line bg-input px-1" value={partner} onChange={(e) => setPartner(e.target.value)} data-testid="duo-partner">
          {partners.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
        dans
        <select className="rounded border border-line bg-input px-1" value={decor} onChange={(e) => setDecor(e.target.value)} data-testid="duo-decor">
          <option value="">décor 3D</option>
          {sets.map(([k, x]) => (
            <option key={k} value={k}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <div ref={host} className="h-[480px] w-[270px] rounded-[12px] bg-black/10" data-testid="duo-canvas" />
      {err && <div className="max-w-[270px] text-[11px] text-err">{err}</div>}
    </div>
  );
}

/** The cut-out poses of a sheet, with their role (changeable). */
function Poses({ look, onKind }: { look: ActorLook3D; onKind: (i: number, k: PoseKind) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    void Promise.all((look.sheet?.poses ?? []).map((p) => blobs.get(p.assetId))).then((bs) => {
      if (!alive) return;
      for (const b of bs) made.push(b ? URL.createObjectURL(b) : '');
      setUrls(made);
    });
    return () => {
      alive = false;
      made.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [look.sheet]);
  if (!look.sheet) return null;
  return (
    <div className="col-span-2 flex flex-wrap gap-2" data-testid="actor-poses">
      {look.sheet.poses.map((p, i) => (
        <div key={p.assetId} className="flex flex-col items-center gap-1">
          <div className="flex h-24 w-16 items-end justify-center rounded bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:12px_12px]">{urls[i] && <img src={urls[i]} alt={p.kind} className="max-h-24 max-w-16 object-contain" />}</div>
          <Select value={p.kind} onChange={(v) => onKind(i, v as PoseKind)} options={POSE_ORDER.map((k) => ({ value: k, label: POSE_LABEL[k] }))} />
        </div>
      ))}
    </div>
  );
}

/** The owner's empty sets (their own décor images): the background of the scenes of that place. */
function Decors() {
  const decors = useStudio((s) => s.decors);
  const [name, setName] = useState(UNIVERSE_SETS[0]!.name);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const made: Record<string, string> = {};
    void Promise.all(Object.values(decors).map(async (d) => [d.name, await blobs.get(d.assetId)] as const)).then((xs) => {
      if (!alive) return;
      for (const [n, b] of xs) if (b) made[n] = URL.createObjectURL(b);
      setUrls(made);
    });
    return () => {
      alive = false;
      Object.values(made).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [decors]);
  return (
    <div className="space-y-1 border-t border-line pt-2" data-testid="decors">
      <div className="flex flex-wrap items-center gap-2">
        <b>Vos décors</b>
        <span className="text-faint">(images du lieu VIDE : elles deviennent le fond des scènes de ce lieu)</span>
        <Select value={name} onChange={setName} options={UNIVERSE_SETS.map((x) => ({ value: x.name, label: x.name }))} />
        <label className="cursor-pointer rounded-lg border border-line px-2 py-1">
          Importer le décor
          <input
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="decor-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const id = `decor-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
              await blobs.put(id, f);
              useStudio.getState().upsertDecor(name, id);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="decor-list">
        {Object.values(decors).map((d) => (
          <div key={d.name} className="flex flex-col items-center gap-1 text-[11px]">
            {urls[d.name] && <img src={urls[d.name]} alt={d.name} className="h-14 w-24 rounded object-cover" />}
            <span>
              {d.name}{' '}
              <button className="text-err" onClick={() => useStudio.getState().removeDecor(d.name)} title="Retirer ce décor">
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Swatch = ({ c, t }: { c: string; t: string }) => <span title={t} className="inline-block h-3 w-3 rounded-full border border-black/20" style={{ background: c }} />;

export function ActorCasting({ projectId }: { projectId?: string }) {
  const actors = useStudio((s) => s.actors);
  const on = Boolean(useStudio((s) => s.settings.actors3d));
  const bp = useStudio((s) => (projectId ? s.projects[projectId] : undefined));
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const list = Object.values(actors).sort((a, b) => (b.films ?? 0) - (a.films ?? 0) || a.name.localeCompare(b.name));
  const cur = sel ? actors[sel] : list[0];
  const gl = webglOk();
  /** An edit goes to the library AND to the cast of the current film (the next montage plays it). */
  const save = (p: Partial<ActorLook3D>) => {
    if (!cur) return;
    const next = { ...cur, ...p, source: p.vrmAssetId ? ('vrm' as const) : p.source ?? (cur.source === 'vrm' && cur.vrmAssetId ? 'vrm' : cur.sheet ? 'planche' : 'manuel'), updatedAt: Date.now() };
    useStudio.getState().upsertActors([next]);
    if (projectId && bp?.actors3d?.cast[next.key]) useStudio.getState().patchProject(projectId, (b) => ({ ...b, actors3d: { cast: { ...b.actors3d!.cast, [next.key]: next }, at: Date.now() } }), `acteur 3D ${next.name} modifié`);
  };
  const sheet = cur && bp ? bp.characters.find((c) => speakerKey(c.name) === cur.key) : undefined;
  const [sheetName, setSheetName] = useState('');
  const [galleryText, setGalleryText] = useState('');
  // The owner's troupe embedded in the HTML installs itself (once per version) when the studio opens: nothing to import.
  const hydrated = useStudio((s) => s.hydrated);
  const enabled = useStudio((s) => s.settings.enabled);
  const [installing, setInstalling] = useState(false);
  const [duo, setDuo] = useState(false);
  const installTroupe = async (force: boolean) => {
    setInstalling(true);
    try {
      await ensureTroupeKit({ force, onNote: setNote });
    } finally {
      setInstalling(false);
    }
  };
  useEffect(() => {
    // (Automated test browsers install it on demand, with the button, so every test starts from the same library.)
    if (hydrated && enabled && troupeKit && !navigator.webdriver) void installTroupe(false);
  }, [hydrated, enabled]);
  /** A GALLERY on a green screen (several characters, one figure each): each figure becomes its own actor. */
  const importGallery = async (f: File) => {
    setNote('découpe de la galerie…');
    try {
      const r = await importSheet(f, `galerie-${Date.now().toString(36)}`, { gallery: true });
      const names = galleryNames(galleryText, r.poses.length);
      const lib = useStudio.getState().actors;
      const looks = r.poses.map((p, i) => {
        const key = speakerKey(names[i]!);
        const base = lib[key] ?? { ...lookFromSheet({ name: names[i]! }), films: 0 };
        return { ...base, sheet: { sourceAssetId: r.sourceAssetId, poses: [{ ...p, kind: 'neutre' as const }] }, source: 'planche' as const, updatedAt: Date.now() };
      });
      useStudio.getState().upsertActors(looks);
      setNote(`galerie : ${looks.length} personnage(s) — ${names.join(', ')} · visage mesuré (bouche, yeux) sur ${r.rigged}/${r.poses.length}`);
    } catch (e) {
      setNote(`galerie illisible : ${(e as Error).message}`);
    }
  };
  /** A green-screen character sheet → the actor (new or existing) plays with the owner's own drawn poses. */
  const importPlanche = async (f: File, name: string) => {
    const n = name.trim() || cur?.name || '';
    if (!n) {
      setNote('indiquez le nom du personnage de la planche');
      return;
    }
    setNote(`découpe de la planche de ${n}…`);
    try {
      const key = speakerKey(n);
      const r = await importSheet(f, key);
      const base = useStudio.getState().actors[key] ?? { ...lookFromSheet({ name: n }), films: 0 };
      const next: ActorLook3D = { ...base, sheet: { sourceAssetId: r.sourceAssetId, poses: r.poses }, source: 'planche', updatedAt: Date.now() };
      useStudio.getState().upsertActors([next]);
      if (projectId && bp?.actors3d?.cast[key]) useStudio.getState().patchProject(projectId, (b) => ({ ...b, actors3d: { cast: { ...b.actors3d!.cast, [key]: next }, at: Date.now() } }), `planche de ${n}`);
      setSel(key);
      setSheetName('');
      setNote(
        `planche de ${n} : ${r.poses.length} pose(s) découpée(s) (${r.poses.map((p) => POSE_LABEL[p.kind]).join(', ')}) · visage mesuré (bouche, yeux) sur ${r.rigged}/${r.poses.length}` +
          (r.rigged < r.poses.length ? ' — les autres gardent la bouche du dessin, sans lip-sync (détecteur de visage indisponible ou visage caché)' : ''),
      );
    } catch (e) {
      setNote(`planche illisible : ${(e as Error).message}`);
    }
  };
  const importVrm = async (f: File) => {
    if (!cur) return;
    if (!/\.(vrm|glb|gltf)$/i.test(f.name)) {
      setNote('choisissez un fichier .vrm (VRoid Studio, VRoid Hub…) ou un modèle riggé .glb / .gltf (Mixamo, UniRig, Rigify…)');
      return;
    }
    const id = `vrm-${cur.key}-${Date.now().toString(36)}`;
    await blobs.put(id, f);
    save({ vrmAssetId: id, source: 'vrm' });
    setNote(`${f.name} associé à ${cur.name} (${(f.size / 1e6).toFixed(1)} Mo)`);
  };
  return (
    <details className="rounded-xl border border-line p-3" data-testid="actor-casting">
      <summary className="cursor-pointer text-[13px] font-semibold">🧍 Acteurs réutilisables (vos planches de personnages, ou 3D) — {list.length} acteur(s) dans la bibliothèque</summary>
      <div className="mt-2 space-y-2 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2" title="Les scènes sans clip vidéo sont jouées par les acteurs 3D au montage (au lieu de la Marionnette). 0 $, dans le navigateur.">
            <span data-testid="actors3d-toggle" data-on={on ? '1' : '0'}>
              <Toggle checked={on} disabled={!gl} onChange={(v) => useStudio.getState().setSettings({ actors3d: v })} />
            </span>
            Jouer les scènes sans clip avec les acteurs 3D
          </label>
          {!gl && <span className="text-warn">WebGL indisponible dans ce navigateur</span>}
          {projectId && bp && (
            <Button
              size="sm"
              data-testid="actors3d-cast"
              onClick={() => {
                const r = castActors(projectId);
                setNote(`${Object.keys(r.cast).length} rôle(s) distribué(s)${r.reused.length ? ` · réutilisés : ${r.reused.join(', ')}` : ''}${r.added.length ? ` · nouveaux : ${r.added.join(', ')}` : ''}`);
              }}
            >
              Distribuer les rôles de ce film
            </Button>
          )}
          <Button
            size="sm"
            data-testid="actors3d-troupe"
            title={`Les ${TROUPE.length} acteurs récurrents de @comedyvideos_100 (bible des personnages, catalogues de la chaîne, clip 041701) : mêmes noms, mêmes rôles, mêmes tenues dans chaque film.`}
            onClick={() => {
              const lib = useStudio.getState().actors;
              const missing = TROUPE.filter((c) => !lib[speakerKey(c.name)]).map((c) => ({ ...lookFromSheet(c), source: 'troupe' as const, updatedAt: Date.now(), films: 0 }));
              useStudio.getState().upsertActors(missing);
              setNote(missing.length ? `univers @comedyvideos_100 : ${missing.length} acteur(s) ajouté(s)` : 'l’univers est déjà dans la bibliothèque');
            }}
          >
            Ajouter l’univers @comedyvideos_100 ({TROUPE.length} personnages)
          </Button>
          {troupeKit && (
            <Button
              size="sm"
              disabled={installing}
              data-testid="troupe-install"
              title="Vos planches, galeries et décors sont intégrés à ce fichier (jamais publiés) et installés tout seuls ; ce bouton les réinstalle."
              onClick={() => void installTroupe(true)}
            >
              {installing ? 'Installation de votre troupe…' : `Votre troupe intégrée (${troupeKit.planches.length} planches, ${troupeKit.galeries.reduce((a, g) => a + g.names.length, 0)} figures, ${kitDecorCount(troupeKit)} décors)`}
            </Button>
          )}
          <span className="flex items-center gap-1" title="Votre planche de personnage sur fond vert (plusieurs poses : neutre, accuse, choc, haussement, fou rire). Le personnage joue avec VOS dessins, et la planche devient sa référence pour les images et les clips Grok.">
            <input value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder="Nom du personnage" className="w-36 rounded border border-line bg-input px-1" data-testid="sheet-name" />
            <label className="cursor-pointer rounded-lg border border-accent px-2 py-1 text-accent">
              Importer une planche (fond vert)
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void importPlanche(e.target.files[0], sheetName)} data-testid="sheet-file" />
            </label>
          </span>
          <span className="flex items-center gap-1" title="Une image fond vert avec PLUSIEURS personnages (un par silhouette) : chacun devient un acteur. Tapez leurs noms dans l’ordre de lecture (ligne par ligne, de gauche à droite).">
            <input value={galleryText} onChange={(e) => setGalleryText(e.target.value)} placeholder="Noms, dans l’ordre (MAMAN NOUNOU, COUMBA…)" className="w-56 rounded border border-line bg-input px-1" data-testid="gallery-names" />
            <label className="cursor-pointer rounded-lg border border-line px-2 py-1">
              Importer une galerie
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void importGallery(e.target.files[0])} data-testid="gallery-file" />
            </label>
          </span>
          {note && (
            <span className="text-faint" data-testid="actors3d-note">
              {note}
            </span>
          )}
        </div>
        {list.length === 0 ? (
          <div className="text-faint">Aucun acteur pour l’instant : ils sont créés depuis les fiches des personnages au premier film joué en 3D (ou avec « Distribuer les rôles »).</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <div className="flex max-h-[300px] w-56 flex-col gap-1 overflow-auto" data-testid="actors3d-list">
              {list.map((a) => (
                <button key={a.key} onClick={() => setSel(a.key)} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-left ${cur?.key === a.key ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <span className="flex gap-0.5">
                    <Swatch c={a.skin} t="peau" />
                    <Swatch c={a.top} t="haut" />
                    <Swatch c={a.bottom} t="bas" />
                  </span>
                  <span className="flex-1 truncate font-medium">{a.name}</span>
                  <span className="text-faint">{a.films ?? 0} film(s)</span>
                </button>
              ))}
            </div>
            {cur && gl && <Preview key={`${cur.key}-${cur.updatedAt ?? 0}`} look={cur} />}
            {cur && gl && cur.sheet && (
              <div className="flex flex-col gap-1">
                <Button size="sm" data-testid="duo-toggle" onClick={() => setDuo((v) => !v)}>
                  {duo ? '■ Arrêter le test' : '▶ Test d’animation'}
                </Button>
                {duo && <DuoTest key={cur.key} look={cur} />}
              </div>
            )}
            {cur && (
              <div className="grid min-w-[260px] flex-1 grid-cols-2 gap-x-3 gap-y-1" data-testid="actor-editor">
                <div className="col-span-2 flex items-center gap-2">
                  <b>{cur.name}</b>
                  <Badge tone={cur.source === 'vrm' || cur.sheet ? 'accent' : 'neutral'}>{cur.sheet ? `planche · ${cur.sheet.poses.length} poses` : cur.source === 'vrm' ? 'modèle VRM' : cur.source === 'manuel' ? 'retouché' : cur.source === 'troupe' ? 'troupe' : 'depuis la fiche'}</Badge>
                  {cur.role && <span className="text-faint">{cur.role}</span>}
                  <span className="text-faint">
                    {cur.gender === 'f' ? 'femme' : 'homme'} · {cur.age}
                  </span>
                </div>
                {(
                  [
                    ['skin', 'Peau'],
                    ['top', 'Haut / boubou'],
                    ['bottom', 'Bas / pagne'],
                    ['hair', 'Cheveux'],
                    ['shoes', 'Chaussures'],
                    ['accent', 'Couleur d’accent'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2">
                    {label}
                    <input type="color" value={cur[k]} onChange={(e) => save({ [k]: e.target.value })} data-testid={`actor-color-${k}`} />
                  </label>
                ))}
                <label className="flex items-center justify-between gap-2">
                  Coiffure
                  <Select value={cur.hairStyle} onChange={(v) => save({ hairStyle: v as HairStyle })} options={HAIR} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Silhouette
                  <Select value={cur.shape} onChange={(v) => save({ shape: v as BodyShape })} options={SHAPES} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Motif
                  <Select value={cur.pattern} onChange={(v) => save({ pattern: v as Pattern })} options={PATTERNS} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Pieds
                  <Select value={cur.feet} onChange={(v) => save({ feet: v as Footwear })} options={FEET} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Manches
                  <Select value={cur.sleeves} onChange={(v) => save({ sleeves: v as Sleeves })} options={SLEEVES} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Corpulence
                  <input type="range" min={0.85} max={1.3} step={0.01} value={cur.build} onChange={(e) => save({ build: Number(e.target.value) })} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Taille
                  <input type="range" min={0.6} max={1.1} step={0.01} value={cur.height} onChange={(e) => save({ height: Number(e.target.value) })} />
                </label>
                <div className="col-span-2 flex flex-wrap gap-3">
                  {(
                    [
                      ['dress', 'Boubou / robe'],
                      ['belly', 'Ventre rond'],
                      ['glasses', 'Lunettes'],
                      ['beard', 'Barbe'],
                      ['moustache', 'Moustache'],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1">
                      <input type="checkbox" checked={Boolean(cur[k])} onChange={(e) => save({ [k]: e.target.checked })} />
                      {label}
                    </label>
                  ))}
                </div>
                <Poses
                  look={cur}
                  onKind={(i, k) => save({ sheet: { ...cur.sheet!, poses: cur.sheet!.poses.map((p, j) => (j === i ? { ...p, kind: k } : p)) }, source: 'planche' })}
                />
                <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1">
                  <label className="cursor-pointer rounded-lg border border-line px-2 py-1" title="Un personnage 3D riggé (VRM de VRoid, ou tout .glb humanoïde : Mixamo, UniRig, Make-It-Animatable, Rigify…) : reconnu et normalisé en T-pose automatiquement, il remplace le corps procédural ; les mêmes gestes et la même bouche le pilotent.">
                    Importer un .vrm / .glb riggé
                    <input type="file" accept=".vrm,.glb,.gltf" className="hidden" onChange={(e) => e.target.files?.[0] && void importVrm(e.target.files[0])} data-testid="actor-vrm-file" />
                  </label>
                  {cur.sheet?.poses.some((p) => p.kind === 'neutre' && p.body) && (
                    <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1" title="Le dessin neutre de la planche devient un corps 3D (volume gonflé depuis sa silhouette, os posés sur son squelette mesuré, poids de peau automatiques, le dessin projeté comme peau) : le jeu corps entier du moteur l’anime en 3D. Première étape de l’architecture « corps 3D, peau 2D » : le visage n’est pas encore animé sur ce corps.">
                      <input type="checkbox" checked={!!cur.body3d} onChange={(e) => save({ body3d: e.target.checked })} data-testid="actor-body3d" />
                      Corps 3D (dessin gonflé)
                    </label>
                  )}
                  {cur.vrmAssetId && (
                    <Button size="sm" onClick={() => save({ vrmAssetId: undefined, source: 'manuel' })}>
                      Retirer le .vrm
                    </Button>
                  )}
                  {sheet && (
                    <Button size="sm" title="Reconstruit l’acteur depuis la fiche du personnage de ce film." onClick={() => save({ ...lookFromSheet(sheet), films: cur.films, vrmAssetId: cur.vrmAssetId, source: 'fiche' })}>
                      Recaler sur la fiche
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      useStudio.getState().removeActor(cur.key);
                      setSel(null);
                    }}
                  >
                    Retirer de la bibliothèque
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <Decors />
      </div>
    </details>
  );
}
