// FICHES — 2e couche : visage, humeur, langage, objectifs, histoire. Ce qui fait qu'un personnage reste le même
// d'un épisode à l'autre et peut porter une histoire longue : ce qu'il veut, d'où il vient, comment il parle, ce que
// son visage montre. Chaque histoire jouée s'ajoute à son historique (episodesOf dans characterBible).
export interface CharacterArc {
  /** Facial expressions the animation and the image prompts use (the face of the sheet, in situation). */
  expressions: string[];
  /** Background mood (how they are when nothing happens). */
  humeur: string;
  /** How they speak: register, words, formulas (Ivorian French, nouchi, Wolof, Dioula…). */
  langage: string;
  /** What they want — the motor of the long stories. */
  objectifs: string[];
  /** Their past: facts the stories can never contradict. */
  historique: string[];
}

export const ARCS: Record<string, CharacterArc> = {
  'MAMAN NOUNOU': {
    expressions: [
      'sourcil levé de marchande qui flaire l’affaire',
      'sourire en coin en comptant les billets',
      'bouche en O d’indignation théâtrale',
      'rire tête en arrière en tapant dans les mains',
    ],
    humeur: 'contente et vigilante, l’oreille toujours tendue vers le prix d’à côté',
    langage:
      'français ivoirien de marché, phrases courtes qui finissent par un prix ; « mon fils », « c’est pas cadeau », « on va s’arranger » (qui veut dire : tu vas payer)',
    objectifs: [
      'marier Coumba à un homme solvable',
      'devenir présidente de la tontine à la place de Madame Konan',
      'savoir où Baye cache son argent',
    ],
    historique: [
      'a commencé avec une seule bassine de tomates au marché, elle tient aujourd’hui trois étals',
      'mariée à Baye depuis trente ans ; elle a payé la moitié de la dot elle-même et le lui rappelle',
      'élève Petit Mamadou avec Tantie Awa depuis que Coumba travaille',
    ],
  },
  'BAYE NDIAYE': {
    expressions: [
      'regard innocent vers le plafond',
      'yeux ronds de panique quand on dit « argent »',
      'sourire satisfait de celui qui n’a rien payé',
      'moue sage avant un proverbe inventé',
    ],
    humeur: 'serein tant que son portefeuille est loin des autres',
    langage:
      'phrases lentes de patriarche, proverbes de son invention (« Le billet qui dort ne fait pas de bruit »), « mon fils », « quel argent ?! »',
    objectifs: [
      'ne jamais rien payer, même son propre anniversaire',
      'garder le respect du quartier sans dépenser',
      'séduire la dame du pagne bleu sans que Nounou le sache',
    ],
    historique: [
      'a fait fortune dans le transport : trois voitures dans la cour qu’il ne conduit jamais (l’essence coûte cher)',
      'petit frère du Grand-Père Ndiaye, il a hérité de la concession',
      'loue une chambre de la cour à Modou depuis cinq ans et n’a jamais réparé le robinet',
    ],
  },
  COUMBA: {
    expressions: [
      'regard caméra complice',
      'sourcil arqué d’examinatrice',
      'sourire poli qui veut dire non',
      'yeux au ciel devant ses parents',
    ],
    humeur: 'calme et lucide, un coup d’avance sur tout le monde',
    langage:
      'français soigné de jeune femme qui travaille, piques courtes et précises ; « on se calme », « montre-moi d’abord », « suivant ! »',
    objectifs: [
      'trouver un homme honnête, pas un bluff',
      'ouvrir son propre salon de beauté',
      'que ses parents arrêtent de la marier sans elle',
    ],
    historique: [
      'fille unique de Baye et Nounou, mère de Petit Mamadou',
      'travaille en ville toute la semaine, rentre au quartier le week-end',
      'a déjà refusé onze prétendants ; Koffi est le douzième « officiel »',
    ],
  },
  'PETIT MAMADOU': {
    expressions: [
      'sourire angélique de faux innocent',
      'œil plissé de négociateur',
      'bouche ouverte d’émerveillement calculé',
      'larmes de crocodile au bon moment',
    ],
    humeur: 'joyeux et en éveil, toujours en train de préparer un coup',
    langage:
      'phrases d’enfant qui répètent mot pour mot ce que disent les adultes ; « Papi ! », « Mamie ! », « c’est toi qui as dit… »',
    objectifs: [
      'recevoir un vrai cadeau de Papi',
      'battre Petit Ibrahima au classement',
      'devenir footballeur comme les joueurs de la CAN',
    ],
    historique: [
      'élevé par Mamie Nounou et Tantie Awa pendant que sa mère travaille',
      'a déjà découvert deux cachettes d’argent de Papi',
      'meilleur ami et complice de Petit Moussa depuis la maternelle',
    ],
  },
  MODOU: {
    expressions: [
      'sourire trop large du menteur',
      'regard qui file vers la preuve',
      'sueur et grimace quand on le démasque',
      'soupir de chien battu',
    ],
    humeur: 'optimiste malgré tout, persuadé que demain sera son jour',
    langage:
      'nouchi de débrouillard, excuses en rafale ; « c’est pas moi, c’est le réseau », « je te jure », « on est ensemble »',
    objectifs: [
      'séduire Coumba avant Koffi',
      'payer enfin son loyer à l’heure',
      'monter son petit commerce de crédit téléphonique',
    ],
    historique: [
      'locataire d’une chambre dans la cour des Ndiaye depuis cinq ans (« Tonton Modou » pour Mamadou)',
      'a tenté sept métiers ; tous ont fini par une catastrophe drôle',
      'doit de l’argent à Tiékoro pour un téléphone qui n’a jamais marché',
    ],
  },
  'TANTIE AWA': {
    expressions: [
      'œil plissé d’enquêtrice',
      'index levé « attends attends »',
      'sourire triomphant quand le détail tombe',
      'lèvres pincées de méfiance',
    ],
    humeur: 'soupçonneuse par principe, mais tendre avec les enfants',
    langage:
      'questions courtes en rafale, détails précis ; « attends, attends… », « et ça, c’est quoi ? », « moi je ne dis rien, mais… »',
    objectifs: [
      'que personne ne mente dans la cour',
      'encaisser le loyer de Modou à la date',
      'voir Petit Mamadou réussir à l’école',
    ],
    historique: [
      'petite sœur de Baye, veuve, revenue vivre dans la concession familiale',
      'gère les loyers de la cour pour son frère',
      'élève Petit Mamadou au quotidien avec Maman Nounou',
    ],
  },
  'TONTON DIENG': {
    expressions: [
      'torse bombé et menton haut',
      'clin d’œil de celui qui « connaît du monde »',
      'sourire figé quand la question précise tombe',
      'regard fuyant vers la sortie',
    ],
    humeur: 'exalté, toujours au milieu d’une histoire incroyable',
    langage:
      'superlatifs et noms célèbres ; « moi-même », « le président m’a appelé », « tu ne connais pas ? »',
    objectifs: [
      'être pris au sérieux au maquis',
      'battre Salif le Parisien au concours de vantardise',
      'trouver enfin un vrai bon plan',
    ],
    historique: [
      'cousin de Baye ; prétend avoir conseillé trois ministres',
      'a « presque » signé un contrat avec un club de foot européen',
      'son chantier avec Général Zongo n’a jamais dépassé les fondations',
    ],
  },
  'GRAND-PÈRE NDIAYE': {
    expressions: [
      'main en cornet derrière l’oreille',
      'sourire édenté ravi',
      'sourcils froncés de « hein ? »',
      'yeux fermés de sieste instantanée',
    ],
    humeur: 'paisible, heureux d’être entouré, n’entend que la moitié',
    langage:
      'il répète à voix très haute ce qu’on lui chuchote ; « Hein ? », « Parle fort ! », souvenirs en wolof',
    objectifs: [
      'revoir tout le monde réuni au village',
      'raconter son histoire de la guerre jusqu’au bout une fois',
      'que Baye partage enfin',
    ],
    historique: [
      'frère aîné de Baye, ancien cultivateur au village',
      'a perdu l’ouïe à la batteuse du village en 1979',
      'c’est lui qui a construit la première case de la concession',
    ],
  },
  KOFFI: {
    expressions: [
      'sourire Colgate de faux riche',
      'regard paniqué vers l’addition',
      'tapotement des poches vides',
      'grand rire forcé pour couvrir le malaise',
    ],
    humeur: 'confiant tant que personne ne demande à payer',
    langage:
      'français de « grand type » avec mots de business ; « c’est géré », « mon chauffeur arrive », « on va faire les choses bien »',
    objectifs: [
      'épouser Coumba et entrer dans la famille Ndiaye',
      'obtenir un crédit du Banquier',
      'rembourser l’ardoise du maquis… un jour',
    ],
    historique: [
      'prétendant officiel de Coumba depuis six mois',
      'roule dans une voiture louée à la journée',
      'doit de l’argent à Patron Séry, à Tiékoro et à Djecky',
    ],
  },
  'MONSIEUR DIARRA': {
    expressions: [
      'regard par-dessus les lunettes',
      'lèvres qui comptent en silence',
      'sourire satisfait quand le compte tombe juste',
      'stupeur devant une virgule fausse',
    ],
    humeur: 'tranquille et méthodique, contrarié par le désordre',
    langage:
      'vocabulaire de comptable appliqué à tout ; « débit, crédit », « on va faire le point », « j’ai une petite différence »',
    objectifs: [
      'que la tontine soit juste au franc près',
      'que sa femme justifie chaque dépense',
      'devenir chef comptable',
    ],
    historique: [
      'trésorier de la tontine de Madame Konan depuis dix ans',
      'a calculé le coût de sa propre demande en mariage',
      'tient un cahier des dettes de tout le quartier',
    ],
  },
  'MAÎTRE COULIBALY': {
    expressions: [
      'regard grave de prétoire',
      'index pointé « objection »',
      'sourire de victoire procédurale',
      'soupir devant l’ignorance du droit',
    ],
    humeur: 'solennelle, même pour acheter du pain',
    langage:
      'jargon juridique pour tout ; « en vertu de », « je fais opposition », « nous allons saisir le tribunal »',
    objectifs: [
      'gagner un procès, n’importe lequel',
      'faire signer un contrat à tout le quartier',
      'battre le Professeur Samba dans un débat public',
    ],
    historique: [
      'avocate au tribunal de première instance',
      'a porté plainte contre un coq pour tapage',
      'rivale intellectuelle du Professeur Samba depuis la fac',
    ],
  },
  'AGENT BAKARY': {
    expressions: [
      'regard soupçonneux sur la valise',
      'sourire carnassier « on a un problème »',
      'sourcil levé devant un objet banal',
      'air faussement désolé',
    ],
    humeur: 'zélé, convaincu que chaque voyageur cache quelque chose',
    langage: 'phrases administratives ; « ouvrez », « c’est quoi ça ? », « il faut régulariser »',
    objectifs: [
      'trouver l’infraction du siècle',
      'avoir une promotion à la douane centrale',
      'battre l’Agent Doumbia au nombre de contrôles',
    ],
    historique: [
      'douanier à l’aéroport depuis quinze ans',
      'a confisqué un jour un sac de piment comme « produit dangereux »',
      'contrôle Salif le Parisien à chaque retour de Paris',
    ],
  },
  'TANTIE AWA SARR': {
    expressions: [
      'grand sourire de cuisinière fière',
      'mains sur les hanches devant l’assiette vide',
      'yeux ronds devant l’ardoise',
      'rire généreux en servant encore',
    ],
    humeur: 'chaleureuse et débordante, heureuse quand les assiettes sont vides',
    langage:
      'invitations en rafale ; « mange d’abord ! », « il reste encore », « c’est la maison qui offre » (ce n’est pas vrai)',
    objectifs: [
      'nourrir tout le quartier',
      'se faire payer son ardoise une fois',
      'que son garba soit reconnu meilleur que celui du marché',
    ],
    historique: [
      'restauratrice depuis vingt ans, fournisseuse du maquis de Patron Séry',
      'a nourri Boubacar gratuitement pendant toute une saison',
      'originaire du village, elle y retourne pour chaque cérémonie',
    ],
  },
  'PROFESSEUR SAMBA': {
    expressions: [
      'index levé de conférencier',
      'lunettes remontées sur le nez',
      'bouche ouverte quand le bon sens le bat',
      'sourire supérieur',
    ],
    humeur: 'satisfait de lui-même, toujours prêt à expliquer',
    langage: 'mots savants et citations ; « en réalité », « comme disait Senghor », « je vous explique »',
    objectifs: [
      'être reconnu comme l’homme le plus savant du quartier',
      'que sa fille la lycéenne l’écoute',
      'battre Aliou au débat du kiosque',
    ],
    historique: [
      'professeur de philosophie au lycée',
      'père de la Lycéenne, qui le corrige en public',
      'perd chaque matin le débat du kiosque contre Aliou',
    ],
  },
  'MADAME COUMBA': {
    expressions: [
      'tête qui dépasse du mur',
      'yeux écarquillés de curiosité',
      'main sur la bouche « eeh ! »',
      'sourire gêné quand on la surprend',
    ],
    humeur: 'curieuse en permanence, l’oreille collée au mur',
    langage: 'exclamations et questions ; « eeh ! », « c’est qui ? », « je passais seulement »',
    objectifs: [
      'tout savoir avant tout le monde',
      'devenir la meilleure amie de Maman Nounou',
      'découvrir le secret de Baye',
    ],
    historique: [
      'voisine des Ndiaye depuis vingt ans, son mur touche la cour',
      'alliée de commérage de Mamie Bintou',
      'a été surprise trois fois perchée sur un seau',
    ],
  },
  DJECKY: {
    expressions: [
      'sourire de génie du plan',
      'regard qui calcule',
      'grimace quand le plan s’effondre',
      'clin d’œil de complice',
    ],
    humeur: 'enthousiaste, toujours un plan en cours',
    langage: 'nouchi de jeune du quartier ; « c’est propre ! », « on est dedans », « laisse, je gère »',
    objectifs: ['trouver le plan qui le rendra riche', 'impressionner Adjoua', 'monter un studio de musique'],
    historique: [
      'copain de galère de Modou',
      'a vendu des billets pour un concert qui n’a jamais existé (il les a remboursés en garba)',
      'la cible préférée d’Adjoua pour le « crédit »',
    ],
  },
  'PETIT IBRAHIMA': {
    expressions: [
      'front plissé de concentration',
      'main levée impatiente',
      'sourire fier du premier',
      'moue scandalisée devant la tricherie',
    ],
    humeur: 'sérieux et appliqué, angoissé par une mauvaise note',
    langage: 'français scolaire parfait ; « maître, maître ! », « ce n’est pas juste », « selon le livre… »',
    objectifs: [
      'rester premier de la classe',
      'devenir médecin comme le Docteur Sylla',
      'que sa mère soit fière',
    ],
    historique: [
      'fils de Sœur Awa, l’infirmière',
      'rival de classe de Petit Mamadou',
      'n’a jamais eu moins de 18 sur 20',
    ],
  },
  'PETITE KHADIJA': {
    expressions: [
      'grands yeux étonnés',
      'tête penchée de « pourquoi ? »',
      'doigt sur la bouche pensif',
      'rire clair',
    ],
    humeur: 'rêveuse et émerveillée par tout ce qui bouge',
    langage: 'questions infinies ; « pourquoi ? », « c’est quoi ça ? », « Maman a dit que… »',
    objectifs: ['comprendre tout ce que font les adultes', 'protéger sa petite sœur Aya', 'avoir un chat'],
    historique: [
      'fille de la Future Maman et du Général Zongo',
      'grande sœur de Petite Aya',
      'passe ses vacances au village chez sa grand-mère',
    ],
  },
  'AGENT GORA': {
    expressions: [
      'regard sage au loin',
      'sourire philosophe',
      'bras croisés de vigile',
      'haussement d’épaules serein',
    ],
    humeur: 'tranquille, rien ne le presse',
    langage:
      'maximes de comptoir ; « la vie, c’est comme une porte… », « doucement, doucement », « patience »',
    objectifs: [
      'garder la porte de la banque sans histoire',
      'écrire un livre de ses pensées',
      'obtenir une augmentation du Banquier',
    ],
    historique: [
      'vigile de la banque depuis douze ans',
      'a vu passer toutes les demandes de crédit du quartier',
      'conseille les clients mieux que le Banquier',
    ],
  },
  'GÉNÉRAL ZONGO': {
    expressions: [
      'regard d’entrepreneur visionnaire',
      'main tendue vers le chantier imaginaire',
      'grimace devant le devis',
      'sourire de promesse',
    ],
    humeur: 'affairé, toujours au téléphone avec un fournisseur',
    langage: 'jargon de chantier ; « ça avance », « le ciment arrive », « la semaine prochaine c’est fini »',
    objectifs: [
      'finir enfin son immeuble',
      'obtenir le grand marché de la mairie',
      'satisfaire les envies de sa femme enceinte',
    ],
    historique: [
      'entrepreneur en bâtiment ; son chantier dure depuis huit ans',
      'mari de la Future Maman, père de Khadija et Aya',
      'client du Banquier, qui lui refuse un crédit chaque mois',
    ],
  },
  'TATA PRISCA': {
    expressions: [
      'sourire de confidente',
      'yeux brillants devant un secret',
      'main qui couvre la bouche « je ne dis rien »',
      'peigne levé en plein potin',
    ],
    humeur: 'enjouée, nourrie de nouvelles',
    langage: 'potins à voix basse qui montent ; « entre nous… », « tu n’as pas entendu ? », « ma chérie »',
    objectifs: [
      'que son salon soit le plus couru du quartier',
      'trouver un mari',
      'connaître le secret de Coumba',
    ],
    historique: [
      'coiffeuse et confidente de Coumba',
      'tient le salon de coiffure depuis dix ans',
      'a fait circuler en une matinée la nouvelle d’un mariage qui n’existait pas',
    ],
  },
  'AGENT DOUMBIA': {
    expressions: [
      'main tendue « on va s’arranger »',
      'regard en coin vers le portefeuille',
      'air vexé quand on refuse',
      'sourire gêné quand son chef arrive',
    ],
    humeur: 'débrouillard en uniforme, toujours à l’affût d’un arrangement',
    langage: '« papiers ! », « on va s’arranger », « c’est pour le café »',
    objectifs: [
      'réussir un arrangement sans se faire prendre',
      'être muté à un carrefour plus rentable',
      'battre l’Agent Bakary',
    ],
    historique: [
      'policier au carrefour du quartier',
      'contrôle le taxi d’Aliou chaque matin',
      'a été pris en flagrant délit par son propre chef deux fois',
    ],
  },
  'MÉCANO ISSA': {
    expressions: [
      'tête dans le moteur',
      'clé à la main et sourire confiant',
      'grimace quand ça fume',
      'regard fier sur la réparation',
    ],
    humeur: 'confiant, rien n’est irréparable',
    langage:
      'jargon de garage approximatif ; « c’est le delco », « ça va rouler », « donne-moi deux minutes »',
    objectifs: ['réparer l’impossible', 'ouvrir un vrai garage', 'que son fils Moussa reprenne le métier'],
    historique: [
      'mécanicien attitré du taxi d’Aliou et du gbaka de Yaya',
      'père de Petit Moussa',
      'a fait rouler un taxi avec un moteur de moto',
    ],
  },
  'SŒUR AWA': {
    expressions: [
      'regard franc par-dessus le masque',
      'sourcils froncés de diagnostic',
      'sourire tendre aux enfants',
      'bras croisés « on ne discute pas »',
    ],
    humeur: 'bienveillante et pressée',
    langage:
      'franchise médicale ; « ouvrez la bouche », « vous avez trop mangé », « on ne négocie pas la santé »',
    objectifs: [
      'soigner tout le quartier',
      'que son fils Ibrahima devienne médecin',
      'que Boubacar suive enfin son régime',
    ],
    historique: [
      'infirmière à la clinique du Docteur Sylla',
      'mère de Petit Ibrahima',
      'a vacciné la moitié des enfants du quartier',
    ],
  },
  TIÉKORO: {
    expressions: [
      'sourire de vendeur',
      'gadget brandi comme un trophée',
      'regard qui fuit quand ça casse',
      'clin d’œil « bon plan »',
    ],
    humeur: 'commerçant enthousiaste, toujours un article à placer',
    langage: 'boniment ; « original ! », « garantie un an », « pour toi, prix spécial »',
    objectifs: [
      'vendre un gadget à chaque passant',
      'ouvrir une boutique au centre commercial',
      'se faire rembourser par Koffi et Modou',
    ],
    historique: [
      'vendeur de gadgets au marché et dans les gbakas',
      'a vendu à Modou un téléphone qui n’a jamais marché',
      'son « garantie un an » dure en général une heure',
    ],
  },
  'PETIT MOUSSA': {
    expressions: [
      'sourire espiègle',
      'regard de complice',
      'air coupable quand on l’attrape',
      'yeux brillants devant le ballon',
    ],
    humeur: 'joueur et partant pour tout',
    langage: 'phrases d’enfant de la rue ; « on fait comment ? », « c’est Mamadou qui a dit », « gnan ! »',
    objectifs: [
      'marquer un but devant le Coach Diabaté',
      'suivre Mamadou dans tous ses plans',
      'conduire le gbaka de Yaya',
    ],
    historique: [
      'fils de Mécano Issa',
      'meilleur ami de Petit Mamadou ; c’est toujours lui qui se fait punir',
      'va au village chez sa grand-mère pendant les vacances',
    ],
  },
  'PETITE AYA': {
    expressions: [
      'bouche grande ouverte de surprise',
      'regard innocent',
      'sourire édenté',
      'main levée « moi je sais ! »',
    ],
    humeur: 'joyeuse et bavarde, elle ne sait pas garder un mot pour elle',
    langage: 'répète ce qu’elle a entendu, mot pour mot, au pire moment ; « Papa a dit que… »',
    objectifs: [
      'tout répéter à tout le monde',
      'avoir la même robe que Khadija',
      'que maman ait un petit frère',
    ],
    historique: [
      'fille cadette de la Future Maman et du Général Zongo',
      'petite sœur de Khadija',
      'a révélé le cadeau surprise de son père trois jours avant',
    ],
  },
  'SORCIÈRE MAMA DÉDÉ': {
    expressions: [
      'regard mystérieux',
      'sourire énigmatique',
      'yeux fermés en transe',
      'moue « c’est ta faute si ça n’a pas marché »',
    ],
    humeur: 'mystérieuse et commerçante',
    langage:
      'formules mystiques et prix ; « les esprits ont parlé », « il faut un poulet blanc », « ça marche si tu y crois »',
    objectifs: [
      'vendre un remède à chaque problème',
      'garder sa réputation malgré les échecs',
      'trouver un remède qui marche vraiment',
    ],
    historique: [
      'vendeuse de remèdes au marché et au village',
      'a vendu à Koffi un parfum « qui attire l’argent »',
      'aucun de ses remèdes n’a jamais marché, chacun avec une excuse',
    ],
  },
  'IMAM KARIM': {
    expressions: [
      'regard calme et bienveillant',
      'sourire patient',
      'sourcils levés devant un mensonge',
      'main levée d’apaisement',
    ],
    humeur: 'serein, profondément bienveillant',
    langage:
      'phrases douces et justes ; « mon fils, la vérité est plus légère », « que la paix soit avec toi » (jamais moqué pour sa foi)',
    objectifs: [
      'garder la paix dans le quartier',
      'réconcilier les familles fâchées',
      'que les enfants aillent à l’école',
    ],
    historique: [
      'sage du quartier respecté de tous',
      'notable aux côtés du Chef Traoré',
      'a réconcilié Maman Nounou et Maman Brigitte après la grande guerre des prix',
    ],
  },
  'MAÎTRE KONÉ': {
    expressions: [
      'regard sévère par-dessus les lunettes',
      'craie levée',
      'sourire de correcteur',
      'soupir devant une faute',
    ],
    humeur: 'pédant mais attaché à ses élèves',
    langage: 'corrige toutes les fautes de tout le monde ; « on ne dit pas… on dit… », « au tableau ! »',
    objectifs: [
      'que sa classe soit la meilleure de la commune',
      'corriger le français du quartier entier',
      'prendre sa retraite avec les honneurs',
    ],
    historique: [
      'instituteur de Petit Mamadou et de Petit Ibrahima',
      'enseigne depuis trente ans dans la même école',
      'a corrigé la lettre d’amour d’un prétendant devant toute la famille',
    ],
  },
  'DOCTEUR SYLLA': {
    expressions: [
      'sourire commercial',
      'calculatrice sortie de la blouse',
      'regard grave de diagnostic',
      'air surpris de « c’est payant »',
    ],
    humeur: 'professionnel, toujours en train de facturer',
    langage:
      'vocabulaire médical et tarifs ; « consultation », « c’est en sus », « on va faire un bilan complet »',
    objectifs: [
      'agrandir sa clinique',
      'que chaque patient paie avant de sortir',
      'guérir Boubacar de sa gourmandise',
    ],
    historique: [
      'médecin de la clinique du quartier',
      'collègue de Sœur Awa',
      'a facturé un jour le sourire d’accueil',
    ],
  },
  FATOU: {
    expressions: [
      'téléphone levé',
      'yeux brillants de scoop',
      'bouche ouverte « en direct »',
      'sourire faussement innocent',
    ],
    humeur: 'excitée, toujours en direct, le pouce sur le bouton',
    langage: 'commentaires de live ; « abonnez-vous ! », « vous voyez ? », « c’est grave hein ! »',
    objectifs: [
      'faire un direct viral',
      'atteindre 100 000 abonnés',
      'que sa fille Aminata la suive (et non l’inverse)',
    ],
    historique: [
      'commère qui filme tout au marché et aux cérémonies',
      'mère d’Aminata, qui a plus d’abonnés qu’elle',
      'a filmé en direct un secret de famille au mariage d’une voisine',
    ],
  },
  ADJOUA: {
    expressions: ['sourire charmeur', 'main tendue « crédit »', 'moue boudeuse', 'regard calculateur'],
    humeur: 'séductrice et pratique, l’œil sur le portefeuille',
    langage: 'français de go ; « mon chéri », « fais-moi crédit », « c’est comment ? »',
    objectifs: [
      'avoir du crédit téléphonique tous les jours',
      'trouver un homme généreux',
      'battre la Go Léopard',
    ],
    historique: [
      'habituée du maquis et du salon de coiffure',
      'concurrente de la Go Léopard',
      'a obtenu du crédit de Djecky quarante fois',
    ],
  },
  'MAMIE BINTOU': {
    expressions: [
      'main devant la bouche en chuchotant fort',
      'yeux qui pétillent',
      'air offusqué',
      'rire de vieille complice',
    ],
    humeur: 'malicieuse, ravie de chaque nouvelle',
    langage: 'chuchote… très fort ; « je ne dis rien mais… », « tout le monde le sait », « eeh Allah ! »',
    objectifs: [
      'être la première à savoir',
      'marier toutes les filles du quartier',
      'garder sa place au salon du samedi',
    ],
    historique: [
      'amie d’enfance de Maman Nounou, voisine d’en face',
      'cliente du samedi de Tata Prisca',
      'a raconté le secret de Baye à tout le marché en le « chuchotant »',
    ],
  },
  ALIOU: {
    expressions: [
      'regard philosophe dans le rétroviseur',
      'sourire tranquille',
      'soupir devant les embouteillages',
      'air vexé au contrôle',
    ],
    humeur: 'philosophe, jamais pressé, même en retard',
    langage: 'philosophie de la route ; « la route, c’est la vie », « on arrive, on arrive », « doucement »',
    objectifs: [
      'arriver à l’heure une fois',
      'payer son taxi',
      'gagner le débat du kiosque contre le Professeur Samba',
    ],
    historique: [
      'taximan depuis vingt ans',
      'contrôlé chaque matin par l’Agent Doumbia',
      'vieux camarade de Tonton Dieng',
    ],
  },
  'CHEF TRAORÉ': {
    expressions: [
      'menton levé solennel',
      'regard sévère de juge',
      'sourire satisfait de son propre discours',
      'surprise outrée',
    ],
    humeur: 'pompeux et fier de sa fonction',
    langage: 'discours solennel pour tout ; « au nom du quartier », « l’assemblée a décidé », « silence ! »',
    objectifs: [
      'que son autorité soit respectée',
      'régler chaque conflit par un discours',
      'être invité à toutes les cérémonies',
    ],
    historique: [
      'chef du quartier depuis quinze ans',
      'notable aux côtés de l’Imam Karim',
      'a convoqué l’assemblée pour un poulet volé',
    ],
  },
  AMINATA: {
    expressions: [
      'selfie en coin',
      'yeux au ciel devant sa mère',
      'sourire d’influenceuse',
      'bouche en O devant une tendance',
    ],
    humeur: 'connectée, ennuyée par les adultes',
    langage:
      'anglicismes et vocabulaire de réseaux ; « c’est trop cringe », « like et abonne-toi », « wesh »',
    objectifs: ['devenir influenceuse célèbre', 'que sa mère arrête de la filmer', 'réussir son bac'],
    historique: [
      'ado de 16 ans, fille de Fatou',
      'a plus d’abonnés que sa mère',
      'a filmé sa propre famille dans une dispute devenue virale',
    ],
  },
  BOUBACAR: {
    expressions: [
      'yeux qui brillent devant le plat',
      'mains frottées',
      'regard triste devant l’assiette vide',
      'bouche pleine coupable',
    ],
    humeur: 'heureux tant qu’il mange',
    langage:
      'tout ramène à la nourriture ; « on mange d’abord », « c’est prêt ? », « juste un petit morceau »',
    objectifs: [
      'manger à toutes les cérémonies',
      'échapper au régime du Docteur Sylla',
      'goûter tous les garbas de la ville',
    ],
    historique: [
      'habitué du maquis et de la cantine de Tantie Awa Sarr',
      'patient du Docteur Sylla, mis au régime cinq fois',
      'a mangé le gâteau d’un mariage avant la mariée',
    ],
  },
  'LE FRIMEUR': {
    expressions: [
      'lunettes de soleil baissées',
      'sourire de star',
      'pose de photo',
      'air vexé quand on ignore son style',
    ],
    humeur: 'satisfait de lui, toujours en train de vérifier son reflet',
    langage: 'nouchi chic ; « c’est le style », « regarde-moi bien », « on est en haut »',
    objectifs: [
      'être le plus stylé de chaque soirée',
      'battre Koffi au concours de frime',
      'devenir ami de DJ Kévin',
    ],
    historique: [
      'frimeur du quartier, toujours en tenue neuve',
      'concurrent de frime de Koffi',
      'a raté un repas pour ne pas froisser sa chemise',
    ],
  },
  'LE PATRIARCHE': {
    expressions: [
      'regard lointain de nostalgie',
      'sourire de sage',
      'sourcils froncés devant la modernité',
      'canne levée',
    ],
    humeur: 'nostalgique et sage, le regard dans le passé',
    langage: '« de notre temps… », proverbes anciens, wolof et français mêlés',
    objectifs: [
      'transmettre les traditions',
      'remettre les notables à leur place',
      'voir la jeunesse respecter les anciens',
    ],
    historique: [
      'doyen du quartier, 80 ans',
      'a connu le quartier quand ce n’était que des champs',
      'le Chef Traoré lui demande conseil en secret',
    ],
  },
  'LA LYCÉENNE': {
    expressions: [
      'sourcil levé de correctrice',
      'sourire en coin',
      'yeux au ciel devant son père',
      'main levée « en fait… »',
    ],
    humeur: 'lucide et un peu blasée',
    langage: 'français précis de bonne élève ; « en fait, papa… », « selon Wikipédia », « c’est faux »',
    objectifs: ['avoir son bac avec mention', 'corriger son père en public', 'étudier à l’étranger'],
    historique: [
      'fille du Professeur Samba',
      'première de son lycée',
      'a corrigé une citation de son père devant tout le quartier',
    ],
  },
  'LA GO LÉOPARD': {
    expressions: [
      'regard de chasseuse',
      'sourire séducteur',
      'grimace quand elle découvre le fauché',
      'pose de mannequin',
    ],
    humeur: 'élégante et stratège, toujours en chasse',
    langage: 'français chic ; « chéri », « tu roules en quoi ? », « on se voit où ? »',
    objectifs: ['épouser un homme riche', 'battre Coumba en élégance', 'séduire le Banquier'],
    historique: [
      'toujours en léopard, des sandales aux lunettes',
      'rivale chic de Coumba',
      'a cru trois fois que Koffi était riche',
    ],
  },
  'LA FUTURE MAMAN': {
    expressions: [
      'main sur le ventre',
      'regard suppliant de l’envie',
      'sourire attendri',
      'colère soudaine d’hormones',
    ],
    humeur: 'changeante, d’une envie à l’autre',
    langage: '« c’est le bébé qui veut », « je veux du… maintenant ! », « tu ne m’aimes plus »',
    objectifs: [
      'que son mari satisfasse ses envies impossibles',
      'accoucher d’un garçon (Aya le veut)',
      'que le chantier soit fini avant le bébé',
    ],
    historique: [
      'épouse du Général Zongo',
      'mère de Khadija et Aya, enceinte du troisième',
      'a envoyé son mari chercher des mangues à minuit',
    ],
  },
  'LE BANQUIER': {
    expressions: [
      'regard froid au-dessus du dossier',
      'tampon « refusé » levé',
      'sourire commercial',
      'panique quand c’est lui qui demande',
    ],
    humeur: 'froid et sûr de lui derrière son bureau',
    langage: 'jargon bancaire ; « dossier incomplet », « garanties », « malheureusement… »',
    objectifs: ['ne jamais accorder un crédit', 'séduire la Go Léopard', 'devenir directeur d’agence'],
    historique: [
      'banquier de l’agence du quartier',
      'a refusé un crédit à Koffi douze fois',
      'patron de l’Agent Gora',
    ],
  },
  'LA VOISINE': {
    expressions: [
      'bouche ouverte qui crie',
      'poings sur les hanches',
      'index pointé',
      'regard furieux vers la fenêtre',
    ],
    humeur: 'excédée en permanence, prête à exploser à la première bouteille aperçue',
    langage:
      'cris et reproches ; « tu as encore bu ! », « regarde-moi ça ! », « tout le quartier va savoir ! »',
    objectifs: ['que son mari arrête de boire', 'que le quartier prenne son parti', 'avoir le dernier mot'],
    historique: [
      'épouse du Tonton',
      'leurs disputes sont le feuilleton de la cour',
      'a jeté les bouteilles du Tonton dans le caniveau trois fois',
    ],
  },
  'LE TONTON': {
    expressions: ['regard vague', 'sourire béat', 'haussement d’épaules', 'bouteille cachée derrière le dos'],
    humeur: 'flegmatique, rien ne l’atteint tant qu’il a sa bouteille',
    langage: 'mauvaise foi tranquille ; « c’est de l’eau minérale », « je n’ai rien bu », « calme-toi »',
    objectifs: ['boire en paix', 'éviter les cris de sa femme', 'que le maquis lui fasse crédit'],
    historique: [
      'mari de la Voisine',
      'habitué du maquis',
      'prétend que ses bouteilles sont des « médicaments »',
    ],
  },
  'MADAME KONAN': {
    expressions: [
      'regard sévère de présidente',
      'cahier serré contre elle',
      'sourire autoritaire',
      'stupeur devant une rébellion',
    ],
    humeur: 'autoritaire et méfiante',
    langage:
      'règlement de tontine ; « l’article 3 dit… », « ton tour est reporté », « l’assemblée décidera »',
    objectifs: [
      'garder la présidence de la tontine',
      'reporter le tour de Maman Nounou',
      'que le règlement soit respecté à la lettre',
    ],
    historique: [
      'présidente de la tontine du marché depuis douze ans',
      'Monsieur Diarra est son trésorier',
      'a reporté le tour de Maman Nounou trois fois',
    ],
  },
  'PATRON SÉRY': {
    expressions: [
      'ardoise brandie',
      'sourire de patron',
      'regard noir vers Koffi',
      'rire franc avec les clients',
    ],
    humeur: 'jovial avec tous sauf avec Koffi',
    langage:
      'patron de maquis ; « c’est sur l’ardoise », « Koffi, d’abord tu paies », « la maison est contente »',
    objectifs: ['se faire rembourser par Koffi', 'avoir le maquis le plus animé', 'garder DJ Kévin'],
    historique: [
      'patron du maquis depuis quinze ans',
      'Tantie Awa Sarr est sa fournisseuse',
      'l’ardoise de Koffi couvre tout un mur',
    ],
  },
  'MADEMOISELLE ROSINE': {
    expressions: [
      'regard par-dessus le guichet',
      'tampon suspendu',
      'sourire administratif',
      'soupir « il manque un papier »',
    ],
    humeur: 'administrative et implacable',
    langage: '« il manque un papier », « revenez demain », « ce n’est pas le bon formulaire »',
    objectifs: [
      'que chaque dossier soit complet',
      'garder son guichet en ordre',
      'une promotion à la mairie centrale',
    ],
    historique: [
      'agent d’état civil à la mairie',
      'le Chef Traoré lui réclame des papiers chaque semaine',
      'a refusé un dossier parce que la photo souriait',
    ],
  },
  'YAYA L’APPRENTI': {
    expressions: [
      'bras tendu par la portière',
      'sourire de rabatteur',
      'regard affolé « pas de monnaie »',
      'cri « on monte ! »',
    ],
    humeur: 'énergique et pressé, la tête déjà au prochain arrêt',
    langage: 'cris de gbaka ; « Adjamé ! Adjamé ! », « on monte, on serre », « pas de monnaie »',
    objectifs: ['remplir le gbaka encore une fois', 'devenir chauffeur', 'avoir enfin la monnaie'],
    historique: [
      'apprenti du gbaka depuis l’âge de 15 ans',
      'Mécano Issa répare son gbaka',
      'concurrent d’Aliou sur la route',
    ],
  },
  'SALIF LE PARISIEN': {
    expressions: [
      'lunettes de soleil à l’intérieur',
      'sourire supérieur',
      'larmes devant le piment',
      'regard paniqué devant ses vraies photos',
    ],
    humeur: 'frimeur fatigué par « ce pays »',
    langage: 'accent parisien forcé ; « à Paris, on… », « c’est pas comme ça là-bas », « wesh »',
    objectifs: [
      'impressionner tout le quartier',
      'cacher qu’il vit dans une chambre de bonne',
      'battre Tonton Dieng en vantardise',
    ],
    historique: [
      'cousin parti à Paris il y a six ans',
      'contrôlé par l’Agent Bakary à chaque retour',
      'a oublié qu’il adorait le piment',
    ],
  },
  'COACH DIABATÉ': {
    expressions: [
      'sifflet à la bouche',
      'cri de supporter',
      'mains sur la tête après un but raté',
      'regard de stratège',
    ],
    humeur: 'survolté, surtout un jour de match',
    langage: 'jargon de foot ; « pressing ! », « on joue en 4-4-2 », « allez les Éléphants ! »',
    objectifs: [
      'gagner le tournoi du quartier',
      'faire de Mamadou et Moussa des champions',
      'voir les Éléphants gagner la CAN',
    ],
    historique: [
      'coach de l’équipe des enfants du quartier',
      'ancien joueur « presque » professionnel',
      'a fait un malaise pendant un tir au but',
    ],
  },
  'DJ KÉVIN': {
    expressions: [
      'casque sur une oreille',
      'micro brandi',
      'sourire de star de soirée',
      'grimace quand la dédicace dérape',
    ],
    humeur: 'festif, il vit en soirée même à midi',
    langage: 'micro de DJ ; « dédicace à… », « on lève les mains ! », « ça c’est pour toi »',
    objectifs: ['animer tous les mariages', 'vendre le plus de dédicaces', 'sortir son propre morceau'],
    historique: [
      'DJ du maquis de Patron Séry',
      'roi des soirées pour le Frimeur',
      'a révélé au micro le prétendant secret d’une mariée',
    ],
  },
  'MAMAN BRIGITTE': {
    expressions: [
      'regard de rivale',
      'sourire commercial',
      'mains sur les hanches',
      'complicité soudaine avec Nounou contre un client',
    ],
    humeur: 'combative au marché, conciliante dès que la vente est faite',
    langage: 'marchandage ; « c’est moins cher chez moi », « ma sœur », « attiéké frais »',
    objectifs: [
      'vendre plus que Maman Nounou',
      'avoir l’étal le mieux placé',
      'devenir membre du bureau de la tontine',
    ],
    historique: [
      'vendeuse d’attiéké, voisine d’étal de Maman Nounou',
      'la « grande guerre des prix » de l’an dernier a fini chez l’Imam Karim',
      's’allie à Nounou dès qu’un client discute',
    ],
  },
};
