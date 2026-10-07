// OMNIPOTENT V4.1 — MISSION RECLASSIFICATION ENGINE (§2, §3, §87, §88).
// The first classification of a request is a HYPOTHESIS. It is built from the language envelope (« mail », « image », « excel »)
// and misses what the user really asks. This module classifies the JOB (objective + operation + artifact state), not the input
// modality: an image with « corrige » is an artifact repair, a mail that merely delivers a repair is a delivery channel.
import { normText } from './text';

export type TrueTask =
  | 'artifact:repair:visual-regression'
  | 'artifact:regression-repair'
  | 'artifact:repair:data'
  | 'artifact:repair'
  | 'artifact:enhance'
  | 'artifact:create'
  | 'vision:inspect'
  | 'vision:answer'
  | 'delivery:email'
  | 'writing'
  | 'answer';
/** The existing routing task types the engine maps onto (null = keep the initial one). */
export type RouteType = 'code' | 'data' | 'document' | 'vision' | 'writing' | 'chat' | null;

export interface Reclass {
  initial: string;
  trueTask: TrueTask;
  routeType: RouteType;
  primaryIntent: string;
  secondaryIntents: string[];
  artifactInvolved: boolean;
  mutationRequired: boolean;
  visualRegression: boolean;
  dataRegression: boolean;
  verificationRequired: boolean;
  deliveryOnly: boolean;
  reclassified: boolean;
  confidence: number;
  triggers: string[];
  /** Difficulty is raised to at least this value (reasoning level re-evaluated after reclassification). */
  difficultyFloor: number;
  reasoningMin: 'low' | 'medium' | 'high';
  /** The mission is really about an existing artifact and its visual / functional state. */
  expected: 'answer' | 'corrected_artifact' | 'new_artifact' | 'text' | 'delivery';
}

const RX = {
  repair: /\b(corrig\w*|r[ée]par\w*|restaur\w*|r[ée]tabli\w*|fix\w*|r[ée]sou(?:d|dre|ds)\b|debug\w*|d[ée]bogu\w*|d[ée]panne\w*)/i,
  regression: /\b(r[ée]gression\w*|disparu\w*|dispara[iî]t\w*|manquan\w*|cass[ée]\w*|ne (?:fonctionne|marche) plus|plus visible|n['’]appara[iî]t plus|a r[ée]gress[ée]|a chang[ée] (?:depuis|apr[èe]s)|apr[èe]s ta modification|avant\s*\/?\s*apr[èe]s|perdu\w*|supprim[ée]\w* par erreur)\b/i,
  problem: /\b(d[ée]cal[ée]\w*|cach[ée]\w*|invisible\w*|coup[ée]\w*|tronqu[ée]\w*|d[ée]borde\w*|chevauch\w*|illisible\w*|bug\w*|erreur\w*|probl[èe]me|impossible|bloqu[ée]\w*|d[ée]fil\w*|scroll\w*|ne s['’]affiche|mal align\w*)/i,
  mutate: /\b(modifi\w*|mets? [àa] jour|mettre [àa] jour|refai\w*|reconstru\w*|recr[ée]\w*|ajout\w*|supprim\w*|remplac\w*|ajust\w*|change\w*|adapte\w*|retire\w*|d[ée]place\w*|renomm\w*)/i,
  enhance: /\b(am[ée]liore\w*|optimise\w*|embellis\w*|modernise\w*|peaufine\w*|travaille le design|rends? (?:le|la|les|ça|cela) (?:plus|meilleur)\w*|redesign\w*)/i,
  create: /\b(cr[ée]e\w*|g[ée]n[èe]re\w*|construis\w*|fabrique\w*|d[ée]veloppe\w*|[ée]cris un (?:script|programme|code)|build)\b/i,
  artifact: /\b(fichier|html?|css|page|appli(?:cation)?|app|dashboard|tableau de bord|site|design|mise en page|layout|photo|image|logo|maquette|interface|ui|ux|composant|bouton|menu|formulaire|script|code|fonction|classeur|excel|xlsx|feuille|onglet|graphique|rapport|pdf|docx|pptx|diapo|pr[ée]sentation|export)\b/i,
  visual: /\b(photo|image|design|mise en page|layout|couleur\w*|police|typograph\w*|scroll\w*|d[ée]fil\w*|[ée]criture\w* cach|marge|espacement|alignement|logo|ic[oô]ne|visuel\w*|affichage|responsive|css|style|th[èe]me)\b/i,
  dataArtifact: /\b(excel|xlsx|xlsb|csv|classeur|feuille|onglet|formule\w*|tableau crois[ée]|colonnes?|lignes?|chiffres?|totaux?)\b/i,
  codeArtifact: /\b(html?|css|javascript|typescript|react|code|script|fonction|api|composant|bug|app|appli(?:cation)?|site|page|dashboard|build|compile)\b/i,
  delivery: /\b(envoie\w*|envoyer|exp[ée]di\w*|transmets?|mail|e-?mail|courriel|outlook|par mail)\b/i,
  inspect: /\b(regarde\w*|d[ée]cris\w*|explique\w* (?:ce qu['’]on voit|l['’]image|ce que)|que voit|qu['’]est-ce qu['’]on voit|lis\b|analyse\w*|identifie\w*|montre\w* ce que)/i,
  writing: /\b([ée]cris\w*|r[ée]dige\w*|reformule\w*|r[ée]ponds?|compose\w*|traduis\w*|r[ée]sume\w*|synth[èe]se)\b/i,
  textNoun: /\b(texte|orthographe|fautes?|grammaire|phrase\w*|paragraphe\w*|lettre|r[ée]daction|style d['’][ée]criture|ton\b)/i,
  attached: /\b(attach[ée]\w*|ci-?joint\w*|ci-?dessus|ce fichier|cette image|cet? (?:html|page|code|fichier)|le fichier|l['’]image)\b/i,
  newTopic: /\b(nouveau sujet|passons [àa]|autre sujet|oublie (?:tout|ça)|maintenant)\b/i,
};

export interface ReclassInput {
  text: string;
  attachments?: { name: string; image?: boolean }[];
  /** Task type chosen by the first classification (« writing », « chat », « vision »…). */
  initial: string;
  hasImages?: boolean;
}

export function reclassify(i: ReclassInput): Reclass {
  const t = i.text;
  const n = normText(t);
  const atts = i.attachments ?? [];
  const imgAtt = Boolean(i.hasImages) || atts.some((a) => a.image);
  const fileAtt = atts.some((a) => !a.image);
  const triggers: string[] = [];
  const has = (rx: RegExp, label: string) => {
    const hit = rx.test(t);
    if (hit) triggers.push(label);
    return hit;
  };
  const repair = has(RX.repair, 'corriger / réparer');
  const regression = has(RX.regression, 'régression / disparition');
  const problem = has(RX.problem, 'problème observé');
  const mutate = has(RX.mutate, 'modification demandée');
  const enhance = has(RX.enhance, 'amélioration');
  const create = has(RX.create, 'création');
  const artifactNoun = RX.artifact.test(t);
  const visual = RX.visual.test(t);
  const dataArt = RX.dataArtifact.test(t);
  const codeArt = RX.codeArtifact.test(t);
  const delivery = has(RX.delivery, 'livraison par mail');
  const inspect = RX.inspect.test(t);
  const writing = RX.writing.test(t);
  const textOnly = RX.textNoun.test(t) && !codeArt && !visual && !dataArt;
  const artifactInvolved = artifactNoun || fileAtt || imgAtt || RX.attached.test(t);
  const secondary: string[] = [];

  let trueTask: TrueTask = 'answer';
  let primary = 'répondre à la question';
  let expected: Reclass['expected'] = 'answer';
  let routeType: RouteType = null;
  let mutation = false;
  let visualReg = false;
  let dataReg = false;
  let confidence = 0.6;

  const brokenState = regression || (problem && (repair || artifactInvolved));
  if (brokenState || (repair && !textOnly)) {
    // ARTIFACT FIRST: observed problem + artifact + action verb ⇒ repair, never an answer, never a mail.
    mutation = true;
    expected = 'corrected_artifact';
    visualReg = visual && (regression || problem || repair);
    dataReg = dataArt && !visual && (regression || problem || repair);
    trueTask = visualReg ? (regression ? 'artifact:regression-repair' : 'artifact:repair:visual-regression') : dataReg ? 'artifact:repair:data' : regression ? 'artifact:regression-repair' : 'artifact:repair';
    if (visualReg && regression && !/disparu|manquan|plus visible/i.test(t)) trueTask = 'artifact:repair:visual-regression';
    primary = visualReg ? 'diagnostiquer et corriger la régression visuelle' : dataReg ? 'diagnostiquer et corriger l’artefact de données' : 'diagnostiquer et corriger l’artefact';
    routeType = dataReg ? 'data' : 'code';
    confidence = 0.85;
    if (delivery) secondary.push('delivery:email');
  } else if (enhance && artifactInvolved) {
    trueTask = 'artifact:enhance';
    mutation = true;
    expected = 'corrected_artifact';
    primary = 'améliorer l’artefact existant';
    routeType = dataArt && !visual ? 'data' : 'code';
    visualReg = visual;
    confidence = 0.75;
    if (delivery) secondary.push('delivery:email');
  } else if (create && artifactNoun && !textOnly && !inspect) {
    trueTask = 'artifact:create';
    mutation = true;
    expected = 'new_artifact';
    primary = 'créer un nouvel artefact';
    routeType = dataArt && !codeArt ? 'data' : codeArt ? 'code' : 'document';
    confidence = 0.7;
    if (delivery) secondary.push('delivery:email');
  } else if (imgAtt && inspect) {
    trueTask = /explique|qu['’]est-ce|que voit/i.test(t) ? 'vision:answer' : 'vision:inspect';
    primary = 'observer et décrire l’image';
    routeType = 'vision';
    confidence = 0.8;
  } else if (delivery && artifactInvolved && !writing && /\b(envoie\w*|envoyer|exp[ée]di\w*|transmets?)\b/i.test(t)) {
    trueTask = 'delivery:email';
    primary = 'envoyer le livrable existant par mail';
    expected = 'delivery';
    routeType = 'writing';
    confidence = 0.7;
  } else if (delivery && (writing || /\b(un|le|ce) (mail|e-?mail|courriel)\b/i.test(t) || /^mail\b/i.test(n))) {
    // A mail with nothing to repair or build: plain writing.
    trueTask = 'writing';
    primary = 'rédiger le message';
    expected = 'text';
    routeType = 'writing';
    confidence = 0.75;
  } else if (writing || textOnly) {
    trueTask = 'writing';
    primary = 'rédiger / corriger un texte';
    expected = 'text';
    routeType = 'writing';
    confidence = 0.7;
  }
  if (trueTask === 'answer' && imgAtt) {
    trueTask = 'vision:answer';
    routeType = 'vision';
  }
  const reclassified =
    (trueTask.startsWith('artifact:') && ['writing', 'chat', 'vision'].includes(i.initial)) ||
    (trueTask === 'writing' && i.initial === 'chat') ||
    (trueTask.startsWith('vision') && i.initial === 'chat');
  const verification = mutation;
  const floor = trueTask === 'artifact:repair:visual-regression' || trueTask === 'artifact:regression-repair' ? 0.55 : trueTask.startsWith('artifact:') ? 0.45 : 0;
  return {
    initial: i.initial,
    trueTask,
    routeType,
    primaryIntent: primary,
    secondaryIntents: secondary,
    artifactInvolved: mutation ? true : artifactInvolved,
    mutationRequired: mutation,
    visualRegression: visualReg,
    dataRegression: dataReg,
    verificationRequired: verification,
    deliveryOnly: trueTask === 'delivery:email',
    reclassified,
    confidence,
    triggers: [...new Set(triggers)],
    difficultyFloor: floor,
    reasoningMin: floor >= 0.55 ? 'medium' : floor > 0 ? 'medium' : 'low',
    expected,
  };
}
/** Marks a topic switch announced by the user (« nouveau sujet », « passons à »). */
export const announcesNewTopic = (text: string) => RX.newTopic.test(text);
