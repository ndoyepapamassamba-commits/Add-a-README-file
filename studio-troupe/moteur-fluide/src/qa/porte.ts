/**
 * Porte qualité sur l'état du moteur : échantillonne `evaluer(projet, n/fps)` à la cadence de sortie, mesure
 * (`metriques.ts`) et rend un verdict PASS / FAIL chiffré.
 *
 * Les seuils viennent des échecs passés (« trop lego », « irréel », mouvement trop faible ou saccadé) : le minimum
 * d'énergie et de mouvement franc rejette un personnage qui ne fait que respirer ; le maximum rejette l'agitation
 * illisible ; l'indice de tremblement rejette le bruit image par image ; les sauts de pose, le glissement des pieds et
 * l'immobilité au-delà de 1,5 s (hors gel voulu) sont refusés. Les seuils sont réglables (`SeuilsQualite`).
 */
import { imageVersTemps } from '../noyau/temps';
import { finReplique } from '../timeline/derives';
import { evaluer } from '../timeline/evaluer';
import type { CharacterRig, EtatImage, Moteur, Projet } from '../timeline/types';
import {
  extraireSeries,
  mesurerCamera,
  mesurerLevres,
  mesurerPersonnage,
  type ExclusionCamera,
  type MesuresCamera,
  type MesuresLevres,
  type MesuresPersonnage,
  type ParolePersonnage,
  type ReglagesMesures,
} from './metriques';
import type { MesureQualite, RapportQualite } from './types';

/** Seuils du verdict. */
export interface SeuilsQualite {
  /** Temps de jeu minimal (s) pour juger l'énergie d'un personnage. */
  dureeMinEnergie: number;
  /** Énergie de jeu (vitesse moyenne des articulations, H/s) : minimum et maximum. */
  energieMin: number;
  energieMax: number;
  /** Part minimale des images avec un mouvement franc (au moins un membre ≥ 0,25 H/s). */
  mouvementFrancMin: number;
  /** Plus long passage mou toléré à l'écran (s) : respiration seule, attente sans jeu. */
  passageMouMax: number;
  /** Vitesse maximale d'un point, centile 99 (H/s). */
  vitesseMaxP99: number;
  /** Indice de tremblement, centile 95 (sans unité). */
  tremblementMax: number;
  /** À-coups, centile 99 (H/s³). */
  jerkMaxP99: number;
  /** Glissement d'un pied posé (px de sortie par image, centile 95) et dérive cumulée par appui (H). */
  glissementMax: number;
  deriveMax: number;
  /** Immobilité totale maximale à l'écran hors gel (s). */
  immobiliteMax: number;
  /** Temps à l'écran à partir duquel au moins un clignement est exigé (s). */
  dureeClignement: number;
  /** Bouche pendant la parole : écart-type minimal de l'ouverture. */
  levresEcartTypeMin: number;
  /** Part minimale des M/B/P où la bouche se ferme. */
  fermeturesMBPMin: number;
  /** Corrélation minimale ouverture ↔ énergie de la voix, et décalage maximal (images). */
  correlationMin: number;
  decalageMax: number;
  /** Caméra : vitesse du centre (hauteurs d'écran/s), vitesse de zoom (1/s), roulis (rad/s), tremblement. */
  cameraVitesseMax: number;
  cameraZoomMax: number;
  cameraRotationMax: number;
  cameraTremblementMax: number;
}

export const SEUILS_DEFAUT: SeuilsQualite = {
  dureeMinEnergie: 1,
  energieMin: 0.06,
  energieMax: 1.2,
  mouvementFrancMin: 0.25,
  passageMouMax: 3,
  vitesseMaxP99: 10,
  tremblementMax: 1.3,
  jerkMaxP99: 3000,
  glissementMax: 2,
  deriveMax: 0.05,
  immobiliteMax: 1.5,
  dureeClignement: 6,
  levresEcartTypeMin: 0.05,
  fermeturesMBPMin: 0.85,
  correlationMin: 0.3,
  decalageMax: 3,
  cameraVitesseMax: 1.5,
  cameraZoomMax: 3,
  cameraRotationMax: 1,
  cameraTremblementMax: 1.5,
};

/** Contexte de la porte sur des états. */
export interface ContextePorte {
  fps: number;
  largeur: number;
  hauteur: number;
  rigs: Readonly<Record<string, CharacterRig>>;
  /** Index absolu de chaque état (défaut 0, 1, 2…). */
  images?: readonly number[];
  exclusionsCamera?: readonly ExclusionCamera[];
  /** Parole par personnage (synchro labiale). */
  parole?: Readonly<Record<string, ParolePersonnage>>;
  reglages?: Partial<ReglagesMesures>;
}

const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));

/** Porte qualité sur une suite d'états pris à la cadence de sortie. */
export function porteEtats(etats: readonly EtatImage[], ctx: ContextePorte, seuils: Partial<SeuilsQualite> = {}): RapportQualite {
  const S = { ...SEUILS_DEFAUT, ...seuils };
  const series = extraireSeries(etats, { fps: ctx.fps, rigs: ctx.rigs, largeur: ctx.largeur, hauteur: ctx.hauteur, ...(ctx.images ? { images: ctx.images } : {}) });
  const mesures: MesureQualite[] = [];
  const m = (x: MesureQualite): void => {
    mesures.push(x);
  };
  const personnages: MesuresPersonnage[] = [];
  const levres: MesuresLevres[] = [];

  for (const s of series.personnages) {
    const p = mesurerPersonnage(s, ctx.reglages);
    personnages.push(p);
    const id = p.id;
    m({ nom: 'valeurs finies', personnage: id, valeur: p.nonFinis, seuil: '= 0', ok: p.nonFinis === 0 });
    if (p.dureeJeu >= S.dureeMinEnergie) {
      m({
        nom: 'énergie de jeu (minimum : pas de personnage figé ou mou)',
        personnage: id,
        valeur: p.energieJeu,
        unite: 'H/s',
        seuil: `≥ ${S.energieMin}`,
        ok: p.energieJeu >= S.energieMin,
        detail: `marche comprise ${f(p.energieTotale)} H/s ; rotation des os ${f(p.vitesseAngulaire)} rad/s ; ancrage ${f(p.vitesseRacine)} H/s`,
      });
      m({ nom: 'énergie de jeu (maximum : agitation illisible)', personnage: id, valeur: p.energieJeu, unite: 'H/s', seuil: `≤ ${S.energieMax}`, ok: p.energieJeu <= S.energieMax });
      m({
        nom: 'part de mouvement franc',
        personnage: id,
        valeur: p.partMouvementFranc,
        seuil: `≥ ${S.mouvementFrancMin}`,
        ok: p.partMouvementFranc >= S.mouvementFrancMin,
        detail: 'images où au moins une articulation va à ≥ 0,25 H/s',
      });
      m({
        nom: 'passage mou (respiration seule)',
        personnage: id,
        valeur: p.passageMouMax,
        unite: 's',
        seuil: `≤ ${S.passageMouMax}`,
        ok: p.passageMouMax <= S.passageMouMax,
        detail: `vitesse de jeu < ${ctx.reglages?.vitesseMolle ?? 0.05} H/s en moyenne glissante${p.passageMouDebut !== null && p.passageMouMax > S.passageMouMax ? ` ; dès l'image ${p.passageMouDebut}` : ''}`,
      });
      m({ nom: 'vitesse maximale (c99)', personnage: id, valeur: p.vitesseMaxP99, unite: 'H/s', seuil: `≤ ${S.vitesseMaxP99}`, ok: !(p.vitesseMaxP99 > S.vitesseMaxP99), detail: `maximum ${f(p.vitesseMax)} H/s` });
      m({
        nom: 'tremblement (c95)',
        personnage: id,
        valeur: p.tremblementP95,
        seuil: `≤ ${S.tremblementMax}`,
        ok: !(p.tremblementP95 > S.tremblementMax),
        detail: `‖Δ³‖/‖Δ‖ sur ${ctx.reglages?.fenetreTremblement ?? 0.5} s ; maximum ${f(p.tremblementMax)}`,
      });
      m({ nom: 'à-coups (c99)', personnage: id, valeur: p.jerkP99, unite: 'H/s³', seuil: `≤ ${S.jerkMaxP99}`, ok: !(p.jerkP99 > S.jerkMaxP99), detail: `c50 ${f(p.jerkP50, 1)} ; c95 ${f(p.jerkP95, 1)}` });
    } else {
      m({ nom: 'énergie de jeu', personnage: id, valeur: p.dureeJeu, unite: 's', seuil: `non jugée sous ${S.dureeMinEnergie} s de jeu`, ok: true, bloquant: false });
    }
    m({
      nom: 'sauts de pose',
      personnage: id,
      valeur: p.sauts.length,
      seuil: '= 0',
      ok: p.sauts.length === 0,
      ...(p.sauts.length
        ? { detail: `images ${p.sauts.slice(0, 10).join(', ')}${p.demiTours.length ? ` ; dont demi-tour instantané (miroir sans transition) aux images ${p.demiTours.join(', ')}` : ''}` }
        : {}),
    });
    if (p.glissement) {
      m({
        nom: 'glissement des pieds posés (c95)',
        personnage: id,
        valeur: p.glissement.p95,
        unite: 'px/image',
        seuil: `≤ ${S.glissementMax}`,
        ok: p.glissement.p95 <= S.glissementMax,
        detail: `${p.glissement.appuis} appui(s), ${p.glissement.imagesAppui} image(s) d'appui, maximum ${f(p.glissement.max, 2)} px`,
      });
      m({ nom: 'dérive d’un pied posé', personnage: id, valeur: p.glissement.derive, unite: 'H', seuil: `≤ ${S.deriveMax}`, ok: p.glissement.derive <= S.deriveMax });
    }
    m({
      nom: 'immobilité totale hors gel',
      personnage: id,
      valeur: p.immobiliteMax,
      unite: 's',
      seuil: `≤ ${S.immobiliteMax}`,
      ok: p.immobiliteMax <= S.immobiliteMax,
      ...(p.immobiliteDebut !== null && p.immobiliteMax > S.immobiliteMax ? { detail: `à partir de l'image ${p.immobiliteDebut}` } : {}),
    });
    if (p.dureeALEcran >= S.dureeClignement) {
      m({ nom: 'clignements', personnage: id, valeur: p.clignements, seuil: '≥ 1', ok: p.clignements >= 1, detail: `${f(p.clignementsParMinute, 1)} par minute` });
    }
    const parole = ctx.parole?.[id];
    if (parole && parole.repliques.length > 0) {
      const l = mesurerLevres(s, parole);
      levres.push(l);
      if (l.imagesParole >= 6) {
        m({
          nom: 'bouche active pendant la parole',
          personnage: id,
          valeur: l.ouvertureEcartType,
          seuil: `écart-type ≥ ${S.levresEcartTypeMin}`,
          ok: l.ouvertureEcartType >= S.levresEcartTypeMin,
          detail: `ouverture moyenne ${f(l.ouvertureMoyenne)} (hors parole ${f(l.ouvertureHorsParole)}) sur ${l.imagesParole} images`,
        });
        if (l.fermeturesMBP.total > 0) {
          const part = l.fermeturesMBP.fermees / l.fermeturesMBP.total;
          m({
            nom: 'fermetures M/B/P',
            personnage: id,
            valeur: part,
            seuil: `≥ ${S.fermeturesMBPMin}`,
            ok: part >= S.fermeturesMBPMin,
            detail: `${l.fermeturesMBP.fermees}/${l.fermeturesMBP.total}`,
          });
        }
        if (l.correlation !== null) {
          m({
            nom: 'synchro labiale (corrélation bouche ↔ voix)',
            personnage: id,
            valeur: l.correlation,
            seuil: `≥ ${S.correlationMin}, décalage ≤ ${S.decalageMax} images`,
            ok: l.correlation >= S.correlationMin && Math.abs(l.decalage ?? 99) <= S.decalageMax,
            detail: `meilleur décalage ${l.decalage} image(s) (positif : la bouche précède la voix)`,
          });
        }
      }
    }
  }

  const camera: MesuresCamera = mesurerCamera(series.camera, ctx.exclusionsCamera ?? [], ctx.reglages);
  m({ nom: 'caméra : valeurs finies', valeur: camera.nonFinis, seuil: '= 0', ok: camera.nonFinis === 0 });
  m({ nom: 'caméra : vitesse du cadre', valeur: camera.vitesseMax, unite: 'écrans/s', seuil: `≤ ${S.cameraVitesseMax} (hors filé)`, ok: camera.vitesseMax <= S.cameraVitesseMax, detail: `c95 ${f(camera.vitesseP95)}` });
  m({ nom: 'caméra : vitesse de zoom', valeur: camera.zoomMax, unite: '1/s', seuil: `≤ ${S.cameraZoomMax} (hors punch-in)`, ok: camera.zoomMax <= S.cameraZoomMax });
  m({ nom: 'caméra : roulis', valeur: camera.rotationMax, unite: 'rad/s', seuil: `≤ ${S.cameraRotationMax}`, ok: camera.rotationMax <= S.cameraRotationMax });
  m({ nom: 'caméra : tremblement (c95)', valeur: camera.tremblementP95, seuil: `≤ ${S.cameraTremblementMax}`, ok: camera.tremblementP95 <= S.cameraTremblementMax });
  m({ nom: 'caméra : sauts dans un plan', valeur: camera.sauts.length, seuil: '= 0', ok: camera.sauts.length === 0, ...(camera.sauts.length ? { detail: `images ${camera.sauts.slice(0, 10).join(', ')}` } : {}) });

  const verdict = mesures.every((x) => x.ok || x.bloquant === false) ? 'PASS' : 'FAIL';
  return {
    verdict,
    mesures,
    portee: 'états du moteur',
    images: etats.length,
    fps: ctx.fps,
    details: { personnages, levres, camera },
  };
}

/** Parole des personnages d'un projet (intervalles des répliques, phonèmes absolus, enveloppes fournies). */
export function paroleDuProjet(projet: Projet, enveloppes: Readonly<Record<string, Float64Array>> = {}): Record<string, ParolePersonnage> {
  const r: Record<string, ParolePersonnage> = {};
  for (const rep of projet.pistes.dialogue) {
    const p = (r[rep.personnage] ??= { repliques: [], phonemes: [] });
    p.repliques.push({ debut: rep.debut, fin: finReplique(rep) });
    for (const ph of rep.phonemes ?? []) p.phonemes.push({ debut: rep.debut + ph.debut, fin: rep.debut + ph.fin, ph: ph.ph });
  }
  for (const [id, env] of Object.entries(enveloppes)) if (r[id]) r[id]!.enveloppe = env;
  return r;
}

/** Intervalles où la caméra a le droit d'aller vite (filé, punch-in, gel). */
export function exclusionsCameraDuProjet(projet: Projet): ExclusionCamera[] {
  const r: ExclusionCamera[] = [];
  for (const c of projet.pistes.camera) {
    if (c.type === 'file') r.push({ debut: c.debut, fin: c.debut + c.duree, type: 'deplacement' });
    // Punch-in : zoom éclair ANCRÉ SUR LE VISAGE — le visage reste fixe à l'écran, donc le centre du cadre se déplace
    // forcément pendant le zoom ; ce n'est pas un panoramique. Fenêtre élargie au dépassement du ressort (≈ 2 × durée).
    else if (c.type === 'punchIn') r.push({ debut: c.debut, fin: c.debut + 2 * c.duree, type: 'tout' });
    else if (c.type === 'gel') r.push({ debut: c.debut, fin: c.debut + c.duree, type: 'zoom' });
  }
  return r;
}

/** Options de la porte sur un projet. */
export interface OptionsPorteProjet {
  /** Plage d'images `[premiere, derniere[` (défaut : tout le projet). */
  premiere?: number;
  derniere?: number;
  /** Enveloppes RMS des voix par personnage (index = image absolue). */
  enveloppes?: Readonly<Record<string, Float64Array>>;
  seuils?: Partial<SeuilsQualite>;
  reglages?: Partial<ReglagesMesures>;
  /** Nombre d'images réévaluées dans le désordre pour contrôler le déterminisme (défaut 8). */
  controleDeterminisme?: number;
}

/**
 * Porte qualité d'un projet : évalue chaque image de la plage à la cadence de sortie, contrôle la couverture
 * (aucune exception) et le déterminisme (mêmes états réévalués dans un autre ordre), puis `porteEtats`.
 */
export function porteProjet(projet: Projet, moteur: Moteur, o: OptionsPorteProjet = {}): RapportQualite {
  const fps = projet.fps;
  const total = Math.round(projet.duree * fps);
  const premiere = Math.max(0, o.premiere ?? 0);
  const derniere = Math.min(total, o.derniere ?? total);
  const etats: EtatImage[] = [];
  const images: number[] = [];
  const erreurs: string[] = [];
  const t0 = performance.now();
  for (let n = premiere; n < derniere; n++) {
    try {
      etats.push(evaluer(projet, imageVersTemps(n, fps), moteur));
      images.push(n);
    } catch (e) {
      if (erreurs.length < 5) erreurs.push(`image ${n} : ${(e as Error).message}`);
    }
  }
  const msParImage = (performance.now() - t0) / Math.max(1, derniere - premiere);
  // Déterminisme : quelques images réévaluées en ordre inverse doivent donner exactement le même état.
  let differentes = 0;
  const nControle = Math.min(etats.length, o.controleDeterminisme ?? 8);
  for (let i = nControle - 1; i >= 0; i--) {
    const k = Math.floor(((i + 0.5) / nControle) * etats.length);
    const n = images[k]!;
    if (JSON.stringify(evaluer(projet, imageVersTemps(n, fps), moteur)) !== JSON.stringify(etats[k])) differentes++;
  }
  const rapport = porteEtats(
    etats,
    {
      fps,
      largeur: projet.sortie.largeur,
      hauteur: projet.sortie.hauteur,
      rigs: moteur.ressources.rigs,
      images,
      exclusionsCamera: exclusionsCameraDuProjet(projet),
      parole: paroleDuProjet(projet, o.enveloppes),
      ...(o.reglages ? { reglages: o.reglages } : {}),
    },
    o.seuils,
  );
  rapport.mesures.unshift(
    {
      nom: 'couverture des images',
      valeur: etats.length,
      seuil: `= ${derniere - premiere}`,
      ok: etats.length === derniere - premiere,
      ...(erreurs.length ? { detail: erreurs.join(' ; ') } : { detail: `${f(msParImage, 3)} ms par image évaluée` }),
    },
    { nom: 'déterminisme (réévaluation dans le désordre)', valeur: differentes, seuil: '= 0 différence', ok: differentes === 0, detail: `${nControle} images contrôlées` },
  );
  rapport.verdict = rapport.mesures.every((x) => x.ok || x.bloquant === false) ? 'PASS' : 'FAIL';
  return rapport;
}

const echapper = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Rapport de qualité en Markdown (français). */
export function qualiteEnMarkdown(r: RapportQualite, titre = 'Porte qualité'): string {
  const l: string[] = [];
  const echecs = r.mesures.filter((x) => !x.ok && x.bloquant !== false);
  const avert = r.mesures.filter((x) => !x.ok && x.bloquant === false);
  l.push(`## ${titre} (${r.portee ?? ''}) — ${r.verdict}`);
  l.push('');
  l.push(`${r.images ?? '?'} images à ${r.fps ?? '?'} i/s ; ${echecs.length} échec(s) bloquant(s), ${avert.length} avertissement(s).`);
  l.push('');
  l.push('| Critère | Qui | Mesure | Seuil | Résultat | Détail |');
  l.push('|---|---|---|---|---|---|');
  for (const x of r.mesures) {
    const res = x.ok ? 'OK' : x.bloquant === false ? 'avertissement' : '**ÉCHEC**';
    const val = `${Number.isInteger(x.valeur) ? x.valeur : f(x.valeur)}${x.unite ? ` ${x.unite}` : ''}`;
    l.push(`| ${echapper(x.nom)} | ${x.personnage ?? '—'} | ${val} | ${echapper(x.seuil)} | ${res} | ${echapper(x.detail ?? '')} |`);
  }
  return l.join('\n');
}
