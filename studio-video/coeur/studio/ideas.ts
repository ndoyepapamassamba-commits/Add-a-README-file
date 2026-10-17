/**
 * BIBLIOTHÈQUE D'IDÉES — sketches « à mourir de rire » dans le style du compte @comedyvideos_100 (familles de situations
 * relevées sur ses vidéos les plus vues : le mari paresseux, la jalousie à la maison, la révélation de grossesse, le
 * vieux qui drague devant le jeune, le panier de la marchande, les voleurs qui s'accusent, l'ex qui revient riche…).
 * Les sketchs ci-dessous sont ORIGINAUX (aucune réplique copiée) : deux personnages, une situation du quotidien
 * d'Abidjan, une escalade, une chute de moins de 10 mots, un geste par réplique — en français ivoirien.
 * La bibliothèque se met à jour avec l'actualité (newsIdeasPrompt), toujours sous l'angle de l'humour du quotidien.
 */
import { TIKTOK_STORIES, storyScript, tiktokIdeaRules } from './tiktokComedy';
export interface Idea {
  id: string;
  family: string;
  title: string;
  setup: string;
  escalation: string;
  punchline: string;
  /** « court » = 1 sketch de 6–8 s ; « compilation » = enchaînement de sketchs (~65 s) ; « histoire » = sketch de 60 s
   *  déjà ÉCRIT (répliques complètes, bible comique TikTok), repris mot pour mot. */
  format: 'court' | 'compilation' | 'histoire';
  /** For a written story: the full script (« NOM : [pose] réplique »), kept word for word by the writer. */
  script?: string;
  source: 'bibliothèque' | 'actualité';
  date?: string;
}
const I = (
  id: string,
  family: string,
  title: string,
  setup: string,
  escalation: string,
  punchline: string,
  format: Idea['format'] = 'court',
): Idea => ({ id, family, title, setup, escalation, punchline, format, source: 'bibliothèque' });

export const IDEA_FAMILIES = [
  'Histoires TikTok',
  'Couple & maison',
  'Belle-famille',
  'Le vieux galant',
  'Argent & frime',
  'Marché & maquis',
  'Voisinage',
  'Bureau & école',
  'Transport',
  'Téléphone & réseaux',
] as const;

export const IDEA_LIBRARY: Idea[] = [
  I(
    'm1',
    'Couple & maison',
    'Le canapé est occupé',
    'La femme sert le repas ; le mari couché sur le canapé ordonne « apporte encore piment ».',
    'Elle lui apporte la marmite entière, il réclame la télécommande, puis l’éventail.',
    '[montre du doigt] « Même le canapé a démissionné ! »',
  ),
  I(
    'm2',
    'Couple & maison',
    'Le gâteau d’anniversaire',
    'Le mari arrive avec un gâteau pour l’anniversaire de sa femme.',
    'Il chante fort… mais c’est écrit « Joyeux anniversaire Clarisse ». Elle s’appelle Awa.',
    '[hausse les épaules] « Clarisse c’est ton nom de jeunesse non ? »',
  ),
  I(
    'm3',
    'Couple & maison',
    'La servante trop bien habillée',
    'La nouvelle servante arrive en robe de soirée et talons.',
    'La patronne la regarde de haut en bas ; le mari dit « elle est préparée pour le travail ».',
    '[se fâche] « Faut la chasser… elle est mieux habillée que moi ! »',
  ),
  I(
    'm4',
    'Couple & maison',
    'La coupure de courant',
    'Le mari regarde la finale ; coupure de courant à la 89e minute.',
    'Il accuse la femme, le voisin, la CIE, puis le chat.',
    '[secoue la tête] Le courant revient : « Tu as raté le but de ta vie ! »',
  ),
  I(
    'm5',
    'Couple & maison',
    'Le régime',
    'La femme annonce : « À partir d’aujourd’hui je suis au régime. »',
    'Elle refuse l’attiéké… mais vide la casserole de sauce graine « pour goûter ».',
    '[éclate de rire] « Le régime commence demain, aujourd’hui on prépare. »',
  ),
  I(
    'b1',
    'Belle-famille',
    'La belle-mère et les valises',
    'La belle-mère débarque « juste pour deux jours » avec cinq valises.',
    'Elle sort un matelas, une marmite, puis une chèvre.',
    '[mains sur la tête] « Deux jours… de quelle année ? »',
  ),
  I(
    'b2',
    'Belle-famille',
    'La dot négociée',
    'Le prétendant vient demander la main ; le tonton lit la liste de la dot.',
    'Pagnes, boissons… puis « un iPhone 17 pour le petit frère ».',
    '[hausse les épaules] « Prends ma main, la fille garde-la. »',
  ),
  I(
    'b3',
    'Belle-famille',
    'La cuisine de maman',
    'Le mari compare chaque plat de sa femme à celui de sa mère.',
    'La femme invite la belle-mère à cuisiner ; c’est immangeable.',
    '[réfléchit] « Maman… tu as changé de recette ou de fils ? »',
  ),
  I(
    'b4',
    'Belle-famille',
    'Le cadeau du village',
    'Le neveu revient du village avec « un petit cadeau » pour tout le monde.',
    'Le sac bouge, fait du bruit, sent fort.',
    '[sursaute] « C’est pas cadeau, c’est le poulet qui voyage ! »',
  ),
  I(
    'v1',
    'Le vieux galant',
    'Le vieux et la maman',
    'Un vieux en costume drague la maman devant son fils.',
    'Le fils proteste ; le vieux sort des billets à chaque phrase.',
    '[salue] « Papa, je t’appelle comment maintenant ? »',
  ),
  I(
    'v2',
    'Le vieux galant',
    'Le vieux au maquis',
    'Un vieux commande « la même chose que la jeune fille ».',
    'Elle commande jus, piment, danse… il suit tout et s’essouffle.',
    '[pleure] « Garçon ! La même chose… mais pour ma tension. »',
  ),
  I(
    'v3',
    'Le vieux galant',
    'Le vieux sportif',
    'Pour impressionner une fille, le vieux fait des pompes au quartier.',
    'Une pompe, deux pompes… il reste coincé en bas.',
    '[hoche la tête] « Je me repose en position de champion. »',
  ),
  I(
    'v4',
    'Le vieux galant',
    'Les lunettes',
    'Le vieux salue de loin une « jolie fille ».',
    'Il s’approche, fait son discours… c’est sa propre femme sans foulard.',
    '[éclate de rire] « Chérie ! Je testais ton marché. »',
  ),
  I(
    'a1',
    'Argent & frime',
    'L’ex revient riche',
    'L’ex arrive en costume avec une grosse voiture devant chez la fille.',
    'Elle court, se coiffe, sourit… il demande juste le chemin.',
    '[montre du doigt] « C’est toi qui as changé de quartier ou c’est moi ? »',
  ),
  I(
    'a2',
    'Argent & frime',
    'Le salaire du 25',
    'Le 25, il annonce « ce soir c’est moi qui paye tout ».',
    'Le 26 il emprunte le pain ; le 27 la recharge.',
    '[hausse les épaules] « L’argent est un voyageur, il est parti en vacances. »',
  ),
  I(
    'a3',
    'Argent & frime',
    'Le faux boss',
    'Il se présente comme « grand patron » en parlant au téléphone.',
    'Le téléphone sonne… en plein appel.',
    '[sursaute] « C’est… mon autre téléphone de patron ! »',
  ),
  I(
    'a4',
    'Argent & frime',
    'Les voleurs qui s’accusent',
    'Deux voleurs fuient avec un sac d’argent… vide.',
    'Chacun accuse l’autre d’avoir mal fermé ; ils retournent chercher.',
    '[se fâche] « Non c’est toi ! Tu as volé le sac sans l’argent ! »',
  ),
  I(
    'k1',
    'Marché & maquis',
    'Le panier de la marchande',
    'Un malin pique une mangue dans le panier sur la tête de la marchande.',
    'Elle sent tout, se retourne, il siffle innocemment.',
    '[montre du doigt] « Mon panier a des yeux derrière, mon fils ! »',
  ),
  I(
    'k2',
    'Marché & maquis',
    'Le prix qui monte',
    'Le client demande le prix du poisson.',
    'Chaque fois qu’il marchande, le prix monte au lieu de baisser.',
    '[mains sur la tête] « Si tu parles encore, c’est toi qui me dois ! »',
  ),
  I(
    'k3',
    'Marché & maquis',
    'L’addition',
    'Au maquis, la bande commande tout « c’est ma fête ».',
    'L’addition arrive : chacun découvre un appel urgent.',
    '[court] Le garçon : « Le dernier assis, c’est le parrain ! »',
  ),
  I(
    'k4',
    'Marché & maquis',
    'L’attiéké de la discorde',
    'Deux amies se disputent le dernier morceau de poisson.',
    'Escalade de politesse hypocrite « non toi d’abord ».',
    '[éclate de rire] Le chat part avec le poisson.',
  ),
  I(
    'q1',
    'Voisinage',
    'Le sel emprunté',
    'La voisine vient « emprunter le sel » pour la 40e fois.',
    'Puis l’huile, la marmite, la cuisinière.',
    '[secoue la tête] « Viens habiter ici, ça ira plus vite ! »',
  ),
  I(
    'q2',
    'Voisinage',
    'La musique du voisin',
    'Le voisin met la musique à fond à 6 h du matin.',
    'On toque, il monte le son ; on crie, il monte encore.',
    '[danse] Tout le quartier finit par danser avec lui.',
  ),
  I(
    'q3',
    'Voisinage',
    'Le générateur',
    'Coupure : le voisin allume son groupe électrogène fièrement.',
    'Il branche toute la rue… le groupe s’arrête.',
    '[hausse les épaules] « On est tous égaux devant la CIE. »',
  ),
  I(
    'q4',
    'Voisinage',
    'La commère',
    'La commère du quartier « ne dit jamais rien à personne ».',
    'Elle raconte un secret, puis deux, puis le sien.',
    '[sursaute] « Qui t’a dit ça ?! » — « Toi, hier. »',
  ),
  I(
    'e1',
    'Bureau & école',
    'L’excuse du retard',
    'Le collègue arrive à 11 h avec une excuse.',
    'Embouteillage, puis inondation, puis lion échappé du zoo.',
    '[réfléchit] Le chef : « Et le lion t’a déposé ? »',
  ),
  I(
    'e2',
    'Bureau & école',
    'La réunion Zoom',
    'En visio, le stagiaire parle avec assurance.',
    'Sa caméra montre qu’il est encore au lit avec le pagne.',
    '[salue] « C’est ma tenue de télétravail ! »',
  ),
  I(
    'e3',
    'Bureau & école',
    'Le bulletin',
    'L’enfant montre son bulletin « avec fierté ».',
    'Le papa lit : 2/20, 3/20… « Bravo pour la régularité. »',
    '[hoche la tête] L’enfant : « Au moins je suis constant. »',
  ),
  I(
    'e4',
    'Bureau & école',
    'Le petit frère espion',
    'Devant les parents, le petit frère « défend » sa grande sœur.',
    'Chaque défense révèle un nouveau secret.',
    '[mains sur la tête] « Toi on t’a envoyé pour m’aider ou me finir ? »',
  ),
  I(
    't1',
    'Transport',
    'Le gbaka plein',
    'L’apprenti crie « y a la place ! » dans un gbaka bondé.',
    'Il fait entrer une dame, un bébé, une chèvre.',
    '[court] Il descend lui-même : « Y a la place ! »',
  ),
  I(
    't2',
    'Transport',
    'Le woro-woro',
    'Le client négocie le prix du woro-woro au centime près.',
    'Le chauffeur accepte… et le dépose à mi-chemin.',
    '[montre du doigt] « Le reste du trajet, c’est la remise ! »',
  ),
  I(
    't3',
    'Transport',
    'Le permis de conduire',
    'Le tonton se vante de conduire « depuis 40 ans ».',
    'Il cale, recule dans le mur, klaxonne le mur.',
    '[hausse les épaules] « C’est le mur qui a bougé. »',
  ),
  I(
    'p1',
    'Téléphone & réseaux',
    'Le message vocal',
    'Elle envoie par erreur un vocal sur son patron… au patron.',
    'Elle tente d’effacer, appelle, court jusqu’au bureau.',
    '[sursaute] Le patron : « J’ai écouté trois fois, c’est bien fait. »',
  ),
  I(
    'p2',
    'Téléphone & réseaux',
    'La photo filtrée',
    'Rendez-vous avec quelqu’un connu sur les réseaux.',
    'Il cherche la personne de la photo… elle est devant lui.',
    '[éclate de rire] « C’est moi, le filtre est resté à la maison. »',
  ),
  I(
    'p3',
    'Téléphone & réseaux',
    'Le live TikTok',
    'Maman découvre le live TikTok de son fils.',
    'Elle entre dans le live, commente, puis prend le téléphone.',
    '[salue] « Abonnez-vous à maman, le petit est puni ! »',
  ),
  I(
    'p4',
    'Téléphone & réseaux',
    'La compilation du quartier',
    'Une journée du quartier en 6 mini-sketchs (sel, gbaka, maquis, coupure, dot, live).',
    'Chaque sketch finit par la stupeur.',
    'Dernier plan : tout le monde se retourne vers la caméra.',
    'compilation',
  ),
  // Les histoires de 60 s ÉCRITES selon la bible comique TikTok (tiktokComedy.ts) : le script complet est repris tel quel.
  ...TIKTOK_STORIES.map((t): Idea => ({
    id: `tt-${t.id}`,
    family: 'Histoires TikTok',
    title: t.title,
    setup: `${t.engine} Accroche : « ${t.beats[0]!.text} »`,
    escalation: t.beats
      .slice(1, t.punch)
      .map((b) => b.text)
      .filter((_, k, a) => k === Math.floor(a.length / 2))
      .join(' '),
    punchline: `« ${t.beats[t.punch]!.text} »`,
    format: 'histoire',
    script: storyScript(t),
    source: 'bibliothèque',
  })),
];

/** The brief given to the autopilot for one idea (setup → escalation → punchline, Ivorian French, gestures). */
export function ideaBrief(i: Idea): string {
  if (i.script)
    return `${i.script}\n(Format : histoire de 60 s, plans de 3 à 5 s, gestes exagérés, français ivoirien.)`;
  return `${i.title} — ${i.setup} Escalade : ${i.escalation} Chute : ${i.punchline} (Format ${i.format === 'court' ? 'court : 1 sketch de 6 à 8 s' : 'compilation de sketchs de 6 s, environ 65 s'}, deux personnages qui se disputent, gestes exagérés, français ivoirien.)`;
}
/** The idea as typed in the Autopilot field (no format: the duration chosen there decides). */
export function ideaText(i: Idea): string {
  if (i.script) return i.script;
  return `${i.title} — ${i.setup}${i.escalation ? ` ${i.escalation}` : ''} Chute : ${i.punchline}`;
}
/** Searches that bring the day's news of Côte d'Ivoire / Africa (the writer keeps only what can be laughed about). */
export const NEWS_QUERIES = [
  'actualité Abidjan aujourd’hui',
  'Côte d’Ivoire actualité insolite',
  'prix au marché Abidjan',
  'football Côte d’Ivoire Éléphants actualité',
  'tendances TikTok Côte d’Ivoire',
];
/** Prompt: today's headlines → sketch ideas in the library format (humour on everyday life, never on victims). */
export function newsIdeasPrompt(headlines: string[], n = 6): string {
  return [
    `Tu écris des idées de sketchs TikTok « à mourir de rire » dans le style d’un compte ivoirien d’animation 3D (deux personnages qui se disputent, situation du quotidien d’Abidjan, chute nette, français ivoirien).`,
    `À partir de l’actualité ci-dessous, propose ${n} idées. Règles : l’humour vise la situation quotidienne qu’un sujet provoque (prix, embouteillages, foot, coupures, tendances), JAMAIS un drame, une victime, un deuil, la religion, une ethnie, un handicap ou une personne réelle nommée ; ignore les nouvelles tragiques.`,
    `Règles comiques TikTok : ${tiktokIdeaRules()}.`,
    `Réponds UNIQUEMENT en JSON : {"ideas":[{"family":"…","title":"…","setup":"…","escalation":"…","punchline":"[geste] « réplique de moins de 10 mots »"}]}`,
    'ACTUALITÉ :',
    ...headlines.slice(0, 12).map((h) => `- ${h.slice(0, 200)}`),
  ].join('\n');
}
export function parseIdeas(text: string, date = new Date().toISOString().slice(0, 10)): Idea[] {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]) as { ideas?: Record<string, unknown>[] };
    return (j.ideas ?? [])
      .filter((x) => x.title && x.setup && x.punchline)
      .slice(0, 12)
      .map((x, k) => ({
        id: `n-${date}-${k}`,
        family: String(x.family ?? 'Actualité').slice(0, 40),
        title: String(x.title).slice(0, 80),
        setup: String(x.setup).slice(0, 300),
        escalation: String(x.escalation ?? '').slice(0, 300),
        punchline: String(x.punchline).slice(0, 160),
        format: 'court' as const,
        source: 'actualité' as const,
        date,
      }));
  } catch {
    return [];
  }
}
