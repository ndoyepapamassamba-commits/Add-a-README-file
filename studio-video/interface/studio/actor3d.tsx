// ACTEUR 3D — the scene played by real skeletal actors (WebGL), then handed to the motion-transfer model so the
// characters of the scene image perform it. Loaded on demand (three.js only when this panel is opened).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Select } from '@workbench/web/components/ui';
import { useStore } from '@workbench/direct/lib/store';
import { Card, NoData, useActive, usd } from './common';
import { blobs } from '../../navigateur/studio/blobs';
import { timeSubtitles } from '../../coeur/studio/subtitles';
import { defaultStaging, directScene, type CueLine } from '../../coeur/studio/actor/director';
import { ActorStage, recordPerformance } from '../../navigateur/studio/actorRender';
import { FAL_USD_PER_S, animateCharacter } from '../../navigateur/studio/actorTransfer';
import { useReglages } from '../../navigateur/reglages';

export default function Actor3DPanel() {
  const bp = useActive();
  const toast = useStore((x) => x.toast);
  const hasFal = Boolean(useReglages((x) => x.falKey));
  const [sceneId, setSceneId] = useState('');
  const [busy, setBusy] = useState('');
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const view = useRef<HTMLDivElement>(null);
  const sc = bp?.scenes.find((s) => s.scene_id === sceneId) ?? bp?.scenes[0];
  // The scene's lines with their timing (same timing as the subtitles and the voices).
  const plan = useMemo(() => {
    if (!bp || !sc) return null;
    const all = timeSubtitles(bp.scenes);
    const mine = all.filter((l) => l.sceneId === sc.scene_id);
    const t0 = mine[0]?.start ?? 0;
    const lines: CueLine[] = mine.map((l) => {
      const d = sc.dialogue[l.index];
      return { speaker: l.speaker, start: l.start - t0 + 0.4, end: l.end - t0 + 0.4, text: l.text, gesture: d?.gesture, emotion: d?.emotion };
    });
    const seconds = Math.max(sc.duration, (lines.at(-1)?.end ?? 0) + 0.8);
    const names = sc.characters.length ? sc.characters : [...new Set(lines.map((l) => l.speaker))];
    return { names, lines, seconds, scripts: directScene(names, lines, defaultStaging(names, seconds), sc.action) };
  }, [bp, sc]);
  // Live WebGL preview (loops the scene).
  useEffect(() => {
    if (!plan || !view.current) return;
    const host = view.current;
    let stage: ActorStage | null = null;
    const mount = () => {
      stage?.dispose();
      stage = new ActorStage(plan.scripts, { width: 270, height: 480 });
      const el = stage.renderer.domElement;
      el.style.borderRadius = '10px';
      host.replaceChildren(el);
    };
    try {
      mount();
    } catch {
      host.textContent = 'WebGL indisponible dans ce navigateur.';
      return;
    }
    let t = 0;
    const id = setInterval(() => {
      t += 1 / 25;
      // The step planner keeps state: the loop restarts on a fresh stage.
      if (t > plan.seconds) {
        t = 0;
        mount();
      }
      stage!.render(t);
    }, 40);
    return () => {
      clearInterval(id);
      stage?.dispose();
    };
  }, [plan]);
  if (!bp) return null;
  const keep = (name: string, b: Blob) => setFiles((f) => [...f, { name, url: URL.createObjectURL(b) }]);
  return (
    <Card title="ACTEUR 3D (squelette complet → personnage)" testId="actor3d">
      <div className="mb-2 text-[12.5px] text-muted">
        La scène est jouée par de vrais acteurs 3D (35 articulations, IK, pas posés au sol, émotions), puis le mouvement est
        transféré au personnage de l’image (Wan2.2-Animate, corps entier).
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sc?.scene_id ?? ''} onChange={(v) => setSceneId(v)} options={bp.scenes.map((s) => ({ value: s.scene_id, label: `${s.scene_id} — ${s.action.slice(0, 40)}` }))} title="Scène" />
        <Button
          size="sm"
          disabled={!plan || !!busy}
          data-testid="actor3d-record"
          onClick={async () => {
            if (!plan) return;
            setBusy('enregistrement de la performance…');
            try {
              const r = await recordPerformance(plan.scripts, plan.seconds, { pose: true, width: 540, height: 960 });
              const ext = r.mime.includes('mp4') ? 'mp4' : 'webm';
              keep(`performance-${sc!.scene_id}.${ext}`, r.performance);
              if (r.pose) keep(`squelette-openpose-${sc!.scene_id}.${ext}`, r.pose);
            } catch (e) {
              toast('err', `Acteur 3D : ${(e as Error).message}`);
            } finally {
              setBusy('');
            }
          }}
        >
          Enregistrer la performance
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!plan || !!busy || !hasFal || !sc?.imageAssetId}
          data-testid="actor3d-transfer"
          onClick={async () => {
            if (!plan || !sc?.imageAssetId) return;
            try {
              setBusy('performance…');
              const r = await recordPerformance(plan.scripts, plan.seconds, { width: 540, height: 960 });
              const img = await blobs.get(sc.imageAssetId);
              if (!img) throw new Error('image de la scène introuvable');
              setBusy('transfert au personnage (fal.ai)…');
              const out = await animateCharacter(img, r.performance, plan.seconds, { onStatus: (s) => setBusy(`transfert : ${s}`) });
              keep(`personnage-anime-${sc.scene_id}.mp4`, out.blob);
              toast('ok', `Personnage animé (${usd(out.usd)})`);
            } catch (e) {
              toast('err', `Transfert : ${(e as Error).message}`);
            } finally {
              setBusy('');
            }
          }}
        >
          Animer le personnage
        </Button>
        {!hasFal && <Badge tone="warn">clé fal.ai à renseigner (Réglages)</Badge>}
        {plan && <span className="text-[12px] text-faint">≈ {usd(plan.seconds * FAL_USD_PER_S['480p'])} en 480p</span>}
      </div>
      {busy && <div className="mt-1 text-[12px] text-faint">{busy}</div>}
      <div className="mt-2 flex flex-wrap gap-3">
        <div ref={view} data-testid="actor3d-view" />
        <div className="space-y-1 text-[12.5px]">
          {!files.length ? (
            <NoData>Aucun fichier encore.</NoData>
          ) : (
            files.map((f) => (
              <div key={f.url}>
                <a className="text-accent underline" href={f.url} download={f.name}>
                  {f.name}
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
