/* MASSAMBA AI MOTION STUDIO — registre des moteurs vidéo (22/10/2026).
 * Règle : aucune capacité inventée. Deux sources seulement :
 *   1. la configuration publique de chaque Space Gradio, relue EN DIRECT à chaque session (/config : entrées, bornes,
 *      valeurs par défaut) — le registre en déduit modes, durées, image de fin, entrée audio ;
 *   2. pour les fournisseurs à clé secrète (côté serveur), les types des SDK officiels démontés le 22/10/2026
 *      (@runwayml/sdk 4.22.0, lumaai 1.19.1) et les pages de documentation officielles lues le même jour (fal, Replicate).
 * Les paramètres sont transmis PAR LIBELLÉ (et non par position) : si un Space change sa signature, l'entrée inconnue
 * reçoit sa valeur par défaut, et une entrée obligatoire introuvable bloque l'appel au lieu d'envoyer n'importe quoi. */
(function (racine) {
  'use strict';
  var VERIF = '22/10/2026';
  var PRIX_INCONNU = 'Tarif indisponible — vérifier auprès du fournisseur';
  var NEGATIF = 'subtitles, text, watermark, deformed face, extra limbs, morphing, flicker, static image';

  // rôle de chaque entrée, reconnu à son libellé (libellés observés en direct le 22/10/2026)
  var ROLES = [
    ['fin', /^(end frame|last frame|last image)/i],
    ['image', /^(input image|start frame|first frame|image)\b/i],
    ['audio', /^audio/i],
    ['negatif', /^negative prompt/i],
    ['prompt', /^prompt$/i],
    ['duree', /duration/i],
    ['etapes', /inference steps/i],
    ['aleatoire', /^randomize seed/i],
    ['graine', /^seed$/i],
    ['hauteur', /^height$/i],
    ['largeur', /^width$/i],
    ['ameliorer', /^enhance prompt/i],
    ['tache', /^task$/i]
  ];
  function role(e) {
    var l = String(e.libelle || '');
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i][1].test(l)) return ROLES[i][0];
    return null;
  }
  function facultatif(e) { return /optional/i.test(String(e.libelle || '')); }

  /** capacités déduites de la signature réelle d'une fonction Gradio. */
  function capacites(desc) {
    var c = { i2v: false, t2v: false, fin: false, audioEntree: false, dureeMin: null, dureeMax: null, imageObligatoire: false, finObligatoire: false, resolution: false };
    if (!desc) return c;
    desc.entrees.forEach(function (e) {
      var r = role(e);
      if (r === 'image') { c.i2v = true; if (!facultatif(e)) c.imageObligatoire = true; }
      if (r === 'fin') { c.fin = true; if (!facultatif(e)) c.finObligatoire = true; }
      if (r === 'audio') c.audioEntree = true;
      if (r === 'duree') { c.dureeMin = e.min != null ? Number(e.min) : null; c.dureeMax = e.max != null ? Number(e.max) : null; }
      if (r === 'hauteur' || r === 'largeur') c.resolution = true;
      if (r === 'tache' && e.choix && e.choix.indexOf('text-to-video') >= 0) c.t2v = true;
    });
    var aPrompt = desc.entrees.some(function (e) { return role(e) === 'prompt'; });
    if (aPrompt && !c.imageObligatoire) c.t2v = true;
    return c;
  }

  function borne(v, e) {
    if (typeof v !== 'number' || isNaN(v)) return e.defaut;
    if (e.min != null) v = Math.max(Number(e.min), v);
    if (e.max != null) v = Math.min(Number(e.max), v);
    return v;
  }

  /**
   * valeurs à envoyer, dans l'ordre de la signature réelle. `req` : { image, fin, audio, prompt, negatif, dureeS, etapes,
   * graine, largeur, hauteur, mode }. Lève une erreur claire si une entrée obligatoire manque.
   */
  function construire(desc, req, extra) {
    extra = extra || {};
    var manque = [];
    var vals = desc.entrees.map(function (e) {
      var r = role(e);
      switch (r) {
        case 'image': if (!req.image && !facultatif(e)) manque.push('image de départ'); return req.image || null;
        case 'fin': if (!req.fin && !facultatif(e)) manque.push('image de fin'); return req.fin || null;
        case 'audio': return req.audio || null;
        case 'prompt': if (!req.prompt) manque.push('consigne'); return req.prompt || '';
        case 'negatif': return req.negatif || NEGATIF;
        case 'duree': return borne(req.dureeS, e);
        case 'etapes': return borne(req.etapes != null ? req.etapes : (extra.etapes != null ? extra.etapes : e.defaut), e);
        case 'graine': return req.graine != null ? borne(req.graine, e) : e.defaut;
        case 'aleatoire': return req.graine == null;
        case 'hauteur': return req.hauteur || e.defaut;
        case 'largeur': return req.largeur || e.defaut;
        case 'ameliorer': return false;   // jamais de réécriture silencieuse de l'intention de l'utilisateur
        case 'tache': return req.mode === 't2v' ? 'text-to-video' : 'image-to-video';
        default: return e.defaut === undefined ? null : e.defaut;
      }
    });
    if (manque.length) throw new Error('Paramètres manquants pour ce moteur : ' + manque.join(', ') + '.');
    return vals;
  }

  // ------------------------------------------------------------------ catalogue
  // voie « navigateur » : appel direct depuis le navigateur de l'utilisateur, gratuit, quota ZeroGPU de son compte HF.
  var MODELES = [
    { id: 'wan22-i2v-rapide', nom: 'Wan 2.2 14B — image → vidéo (rapide)', fournisseur: 'Hugging Face (Space ZeroGPU)', voie: 'navigateur',
      space: 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space', api: 'generate_video', extra: { etapes: 4 }, modes: ['i2v'],
      licence: 'Wan 2.2 : Apache-2.0 (poids Wan-AI) ; Space public zerogpu-aoti', sortie: 'MP4 (16 i/s, mesuré sur le clip reçu)',
      prix: 'Gratuit — consomme le quota GPU quotidien de votre compte Hugging Face (anonyme : quota réduit, file moins prioritaire)',
      limites: 'Clips courts (bornes lues en direct). Identité du personnage non garantie d’un clip à l’autre.', verifie: VERIF },
    { id: 'wan22-premier-dernier', nom: 'Wan 2.2 — image de départ + image de fin', fournisseur: 'Hugging Face (Space ZeroGPU)', voie: 'navigateur',
      space: 'https://multimodalart-wan-2-2-first-last-frame.hf.space', api: 'generate_video', extra: { etapes: 8 }, modes: ['i2v'],
      licence: 'Wan 2.2 : Apache-2.0 ; Space public multimodalart', sortie: 'MP4', prix: 'Gratuit — quota GPU de votre compte Hugging Face',
      limites: 'Les deux images sont obligatoires ; durée courte.', verifie: VERIF },
    { id: 'ltx23', nom: 'LTX-2.3 — texte → vidéo et image → vidéo', fournisseur: 'Hugging Face (Space officiel Lightricks)', voie: 'navigateur',
      space: 'https://lightricks-ltx-2-3.hf.space', api: 'generate_video', extra: {}, modes: ['t2v', 'i2v'],
      licence: 'LTX-2 Community License : usage commercial gratuit sous 10 M$ de chiffre d’affaires annuel ; aucun droit revendiqué sur les vidéos produites (licence lue le 22/10/2026)',
      sortie: 'MP4 (piste audio éventuelle détectée sur le clip reçu)', prix: 'Gratuit — quota GPU de votre compte Hugging Face',
      limites: 'Résolution élevée par défaut : plus de quota consommé. Identité non garantie.', verifie: VERIF },
    { id: 'ltx23-premier-dernier', nom: 'LTX-2.3 — première et dernière image (+ audio)', fournisseur: 'Hugging Face (Space linoyts)', voie: 'navigateur',
      space: 'https://linoyts-ltx-2-3-first-last-frame.hf.space', api: 'generate_video', extra: {}, modes: ['t2v', 'i2v'],
      licence: 'LTX-2 Community License (voir ci-dessus)', sortie: 'MP4', prix: 'Gratuit — quota GPU de votre compte Hugging Face',
      limites: 'Space communautaire : disponibilité variable.', verifie: VERIF },
    { id: 'ltx-video-distille', nom: 'LTX-Video distillé — texte → vidéo (secours)', fournisseur: 'Hugging Face (Space officiel Lightricks)', voie: 'navigateur',
      space: 'https://lightricks-ltx-video-distilled.hf.space', api: 'text_to_video', extra: {}, modes: ['t2v'],
      licence: 'LTX-Video : licence « other » (Open Weights License de Lightricks) — à relire avant usage commercial', sortie: 'MP4',
      prix: 'Gratuit — quota GPU de votre compte Hugging Face', limites: 'Ancienne génération, qualité inférieure à LTX-2.3.', verifie: VERIF },
    { id: 'chaine-pollinations-wan', nom: 'Texte → image (Pollinations « sana ») puis image → vidéo (Wan 2.2)', fournisseur: 'Pollinations + Hugging Face', voie: 'chaine',
      licence: 'Image : Pollinations (service gratuit, modèle « sana ») ; vidéo : Wan 2.2 Apache-2.0', sortie: 'MP4',
      prix: 'Gratuit — sans compte pour l’image ; quota GPU Hugging Face pour la vidéo',
      limites: 'Deux étapes : l’image intermédiaire est montrée et gardée dans la médiathèque.', verifie: VERIF,
      fixe: { i2v: false, t2v: true, fin: false, audioEntree: false, dureeMin: 0.5, dureeMax: 5, imageObligatoire: false } },

    // voie « serveur » : clé secrète dans les variables d'environnement du serveur local, JAMAIS dans le navigateur.
    { id: 'runway-gen4_turbo', nom: 'Runway gen4_turbo', fournisseur: 'Runway', voie: 'serveur', serveur: 'runway', modele: 'gen4_turbo', payant: true,
      fixe: { i2v: true, t2v: false, fin: false, formats: ['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'], durees: 'selon Runway (non borné dans le SDK)' },
      licence: 'Conditions Runway', sortie: 'MP4 (URL temporaire, rapatriée)', prix: PRIX_INCONNU,
      limites: 'Image de départ obligatoire (URL HTTPS ou data URI ≤ 5 Mo).', source: '@runwayml/sdk 4.22.0, resources/image-to-video.d.ts', verifie: VERIF },
    { id: 'runway-gen4.5', nom: 'Runway gen4.5', fournisseur: 'Runway', voie: 'serveur', serveur: 'runway', modele: 'gen4.5', payant: true,
      fixe: { i2v: true, t2v: true, fin: false, dureeMin: 2, dureeMax: 10, formats: ['1280:720', '720:1280'] },
      licence: 'Conditions Runway', sortie: 'MP4', prix: PRIX_INCONNU, limites: 'Durée entière de 2 à 10 s.',
      source: '@runwayml/sdk 4.22.0 (text-to-video.d.ts, image-to-video.d.ts)', verifie: VERIF },
    { id: 'runway-veo3.1', nom: 'Runway veo3.1 (première + dernière image)', fournisseur: 'Runway', voie: 'serveur', serveur: 'runway', modele: 'veo3.1', payant: true,
      fixe: { i2v: true, t2v: true, fin: true, durees: [4, 6, 8], formats: ['1280:720', '720:1280', '1080:1920', '1920:1080'] },
      licence: 'Conditions Runway / Google', sortie: 'MP4', prix: PRIX_INCONNU, limites: 'Durée 4, 6 ou 8 s.',
      source: '@runwayml/sdk 4.22.0 (position first | last)', verifie: VERIF },
    { id: 'luma-ray-2', nom: 'Luma Ray 2', fournisseur: 'Luma', voie: 'serveur', serveur: 'luma', modele: 'ray-2', payant: true,
      fixe: { i2v: true, t2v: true, fin: true, durees: ['5s', '9s'], formats: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'], resolutions: ['540p', '720p', '1080p', '4k'] },
      licence: 'Conditions Luma', sortie: 'MP4', prix: PRIX_INCONNU,
      limites: 'Images de départ/fin : URL publique obligatoire (pas de fichier local).', source: 'lumaai 1.19.1 + docs.lumalabs.ai', verifie: VERIF },
    { id: 'luma-ray-flash-2', nom: 'Luma Ray Flash 2', fournisseur: 'Luma', voie: 'serveur', serveur: 'luma', modele: 'ray-flash-2', payant: true,
      fixe: { i2v: true, t2v: true, fin: true, durees: ['5s', '9s'], formats: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'] },
      licence: 'Conditions Luma', sortie: 'MP4', prix: PRIX_INCONNU, limites: 'Images : URL publique obligatoire.', source: 'lumaai 1.19.1', verifie: VERIF },
    { id: 'fal-configure', nom: 'fal.ai — modèle choisi dans la configuration du serveur', fournisseur: 'fal.ai', voie: 'serveur', serveur: 'fal', payant: true,
      fixe: { i2v: true, t2v: true, fin: false }, licence: 'Selon le modèle fal choisi', sortie: 'Selon le modèle', prix: PRIX_INCONNU,
      limites: 'Champs d’entrée propres à chaque modèle fal : à vérifier sur la page du modèle avant usage.', source: 'fal.ai/docs (file d’attente, lue le 22/10/2026)', verifie: VERIF },
    { id: 'replicate-configure', nom: 'Replicate — modèle choisi dans la configuration du serveur', fournisseur: 'Replicate', voie: 'serveur', serveur: 'replicate', payant: true,
      fixe: { i2v: true, t2v: true, fin: false }, licence: 'Selon le modèle Replicate choisi', sortie: 'Selon le modèle', prix: PRIX_INCONNU,
      limites: 'Le serveur lit le schéma d’entrée réel du modèle (API /v1/models) avant d’envoyer.', source: 'replicate.com/docs/reference/http (lue le 22/10/2026)', verifie: VERIF },
    { id: 'kling-officiel', nom: 'Kling (API officielle)', fournisseur: 'Kling AI', voie: 'serveur', serveur: 'kling', payant: true,
      fixe: { i2v: true, t2v: true, fin: false }, licence: 'Conditions Kling', sortie: 'MP4', prix: PRIX_INCONNU,
      limites: 'À CONFIRMER : la documentation officielle ne s’affiche qu’en JavaScript et n’a pas pu être relue en direct le 22/10/2026 ; adresse et modèle configurables.',
      source: 'schéma JWT HS256 (clé d’accès + clé secrète) confirmé par plusieurs sources secondaires', verifie: 'non vérifié en direct' },

    // moteur de la V1 (22/10/2026, « y intégrer le moteur de la V1 ») : le moteur MASSAMBA de la troupe tourne un sketch parlé
    // (voix Piper, bouches synchronisées, rires, ambiance, montage TikTok) sur une scène PRÉPARÉE ; il tourne sur la machine du
    // serveur local (Python), sans service externe.
    { id: 'moteur-v1', nom: 'Moteur V1 de la troupe — sketch parlé (voix, bouches, rires)', fournisseur: 'MASSAMBA (moteur local)', voie: 'serveur', serveur: 'moteur-v1', modes: ['v1'],
      fixe: { i2v: false, t2v: false, v1: true }, licence: 'Moteur MASSAMBA (MIT) ; voix Piper siwis (CC-BY) et gilles (CC0)', sortie: 'MP4 1080×1920 (TikTok) avec son',
      prix: 'Gratuit — calcul sur l’ordinateur qui fait tourner le serveur local', limites: 'Scènes déjà préparées seulement (duos de la troupe) ; plusieurs minutes par sketch (mesuré dans l’historique).',
      source: 'studio-video/moteur-troupe (usine.tourne, format V1)', verifie: VERIF },

    // mode démo : jamais présenté comme une génération IA.
    { id: 'demo', nom: 'DÉMO — animation locale (pas une génération IA)', fournisseur: 'Local (navigateur)', voie: 'demo',
      fixe: { i2v: true, t2v: true, fin: false, dureeMin: 1, dureeMax: 6 }, licence: '—', sortie: 'WebM marqué « DÉMO »',
      prix: 'Gratuit (aucun service)', limites: 'Zoom/panoramique sur l’image : ce n’est PAS une vidéo générée par un modèle.', verifie: VERIF }
  ];

  function trouver(id) { for (var i = 0; i < MODELES.length; i++) if (MODELES[i].id === id) return MODELES[i]; return null; }

  /** relit la configuration en direct d'un modèle « navigateur » ; renvoie { etat, capacites, desc, message }. */
  async function verifierEnDirect(m, G, o) {
    if (m.voie !== 'navigateur') return { etat: m.voie === 'demo' ? 'local' : 'serveur', capacites: m.fixe || {} };
    try {
      var cfg = await G.config(m.space, o);
      var desc = G.decrire(cfg, m.api);
      if (!desc) return { etat: 'signature changée', capacites: {}, message: 'La fonction ' + m.api + ' a disparu du Space.' };
      var c = capacites(desc);
      return { etat: 'disponible', capacites: c, desc: desc, cfg: cfg, version: cfg.version };
    } catch (e) {
      return { etat: 'indisponible', capacites: {}, message: G.messageErreur(e.message) };
    }
  }

  var API = { MODELES: MODELES, ROLES: ROLES, role: role, capacites: capacites, construire: construire, trouver: trouver,
    verifierEnDirect: verifierEnDirect, PRIX_INCONNU: PRIX_INCONNU, NEGATIF: NEGATIF, VERIF: VERIF };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.registre = API; }
})(typeof self !== 'undefined' ? self : this);
