"""Bible des personnages et décors Afrikatoon (descriptions recopiées verbatim dans les prompts)."""

STYLE = (
    "3D animated cartoon, Pixar/DreamWorks style, African characters, exaggerated comedic "
    "facial expressions, vibrant saturated colors, warm sunlight, 9:16 vertical, high detail"
)

CHARACTERS = {
    "MODOU": {
        "role": "le débrouillard malchanceux, toujours victime puis vengé (ou pas)",
        "visual": "MODOU: thin African man in his 40s, short hair, faded green t-shirt and brown "
                  "trousers, plastic sandals, expressive tired eyes",
        "voice": "plaintif, indigné, punchlines de désespoir comique",
    },
    "BAYE": {
        "role": "Baye Ndiaye, le riche radin de mauvaise foi, jure qu'il n'a rien alors qu'il a tout",
        "visual": "BAYE: plump African man in his 50s, immaculate shiny royal-blue boubou with gold "
                  "embroidery, prayer beads, smug innocent face",
        "voice": "théâtral, serments exagérés (« Walay ! »), trahi par les détails",
    },
    "TANTIE AWA": {
        "role": "la belle-mère / voisine redoutable, toujours au courant de tout",
        "visual": "TANTIE AWA: large African woman in her 50s, colorful orange-and-yellow wax dress "
                  "with matching headwrap, hands on hips, piercing judgmental stare",
        "voice": "reproches en rafale, comparaisons humiliantes (« le fils de Fatou, LUI... »)",
    },
    "PETIT MAMADOU": {
        "role": "l'enfant plus malin que les adultes, twist ambulant",
        "visual": "PETIT MAMADOU: small African boy around 8 years old, oversized yellow football "
                  "jersey, big curious eyes, cheeky smile",
        "voice": "une seule réplique, à la chute, qui détruit tout le monde",
    },
    "COUMBA": {
        "role": "la fiancée / épouse stratège, révélatrice de mensonges",
        "visual": "COUMBA: young African woman in her late 20s, elegant pink-and-purple wax dress, "
                  "braided hair, raised eyebrow, unimpressed expression",
        "voice": "calme glacial, questions pièges",
    },
    "TONTON DIENG": {
        "role": "le vantard mythomane, démasqué en direct",
        "visual": "TONTON DIENG: middle-aged African man, open floral shirt over white vest, flat cap, "
                  "gold-tone watch, exaggerated storytelling gestures",
        "voice": "superlatifs (« moi-même personnellement »), effondrement final",
    },
    "MAITRE KONE": {
        "role": "l'instituteur ivoirien ultra-sévère, qui corrige la grammaire de tout le monde même en pleine dispute",
        "visual": "MAITRE KONE: lean Ivorian schoolteacher in his 50s, brown suit too big for him, thick round glasses, "
                  "piece of chalk in hand, strict raised finger",
        "voice": "pédant, articule chaque syllabe, « on ne dit pas... on dit... »",
    },
    "DOCTEUR SYLLA": {
        "role": "le médecin de quartier qui diagnostique tout de travers et facture tout",
        "visual": "DOCTEUR SYLLA: round West African doctor in his 40s, white coat over colorful shirt, stethoscope, "
                  "small glasses on the tip of his nose, clipboard",
        "voice": "solennel, jargon médical inventé, « c'est grave… c'est 25 000 francs »",
    },
    "FATOU": {
        "role": "la voisine commère, filme tout, sait tout avant tout le monde",
        "visual": "FATOU: West African woman in her 40s, green wax wrapper and huge matching headscarf, smartphone always "
                  "raised to film, gossiping hand over mouth",
        "voice": "chuchote fort, « je ne dis rien hein… mais… », rires étouffés",
    },
    "ADJOUA": {
        "role": "la go ivoirienne exigeante, tout se mesure en cadeaux et en crédit téléphonique",
        "visual": "ADJOUA: glamorous young Ivorian woman, long blonde wig, tight red dress, very long nails, big gold "
                  "hoop earrings, unimpressed pout",
        "voice": "nouchi d'Abidjan, « Chéri, tu es gâté hein ! », ton faussement doux puis tranchant",
    },
    "KOFFI": {
        "role": "le faux riche fauché qui « fait le boss » avec de l'argent qu'il n'a pas",
        "visual": "KOFFI: skinny young Ivorian man, oversized shiny gold shirt, dark sunglasses, fake gold chain, "
                  "flashy sneakers, cocky pose",
        "voice": "frime en nouchi, « on est ensemble », « c'est moi le boss », panique quand on parle d'argent",
    },
    "GRAND-PERE NDIAYE": {
        "role": "le vieux sage dur d'oreille qui comprend tout de travers, mais dit la phrase la plus juste",
        "visual": "GRAND-PERE NDIAYE: very old Senegalese man, white boubou, white knitted cap, long white beard, "
                  "wooden walking cane, hand cupped behind his ear",
        "voice": "lent, « Hein ? Quoi ? », proverbes wolof détournés",
    },
    "MAMIE BINTOU": {
        "role": "la grand-mère qui a tout vu, tout su, et qui balance tout au pire moment",
        "visual": "MAMIE BINTOU: tiny elderly West African woman, purple wax wrapper and headwrap, big round glasses, "
                  "walking stick, mischievous grin",
        "voice": "petite voix tranchante, « De mon temps… », chute assassine",
    },
    "ALIOU": {
        "role": "le taximan philosophe qui transforme chaque course en débat et chaque débat en facture",
        "visual": "ALIOU: West African taxi driver in his 30s, yellow short-sleeve shirt, black cap worn backwards, "
                  "car keys spinning on his finger, toothpick in mouth",
        "voice": "débit rapide, « Ça c'est la vie, grand frère », négocie tout",
    },
    "CHEF TRAORE": {
        "role": "le chef de quartier pompeux qui convoque des réunions pour des problèmes ridicules",
        "visual": "CHEF TRAORE: imposing West African chief in his 60s, burgundy grand boubou, tall embroidered hat, "
                  "carved ceremonial fly-whisk, puffed-up chest",
        "voice": "théâtral et solennel, « Le quartier a parlé ! », tranche toujours en sa faveur",
    },
    "AMINATA": {
        "role": "l'ado influenceuse qui filme tout pour TikTok, même les drames familiaux",
        "visual": "AMINATA: teenage West African girl, pink braids in a high bun, oversized hoodie, smartphone on a "
                  "selfie stick, ring light glow",
        "voice": "« Abonnez-vous ! », commente en direct, langage de jeune",
    },
    "BOUBACAR": {
        "role": "le gourmand qui transforme chaque problème en occasion de manger",
        "visual": "BOUBACAR: very round cheerful West African man, striped blue t-shirt stretched over his belly, "
                  "napkin tucked in his collar, always holding food",
        "voice": "bouche pleine, « On en parle après le repas », rires gras",
    },
    "MAMAN NOUNOU": {
        "role": "la commerçante du marché, reine du marchandage, imbattable en mauvaise foi",
        "visual": "MAMAN NOUNOU: strong West African market woman, blue-and-white wax dress, fanny pack full of cash, "
                  "basket of tomatoes on her head, hands on hips",
        "voice": "crie les prix, « Pour toi c'est cadeau… 5 000 », négociation sans fin",
    },
    "GENERAL ZONGO": {
        "role": "l'entrepreneur toujours « en chantier », promet des immeubles et n'a jamais fini un mur",
        "visual": "GENERAL ZONGO: cheerful West African building contractor, yellow hard hat, orange safety vest over denim shirt, rolled blueprints under arm, phone glued to his ear",
        "voice": "promesses énormes au téléphone, « c'est presque fini ! »",
    },
    "TATA PRISCA": {
        "role": "la coiffeuse qui sait tout sur tout le monde, son salon est la radio du quartier",
        "visual": "TATA PRISCA: curvy glamorous Ivorian hairdresser, big afro with pink headband, pink apron full of combs and scissors, hairdryer in hand, knowing smile",
        "voice": "« Ma chérie, assieds-toi, je vais te raconter… », potins en rafale",
    },
    "AGENT DOUMBIA": {
        "role": "le policier qui veut toujours « arranger » la situation, débordé par plus malin que lui",
        "visual": "AGENT DOUMBIA: stout West African police officer, light blue uniform and navy cap, notepad and pen, suspicious squinting eyes",
        "voice": "« Papiers ! … On peut s'arranger », autorité qui s'effondre",
    },
    "MECANO ISSA": {
        "role": "le mécanicien qui répare tout avec n'importe quoi, et facture « la pièce qui vient de Dubaï »",
        "visual": "MECANO ISSA: lanky West African mechanic, grease-stained blue overalls, cap backwards, big wrench, oil smudge on cheek, confident grin",
        "voice": "diagnostics farfelus, « ça c'est le moteur qui est fatigué »",
    },
    "SOEUR AWA": {
        "role": "l'infirmière au grand cœur mais brutalement directe, qui dit tout haut ce que le docteur cache",
        "visual": "SOEUR AWA: West African nurse in her 30s, white-and-pink nurse uniform, stethoscope, braided bun, clipboard, eyebrow raised",
        "voice": "calme, cash, « Monsieur, vous n'êtes pas malade, vous êtes paresseux »",
    },
    "TIEKORO": {
        "role": "le vendeur de gadgets, roi des bons plans foireux et des lives TikTok",
        "visual": "TIEKORO: energetic young West African street vendor, red backwards cap, headphones around neck, camera on strap, phone on selfie stick, huge grin",
        "voice": "« Promo ! Promo ! », pitch commercial non-stop",
    },
    "PETIT MOUSSA": {
        "role": "l'enfant malin et espiègle, toujours un coup d'avance sur les adultes",
        "visual": "PETIT MOUSSA: small West African schoolboy around 7, white school shirt, navy shorts, backpack, running with fist raised, mischievous grin",
        "voice": "répliques courtes et assassines",
    },
    "PETITE AYA": {
        "role": "l'enfant curieuse qui pose trop de questions, toujours la mauvaise au mauvais moment",
        "visual": "PETITE AYA: little West African girl around 6, two puffy afro buns with pink bows, pink flowered dress, purple backpack, teddy bear, innocent big eyes",
        "voice": "« Pourquoi ? », questions innocentes qui font tout exploser",
    },
    "MAMA DEDE": {
        "role": "la vendeuse de remèdes miracles qui a une potion pour tout, même pour retrouver un ex",
        "visual": "MAMA DEDE: plump West African herbal-remedy seller, colorful headwrap, layers of bead necklaces, bundle of green leaves and a gourd, bottles on her stall, sly wink",
        "voice": "« Ça, ça soigne tout : palu, jalousie et dettes »",
    },
    "IMAM KARIM": {
        "role": "le sage respecté du quartier, qui remet calmement tout le monde sur le droit chemin (jamais tourné en ridicule)",
        "visual": "IMAM KARIM: calm West African man in his 40s, white embroidered kufi cap, cream boubou with patterned stole, short beard, gentle wise smile, raised finger",
        "voice": "calme, bienveillant, une phrase juste qui clôt le débat",
    },
}

# Descriptions de voix pour ElevenLabs Voice Design (voix inédites, libres de droits)
VOICE_DESIGNS = {
    "MODOU": "Thin West African man in his 40s from Abidjan, Ivory Coast, speaking French with a strong Ivorian "
             "accent, slightly nasal, whiny and outraged comedic tone, fast talker, expressive and dramatic.",
    "BAYE": "Plump Senegalese man in his 50s, deep warm bass voice, French with a strong Wolof/Senegalese accent, "
            "slow theatrical delivery, smug and falsely innocent, loves swearing oaths, comedic.",
    "TANTIE AWA": "Loud West African woman in her 50s, French with a strong Ivorian accent, powerful bossy voice, "
                  "sharp rapid-fire scolding, sarcastic, market-woman energy, comedic.",
    "PETIT MAMADOU": "Cheeky 8-year-old West African boy, high bright voice, French with a light Senegalese accent, "
                     "innocent and mischievous, speaks clearly and proudly.",
    "COUMBA": "Young West African woman in her late 20s, French with a Senegalese accent, calm cold and elegant, "
              "slow ironic delivery, unimpressed, sharp.",
    "TONTON DIENG": "Middle-aged West African man, French with a strong Ivorian accent, loud boastful storyteller, "
                    "big laugh, exaggerated superlatives, energetic, comedic.",
    "MAITRE KONE": "Strict Ivorian schoolteacher in his 50s, French with Ivorian accent, over-articulated pedantic delivery, nasal, comedic.",
    "DOCTEUR SYLLA": "West African doctor in his 40s, French with Senegalese accent, solemn slow voice, fake-serious, comedic.",
    "FATOU": "West African woman in her 40s, French with Senegalese accent, loud whispering gossip voice, giggles, comedic.",
    "ADJOUA": "Young Ivorian woman, French with strong Abidjan nouchi accent, sweet then sharp, sassy, comedic.",
    "KOFFI": "Young Ivorian man, French with strong Abidjan nouchi accent, cocky show-off voice that cracks when panicking.",
    "GRAND-PERE NDIAYE": "Very old Senegalese man, French with Wolof accent, slow shaky voice, hard of hearing, wise and funny.",
    "MAMIE BINTOU": "Tiny elderly West African woman, French with Senegalese accent, thin sharp voice, mischievous.",
    "ALIOU": "West African taxi driver in his 30s, French with Senegalese accent, fast streetwise talker, philosophical, comedic.",
    "CHEF TRAORE": "West African chief in his 60s, French with Malian/Ivorian accent, booming solemn theatrical voice.",
    "AMINATA": "Teenage West African girl, French with light Ivorian accent, bubbly influencer voice, fast and excited.",
    "BOUBACAR": "Very round cheerful West African man, French with Senegalese accent, deep jolly voice, talks with mouth full.",
    "MAMAN NOUNOU": "Strong West African market woman, French with Ivorian accent, loud hawker voice, unstoppable bargainer.",
    "GENERAL ZONGO": "Cheerful West African contractor, French with Burkinabe/Ivorian accent, loud enthusiastic salesman voice, always on the phone.",
    "TATA PRISCA": "Glamorous Ivorian hairdresser, French with strong Abidjan accent, gossiping sing-song voice, dramatic gasps.",
    "AGENT DOUMBIA": "Stout West African police officer, French with Malian/Ivorian accent, deep official voice that turns sheepish.",
    "MECANO ISSA": "Lanky West African mechanic, French with Senegalese accent, laid-back confident voice, technical nonsense.",
    "SOEUR AWA": "West African nurse in her 30s, French with Ivorian accent, calm warm voice, blunt and dry.",
    "TIEKORO": "Energetic young West African vendor, French with Malian accent, fast hype salesman voice, shouting promos.",
    "PETIT MOUSSA": "Mischievous 7-year-old West African boy, French with Senegalese accent, high cheeky voice.",
    "PETITE AYA": "Innocent 6-year-old West African girl, French with Ivorian accent, tiny sweet voice, asks questions.",
    "MAMA DEDE": "Plump West African remedy seller, French with Beninese/Ivorian accent, mysterious theatrical voice, sly laughs.",
    "IMAM KARIM": "Calm West African man in his 40s, French with Senegalese accent, gentle warm wise voice, measured pace.",
}

SETTINGS = {
    "cour": "sandy courtyard with ochre mud-brick walls, laundry line, plastic chairs, Senegal",
    "salon": "modest African living room, patterned sofa, old TV, family photos on teal wall",
    "plage": "tropical West African beach, palm trees, colorful wooden fishing boats",
    "marche": "busy colorful African street market, fabric stalls, fruit baskets, umbrellas",
    "village": "village with thatched-roof huts, baobab tree, dusty red road",
    "ceremonie": "festive African wedding courtyard, decorated tent, plastic chairs in rows, "
                 "large cooking pots",
    "hopital": "small West African neighborhood clinic, pale green walls, hospital bed, medicine cabinet",
    "ecole": "West African primary school classroom, green blackboard with chalk writing, wooden desks",
    "maquis": "lively Ivorian maquis open-air restaurant at night, plastic tables, string lights, grill smoke",
    "taxi": "busy West African street with a yellow taxi parked at the curb, colorful shop signs",
    "salon_coiffure": "colorful African hair salon, mirrors, hair dryers, wig mannequins, posters of hairstyles",
}

CONFLICTS = [
    "L'argent prêté jamais rendu",
    "La belle-mère qui inspecte la cuisine / le ménage",
    "La cérémonie (mariage, baptême) qui dérape sur une question d'argent ou de places assises",
    "Le vantard démasqué en public",
    "Le voisin trop curieux / qui emprunte tout",
    "Le fiancé radin découvert le jour des fiançailles",
    "L'enfant qui répète devant tout le monde ce que les parents disent en privé",
    "Le faux malade qui guérit miraculeusement (match de foot, plat préféré)",
    "Le propriétaire vs le locataire en retard de loyer",
    "Le retour du « boss » du village qui vivait en ville (mytho)",
    "La tontine : celle qui a pris l'argent et disparaît",
    "Le mouton de Tabaski : trop maigre, trop cher, ou échangé en douce",
    "Le faux riche qui invite tout le monde au maquis et disparaît à l'addition",
    "La go qui réclame du crédit téléphonique à trois copains en même temps",
    "Le diagnostic absurde du docteur de quartier (et sa facture encore plus absurde)",
    "L'élève qui invente l'excuse du siècle pour ses devoirs pas faits",
    "Le taximan qui fait payer chaque virage, chaque silence et chaque soupir",
    "La réunion du chef de quartier pour un problème ridicule (une poule, un pot de fleurs)",
    "La commère qui filme tout et se fait filmer à son tour",
    "La grand-mère qui révèle le vrai âge de quelqu'un devant sa nouvelle conquête",
    "Le marchandage au marché qui finit avec le client qui paie plus cher qu'au début",
    "Le gourmand qui ruine un plan (régime, mariage, réunion) pour un plat",
    "L'ado influenceuse qui met en ligne le drame familial en direct",
    "Le vieux dur d'oreille qui comprend tout de travers pendant une demande en mariage",
    "La coupure de courant qui révèle qui fait quoi dans le noir",
    "Le mari qui « travaille tard » mais est vu au maquis",
    "La dot négociée comme un match de foot",
    "Le cousin du village qui découvre la ville (ascenseur, climatiseur, fast-food)",
    "Le premier rendez-vous où chacun ment sur sa situation",
    "Le WhatsApp familial : le message envoyé dans le mauvais groupe",
]

TWISTS = [
    "L'objet qui trahit (téléphone luxe, climatiseur, mouton gras, reçu qui tombe de la poche)",
    "Le témoin inattendu (PETIT MAMADOU voit tout et le dit)",
    "L'inversion de statut (le « pauvre » est le vrai propriétaire)",
    "L'arroseur arrosé (le piège se retourne)",
    "La révélation en direct (appel téléphonique entendu par tous)",
    "Le malentendu de langue (un mot wolof/nouchi compris de travers change tout)",
    "Le live TikTok : tout le quartier a déjà tout vu en direct",
    "La photo de profil / le statut WhatsApp qui trahit",
    "Le plus vieux (grand-père, mamie) qui était au courant depuis le début",
    "Le complice qui change de camp au pire moment",
    "La boucle : la dernière réplique répète la première, mais retournée",
]

# Procédés comiques à combiner (au moins 3 par vidéo)
COMIC_DEVICES = [
    "règle de trois (deux répliques normales, la troisième absurde)",
    "callback (un détail du début revient exploser à la chute)",
    "mauvaise foi totale face à une preuve évidente",
    "ironie dramatique (le public sait, le personnage non)",
    "exagération qui monte d'un cran à chaque réplique",
    "quiproquo / malentendu de langue",
    "regard caméra gêné juste après un mensonge",
    "inversion de statut (le petit commande le grand)",
    "réponse littérale à une question figurée",
    "le sérieux absolu sur un sujet ridicule",
]

EMOTIONS = [
    "jaw dropped to the floor in cartoon shock", "eyes bulging out", "furious finger pointing",
    "smug innocent shrug, palms open", "arms crossed, unimpressed raised eyebrow",
    "hands on head in despair", "laughing so hard leaning backwards",
    "sweating nervously, forced smile", "piercing judgmental side-eye",
]

BASE_HASHTAGS = ["#drole", "#comedy", "#humourafricain", "#pourtoi"]
