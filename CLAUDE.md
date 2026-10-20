# Consignes permanentes (MASSAMBA Workbench)

**Premier skill à appeler, toujours, avant tout autre skill : `methode-veille-creation` — application stricte, sans exception (liste de contrôle du skill cochée avant chaque réponse).** (consigne du 15/10/2026, venue de la discussion « Ecobank Covenant Trigger Intelligence Pack »)

**Juste après : `rea-d-abord`** (consigne du 17/10/2026, « utilise REA tout le temps au début de toutes tes réflexions pour
de la rétro-ingénierie rapide ») : avant de deviner comment marche un outil, un paquet, une app ou un format, le démonter avec
REA (`rea` en ligne de commande, MCP `rea` déclaré dans `.mcp.json`) et raisonner sur ses preuves (`.claude/skills/rea-d-abord`).
**Puis : `greffer-par-rea`** (consigne du 19/10/2026, « tu dois désormais pour tout chercher des logiciels à greffer via REA avec
précision et avancer, garde-le comme skill ») : pour CHAQUE besoin, trouver le logiciel libre qui le fait déjà, le démonter
avec REA (fichier, ligne, preuve), le greffer, mesurer, pousser, passer au suivant — jamais de code maison avant cette recherche
(`.claude/skills/greffer-par-rea`).
**Veille REA permanente, sans limite** (consignes du 18/10/2026, « veille permanente REA chaque minute », « ne donne pas
de limite à REA, demande-lui de chercher tous les moteurs disponibles du monde ») : `studio-video/outils/veille_rea.py`
tourne en continu (cycle d'une minute) — npm, GitHub, Hugging Face sur tous nos thèmes, REA sur tout ce qu'il sait
démonter, journal daté ; à relancer au début de chaque session et à lire avant chaque greffe.

- **Tout doit être parfait** (consigne du 17/10/2026) : aucune livraison tant qu'un contrôle échoue ; chaque défaut vu par
  l'utilisateur (ex. l'ombre de la poule) devient un contrôle automatique qui l'aurait arrêté ; JEV crée (genèse : variantes
  physiques jugées contre un objectif écrit et une référence d'artiste) et juge (portes A–K du film, batterie physique),
  avec la physique, la mécanique et la lumière du décor respectées (`studio-video/moteur-troupe/physique.py`, `genese.py`).
- **Tout est appuyé par le jugement de JEV** (consignes du 17/10/2026, trois messages) :
  - *greffer d'abord, JEV juge le rendu* (consignes du 18/10/2026, « greffe directement les trouvailles REA et JEV verra
    après rendu » ; « désormais, tu grefferas d'abord les outils nécessaires, JEV ne jugera que le rendu ») : les outils
    nécessaires sont greffés tout de suite, sans consultation préalable ; JEV juge le rendu (portes du film, images) et
    ce qui ne passe pas est repris (`jev_conseil.py` reste disponible pour diagnostiquer un échec, plus avant de coder) ;
  - *aucune tolérance* : chaque contrôle JEV doit rendre la décision « conforme » sur CHAQUE image contrôlée (défaut :
    probabilité < 0,5 ; conformité : > 0,5), sans marge relative à la peinture d'origine ni médiane qui cache une image ;
  - *dans tout le projet* : choix, réglages, livrables et vérifications s'appuient sur une réponse de JEV citée (valeurs).
- **Zéro limite** (consigne du 16/10/2026) : ne jamais livrer de partie « limites » ni dire qu'une tâche confiée dépasse nos moyens ; chaque obstacle est contourné par la veille, l'ajout d'un moteur ou l'adaptation d'un moteur externe, puis mesuré — écrit comme « greffe en cours » avec son plan, jamais comme une impossibilité (`.claude/skills/zero-limite`).
  Renfort du 17/10/2026 : « aucune limite que tu ne pourrais contourner, tu dois **toujours innover** » ; **fouiller GitHub
  de fond en comble** pour les outils qui manquent ; vidéos produites en **temps record** (minutes, tous les plans en
  parallèle), jamais des heures d'attente sur une plateforme que l'utilisateur ne connaît pas ; plateformes connues
  d'abord (OpenRouter de son application, Grok de ses TikTok).
- **Pousser sur le dépôt : AUTORISÉ** (consigne du 17/10/2026, « je t'autorise désormais à tout pousser à partir de
  maintenant », qui remplace « ne plus rien pousser » du 15/10/2026) : pousser la branche de travail après les contrôles
  (aucun secret, rien de `workbench/.private/`, pas de gros binaire, avance simple sur le remote). TOUS les résultats
  (fichiers, mesures, rapports) restent aussi donnés dans le chat (envoi de fichiers + résumé).
- **Rien de payant** (consigne du 17/10/2026, « Je veux rien de payant ») : voies gratuites d'abord (GPU distant appelé depuis le
  navigateur de l'utilisateur avec son propre quota, crédits mensuels gratuits type Modal avec budget plafonné, Kaggle) ; toute
  voie payante reste désactivée dans le code (`OR_PAYANT_AUTORISE`), jamais activée sans accord explicite.
- Répondre en **français**.
- **À chaque requête, chercher d'abord les outils les plus puissants**, mesurer qualité / vitesse / coût / licence sur
  nos propres données, puis les améliorer et les intégrer dans la tâche en cours : compétence
  `.claude/skills/outils-puissants-d-abord`. Un film d'une minute doit sortir en minutes, pas en heures.
- **Veille Internet permanente** à chaque requête (pas seulement quand un résultat déçoit), outils puissants,
  gratuits, sans abonnement ; trouvailles datées dans le journal de `.claude/skills/veille-permanente`.
- **Veille → combiner → créer et innover** (consigne du 15/10/2026) : la veille de chaque requête (technique, DESIGN,
  ANALYSE) n'est jamais reprise telle quelle ; elle est combinée aux outils natifs pour créer du neuf, et la réponse dit
  ce qui a été innové (`.claude/skills/veille-permanente`, §00).
- **Tout blocage de fluidité ou d'écart aux normes → un OUTIL GRATUIT GREFFÉ au moteur** (consigne du 16/10/2026, film
  de la troupe) : à chaque écart mesuré avec les TikTok de l'utilisateur, les vidéos de Ladjagaï ou l'animation 3D (Pixar,
  Illumination ; mêmes outils de mesure : `mesure2.py`, `measure.ts`, `grammaire_plans.py`), chercher sur Internet l'outil
  gratuit qui le résout, l'apprendre, le REPRODUIRE dans notre moteur (licence acceptée par `modeles-libres-moteur`, ou méthode publiée
  réécrite), puis remesurer. Objectif : plus de 100 % des références, dépasser Pixar et Disney.
- **Chaque point faible sans solution fiable → veille Internet et outils puissants d'abord** (dépôts GitHub, modèles
  ouverts), méthode maison seulement en dernier recours.
- Modèles et code exécutés chez nous : licences vérifiées à la source qui autorisent réellement notre usage monétisé
  (consigne du 19/10/2026, « élargis nos critères quand ils sont valables ») — permissives (MIT, Apache-2.0, BSD…),
  CC-BY avec attribution, copyleft (GPL…) utilisé comme programme séparé, licences communautaires dont l'utilisateur
  respecte les seuils ; licence non commerciale seulement au banc d'essai (évaluer, apprendre la méthode), jamais dans
  la chaîne des vidéos publiées ; dépôt sans licence : pour l'expertise et le banc d'essai seulement (consigne du 20/10/2026,
  « utilise aussi les dépôts sans licence pour l'expertise »), jamais dans la chaîne publiée (`.claude/skills/modeles-libres-moteur`).
- Ne jamais fabriquer de données, d'économies ni de performances ; « plafond DUR » seulement s'il est appliqué par le code.
- Ne jamais afficher ni demander de clés, secrets ou jetons. Création de comptes au nom de l'utilisateur **autorisée**
  (consigne du 16/10/2026, « carte blanche ») quand la tâche l'exige, sans jamais contourner un contrôle anti-robot
  (CAPTCHA, code SMS) ni afficher un mot de passe ; ces gestes de vérification restent faits par l'utilisateur.
- Le dépôt est public : images et vidéos de l'utilisateur seulement dans `workbench/.private/` (ignoré par git) ou le
  scratchpad.
- **Livraison de l'app = seulement les fichiers modifiés** (consignes du 15/10/2026) : `npm run build:direct` produit le
  dossier complet `workbench/dist/livraison/MASSAMBA Workbench/` (app, paquets de décors `massamba-troupe-N.js`,
  `LISEZ-MOI.txt`, chaque fichier sous 30 Mio, versions contrôlées) et `dist/livraison/A ENVOYER/` = les fichiers qui
  diffèrent de la dernière livraison envoyée. Envoyer exactement ce dossier « A ENVOYER » (le plus souvent l'app seule ;
  les paquets seulement si les décors changent), puis `npm run livraison:envoyee`. Dossier complet sur demande ou si
  l'utilisateur l'a perdu : `npm run livraison:complet`.
- **Deux applications depuis le 17/10/2026** (séparation demandée le 16/10/2026) : Workbench (`workbench/`, `npm run
  build:direct`, plus de paquets de décors) et **Studio Vidéo** (`studio-video/` : Film Autopilot, Vidéo IA, Réalisation,
  Studio 3D, moteur de la troupe, pont Blender, carnets ; `npm run preparer` puis `npm run build` → `dist/livraison/MASSAMBA
  Studio Video/` et `dist/livraison/A ENVOYER/`, même règle des seuls fichiers modifiés, puis `npm run livraison:envoyee`).
  Le travail vidéo se fait dans `studio-video/` ; ses images privées restent dans `workbench/.private/` (lien `.private`).
