/**
 * PROMPTEUR RIGOLO AFRIKATOON — les ressorts comiques qui font rire sur TikTok (sketchs sénégalais / ouest-africains
 * en animation), donnés au scénariste ET au générateur d'images / de vidéo :
 *  - écriture : mécaniques éprouvées (règle de trois, quiproquo, escalade absurde, contraste statut / situation,
 *    retournement, running gag, chute courte), répliques à voix haute, interjections wolof dosées ;
 *  - jeu et image : réactions exagérées lisibles en 1 s (yeux qui sortent, mâchoire qui tombe, goutte de sueur,
 *    double-take, figé-zoom sur la chute), squash & stretch, timing « pause — punch ».
 * L'humour vise les situations, jamais un groupe, une ethnie, une religion ou un handicap.
 */
export const COMIC_DEVICES: { id: string; label: string; how: string }[] = [
  { id: 'rule-of-three', label: 'Règle de trois', how: 'deux éléments normaux, le troisième absurde ou qui retourne la situation' },
  { id: 'quiproquo', label: 'Quiproquo', how: 'un personnage comprend tout de travers et agit avec une assurance totale' },
  { id: 'escalation', label: 'Escalade absurde', how: 'chaque scène pousse la même erreur un cran plus loin, jusqu’à l’explosion' },
  { id: 'status-flip', label: 'Renversement de statut', how: 'le chef / la belle-mère / le grand frère se fait remettre à sa place par le plus petit' },
  { id: 'deadpan', label: 'Pince-sans-rire', how: 'une réplique énorme dite le plus calmement du monde, regard caméra' },
  { id: 'running-gag', label: 'Gag récurrent', how: 'un détail (une phrase, un objet, un bruit) revient 3 fois, la 3e fois il paie' },
  { id: 'reveal', label: 'Révélation finale', how: 'le dernier plan montre ce que le spectateur n’avait pas vu (le vrai coupable, le vrai chef)' },
  { id: 'callback', label: 'Rappel', how: 'la chute reprend la toute première réplique avec un autre sens' },
];
/** Interjections wolof / françaises naturelles (traduction en sous-titre). */
export const INTERJECTIONS: { text: string; meaning: string }[] = [
  { text: 'Waaw !', meaning: 'Oui ! / Mais oui !' },
  { text: 'Dédet !', meaning: 'Non non non !' },
  { text: 'Yow !', meaning: 'Toi là !' },
  { text: 'Dafa doy !', meaning: 'Ça suffit !' },
  { text: 'Wakh dëgg ?', meaning: 'Tu dis vrai ?' },
  { text: 'Amul problème', meaning: 'Pas de problème' },
  { text: 'Ndeysaan…', meaning: 'Le pauvre…' },
  { text: 'Astaghfirullah !', meaning: 'Mon Dieu ! (stupeur)' },
  { text: 'Nanga def ?', meaning: 'Comment ça va ?' },
  { text: 'Lan la ?', meaning: 'C’est quoi ça ?' },
];
/** Réactions physiques qui se lisent en une seconde, pour l'image et l'animation. */
export const REACTIONS = [
  'eyes popping out comically wide',
  'jaw dropping to the floor',
  'a big comic sweat drop on the temple',
  'a frozen double-take, head snapping back',
  'cheeks puffed, arms crossed, foot tapping',
  'a slow deadpan stare straight at the camera',
  'hands on the head in disbelief',
  'squash and stretch jump of surprise',
];

/** Bloc ajouté au prompt du scénariste. */
export function humorBrief(seed = 0): string {
  const pick = <T>(a: T[], k: number) => Array.from({ length: k }, (_, i) => a[(seed + i * 3) % a.length]!);
  const devices = pick(COMIC_DEVICES, 3);
  return [
    'PROMPTEUR RIGOLO (style Afrikatoon) — le but : faire éclater de rire en moins de 60 s.',
    `Utilise au moins ces ressorts : ${devices.map((d) => `${d.label} (${d.how})`).join(' ; ')}.`,
    'Chaque scène a SON gag : une situation visuelle drôle + une réaction exagérée lisible en 1 s (yeux exorbités, mâchoire qui tombe, goutte de sueur, double-take, regard caméra pince-sans-rire).',
    'Timing : installe, pause d’une demi-seconde, punch. La chute (< 10 mots) retourne tout ou rappelle la 1re réplique.',
    `Dialogues vivants, dits à voix haute : glisse 1 à 2 interjections wolof par scène quand c’est naturel (ex. ${INTERJECTIONS.slice(0, 5).map((i) => `« ${i.text} » = ${i.meaning}`).join(', ')}), avec la traduction.`,
    'Dans "action" de chaque scène : UN SEUL moment visuel (pas une suite d’actions) ; mets le mouvement et la réaction dans "video_prompt".',
    'L’humour vise la situation, jamais un groupe, une ethnie, une religion ou un handicap.',
  ].join('\n');
}

/** Direction de jeu comique pour l'image / la vidéo d'une scène (selon son temps fort). */
export function comicDirection(beat: string | undefined, emotion: string | undefined, index: number): string {
  const r = REACTIONS[index % REACTIONS.length]!;
  const b = (beat ?? '').toLowerCase();
  const base =
    b.includes('chute') || b.includes('twist')
      ? `punchline moment: freeze on the reaction (${r}), quick comedic push-in on the face`
      : b.includes('hook')
        ? `instant hook: an absurd situation readable in one second, ${r}`
        : `comedic escalation: exaggerated body language, ${r}`;
  return `${base}; cartoon acting with squash and stretch, snappy timing${emotion ? `, emotion: ${emotion}` : ''}`;
}
