# 🛍️ Teranga Shop — ta boutique e-commerce (Sénégal)

Boutique en ligne **prête à l'emploi**, pensée pour le marché sénégalais :
**paiement à la livraison (Cash on Delivery)**, **Wave / Orange Money**, commande
confirmée sur **WhatsApp**, livraison moto (« tiak-tiak ») / Yobante / Paps.

Tout tient dans un seul fichier : **`index.html`**. Aucun serveur, aucun abonnement.
Tu l'ouvres, tu le mets en ligne gratuitement, tu vends.

---

## 🚀 Démarrage en 3 minutes

1. **Ouvre `index.html`** (double-clic) pour voir la boutique.
2. **Configure tes infos** : dans `index.html`, cherche le bloc `const CONFIG = {` (vers le milieu du fichier) et remplis :
   - `whatsapp` → **ton numéro WhatsApp** au format international **sans le `+`** (ex : `221771234567`)
   - `deliveryDakar` → tes frais de livraison Dakar
   - `freeShipFrom` → montant pour la livraison gratuite (mets `0` pour désactiver)
   - `waveNumber` / `omNumber` → tes numéros Wave et Orange Money
3. **Mets tes produits** : juste en dessous, dans `const PRODUCTS = [`, modifie/ajoute tes articles.

> ⚠️ **Important** : tant que `whatsapp` contient `XXXX`, les commandes ne t'arriveront pas.
> C'est la **première** chose à changer.

---

## 🛒 Comment une vente se passe (le flux)

1. Le client parcourt la boutique, ajoute au panier, clique **Commander**.
2. Il remplit **nom + téléphone + quartier** et choisit son paiement.
3. Il clique **Confirmer sur WhatsApp** → un message tout prêt s'ouvre **sur TON WhatsApp** avec la commande complète.
4. Tu confirmes, tu organises la livraison, le client **paie à la réception** (ou par Wave/OM avant).

Pas de backend = **tu es la caisse et le suivi**, via WhatsApp. C'est exactement comme ça que
marchent la plupart des boutiques Instagram/TikTok qui gagnent de l'argent au Sénégal aujourd'hui.

---

## 📦 Où trouver les produits (fournisseurs / sourcing)

### Option A — Local (le plus rapide pour démarrer) ✅ recommandé au début
Achète en gros à Dakar, revends avec marge. Zéro délai de douane, tu vois la qualité avant.
- **Marchés de gros** : Sandaga, Marché HLM, Colobane, Petersen — accessoires téléphone, cosmétiques, gadgets.
- **Grossistes importateurs locaux** : beaucoup revendent des produits chinois déjà dédouanés.
- **Avantage** : tu reçois la commande le matin, tu livres le soir. **Idéal pour le Cash on Delivery.**

### Option B — Import Chine (marges plus grosses, à volume)
- **Plateformes** : [Alibaba.com](https://www.alibaba.com) (gros/vérifié), [1688.com](https://www.1688.com) (moins cher, en chinois), Made-in-China.com.
- **Dropshipping** : [CJdropshipping](https://cjdropshipping.com), AliExpress (mais délais 30–60 j = risqué avec le COD, voir plus bas).
- **Transitaires Chine → Dakar** : Sino Shipping, AW Transit, Afrety, Honour Ocean.
  Délai moyen **30–45 jours** (maritime), douane **20 % à 55 %** selon la catégorie.
- **Vérifie ton fournisseur** : note/avis, badge « Verified/Trade Assurance », commande un
  **échantillon** avant, fais un appel vidéo.

### Option C — Fournisseurs africains (délais courts intra-Afrique)
- **Anka (ex-Afrikrea)** : artisans/fournisseurs africains, délais réduits.

> ⚠️ **Le piège du dropshipping pur (AliExpress) au Sénégal** : livrer en 60 jours alors que
> Jumia livre en 48 h fait fuir le client. **Solutions gagnantes** : stock local, pré-commande
> assumée (« exemplaire limité, 10 jours »), ou import par petits lots que tu stockes chez toi.

---

## 🚚 La livraison (logistique)

| Service | Idéal pour | Repère de prix |
|---|---|---|
| **Livreur moto / tiak-tiak** | Dakar, rapide, souple | ~1 500–3 000 FCFA / course |
| **[Yobante Express](https://yobante-express.com)** | Dakar + **régions**, points relais | à partir de ~1 200 FCFA |
| **[Paps](https://papslogistics.com)** | E-commerce, paiement Wave/OM, entrepôt Dakar | sur devis |
| **Yango Delivery / Glovo** | Livraison express Dakar | à la course |
| **Chronopost Sénégal** | Colis plus lourds / régions | sur devis |

**Conseil** : commence avec **un ou deux livreurs moto de confiance** sur Dakar (WhatsApp).
Passe à Yobante/Paps quand tu veux livrer les **régions** (Touba, Thiès, Saint-Louis…).
Beaucoup de livreurs encaissent le **Cash on Delivery** pour toi et te reversent — cadre bien ça dès le départ.

---

## 💰 Fixer tes prix (marges)

Règle simple : **Prix de vente ≈ 2,5 à 3 × ton prix d'achat.**

Exemple : écouteurs achetés **3 000 FCFA** → vendus **8 900 FCFA**.
Sur cette marge (~5 900), tu couvres la livraison, la pub, les retours, et il te reste ton bénéfice.

- Affiche un **ancien prix barré** (déjà géré via le champ `old`) : ça booste les ventes.
- Garde ~15–20 % de marge de sécurité pour les **produits non conformes / retours**.

---

## 🔥 Produits qui marchent au Sénégal (2026)

D'après la recherche marché, les catégories qui **vendent** et qui vont bien avec le Cash on Delivery
(légers, règlent un problème concret) :
- **Accessoires téléphone** : écouteurs, power bank, chargeurs, supports (souvent + rentables que les téléphones).
- **Gadgets maison / cuisine** : plateau chauffant, mixeur portable, lampes/organisateurs.
- **Beauté naturelle** : sérums, huiles capillaires, savons artisanaux, crèmes.
- **Accessoires auto** : rangement de siège, support téléphone, mini-aspirateur.
- **Saisonnier** : pics avant **Tabaski** et **Magal** — prépare des produits adaptés à l'avance.

La boutique est déjà pré-remplie avec des exemples dans ces catégories : remplace-les par tes vrais produits.

---

## 🖼️ Mettre de vraies photos (au lieu des emojis)

Par défaut chaque produit a un `emoji` (image provisoire). Pour une vraie photo :
1. Mets ton image dans un dossier `images/` (ex : `images/ecouteurs.jpg`).
2. Dans le produit, la façon la plus simple est de garder la structure et d'utiliser l'URL de l'image.
   (Si tu veux, demande-moi et je te modifie le code pour afficher de vraies photos — c'est rapide.)

> De bonnes photos = **plus de ventes**. Prends-les toi-même sur fond clair, ou utilise celles du fournisseur.

---

## 🌍 Mettre la boutique en ligne (gratuit)

Choisis **une** option :
- **Netlify Drop** : va sur [app.netlify.com/drop](https://app.netlify.com/drop), glisse le dossier → lien en ligne immédiat.
- **GitHub Pages** : Settings → Pages → branche `main` → `/root`. (Ce dépôt est déjà sur GitHub.)
- **Vercel** : importe le dépôt, déploie en 1 clic.

Ensuite, mets le lien dans ta **bio TikTok / Instagram** et dans tes vidéos. **Ton audience = ton trafic gratuit.**

---

## ✅ Ta checklist de lancement

- [ ] Mettre mon **numéro WhatsApp** dans `CONFIG`
- [ ] Régler mes **frais de livraison** et **numéros Wave/OM**
- [ ] Trouver **3–5 produits** à petit prix chez un grossiste (Dakar pour commencer)
- [ ] Prendre de **vraies photos** des produits
- [ ] Trouver **1 livreur moto** de confiance (WhatsApp)
- [ ] Mettre la boutique **en ligne** (Netlify/GitHub Pages)
- [ ] Poster le lien à mon **audience** et lancer 2–3 vidéos produit

---

## 🔎 Sources de la recherche marché

- E-commerce & drop en Afrique — moyens de paiement : https://www.webandseo.fr/afrique/
- E-commerce au Sénégal (Systalink) : https://systalink.com/e-commerce-au-senegal/
- Vendre en ligne au Sénégal 2026 (Kolonell) : https://kolonell.com/fr/blog/vendre-en-ligne-senegal-guide-ecommerce-2026
- Dropshipping Sénégal — guide (Senagora) : https://senagora.agilepractice.net/dropshipping-au-senegal-en-2025-le-guide-complet-pour-lancer-votre-e-commerce-meme-sans-capital-initial/
- Produits les plus vendus en Afrique (Systalink) : https://systalink.com/produits-les-plus-vendus-en-afrique/
- Yobante Express : https://yobante-express.com
- Paps Logistics : https://papslogistics.com
- Import Chine → Sénégal (AW Transit) : https://awtransit.com/importer-chine-senegal/
- Transitaire Chine-Afrique (Sino Shipping) : https://fr.sino-shipping.com/transport-transitaire-chine-senegal/

---

*Boutique construite pour démarrer vite et sans coût. Quand tu veux ajouter de vraies photos,
plus de produits, un vrai paiement en ligne automatique, ou une page par produit — dis-le-moi, on fait évoluer.*
