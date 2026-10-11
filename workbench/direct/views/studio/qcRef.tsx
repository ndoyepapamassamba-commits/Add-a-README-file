// CONTRÔLE QUALITÉ RÉFÉRENCE — fidélité visuelle mesurée (vs 041701 et vos vidéos TikTok), degré d'humour (juge à
// grille fixe), potentiel viral (format des vidéos les plus vues). Les vidéos de référence ajoutées ne sont jamais
// stockées : seules leurs mesures le sont, dans ce navigateur.
import { useState } from 'react';
import { Badge, Button } from '../../../web/components/ui';
import { useStore } from '../../lib/store';
import { Card, NoData, useActive } from './common';
import { judgeHumor } from '../../lib/studio/actions';
import { measureVideo } from '../../lib/studio/videoMetrics';
import { HUMOR_CRITERIA, REFERENCE_041701, profileFrom, viralityScore, visualFidelity, type ReferenceProfile, type VideoMetrics } from '../../../server/jev/studio/qualityRef';
import { timeSubtitles } from '../../../server/jev/studio/subtitles';

const KEY = 'massamba-qc-profile';
const loadProfile = (): ReferenceProfile => {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as ReferenceProfile) : REFERENCE_041701;
  } catch {
    return REFERENCE_041701;
  }
};
const tone = (s: number) => (s >= 85 ? 'ok' : s >= 60 ? 'warn' : 'err');

export function QcRefPanel() {
  const bp = useActive();
  const toast = useStore((x) => x.toast);
  const [profile, setProfile] = useState<ReferenceProfile>(loadProfile);
  const [visual, setVisual] = useState<ReturnType<typeof visualFidelity> | null>(null);
  const [busy, setBusy] = useState('');
  if (!bp) return null;
  const humor = bp.qc?.humor;
  const lines = timeSubtitles(bp.scenes);
  const vir = viralityScore({
    seconds: bp.scenes.reduce((a, s) => a + s.duration, 0) || bp.duration,
    aspect: bp.aspect,
    hookAt: lines[0]?.start ?? 99,
    reactionInsert: bp.aspect === '9:16',
    bilingualCaptions: bp.scenes.some((s) => s.dialogue.some((d) => d.english)),
    shotSeconds: bp.scenes.length ? bp.scenes.reduce((a, s) => a + s.duration, 0) / bp.scenes.length : 0,
    humorDegree: humor?.degree ?? null,
  });
  return (
    <Card title="CONTRÔLE QUALITÉ RÉFÉRENCE (041701 + vos TikTok)" testId="qc-ref">
      <div className="mb-2 text-[12px] text-faint">
        Profil : {profile.name} ({profile.sources} vidéo{profile.sources > 1 ? 's' : ''} mesurée{profile.sources > 1 ? 's' : ''}). Les pourcentages sont mesurés, jamais supposés.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-line px-2 py-1 text-[12.5px]">
          Contrôler une vidéo…
          <input
            type="file"
            accept="video/*"
            className="hidden"
            data-testid="qc-video"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy('mesure de la vidéo…');
              try {
                setVisual(visualFidelity(await measureVideo(f, { onProgress: (p) => setBusy(`mesure ${Math.round(p * 100)} %`) }), profile));
              } catch (err) {
                toast('err', `Contrôle : ${(err as Error).message}`);
              } finally {
                setBusy('');
              }
            }}
          />
        </label>
        <Button
          size="sm"
          disabled={!!busy || !bp.scenes.length}
          data-testid="qc-humor"
          onClick={async () => {
            setBusy('juge d’humour…');
            const v = await judgeHumor(bp.project.id);
            setBusy('');
            if (!v) toast('err', 'Aucun modèle n’a répondu : humour non jugé (rien n’est inventé).');
          }}
        >
          Juger l’humour
        </Button>
        <label className="cursor-pointer rounded-lg border border-line px-2 py-1 text-[12.5px]">
          Recalibrer sur mes vidéos…
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            data-testid="qc-calibrate"
            onChange={async (e) => {
              const fs = [...(e.target.files ?? [])];
              if (!fs.length) return;
              const list: VideoMetrics[] = [];
              for (const [i, f] of fs.entries()) {
                setBusy(`calibrage ${i + 1}/${fs.length}…`);
                try {
                  list.push(await measureVideo(f));
                } catch {
                  /* unreadable file skipped */
                }
              }
              setBusy('');
              const p = profileFrom(`vos ${list.length} vidéo(s) (référence : ${fs[0]!.name})`, list);
              setProfile(p);
              try {
                localStorage.setItem(KEY, JSON.stringify(p));
              } catch {
                /* private mode: kept for this session only */
              }
            }}
          />
        </label>
        {profile !== REFERENCE_041701 && (
          <Button size="sm" variant="ghost" onClick={() => setProfile(REFERENCE_041701)}>
            Profil 041701
          </Button>
        )}
      </div>
      {busy && <div className="mt-1 text-[12px] text-faint">{busy}</div>}
      <div className="mt-2 grid gap-3 text-[12.5px] sm:grid-cols-3">
        <div data-testid="qc-visual">
          <div className="mb-1 font-semibold">Fidélité visuelle {visual && <Badge tone={tone(visual.score)}>{visual.score} %</Badge>}</div>
          {!visual ? (
            <NoData>Choisissez une vidéo produite.</NoData>
          ) : (
            visual.items.map((i) => (
              <div key={i.key}>
                {i.label} : <Badge tone={tone(i.score)}>{i.score} %</Badge> <span className="text-faint">({i.value.toFixed(1)} / réf. {i.target.toFixed(1)})</span>
              </div>
            ))
          )}
        </div>
        <div data-testid="qc-humor-result">
          <div className="mb-1 font-semibold">Degré d’humour {humor && <Badge tone={tone(humor.degree)}>{humor.degree} % — {humor.label}</Badge>}</div>
          {!humor ? (
            <NoData>Pas encore jugé.</NoData>
          ) : (
            <>
              {HUMOR_CRITERIA.map((c) => (
                <div key={c.id}>
                  {c.label} : {humor.scores[c.id]}/10
                </div>
              ))}
              {humor.fix && <div className="mt-1 text-muted">À corriger : {humor.fix}</div>}
            </>
          )}
        </div>
        <div data-testid="qc-virality">
          <div className="mb-1 font-semibold">
            Potentiel viral <Badge tone={tone(vir.score)}>{vir.score} %</Badge>
          </div>
          {vir.items.map((i) => (
            <div key={i.label}>
              {i.label} : {i.score} % <span className="text-faint">({i.why})</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
