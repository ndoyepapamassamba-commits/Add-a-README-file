# 🛍️ Teranga Shop — ta boutique e-commerce (Sénégal)

Boutique en ligne **prête à l'emploi**, pensée pour le marché sénégalais :
**paiement à la livraison (Cash on Delivery)**, **Wave / Orange Money**, commande
confirmée sur **WhatsApp**, livraison moto (« tiak-tiak ») / Yobante / Paps.

Aucun serveur, aucun abonnement. Tu ouvres, tu mets en ligne gratuitement, tu vends.

### 📂 Les fichiers
| Fichier | Rôle |
|---|---|
| **`index.html`** | La boutique : catalogue, panier, commande, **aperçu rapide** d'un produit. |
| **`produit.html`** | La **page détaillée** d'un produit (`produit.html?id=p1`) — parfaite pour **envoyer un lien précis** à un client. |
| **`images/`** | Les photos produits (`p1.jpg` … `p15.jpg`). Voir `images/README.md`. |
| **`FOURNISSEURS.md`** | 📇 Répertoire de **grossistes & fournisseurs** (local Dakar + import). |
| **`README.md`** | Ce guide. |
| **`telecommande-tv/`** | 📺 Appli Android **télécommande TV universelle** (ELACTRON & autres) + lampe torche — voir [`telecommande-tv/README.md`](telecommande-tv/README.md). |

> Le panier est **partagé** entre les pages (il se souvient de tes articles d'une page à l'autre).

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
> C'est la **première** chose à changer. Mets le **même numéro** dans le `CONFIG` de
> **`index.html`** ET de **`produit.html`**.

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

## 💵 Tes produits, tes marges (à sourcer)

La boutique est déjà remplie avec **15 produits réels et accessibles** au Sénégal. Voici,
pour chacun, un **prix d'achat indicatif** (à confirmer avec ton grossiste), le **prix de vente**
déjà réglé dans le site, et **ta marge brute**. Ajuste librement dans `PRODUCTS` (champs `buy` / `price` / `old`).

| Produit | Achat ~ | Vente | Marge brute | Où sourcer / photo |
|---|--:|--:|--:|---|
| Écouteurs Bluetooth TWS | 2 500 | 7 900 | **+5 400** | Sandaga/HLM · AliExpress · Jumia (réf. prix) |
| Power Bank 10 000 mAh | 5 000 | 12 900 | **+7 900** | Grossiste Dakar · Nova/Soumari (réf.) |
| Chargeur rapide 20W + câble | 2 000 | 5 900 | **+3 900** | Sandaga · AliExpress |
| Câble USB-C tressé (lot 2) | 900 | 2 900 | **+2 000** | Gros marché · 1688 (lot) |
| Montre connectée sport | 5 500 | 14 900 | **+9 400** | AliExpress/Alibaba · grossiste |
| Ring light + trépied 📸 | 3 500 | 9 900 | **+6 400** | AliExpress · idéal pour tes fans créateurs |
| Perche selfie / trépied BT | 3 000 | 8 900 | **+5 900** | AliExpress · Sandaga |
| Micro-cravate téléphone | 2 500 | 7 900 | **+5 400** | AliExpress · niche créateurs |
| Blender portable | 4 500 | 11 900 | **+7 400** | Alibaba (lot) · grossiste Dakar |
| Lampe LED rechargeable | 2 500 | 6 900 | **+4 400** | Marché HLM · AliExpress |
| Balance de cuisine | 2 800 | 6 900 | **+4 100** | Grossiste · AliExpress |
| Support téléphone voiture | 1 500 | 4 900 | **+3 400** | Sandaga · AliExpress |
| Aspirateur voiture portatif | 6 000 | 14 900 | **+8 900** | Alibaba · grossiste auto |
| Huile capillaire fortifiante | 2 000 | 6 900 | **+4 900** | Fournisseur cosmétique local · Anka |
| Rouleau de massage visage | 1 500 | 5 500 | **+4 000** | AliExpress · beauté |

> ⚠️ Ces prix d'achat sont des **repères** : confirme-les avec ton grossiste (ils varient selon la quantité).
> Ta **marge nette** = marge brute − livraison (~1 500) − une réserve retours (~10–15 %).
> Astuce : **les accessoires créateurs** (ring light, micro, trépied) parlent direct à ton audience TikTok.

## 🖼️ Mettre les vraies photos (2 minutes)

Le système de photos est **déjà câblé**. Il te reste juste à déposer les images :
1. Récupère la photo de chaque produit (chez le fournisseur, ou prends-la toi-même sur fond clair).
2. Renomme-la **`p1.jpg`, `p2.jpg` … `p15.jpg`** (la correspondance exacte est dans **`images/README.md`**).
3. Mets-la dans le dossier **`images/`**. Elle s'affiche **automatiquement**.

> Tant qu'une photo manque, le produit montre un repli propre (icône + couleur) — **rien ne casse**.
> Une bonne photo carrée sur fond clair peut **doubler** tes ventes.

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
