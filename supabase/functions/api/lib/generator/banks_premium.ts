// CV Premium phrase banks: the generic "approach" quote used when the customer typed none, and the aim
// sentence that may close a one-sentence pitch. Quotes are written in the first person and state a way of
// working, never a fact: no employer, no figure, no diploma, no title, no achievement, no sector.
// Never put a digit or a proper noun here.
import type { Level } from "../types.ts";
import type { Variant } from "./banks.ts";
import { enTantQue } from "./text.ts";

/**
 * The job sought, closing a one-sentence pitch of an experienced candidate (kind "emploi", level confirmé or
 * senior). Names only the target role typed by the customer; claims nothing about the past.
 */
export const PREMIUM_AIM: Variant[] = [
  (c) => `Je souhaite aujourd'hui mettre cette expérience au service d'une organisation exigeante ${enTantQue(c.role)}`,
  (c) => `Je souhaite désormais mettre mon expertise au service d'une structure ambitieuse ${enTantQue(c.role)}`,
  (c) => `Mon prochain défi : un ${c.posteNoun} au sein d'une organisation qui place la qualité au cœur de son action`,
  (c) => `J'aspire à mettre mon savoir-faire au service d'une organisation ambitieuse ${enTantQue(c.role)}`,
  (c) =>
    `Je suis ${c.g("prêt", "prête")} à relever un nouveau défi ${enTantQue(c.role)} au sein d'une structure exigeante`,
];

/** At least six first-person approach sentences per experience level. */
export const PREMIUM_QUOTES: Record<Level, string[]> = {
  debutant: [
    "J'aborde chaque mission avec sérieux, curiosité et l'envie d'apprendre vite.",
    "Je crois que la rigueur et l'écoute font la différence dès les premiers pas.",
    "Mon approche : observer, comprendre, puis agir avec méthode.",
    "Je m'engage à donner le meilleur de moi-même sur chaque tâche qui m'est confiée.",
    "Apprendre chaque jour et rendre un travail soigné : c'est ainsi que je conçois mon métier.",
    "Je préfère les résultats concrets aux grands discours, dès la première mission.",
  ],
  junior: [
    "Je conçois mon métier comme un apprentissage permanent au service de résultats concrets.",
    "Mon approche : comprendre les attentes, organiser mon travail et tenir les délais.",
    "Je m'attache à livrer un travail fiable, que l'on peut utiliser sans avoir à le reprendre.",
    "J'aime les défis qui me font progresser et les équipes qui partagent leur savoir.",
    "Rigueur, écoute et sens des responsabilités guident chacune de mes missions.",
    "Pour moi, un travail bien fait commence par une bonne compréhension du besoin.",
  ],
  confirme: [
    "Je m'attache à livrer un travail fiable, documenté et utile à ceux qui s'en servent.",
    "Mon approche : comprendre le besoin réel, proposer une solution simple et la mener à son terme.",
    "Je crois aux résultats mesurables, obtenus avec méthode et partagés avec l'équipe.",
    "Pour moi, l'expérience ne vaut que si elle se transmet et améliore la façon de travailler.",
    "J'aborde chaque dossier avec rigueur, sans jamais perdre de vue l'objectif commun.",
    "Je considère la fiabilité et le respect des engagements comme la base de toute collaboration.",
  ],
  senior: [
    "Mon approche : comprendre le terrain, fixer un cap clair et tenir les engagements pris.",
    "Je m'attache à laisser chaque dossier et chaque processus en meilleur état que je ne les ai trouvés.",
    "Je crois aux décisions éclairées par les faits, prises avec méthode et assumées jusqu'au bout.",
    "Pour moi, l'expérience se mesure à la qualité des résultats et à ce que l'on transmet.",
    "J'avance avec méthode : écouter, analyser, décider, puis rendre compte.",
    "Je considère la rigueur, l'intégrité et la transmission comme les piliers d'un parcours durable.",
  ],
};

/** Labels of the optional personal lines ("Âge : 41 ans", "Situation : Marié, deux enfants"). */
export const PERSONAL_LABELS = { age: "Âge", situation: "Situation" } as const;
