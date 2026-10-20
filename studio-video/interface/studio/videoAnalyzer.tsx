// 🔬 ANALYSER UNE VIDÉO — n'importe quel MP4 / WebM (un film de l'app déjà téléchargé, un clip Grok, une référence
// TikTok) : découpage en plans, mouvement, images figées, scintillement, silences, et — si demandé — le juge visuel
// plan par plan (rire, jeu, expressions, bouche, anatomie, cohérence). Les mesures locales sont gratuites ; le juge
// coûte un appel de modèle vision par plan.
import { useState } from 'react';
import { Badge, Toggle } from '@workbench/web/components/ui';
import { analyzeFilm, type FilmAnalysis } from '../../navigateur/studio/clipAnalyzer';

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function VideoAnalyzer({ projectId }: { projectId?: string }) {
  const [busy, setBusy] = useState('');
  const [judge, setJudge] = useState(false);
  const [res, setRes] = useState<FilmAnalysis | null>(null);
  const [err, setErr] = useState('');
  const run = async (f: File) => {
    setErr('');
    setRes(null);
    try {
      setRes(await analyzeFilm(f, { projectId: projectId ?? 'analyse-video', judge, onProgress: setBusy }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const frozenS = res ? res.frozen.reduce((a, f) => a + f.end - f.start, 0) : 0;
  return (
    <details className="rounded-xl border border-line p-3" data-testid="video-analyzer">
      <summary className="cursor-pointer text-[13px] font-semibold">🔬 Analyser une vidéo (mouvement, images figées, bouche, anatomie, rire)</summary>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        <input type="file" accept="video/*" disabled={Boolean(busy)} onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} data-testid="analyzer-file" />
        <label className="flex items-center gap-2" title="Un appel de modèle vision par plan (quelques millièmes de dollar chacun).">
          <Toggle checked={judge} onChange={setJudge} />
          Juge visuel (rire, bouche, anatomie)
        </label>
        {busy && <span className="text-faint">{busy}</span>}
      </div>
      {err && <div className="mt-1 text-[12px] text-err">{err}</div>}
      {res && (
        <div className="mt-2 space-y-1 text-[12px]" data-testid="analyzer-result">
          <div className="flex flex-wrap gap-2">
            <Badge tone={(res.score ?? 0) >= 70 ? 'ok' : 'warn'}>score {res.score ?? '—'}/100</Badge>
            <span>{res.seconds.toFixed(1)} s · {res.shots.length} plan(s)</span>
            <span className={frozenS >= 0.8 ? 'text-warn' : 'text-faint'} data-testid="analyzer-frozen">
              image figée : {frozenS.toFixed(1)} s{res.frozen.length ? ` (${res.frozen.slice(0, 5).map((f) => `${fmt(f.start)}–${fmt(f.end)}`).join(', ')})` : ''}
            </span>
            <span className="text-faint">{res.silences === null ? 'son : non lu' : res.silences.length ? `silences : ${res.silences.map((g) => `${(g.end - g.start).toFixed(1)} s à ${fmt(g.start)}`).join(', ')}` : 'son : continu'}</span>
          </div>
          <table className="w-full text-left">
            <thead className="text-faint">
              <tr>
                <th>Plan</th>
                <th>Score</th>
                <th>Mouvement</th>
                <th>Juge</th>
                <th>Problèmes</th>
              </tr>
            </thead>
            <tbody>
              {res.shots.map((s, i) => {
                const j = s.report.judge?.scores;
                return (
                  <tr key={i} className="border-t border-line align-top">
                    <td>
                      {fmt(s.start)}–{fmt(s.end)}
                    </td>
                    <td>{s.report.score ?? '—'}</td>
                    <td>
                      {s.report.measures.motion.toFixed(3)} · {Math.round(s.report.measures.coverage * 100)} %
                    </td>
                    <td>{j ? `rire ${j.rire} · jeu ${j.mouvement} · bouche ${j.bouche} · anat. ${j.anatomie}` : 'non mesuré'}</td>
                    <td className="text-warn">{[...s.report.reasons, ...(s.report.judge?.defects ?? [])].slice(0, 3).join(' · ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
