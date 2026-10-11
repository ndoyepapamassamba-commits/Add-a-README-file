/**
 * MARKETPLACE DE COMPÉTENCES — built-in skills (Claude SKILL.md format), sorted by category, installed in one click.
 * An installed skill is an ordinary skill of the user (editable, can be turned off, deleted). Nothing is installed or
 * updated without the user's click. Each body is a short, concrete procedure the model must follow.
 */
export const SKILL_CATEGORIES = ['Design', 'Amélioration d’image', 'Vidéo', 'Ingénierie IA', 'Développement', 'Mathématiques', 'Sciences'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export interface MarketSkill {
  name: string;
  category: SkillCategory;
  /** When to use it; the words in quotes are the triggers. */
  description: string;
  body: string;
}
const S = (name: string, category: SkillCategory, description: string, body: string): MarketSkill => ({ name, category, description, body: body.trim() });

export const MARKET_SKILLS: MarketSkill[] = [
  // ── Design
  S('controle-design-avant-livraison', 'Design', 'Contrôle et corrige le design de tout livrable avant livraison. Se déclenche avec "contrôle design", "vérifie le design", "avant livraison", "cadrage", "illisible".', `
# Contrôle design avant livraison
L'application passe AUTOMATIQUEMENT ce contrôle sur chaque Excel, Word, PowerPoint et HTML écrit pendant le tour. Quand tu produis un fichier toi-même (code), respecte d'avance ce qu'il corrige :
1. Contraste WCAG : texte ≥ 4,5:1 sur son fond (3:1 pour les titres gras ou ≥ 18 pt). Jamais de texte blanc sur fond clair ni foncé sur fond sombre.
2. Excel : aucune colonne trop étroite (##### ou texte coupé par la cellule voisine) ; feuilles larges imprimées « ajuster à la largeur » en paysage ; pas de N(+plage) dans SUMPRODUCT (Excel ne garde que la 1re valeur).
3. Word : tableaux et images jamais plus larges que la zone de texte.
4. PowerPoint : aucun élément hors de la diapositive ; texte qui tient dans sa zone (sinon réduire ou couper la diapositive).
5. HTML / PDF : images et tableaux contenus dans la page, impression A4 sans couper une ligne de tableau ou une carte.
Annonce dans ta réponse les corrections faites (la carte « Design appliqué » les liste).`),
  S('tableau-de-bord-premium', 'Design', 'Construit un tableau de bord Excel premium vivant. Se déclenche avec "tableau de bord", "dashboard", "KPI", "cockpit".', `
# Tableau de bord premium
- Utilise data.export (xlsx) puis laisse l'application ajouter le tableau de bord VIVANT (formules, filtres, graphiques natifs). N'insère jamais d'image de graphique dans Excel.
- 3 à 4 indicateurs en tête (total, moyenne, maximum, nombre), puis 2 à 4 graphiques, puis le top 10.
- Un filtre = une catégorie à peu de valeurs (segment, tranche, taux, mois), jamais un identifiant client.
- Libellés courts (≤ 16 caractères) ; barres horizontales quand les noms sont longs.`),
  S('charte-graphique', 'Design', 'Applique une charte graphique cohérente à tous les formats. Se déclenche avec "charte", "palette", "identité visuelle", "couleurs de la marque".', `
# Charte graphique
1. Une couleur sombre (bandeaux, titres), une primaire (en-têtes de tableaux), un accent (filets, chiffres clés), un fond clair.
2. Une seule police de texte, une police à chasse fixe pour les chiffres.
3. La même charte sur toutes les pages, feuilles et diapositives ; le logo de l'utilisateur seulement, jamais celui d'une autre marque.`),
  // ── Image
  S('retouche-portrait-cartoon', 'Amélioration d’image', 'Améliore visages, yeux et mains d’une image générée. Se déclenche avec "yeux", "visage", "mains", "améliore l\'image", "retouche".', `
# Retouche portrait (cartoon / 3D)
Passe image → image avec l'image d'origine en PREMIÈRE référence. Instruction type :
« Garde exactement la composition, la caméra, les personnages, les poses, les tenues et la palette. Corrige uniquement : yeux symétriques et expressifs avec reflets, pupilles alignées ; mains à cinq doigts ; peau et tissus plus fins ; aucune lettre ni filigrane. »
Le directeur artistique du Studio rejuge l'image : la retouche n'est gardée que si elle est mieux notée.`),
  S('upscale-et-nettete', 'Amélioration d’image', 'Agrandit et rend plus net une image. Se déclenche avec "upscale", "agrandir", "netteté", "haute résolution", "4K".', `
# Agrandissement et netteté
1. Vérifie dans le catalogue du compte un modèle d'image acceptant une image d'entrée et une résolution supérieure ; sinon, dis-le (aucun agrandissement inventé).
2. Demande la même image en plus grande résolution, mêmes couleurs, détails affinés, sans nouvel élément.
3. Compare avant / après (le juge visuel) et garde la meilleure.`),
  S('coherence-personnages', 'Amélioration d’image', 'Garde un personnage identique d’une image à l’autre. Se déclenche avec "même personnage", "cohérence", "continuité", "reconnaissable".', `
# Cohérence des personnages
- Toujours envoyer la planche de référence du personnage (référence générée par le Studio) avec chaque scène.
- Décrire la tenue, la coiffure, la morphologie et les accessoires avec les MÊMES mots dans chaque prompt.
- Un seul moment d'action par image, plan unique ; refuser les planches de BD.`),
  // ── Vidéo
  S('video-afrikatoon-premium', 'Vidéo', 'Pipeline vidéo Afrikatoon de qualité film. Se déclenche avec "vidéo", "animation", "film", "Afrikatoon", "TikTok".', `
# Vidéo Afrikatoon premium
Ordre : histoire → scènes → images (directeur artistique) → animation image → vidéo → contrôle qualité (reprise des scènes faibles) → voix, musique, sous-titres → montage cinéma.
- Un plan = 3 à 6 s, un mouvement de caméra clair, une réaction exagérée lisible en 1 s.
- Voix : une voix par personnage, interjections wolof traduites en sous-titres.
- Interpolation, stabilisation : seulement si un modèle du catalogue les fait ; sinon les annoncer « non disponibles ».`),
  S('mouvements-camera', 'Vidéo', 'Choisit les mouvements de caméra d’une scène. Se déclenche avec "caméra", "plan", "travelling", "zoom", "cadrage vidéo".', `
# Mouvements de caméra
- Révélation : travelling arrière. Réaction : zoom rapide sur le visage. Dialogue : champ / contre-champ léger. Chute : arrêt sur image puis zoom.
- Jamais deux fois le même mouvement d'affilée ; durée du mouvement = durée de la réplique.`),
  S('montage-rythme', 'Vidéo', 'Monte une vidéo courte au bon rythme. Se déclenche avec "montage", "rythme", "transition", "durée", "sous-titres".', `
# Montage et rythme
- Accroche visuelle dans la 1re seconde, chute avant 60 s.
- Coupes sur le mouvement ; fondu seulement pour un saut de temps.
- Sous-titres mot à mot, 2 lignes au plus, au tiers inférieur ; musique baissée sous les voix.`),
  // ── Ingénierie IA
  S('prompt-engineering', 'Ingénierie IA', 'Écrit des prompts robustes pour modèles de langage ou d’image. Se déclenche avec "prompt", "instruction", "system prompt", "consigne".', `
# Prompts robustes
1. Rôle, objectif, contexte utile seulement, format de sortie exact (JSON quand du code le lit).
2. Exemples courts positifs ; contraintes négatives en fin de prompt pour l'image.
3. Tester sur 3 cas réels, garder la version qui gagne, noter la date et le modèle.`),
  S('evaluation-modeles', 'Ingénierie IA', 'Compare des modèles sur une tâche, chiffres à l’appui. Se déclenche avec "comparer les modèles", "benchmark", "évaluer", "meilleur modèle".', `
# Évaluation de modèles
- Même jeu de cas, même consigne, coût et latence mesurés par l'application.
- Score par critère explicite ; jamais de score inventé : sans mesure, « non mesuré ».
- Conclure sur qualité / coût / vitesse, avec la taille de l'échantillon.`),
  S('rag-documents', 'Ingénierie IA', 'Répond à partir de documents fournis avec citations. Se déclenche avec "dans ce document", "selon le fichier", "cite", "sources".', `
# Réponse fondée sur des documents
1. Chercher les passages (filesystem.search), lire seulement ceux-là.
2. Chaque affirmation suivie de sa source (fichier, page ou feuille).
3. Si l'information n'y est pas : le dire, ne pas compléter de mémoire.`),
  // ── Développement
  S('revue-de-code', 'Développement', 'Relit du code pour trouver les bugs. Se déclenche avec "revue de code", "relis mon code", "bug", "review".', `
# Revue de code
Ordre : exactitude (cas limites, null, bornes) → sécurité (secrets, injection) → performance → lisibilité. Pour chaque problème : fichier:ligne, scénario qui casse, correction proposée.`),
  S('tests-automatises', 'Développement', 'Écrit des tests qui prouvent un comportement. Se déclenche avec "tests", "test unitaire", "couverture", "non-régression".', `
# Tests automatisés
- Un test par comportement, nommé par ce qu'il prouve ; il doit échouer sur l'ancien code.
- Données synthétiques, jamais de vraies données client.
- Lancer la suite et donner le résultat réel.`),
  S('python-excel-sans-erreur', 'Développement', 'Écrit du Python (pandas / openpyxl) sans erreur d’exécution. Se déclenche avec "python", "openpyxl", "pandas", "script excel".', `
# Python pour Excel sans erreur
1. Lire d'abord les noms de feuilles et de colonnes (data.inspect), ne jamais les deviner.
2. Couleurs openpyxl en ARGB (« FF » + 6 chiffres) ; ne pas réécrire un classeur produit par l'application (il perd ses formes).
3. Préférer data.export : tableau de bord vivant, design et contrôle design appliqués automatiquement.`),
  // ── Mathématiques
  S('statistiques-descriptives', 'Mathématiques', 'Calcule et interprète des statistiques. Se déclenche avec "moyenne", "médiane", "écart-type", "distribution", "statistiques".', `
# Statistiques descriptives
- Effectif, moyenne, médiane, écart-type, min / max, quartiles ; signaler les valeurs aberrantes (> Q3 + 1,5 IQR).
- Calculs faits par code (data.query / code.run), jamais de tête.
- Interpréter en une phrase par indicateur.`),
  S('calcul-financier', 'Mathématiques', 'Mensualités, intérêts, actualisation, provisions. Se déclenche avec "intérêts", "mensualité", "actualisation", "VAN", "TRI", "provision".', `
# Calcul financier
- Formules exactes (annuité, intérêts composés, VAN, TRI) calculées par code ; afficher hypothèses et taux.
- Montants en XOF avec espace comme séparateur de milliers.
- Toujours un contrôle de cohérence (total = somme des parties, max ≥ moyenne).`),
  S('previsions', 'Mathématiques', 'Prévoit une série chronologique. Se déclenche avec "prévision", "tendance", "projection", "forecast".', `
# Prévisions
- Visualiser la série, tester tendance et saisonnalité ; modèle simple d'abord (moyenne mobile, régression linéaire).
- Donner un intervalle, pas un chiffre seul ; indiquer la période d'apprentissage.`),
  // ── Sciences
  S('methode-scientifique', 'Sciences', 'Structure une analyse avec hypothèses et preuves. Se déclenche avec "hypothèse", "expérience", "démontrer", "méthode scientifique".', `
# Méthode scientifique
Question → hypothèse falsifiable → données / expérience → résultat chiffré → limites → conclusion. Distinguer corrélation et causalité.`),
  S('veille-documentaire', 'Sciences', 'Fait une veille fiable et la garde comme compétence. Se déclenche avec "veille", "état de l\'art", "publications", "recherche documentaire".', `
# Veille documentaire
1. web.search (le résultat déjà connu est réutilisé sans nouvelle recherche Tavily).
2. Sources primaires d'abord (régulateur, publication, site officiel), date de chaque source.
3. Enregistrer la synthèse avec knowledge.save pour ne plus refaire la recherche.`),
  S('vulgarisation', 'Sciences', 'Explique un sujet complexe simplement. Se déclenche avec "explique simplement", "vulgarise", "pour un débutant".', `
# Vulgarisation
Une idée par paragraphe, un exemple concret local, une analogie, aucun jargon non défini ; finir par 3 points à retenir.`),
];
export const marketByCategory = (c: SkillCategory) => MARKET_SKILLS.filter((s) => s.category === c);
