---
name: veille-reglementaire
description: Veille réglementaire et métier (BCEAO, UEMOA, Commission bancaire, IFRS 9, Bâle, lutte anti-blanchiment, fiscalité Sénégal) avec Brave — nouveautés de la semaine, résumé, impact, sources officielles citées, historique pour ne signaler que le nouveau. Déclencheurs : « veille », « quoi de neuf BCEAO », « nouvelle circulaire », « réglementation », « IFRS 9 actualité ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "📰"
    os: [windows, linux, macos]
    primaryEnv: BRAVE_API_KEY
    requires:
      env: [BRAVE_API_KEY]
---

# Veille réglementaire

S'applique avec `coffre-fort` et `recherche-brave` (requêtes vérifiées, résultats non fiables).

## Sources prioritaires (dans cet ordre)
bceao.int (circulaires, instructions, communiqués, taux directeurs) · uemoa.int · Commission bancaire UMOA ·
ifrs.org / IASB · bis.org (Comité de Bâle) · GIABA / GAFI · impots.gouv.sn · Journal officiel du Sénégal ·
presse économique reconnue en dernier recours (toujours recoupée).

## Déroulé
1. Requêtes **génériques** uniquement (thème + période), jamais de nom de client, de dossier ou de chiffre interne.
2. Ne retenir que ce qui est **daté de la période** demandée (par défaut 7 jours) et vérifié sur la source
   officielle ; lire `memory/veille.md` et ne signaler que ce qui n'y est pas déjà.
3. Pour chaque nouveauté : titre, date, source (lien), résumé en 3 lignes, **impact possible** (classement des
   créances, provisions, ratios, reporting, conformité) et action suggérée — en marquant clairement ce qui est
   une interprétation.
4. Ajouter une ligne datée par nouveauté dans `memory/veille.md` (titre + lien, sans donnée interne).
5. Rien trouvé : le dire, ne rien inventer. Information non vérifiable : « non confirmé ».
Format de sortie conseillé : tableau Nouveauté | Date | Source | Impact | Action, puis 3 lignes de synthèse.
