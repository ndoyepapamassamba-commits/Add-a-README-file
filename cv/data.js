// Form reference data. Keys mirror the enums in supabase/functions/api/lib/types.ts;
// quality labels mirror QUALITIES in lib/generator/banks.ts.
window.TCV_DATA = {
  sectors: [
    { key: "commerce", label: "Commerce, vente", skills: ["Accueil client", "Techniques de vente", "Encaissement", "Gestion des stocks", "Mise en rayon", "Prospection", "Négociation", "Fidélisation client"] },
    { key: "comptabilite", label: "Comptabilité, finance", skills: ["Saisie comptable", "SYSCOHADA", "Rapprochement bancaire", "Facturation", "Déclarations fiscales", "Paie", "Suivi de trésorerie", "Gestion de caisse"] },
    { key: "informatique", label: "Informatique, numérique", skills: ["Maintenance informatique", "Réseaux", "Développement web", "Support utilisateurs", "Bases de données", "Installation de logiciels", "Sécurité informatique", "Gestion de parc"] },
    { key: "sante", label: "Santé, social", skills: ["Soins de base", "Accueil des patients", "Hygiène et asepsie", "Suivi des dossiers patients", "Prise de constantes", "Écoute", "Gestion des urgences", "Éducation à la santé"] },
    { key: "enseignement", label: "Enseignement, formation", skills: ["Préparation de cours", "Gestion de classe", "Pédagogie", "Évaluation des élèves", "Soutien scolaire", "Animation de groupe", "Suivi individuel", "Communication avec les parents"] },
    { key: "administration", label: "Administration, secrétariat", skills: ["Accueil physique et téléphonique", "Rédaction de courriers", "Classement et archivage", "Gestion d'agenda", "Saisie de documents", "Organisation de réunions", "Gestion du courrier", "Tenue de dossiers"] },
    { key: "btp", label: "BTP, construction", skills: ["Lecture de plans", "Maçonnerie", "Métré", "Suivi de chantier", "Électricité bâtiment", "Plomberie", "Règles de sécurité", "Coffrage"] },
    { key: "hotellerie", label: "Hôtellerie, restauration", skills: ["Accueil des clients", "Service en salle", "Réservations", "Cuisine", "Hygiène alimentaire", "Room service", "Tenue de caisse", "Gestion des réclamations"] },
    { key: "logistique", label: "Transport, logistique", skills: ["Réception des marchandises", "Gestion des stocks", "Préparation de commandes", "Inventaire", "Conduite de véhicule", "Planification des livraisons", "Suivi des expéditions", "Chargement et déchargement"] },
    { key: "communication", label: "Communication, marketing", skills: ["Réseaux sociaux", "Rédaction web", "Création de visuels", "Organisation d'événements", "Relations presse", "Marketing digital", "Prise de parole", "Photographie"] },
    { key: "agriculture", label: "Agriculture, élevage", skills: ["Techniques culturales", "Irrigation", "Élevage", "Conduite de tracteur", "Gestion d'exploitation", "Transformation de produits", "Pépinière", "Vente de produits agricoles"] },
    { key: "securite", label: "Sécurité, gardiennage", skills: ["Surveillance de site", "Contrôle d'accès", "Rondes", "Premiers secours", "Rédaction de rapports", "Prévention incendie", "Vidéosurveillance", "Gestion des conflits"] },
    { key: "autre", label: "Autre secteur", skills: ["Travail en équipe", "Organisation", "Service client", "Rédaction", "Polyvalence", "Gestion du temps"] }
  ],
  levels: [
    { key: "debutant", label: "Débutant (moins d'1 an)" },
    { key: "junior", label: "Junior (1 à 3 ans)" },
    { key: "confirme", label: "Confirmé (3 à 7 ans)" },
    { key: "senior", label: "Senior (plus de 7 ans)" }
  ],
  kinds: [
    { key: "emploi", label: "Emploi" },
    { key: "stage", label: "Stage" },
    { key: "alternance", label: "Alternance" }
  ],
  qualities: [
    "Rigueur",
    "Sens de l'organisation",
    "Esprit d'équipe",
    "Ponctualité",
    "Sens du contact",
    "Autonomie",
    "Capacité d'adaptation",
    "Dynamisme",
    "Honnêteté",
    "Discrétion",
    "Créativité",
    "Résistance au stress"
  ],
  itSkills: ["Word", "Excel", "PowerPoint", "Internet", "Messagerie (Gmail, Outlook)", "Canva", "Google Docs", "WhatsApp Business", "Sage", "Photoshop"],
  languageLevels: ["Langue maternelle", "Courant", "Bon niveau", "Intermédiaire", "Notions"],
  interests: ["Lecture", "Football", "Bénévolat", "Musique", "Sport", "Voyages", "Cuisine", "Informatique", "Vie associative", "Basket-ball"],
  cities: ["Dakar", "Pikine", "Guédiawaye", "Rufisque", "Keur Massar", "Thiès", "Mbour", "Saint-Louis", "Kaolack", "Touba", "Ziguinchor", "Diourbel", "Louga", "Tambacounda", "Kolda", "Fatick", "Kaffrine", "Matam", "Sédhiou", "Kédougou"],
  sources: ["Emploi Dakar", "Senjob", "LinkedIn", "Facebook", "votre site internet"],
  // Pack Stage. Values are sent as typed (internship.studyLevel is free text, ≤ 40); "Autre" asks for a precision.
  studyLevels: ["BTS", "DUT/ISEP", "Licence 1", "Licence 2", "Licence 3", "Licence pro", "Master 1", "Master 2", "Autre"],
  // Keys mirror InternshipType; `label` completes "Stage …" and the letter subject "Demande de stage …".
  internshipTypes: [
    { key: "academique", label: "académique", hint: "Pendant l'année, demandé par votre école" },
    { key: "fin_etudes", label: "de fin d'études", hint: "Pour valider votre diplôme (rapport, mémoire)" },
    { key: "vacances", label: "de vacances", hint: "Pendant les vacances scolaires ou universitaires" },
    { key: "perfectionnement", label: "de perfectionnement", hint: "Après le diplôme, pour gagner en pratique" }
  ],
  // Keys mirror SendChannel.
  channels: [
    { key: "email", label: "E-mail" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "depot", label: "Dépôt en main propre" }
  ]
};
