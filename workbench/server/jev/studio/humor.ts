/**
 * PROMPTEUR RIGOLO AFRIKATOON — comédie à l'ivoirienne (façon sketchs d'Abidjan qui cartonnent sur TikTok), donnée au
 * scénariste ET au générateur d'images / de vidéo et au moteur d'animation :
 *  - écriture : mécaniques éprouvées (règle de trois, quiproquo, escalade absurde, renversement de statut, pince-
 *    sans-rire, gag récurrent, révélation, rappel), répliques courtes dites à voix haute, TOUT EN FRANÇAIS IVOIRIEN
 *    (expressions populaires d'Abidjan, nouchi léger compréhensible par tous) — jamais de wolof ;
 *  - jeu, gestes et image : réactions exagérées lisibles en 1 s, un GESTE par réplique (le moteur d'animation le joue),
 *    timing « installation — pause — punch », arrêt sur image sur la chute.
 * L'humour vise les situations du quotidien, jamais un groupe, une ethnie, une religion ou un handicap.
 */
export const COMIC_DEVICES: { id: string; label: string; how: string }[] = [
  { id: 'rule-of-three', label: 'Règle de trois', how: 'deux éléments normaux, le troisième absurde ou qui retourne la situation' },
  { id: 'quiproquo', label: 'Quiproquo', how: 'un personnage comprend tout de travers et agit avec une assurance totale' },
  { id: 'escalation', label: 'Escalade absurde', how: 'chaque scène pousse la même erreur un cran plus loin, jusqu’à l’explosion' },
  { id: 'status-flip', label: 'Renversement de statut', how: 'le patron / la belle-mère / le grand frère se fait remettre à sa place par le plus petit' },
  { id: 'deadpan', label: 'Pince-sans-rire', how: 'une réplique énorme dite le plus calmement du monde, regard caméra' },
  { id: 'running-gag', label: 'Gag récurrent', how: 'un détail (une phrase, un objet, un bruit) revient 3 fois, la 3e fois il paie' },
  { id: 'reveal', label: 'Révélation finale', how: 'le dernier plan montre ce que le spectateur n’avait pas vu (le vrai coupable, le vrai patron)' },
  { id: 'callback', label: 'Rappel', how: 'la chute reprend la toute première réplique avec un autre sens' },
  // Ressorts de l'humour « à l'africaine » des caricatures et mèmes (façon Gbeze) :
  { id: 'two-kinds', label: 'Il y a deux genres de personnes', how: 'deux réactions opposées à la même situation, montrées côte à côte, la 2e est la nôtre (énorme)' },
  { id: 'caught', label: 'Pris en flagrant délit', how: 'un personnage est surpris en pleine bêtise (« en plein tournage comme ça ») et invente une excuse impossible' },
  { id: 'caricature', label: 'Caricature', how: 'un trait de caractère connu de tous (le tonton qui sait tout, la maman qui compare) poussé jusqu’à l’absurde' },
  { id: 'proverb-twist', label: 'Proverbe détourné', how: 'un proverbe ou une sagesse de vieux, appliqué de travers à une situation moderne' },
];
/** Situations du quotidien d'Abidjan qui font rire (jamais un groupe : la situation). */
export const SITUATIONS = [
  'le gbaka plein à craquer et l’apprenti qui crie encore « y a la place ! »',
  'la coupure de courant pile pendant le match',
  'la belle-mère qui débarque sans prévenir avec trois valises',
  'le voisin qui « emprunte » le sel depuis six mois',
  'le maquis où l’addition arrive au mauvais moment',
  'la marchande d’attiéké qui connaît tous les secrets du quartier',
  'le collègue qui arrive en retard avec une excuse de plus en plus énorme',
  'le petit frère qui vend la mèche devant les parents',
  'le prétendant qui vient demander la main de la fille et la famille qui négocie la dot',
  'la maman qui compare son enfant au fils du voisin',
  'le mari qui rentre tard avec une excuse de plus en plus énorme',
  'la cousine du village qui débarque en ville et découvre tout',
];
/** Interjections et expressions ivoiriennes naturelles (sens en français standard pour les sous-titres si besoin). */
export const INTERJECTIONS: { text: string; meaning: string }[] = [
  { text: 'Ehhh Dieu !', meaning: 'Mon Dieu ! (stupeur)' },
  { text: 'Dêh !', meaning: 'Mais vraiment ! (insistance, étonnement)' },
  { text: 'C’est comment ?', meaning: 'Qu’est-ce qui se passe ? / Ça va ?' },
  { text: 'On dit quoi ?', meaning: 'Quoi de neuf ?' },
  { text: 'Y a pas drap !', meaning: 'Pas de problème !' },
  { text: 'Ça va aller.', meaning: 'Ça ira.' },
  { text: 'C’est pas mon palabre.', meaning: 'Ce n’est pas mon affaire.' },
  { text: 'Je suis dedans !', meaning: 'Je suis d’accord / j’en suis !' },
  { text: 'C’est gâté !', meaning: 'C’est trop fort ! (ou : c’est fichu)' },
  { text: 'Ahiii !', meaning: 'Aïe ! / Oh là là !' },
  { text: 'Laisse ça !', meaning: 'Laisse tomber !' },
  { text: 'Tu vas voir l’affaire !', meaning: 'Tu vas voir ce qui va se passer !' },
  { text: 'Gbê est mieux que drap.', meaning: 'Mieux vaut la vérité que la honte (proverbe).' },
  { text: 'Mon môgô !', meaning: 'Mon gars ! / Mon ami !' },
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
/** Gestes que le moteur « Marionnette » sait jouer (le scénariste en met un par réplique, entre crochets). */
export const GESTURE_WORDS = ['salue', 'montre du doigt', 'hausse les épaules', 'mains sur la tête', 'éclate de rire', 'saute de joie', 'hoche la tête', 'secoue la tête', 'se fâche', 'danse', 'applaudit', 'réfléchit', 'sursaute', 'pleure', 'court'];

/** Bloc ajouté au prompt du scénariste. */
export function humorBrief(seed = 0): string {
  const pick = <T>(a: T[], k: number) => Array.from({ length: k }, (_, i) => a[(seed + i * 3) % a.length]!);
  const devices = pick(COMIC_DEVICES, 3);
  return [
    'PROMPTEUR RIGOLO (comédie ivoirienne, style Afrikatoon) — le but : faire éclater de rire en moins de 60 s.',
    `Situation de départ possible : ${pick(SITUATIONS, 1)[0]}.`,
    `Utilise au moins ces ressorts : ${devices.map((d) => `${d.label} (${d.how})`).join(' ; ')}.`,
    'Chaque scène a SON gag : une situation visuelle drôle + une réaction exagérée lisible en 1 s (yeux exorbités, mâchoire qui tombe, goutte de sueur, double-take, regard caméra pince-sans-rire).',
    'Timing : installe, pause d’une demi-seconde, punch. La chute (< 10 mots) retourne tout ou rappelle la 1re réplique.',
    `LANGUE : TOUT en français ivoirien (parler d’Abidjan, nouchi léger compréhensible par tous), JAMAIS de wolof. Glisse 1 à 2 expressions ivoiriennes par scène quand c’est naturel (ex. ${INTERJECTIONS.slice(0, 6).map((i) => `« ${i.text} »`).join(', ')}).`,
    `GESTES : chaque réplique porte un geste entre crochets parmi : ${GESTURE_WORDS.join(', ')} (ex. « [hausse les épaules] C’est pas mon palabre. ») — l’animation le joue.`,
    'FORMAT VIRAL « À MOURIR DE RIRE » : chaque scène est UN plan large où deux personnages se disputent avec de grands gestes ; 6 à 10 s ; la chute arrive à la fin de la scène et l’app ajoute la « stupeur » juste après.',
    'Pour chaque réplique, donne aussi "english" : la même réplique en anglais très court (≤ 8 mots), pour les sous-titres bilingues.',
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
