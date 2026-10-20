// TOURNER DANS BLENDER (LOCAL) — la production écrite ici (scènes, répliques, émotions) part au pont Blender de la
// machine de l'utilisateur (blender/blender-bridge.py) qui tourne le film complet : troupe dessinée, voix, décor peint ou
// lieu vivant construit, jeu, caméras, timing comique, son, étalonnage, porte de qualité. Retour : la vidéo, la
// couverture TikTok, les sous-titres, le texte de publication et le verdict de la porte. 0 $ (tout est local).
import { useEffect, useState } from 'react';
import { Badge, Button } from '@workbench/web/components/ui';
import { BRIDGE_HELP, bridgeFilm, bridgeHealth, type FilmResult } from '../../navigateur/blenderBridge';
import { storyFromBlueprint } from '../../coeur/studio/blenderStory';
import type { Blueprint } from '../../coeur/studio/types';

const blobUrl = (b: Uint8Array | null, type: string) =>
  b ? URL.createObjectURL(new Blob([b as BlobPart], { type })) : null;
function save(name: string, data: Uint8Array | string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function BlenderShoot({ bp }: { bp: Blueprint }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [res, setRes] = useState<FilmResult | null>(null);
  const [urls, setUrls] = useState<{ video: string | null; cover: string | null }>({
    video: null,
    cover: null,
  });
  const conv = storyFromBlueprint(bp);
  useEffect(() => () => Object.values(urls).forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  const shoot = async () => {
    setErr('');
    setRes(null);
    const h = await bridgeHealth();
    if (!h) return setErr(BRIDGE_HELP);
    if (!conv.story || conv.problems.length) return setErr(conv.problems.join('\n'));
    setBusy(`envoi au pont Blender (${h.blender ?? h.mode ?? 'local'})…`);
    try {
      const r = await bridgeFilm(conv.story, {
        onProgress: (f, t, st) => setBusy(`Blender · ${st}${t ? ` · image ${f}/${t}` : ''}`),
      });
      setRes(r);
      setUrls({ video: blobUrl(r.video, 'video/mp4'), cover: blobUrl(r.cover, 'image/jpeg') });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  };
  const name = (bp.title || 'film').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40);
  const gate = res?.report.gate;
  return (
    <div className="rounded-xl border border-line p-3" data-testid="blender-shoot">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[13px] font-semibold">🎬 Tourner dans Blender (local, 0 $)</div>
        <Badge tone={conv.problems.length ? 'warn' : 'ok'}>
          {conv.problems.length
            ? `${conv.problems.length} point(s) à régler`
            : `${(conv.story?.beats as unknown[] | undefined)?.length ?? 0} répliques prêtes`}
        </Badge>
        <Button
          size="sm"
          variant="primary"
          disabled={!!busy || !conv.story}
          onClick={() => void shoot()}
          data-testid="blender-shoot-go"
        >
          {busy ? 'Tournage…' : 'Tourner le film'}
        </Button>
      </div>
      <div className="mt-1 text-[11.5px] text-faint">
        Troupe dessinée, voix, décor peint ou lieu vivant construit par Blender, jeu, caméras, timing comique,
        son, étalonnage. Contrôle de conformité 3D obligatoire avant le rendu (géométrie, matériaux,
        collisions, échelle, temps réel, lumière, rigs, récit), puis porte de qualité (rythme TikTok mesuré
        sur vos vidéos).
      </div>
      {conv.story && (
        <div className="mt-1 text-[12px] text-muted" data-testid="blender-shoot-plan">
          Décor : <b>{String(conv.story.decor)}</b> · accroche : « {String(conv.story.hook)} » · distribution
          : {(conv.story.cast as { name: string }[]).map((c) => c.name).join(', ')}
        </div>
      )}
      {conv.notes.map((n) => (
        <div key={n} className="text-[11.5px] text-muted">
          ℹ {n}
        </div>
      ))}
      {conv.problems.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-[11.5px] text-warn" data-testid="blender-shoot-problems">
          {conv.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {busy && <div className="mt-1 text-[12px]">{busy}</div>}
      {err && <div className="mt-1 whitespace-pre-wrap text-[11.5px] text-err">{err}</div>}
      {res && (
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_200px]" data-testid="blender-shoot-result">
          {urls.video && <video src={urls.video} controls className="max-h-[70vh] rounded-lg" />}
          <div className="space-y-1 text-[12px]">
            {urls.cover && <img src={urls.cover} alt="couverture" className="w-full rounded-lg" />}
            {res.report.preflight && (
              <div data-testid="blender-shoot-preflight">
                <Badge
                  tone={
                    res.report.preflight.passed && (res.report.preflight.taux_objectifs ?? 0) >= 80
                      ? 'ok'
                      : 'warn'
                  }
                >
                  conformité 3D : {res.report.preflight.taux_objectifs ?? '—'} % des objectifs · qualité{' '}
                  {res.report.preflight.score}/100
                </Badge>
                <div className="text-faint">
                  conforme dès la génération :{' '}
                  {res.report.preflight.conforme_des_la_generation ? 'oui' : 'non'}
                </div>
                {res.preflightHtml && (
                  <button
                    type="button"
                    className="ml-1 text-[11.5px] text-accent underline"
                    onClick={() =>
                      window.open(
                        URL.createObjectURL(new Blob([res.preflightHtml!], { type: 'text/html' })),
                        '_blank',
                      )
                    }
                  >
                    rapport
                  </button>
                )}
              </div>
            )}
            <Badge tone={gate?.passed ? 'ok' : 'warn'}>
              {gate
                ? gate.passed
                  ? 'porte de qualité : OK'
                  : `porte : ${gate.failed.length} écart(s)`
                : 'porte non lancée'}
            </Badge>
            {gate?.failed.map((f) => (
              <div key={f} className="text-warn">
                {f}
              </div>
            ))}
            <div className="text-faint">
              {res.report.video_s.toFixed(1)} s · {res.report.shots} plans · A/V {res.report.av_gap_ms} ms
              {res.report.loudness_lufs != null ? ` · ${res.report.loudness_lufs} LUFS` : ''}
            </div>
            <div className="flex flex-wrap gap-1">
              {res.video && (
                <Button size="sm" onClick={() => save(`${name}.mp4`, res.video!, 'video/mp4')}>
                  MP4
                </Button>
              )}
              {res.cover && (
                <Button size="sm" onClick={() => save(`${name}-couverture.jpg`, res.cover!, 'image/jpeg')}>
                  Couverture
                </Button>
              )}
              {res.srt && (
                <Button size="sm" onClick={() => save(`${name}.srt`, res.srt!, 'text/plain')}>
                  Sous-titres
                </Button>
              )}
              {res.post && (
                <Button size="sm" onClick={() => save(`${name}-publication.txt`, res.post!, 'text/plain')}>
                  Texte TikTok
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
