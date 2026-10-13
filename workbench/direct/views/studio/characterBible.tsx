// BIBLE DES PERSONNAGES + MONDE VIVANT — la base de connaissances du moteur narratif, consultable : une fiche par
// personnage (apparence, tenue, âge, posture, personnalité, traits, habitudes, émotions, réactions, intérêts, forces,
// faiblesses, comportements par situation, répliques, ressort comique, liens), et les lieux avec ce qui les fait vivre
// (objets, figurants, animaux, effets, sons). Le moteur s'en sert seul à chaque écriture ; ce panneau sert à la lire.
import { useMemo, useState } from 'react';
import { Badge } from '../../../web/components/ui';
import { Card } from './common';
import {
  PROFILES,
  SITUATION_LABEL,
  SITUATIONS,
  arcOf,
  relationsOf,
  type CharacterProfile,
  type Dessin,
} from '../../../server/jev/studio/actor/characterBible';
import { episodesOf } from '../../../server/jev/studio/tiktokComedy';
import { universeCharacter } from '../../../server/jev/studio/actor/universe';
import { PLACES } from '../../../server/jev/studio/world/livingWorld';

const DESSIN_LABEL: Record<Dessin, string> = {
  planche: 'planche 5 poses',
  galerie: 'figure de galerie',
  catalogue: 'catalogue (à découper)',
  'à dessiner': 'à dessiner',
};
const TONE: Record<Dessin, 'ok' | 'info' | 'neutral' | 'warn'> = {
  planche: 'ok',
  galerie: 'info',
  catalogue: 'neutral',
  'à dessiner': 'warn',
};
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Fiche({ p }: { p: CharacterProfile }) {
  const u = universeCharacter(p.name);
  const rel = relationsOf(p.name);
  const arc = arcOf(p.name);
  const eps = episodesOf(p.name);
  const row = (label: string, value: string) => (
    <div>
      <span className="font-semibold">{label} : </span>
      <span className="text-muted">{value}</span>
    </div>
  );
  return (
    <div className="space-y-1 text-[12.5px]" data-testid="bible-fiche">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold">{p.name}</span>
        {p.surnom && <span className="text-faint">« {p.surnom} »</span>}
        <Badge tone={TONE[p.dessin]}>{DESSIN_LABEL[p.dessin]}</Badge>
        <span className="text-faint">
          {u?.role} · {p.age} · {p.taille.toFixed(2)} m · voix {p.voix.piper}
        </span>
      </div>
      {row('Apparence', p.apparence)}
      {row('Tenue', p.tenue)}
      {row('Posture', p.posture)}
      {row('Personnalité', p.personnalite)}
      {row('Traits', p.traits.join(', '))}
      {row('Habitudes', p.habitudes.join(' ; '))}
      {row('Émotions dominantes', p.emotions.join(', '))}
      {row('Réactions typiques', p.reactions.join(' ; '))}
      {row('Centres d’intérêt', p.interets.join(', '))}
      {row('Forces', p.forces.join(', '))}
      {row('Faiblesses', p.faiblesses.join(', '))}
      {arc && (
        <div data-testid="bible-arc">
          {row('Expressions faciales', arc.expressions.join(' ; '))}
          {row('Humeur de fond', arc.humeur)}
          {row('Langage', arc.langage)}
          {row('Objectifs', arc.objectifs.join(' ; '))}
          {row(
            'Historique',
            [...arc.historique, ...eps.map((e) => `épisode « ${e.title} » (${e.decor})`)].join(' ; '),
          )}
        </div>
      )}
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        {SITUATIONS.map((s) => (
          <div key={s} className="rounded-lg border border-line px-2 py-1">
            <div className="text-[11px] uppercase tracking-wide text-faint">{SITUATION_LABEL[s]}</div>
            <div>{p.situations[s]}</div>
          </div>
        ))}
      </div>
      {row('Répliques', p.repliques.map((r) => `« ${r} »`).join(' '))}
      {row('Ressort comique', p.moteur)}
      {row('Lieux fréquentés', `${p.lieux.join(', ')} — en fond : ${p.activite}`)}
      {rel.length > 0 && (
        <div data-testid="bible-relations">
          <span className="font-semibold">Liens : </span>
          {rel.map((r, i) => (
            <div key={i} className="text-muted">
              {r.a} → {r.b} : {r.lien} — <span className="text-faint">{r.dynamique}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CharacterBiblePanel() {
  const [tab, setTab] = useState<'personnages' | 'lieux'>('personnages');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Dessin | 'tous'>('tous');
  const [open, setOpen] = useState<string>(PROFILES[0]!.name);
  const shown = useMemo(
    () =>
      PROFILES.filter(
        (p) =>
          (filter === 'tous' || p.dessin === filter) &&
          (!q ||
            fold(
              `${p.name} ${p.moteur} ${p.traits.join(' ')} ${universeCharacter(p.name)?.role ?? ''}`,
            ).includes(fold(q))),
      ),
    [q, filter],
  );
  const cur = PROFILES.find((p) => p.name === open) ?? shown[0];
  return (
    <Card
      title={`BIBLE DES PERSONNAGES (${PROFILES.length}) · MONDE VIVANT (${PLACES.length} lieux)`}
      testId="character-bible"
      right={
        <div className="flex gap-1 text-[12px]">
          {(['personnages', 'lieux'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              data-testid={`bible-tab-${t}`}
              className={`rounded-full border px-2 py-0.5 ${tab === t ? 'border-accent text-accent' : 'border-line text-muted'}`}
            >
              {t === 'personnages' ? 'Personnages' : 'Lieux'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'personnages' ? (
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher (nom, trait, ressort…)"
              data-testid="bible-search"
              className="mb-1 w-full rounded-lg border border-line bg-transparent px-2 py-1 text-[12px]"
            />
            <div className="mb-1 flex flex-wrap gap-1 text-[11px]">
              {(['tous', 'planche', 'galerie', 'catalogue', 'à dessiner'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFilter(d)}
                  className={`rounded-full border px-1.5 ${filter === d ? 'border-accent text-accent' : 'border-line text-faint'}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="max-h-80 overflow-auto pr-1 text-[12.5px]" data-testid="bible-list">
              {shown.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setOpen(p.name)}
                  className={`block w-full truncate rounded px-1.5 py-0.5 text-left ${cur?.name === p.name ? 'bg-accent/15 text-accent' : 'hover:bg-line/40'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[28rem] overflow-auto pr-1">{cur && <Fiche p={cur} />}</div>
        </div>
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-auto pr-1 text-[12.5px]" data-testid="bible-places">
          {PLACES.map((pl) => (
            <div key={pl.id} className="rounded-lg border border-line p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{pl.nom}</span>
                <Badge tone={pl.kit ? 'ok' : 'info'}>
                  {pl.kit ? `décor peint : ${pl.kit}` : `décor 3D : ${pl.template}`}
                </Badge>
                <span className="text-faint">
                  {pl.exterieur ? 'extérieur' : 'intérieur'} · lumière {pl.heure}
                </span>
              </div>
              <div className="text-muted">{pl.vie}</div>
              <div>
                <span className="font-semibold">Objets : </span>
                {pl.objets.map((o) => `${o.nom} (${o.interaction})`).join(' ; ')}
              </div>
              {pl.pnj.length > 0 && (
                <div>
                  <span className="font-semibold">Figurants : </span>
                  {pl.pnj.map((n) => `${n.role} (${n.comportement}, ${n.n[0]}–${n.n[1]})`).join(' ; ')}
                </div>
              )}
              {pl.animaux.length > 0 && (
                <div>
                  <span className="font-semibold">Animaux : </span>
                  {pl.animaux.map((a) => `${a.espece} — ${a.comportement}`).join(' ; ')}
                </div>
              )}
              <div className="text-faint">
                Effets : {pl.fx.join(', ')} · Sons : {pl.sons.join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
