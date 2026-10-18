// French text helpers: elision, contractions, capitalisation, dates, bullets, sentence assembly.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import {
  a,
  auSeinDe,
  capitalize,
  chez,
  cleanBullet,
  cleanFreeText,
  de,
  elide,
  enTantQue,
  frenchDate,
  genderOf,
  inSentence,
  joinList,
  joinSentences,
  splitMissions,
  startsWithVowelSound,
  tidy,
  titleCaseName,
  upperName,
  withArticle,
} from "../lib/generator/text.ts";

Deno.test("text elision before vowels and mute h, not before aspirated h", () => {
  assertEquals(de("assistant"), "d'assistant");
  assertEquals(de("hôtesse"), "d'hôtesse");
  assertEquals(de("hôtellerie"), "d'hôtellerie");
  assertEquals(de("hygiène"), "d'hygiène");
  assertEquals(de("Hôpital Principal"), "d'Hôpital Principal");
  assertEquals(de("haut niveau"), "de haut niveau");
  assertEquals(de("héros"), "de héros");
  assertEquals(de("hiérarchie"), "de hiérarchie");
  assertEquals(de("hall"), "de hall");
  assertEquals(de("comptable"), "de comptable");
  assertEquals(de("Orange"), "d'Orange");
  assertEquals(de("Ousmane"), "d'Ousmane");
  assertEquals(de("Yves"), "d'Yves");
  assertEquals(de("Yacine"), "de Yacine");
  assertEquals(de("Électricien"), "d'Électricien");
  assertEquals(elide("le", "hôpital"), "l'hôpital");
  assertEquals(elide("le", "héros"), "le héros");
  assertEquals(elide("la", "équipe"), "l'équipe");
  assertEquals(elide("que", "il"), "qu'il");
  assertEquals(elide("que", "elle"), "qu'elle");
  assertEquals(elide("je", "ai"), "j'ai");
  assertEquals(elide("je", "souhaite"), "je souhaite");
  assertEquals(enTantQue("électricien"), "en tant qu'électricien");
  assertEquals(enTantQue("comptable"), "en tant que comptable");
  assertEquals(startsWithVowelSound("  Aïssatou"), true);
  assertEquals(startsWithVowelSound(""), false);
  assertEquals(startsWithVowelSound("2024"), false);
});

Deno.test("text contractions with articles: du, des, au, aux, de la, de l'", () => {
  assertEquals(de("le commerce"), "du commerce");
  assertEquals(de("Le Groupe Sonatel"), "du Groupe Sonatel");
  assertEquals(de("les ventes"), "des ventes");
  assertEquals(de("Les Ciments du Sahel"), "des Ciments du Sahel");
  assertEquals(de("la Sonatel"), "de la Sonatel");
  assertEquals(de("La Poste"), "de La Poste");
  assertEquals(de("l'Hôpital Principal"), "de l'Hôpital Principal");
  assertEquals(de("L'Oréal"), "de l'Oréal");
  assertEquals(a("le commerce"), "au commerce");
  assertEquals(a("les clients"), "aux clients");
  assertEquals(a("la Sonatel"), "à la Sonatel");
  assertEquals(a("l'ISM"), "à l'ISM");
  assertEquals(a("Dakar"), "à Dakar");
  assertEquals(auSeinDe("Orange"), "au sein d'Orange");
  assertEquals(auSeinDe("Le Groupe Sonatel"), "au sein du Groupe Sonatel");
  assertEquals(auSeinDe("Auchan"), "au sein d'Auchan");
  assertEquals(auSeinDe("Kirène"), "au sein de Kirène");
  assertEquals(chez("Orange"), "chez Orange");
  assertEquals(chez(" Auchan Sénégal "), "chez Auchan Sénégal");
  // Institutions known by an acronym starting with a vowel take "l'"; brands do not.
  assertEquals(withArticle("ISRA"), "l'ISRA");
  assertEquals(auSeinDe(withArticle("IPRES")), "au sein de l'IPRES");
  assertEquals(a(withArticle("UCAD")), "à l'UCAD");
  assertEquals(withArticle("IBM"), "IBM");
  assertEquals(withArticle("SODAGRI"), "SODAGRI");
});

Deno.test("text gender helper", () => {
  assertEquals(genderOf("M")("motivé", "motivée"), "motivé");
  assertEquals(genderOf("Mme")("motivé", "motivée"), "motivée");
  assertEquals(genderOf("Mme")("prêt", "prête"), "prête");
});

Deno.test("text names: Title-Case first names, UPPERCASE last names", () => {
  assertEquals(titleCaseName("mame diarra"), "Mame Diarra");
  assertEquals(titleCaseName("MAME DIARRA"), "Mame Diarra");
  assertEquals(titleCaseName("abdou-karim"), "Abdou-Karim");
  assertEquals(titleCaseName("ndèye  fatou"), "Ndèye Fatou");
  assertEquals(titleCaseName("el hadji"), "El Hadji");
  assertEquals(titleCaseName("aïssatou"), "Aïssatou");
  assertEquals(titleCaseName("n'deye"), "N'Deye");
  assertEquals(upperName("Ndiaye"), "NDIAYE");
  assertEquals(upperName("sène"), "SÈNE");
  assertEquals(upperName("n'diaye"), "N'DIAYE");
});

Deno.test("text in-sentence casing keeps acronyms, brands and place names", () => {
  assertEquals(inSentence("Assistante comptable"), "assistante comptable");
  assertEquals(inSentence("Assistant De Direction"), "assistant de direction");
  assertEquals(inSentence("Développeur Web"), "développeur web");
  assertEquals(inSentence("BTS en Comptabilité"), "BTS en comptabilité");
  assertEquals(inSentence("Licence En Gestion Des Entreprises"), "licence en gestion des entreprises");
  assertEquals(inSentence("Diplôme d'État d'infirmier"), "diplôme d'État d'infirmier");
  assertEquals(inSentence("Baccalauréat série G"), "baccalauréat série G");
  assertEquals(inSentence("Livraison des commandes à Dakar et Thiès"), "livraison des commandes à Dakar et Thiès");
  assertEquals(inSentence("Respect du Code de la route"), "respect du Code de la route");
  assertEquals(inSentence("Excel"), "Excel");
  assertEquals(inSentence("PowerPoint"), "PowerPoint");
  assertEquals(inSentence("SYSCOHADA"), "SYSCOHADA");
  assertEquals(inSentence("CAISSIÈRE PRINCIPALE"), "caissière principale");
  assertEquals(inSentence("Chargé RH"), "chargé RH");
  assertEquals(inSentence("Chauffeur-Livreur"), "chauffeur-livreur");
  // Text typed in capitals: function words are never left shouting ("secretaire DE direction").
  assertEquals(inSentence("SECRETAIRE DE DIRECTION"), "secretaire de direction");
  assertEquals(inSentence("GESTION DE L'AGENDA DU DIRECTEUR"), "gestion de l'agenda du directeur");
  // A brand typed alone keeps its capital ("compétences en Cisco").
  assertEquals(inSentence("Cisco"), "Cisco");
  assertEquals(inSentence("Power BI"), "Power BI");
});

Deno.test("text French dates", () => {
  assertEquals(frenchDate(new Date("2026-10-01T00:00:00Z")), "1er octobre 2026");
  assertEquals(frenchDate(new Date("2026-10-18T23:59:59Z")), "18 octobre 2026");
  assertEquals(frenchDate(new Date("2027-02-02T12:00:00Z")), "2 février 2027");
  assertEquals(frenchDate(new Date("2026-08-15T12:00:00Z")), "15 août 2026");
  assertEquals(frenchDate(new Date("2026-12-31T12:00:00Z")), "31 décembre 2026");
});

Deno.test("text bullets: markers stripped, capitalised, no trailing period", () => {
  assertEquals(cleanBullet("- saisie des factures."), "Saisie des factures");
  assertEquals(cleanBullet("  *   accueil  des clients ; "), "Accueil des clients");
  assertEquals(cleanBullet("• Rondes de nuit..."), "Rondes de nuit");
  assertEquals(cleanBullet("1) Préparation des cours"), "Préparation des cours");
  assertEquals(cleanBullet("– Gestion de la caisse (espèces et Wave)"), "Gestion de la caisse (espèces et Wave)");
  assertEquals(cleanBullet("2 ans de suivi client"), "2 ans de suivi client");
  assertEquals(
    splitMissions("- Saisie des factures\n- Rapprochements bancaires.;• Déclarations\n\n -  \n*Inventaire"),
    ["Saisie des factures", "Rapprochements bancaires", "Déclarations", "Inventaire"],
  );
  assertEquals(splitMissions(undefined), []);
  assertEquals(splitMissions("  \n - \n"), []);
  assertEquals(splitMissions("a\nb\nc\nd\ne\nf\ng\nh").length, 6);
});

Deno.test("text sentence joining and typography", () => {
  assertEquals(
    joinSentences([
      "je suis motivée ",
      null,
      "",
      "Mon objectif : apprendre.",
      false,
      "j'ai  le sens du contact , et du service",
    ]),
    "Je suis motivée. Mon objectif : apprendre. J'ai le sens du contact, et du service.",
  );
  assertEquals(joinList([]), "");
  assertEquals(joinList(["Word"]), "Word");
  assertEquals(joinList(["Word", "Excel"]), "Word et Excel");
  assertEquals(joinList(["Word", "Excel", "Canva"]), "Word, Excel et Canva");
  // Never two "et" in a row: the last link becomes "ainsi que" (elided before a vowel).
  assertEquals(
    joinList(["diagnostic des pannes", "vidange et entretien", "réparation des freins"]),
    "diagnostic des pannes, vidange et entretien, ainsi que réparation des freins",
  );
  assertEquals(
    joinList(["collecte et saisie", "animation du réseau"]),
    "collecte et saisie ainsi qu'animation du réseau",
  );
  assertEquals(
    joinList(["hygiène et asepsie", "soins de base", "prise de constantes"]),
    "hygiène et asepsie, soins de base et prise de constantes",
    "an 'et' far from the last link is unambiguous",
  );
  assertEquals(joinList(["a", "b et c"], "ou"), "a ou b et c");
  assertEquals(tidy("Bonjour ( ) , le monde ."), "Bonjour, le monde.");
  assertEquals(tidy("Fin.. Vraiment ?."), "Fin. Vraiment ?");
  assertEquals(tidy("A,B"), "A, B");
  assertEquals(tidy("1,5 point"), "1,5 point");
  assertEquals(tidy("( espèces )"), "(espèces)");
  assertEquals(tidy('il a dit "bonjour'), "il a dit bonjour");
  assertEquals(cleanFreeText("  votre entreprise\n est une référence "), "Votre entreprise est une référence.");
  assertEquals(cleanFreeText("J'adore ce métier !"), "J'adore ce métier !");
  assertEquals(cleanFreeText(" \n "), "");
  assertEquals(capitalize("élan"), "Élan");
});
