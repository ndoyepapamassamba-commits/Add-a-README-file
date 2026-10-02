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
}

SETTINGS = {
    "cour": "sandy courtyard with ochre mud-brick walls, laundry line, plastic chairs, Senegal",
    "salon": "modest African living room, patterned sofa, old TV, family photos on teal wall",
    "plage": "tropical West African beach, palm trees, colorful wooden fishing boats",
    "marche": "busy colorful African street market, fabric stalls, fruit baskets, umbrellas",
    "village": "village with thatched-roof huts, baobab tree, dusty red road",
    "ceremonie": "festive African wedding courtyard, decorated tent, plastic chairs in rows, "
                 "large cooking pots",
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
]

TWISTS = [
    "L'objet qui trahit (téléphone luxe, climatiseur, mouton gras, reçu qui tombe de la poche)",
    "Le témoin inattendu (PETIT MAMADOU voit tout et le dit)",
    "L'inversion de statut (le « pauvre » est le vrai propriétaire)",
    "L'arroseur arrosé (le piège se retourne)",
    "La révélation en direct (appel téléphonique entendu par tous)",
]

EMOTIONS = [
    "jaw dropped to the floor in cartoon shock", "eyes bulging out", "furious finger pointing",
    "smug innocent shrug, palms open", "arms crossed, unimpressed raised eyebrow",
    "hands on head in despair", "laughing so hard leaning backwards",
    "sweating nervously, forced smile", "piercing judgmental side-eye",
]

BASE_HASHTAGS = ["#drole", "#comedy", "#humourafricain", "#pourtoi"]
