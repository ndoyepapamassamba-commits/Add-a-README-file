// EMBEDDED EXPERIENCE — what was learnt building and operating this Workbench, plus proven engineering practice.
// Never sent wholesale: only the 1-2 lessons that match a request are recalled (semantic memory), ~40 tokens each.
import { recall, type MemFact, type Recall } from './semantic';

const L = (text: string): MemFact => ({ id: `seed:${text.slice(0, 24)}`, text, kind: 'lesson', at: Date.UTC(2026, 9, 1) });
export const SEED_EXPERIENCE: MemFact[] = [
  // Delivery & alteration
  L("Après une livraison, « change / ajoute / mets » vise le fichier livré : le relire, appliquer le seul changement demandé, réécrire au même chemin."),
  L("Rapport Excel : vérifier que la somme des lignes de détail égale la ligne de total avant de l'utiliser ; ne jamais recopier un total sans le recalculer."),
  L("Export Excel / Word / PowerPoint : en-têtes figés, largeurs de colonnes adaptées, formats de nombres et de dates explicites, aucune cellule fusionnée inutile."),
  L("Tableau de bord HTML : un seul fichier autonome, données intégrées, lisible sur mobile, graphiques avec titres et unités, export testé dans le navigateur."),
  L("Mail de synthèse : objet explicite, chiffres clés en premier, puis contexte, puis action attendue ; jamais de chiffre non vérifié."),
  // Code
  L("Code : lire le fichier avant de l'éditer, changer le minimum, exécuter ou tester après chaque modification, garder la sortie de l'erreur exacte."),
  L("Bug : reproduire d'abord, isoler la cause racine, corriger, puis prouver avec le même test qui échouait ; ne jamais masquer un test qui échoue."),
  L("Refactorisation : comportement identique prouvé par des tests avant et après ; un commit par intention ; pas de changement de format mêlé à la logique."),
  L("Application web : valider côté serveur, échapper les sorties, jamais de secret dans le code client, gérer les états vide / chargement / erreur."),
  L("Performance : mesurer avant d'optimiser ; éviter les boucles en O(n²) sur les données, paginer, mettre en cache ce qui ne change pas."),
  L("Données : inspecter types, valeurs manquantes, doublons et unités avant toute analyse ; chaque chiffre publié vient d'une requête, jamais d'une estimation."),
  L("Python / pandas : lire avec le bon séparateur et l'encodage, convertir explicitement les dates et montants, contrôler le nombre de lignes après chaque jointure."),
  L("SQL : filtrer tôt, joindre sur des clés uniques vérifiées, compter avant / après chaque jointure pour détecter les doublons."),
  // Cost & reliability
  L("Coût : une question simple se traite sans outils ni relecture ; un budget de tokens est un plafond, jamais une cible à remplir."),
  L("Fiabilité : un seul échec de vérification → correction ciblée → une seule nouvelle vérification ; jamais de boucle de contrôles."),
  L("Recherche web : toute donnée datée (prix, taux, lois, versions, actualités) se vérifie en ligne et se cite avec l'URL et la date."),
  L("Images : un modèle sans vision s'appuie sur la description et l'OCR fournis ; ne jamais prétendre voir un détail absent de la description."),
  // Finance / risk (domain of the main user)
  L("Risque de crédit : citer la règle appliquée (stades IFRS 9, classification BCEAO, jours de retard) avant de l'appliquer ; ratio NPL = encours NPL / encours total."),
  L("Montants en XOF : séparateur de milliers espace, pas de décimales, dates jj/mm/aaaa ; arrondir uniquement à la présentation finale."),
  // Video / studio
  L("Vidéo 2D animée : chaque plan doit bouger (caméra, parallaxe ou animation), la voix doit correspondre au personnage et la musique passer sous les dialogues."),
];
export const seedHits = (text: string, k = 2): Recall[] => recall(SEED_EXPERIENCE, text, { k, min: 0.33 });
