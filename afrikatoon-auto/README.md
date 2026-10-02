# Afrikatoon Auto — vidéos TikTok humoristiques automatiques

Programme pour **@comedyvideos_100** : chaque jour, il écrit un sketch original, crée les personnages,
les anime, monte une vidéo de **plus d'une minute** et l'envoie sur TikTok.

```
Claude (scénario 3 actes, 8 scènes)  →  Nano Banana (images, personnages cohérents)
   →  Veo 3 / Grok Imagine / Kling (animation + voix FR)  →  ffmpeg (montage 9:16, sous-titres jaunes)
   →  API officielle TikTok (brouillon ou publication)
```

## Ce que fait chaque étape

| Étape | Outil | Détail |
|---|---|---|
| 1. Histoire | Claude | Tire un conflit × twist pas encore utilisé (mouton de Tabaski, dette, belle-mère…), écrit un sketch en 3 actes : hook → escalade → twist → chute avec gel regard caméra. Légende + hashtags. |
| 2. Personnages | Nano Banana (fal.ai) | Une fiche de référence par personnage (Modou, Baye, Tantie Awa, Petit Mamadou, Coumba, Tonton Dieng), créée une fois et réutilisée → mêmes visages d'une vidéo à l'autre. |
| 3. Animation | Veo 3 (défaut), Grok Imagine ou Kling via fal.ai | Une image → un clip de 8-10 s avec dialogues parlés en français. |
| 4. Montage | ffmpeg | 8 clips assemblés ≈ 64 s, format 1080×1920, sous-titres incrustés. |
| 5. Publication | TikTok Content Posting API | Étiquetée « contenu IA ». |

## Installation (une fois)

```bash
cd afrikatoon-auto
pip install -r requirements.txt     # + ffmpeg installé sur la machine
cp .env.example .env                # puis remplir les clés
```

1. **Clé Claude** : https://console.anthropic.com → `ANTHROPIC_API_KEY`
2. **Clé fal.ai** : https://fal.ai → `FAL_KEY` (un seul compte pour Veo, Grok Imagine, Kling, Nano Banana).
   Vérifiez sur fal.ai/models que les identifiants de modèles de `afrikatoon/config.py` sont toujours à jour.
3. **App TikTok** (c'est ainsi qu'on donne l'accès à son compte, *jamais avec le mot de passe*) :
   - https://developers.tiktok.com → *Manage apps* → créer une app, ajouter les produits
     **Login Kit** et **Content Posting API**, scopes `user.info.basic`, `video.upload`, `video.publish`.
   - Déclarer une *Redirect URI* (https) et la mettre dans `TIKTOK_REDIRECT_URI`.
   - Copier `Client key` / `Client secret` dans `.env`.
   - Lancer `python run.py auth`, ouvrir le lien, cliquer **Autoriser**, coller l'URL de retour.
     Le programme affiche un `TIKTOK_REFRESH_TOKEN` à garder secret.

## Utilisation

```bash
python run.py run --mock --no-upload                  # test gratuit du montage (aucune API)
python run.py scenario                                # juste le scénario + prompts (kit.json)
python run.py run                                     # tout, envoi en brouillon TikTok
python run.py run --idea "le mouton de Tabaski échangé en douce"
python run.py run --kit examples/kit_exemple.json     # animer un kit déjà écrit
python run.py upload output/<dossier> --mode direct   # republier une vidéo montée
```

Chaque vidéo est rangée dans `output/<date>-<titre>/` : `kit.json`, images, clips, `final.mp4`, `caption.txt`.

## Automatique tous les jours (GitHub Actions)

Le fichier `.github/workflows/afrikatoon-daily.yml` lance tout chaque jour à 18h15 GMT.
Dans GitHub → *Settings → Secrets and variables → Actions*, ajouter :
`ANTHROPIC_API_KEY`, `FAL_KEY`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`
(et la variable `VIDEO_PRESET` = `veo3`, `grok` ou `kling` si vous voulez changer).
On peut aussi le lancer à la main (*Actions → Run workflow*) avec une idée imposée.
La vidéo reste téléchargeable 14 jours dans l'onglet *Actions*.

## Brouillon ou publication directe ?

- **`draft` (défaut, recommandé)** : la vidéo arrive dans les notifications/brouillons de l'app TikTok,
  vous la regardez et appuyez sur *Publier* (vous pouvez ajouter un son tendance). 10 secondes par jour.
- **`direct`** : publication 100 % automatique. Tant que votre app TikTok n'a pas passé **l'audit
  TikTok**, les vidéos publiées par API restent **privées** (le programme le signale). Demande d'audit
  depuis le portail développeur.

## Points importants pour la monétisation

- **N'utilisez plus d'images trouvées sur internet** (ex. dessins de presse signés et filigranés) :
  c'est le premier motif de démonétisation et de suppression pour droits d'auteur. Ce programme crée
  des personnages 100 % originaux.
- TikTok exige l'étiquette **contenu généré par IA** : elle est activée automatiquement en mode direct
  (en brouillon, cochez-la dans l'app).
- Creator Rewards demande des vidéos **> 1 minute** et **originales** : chaque sketch est unique,
  l'historique (`state/history.json`) empêche de refaire le même thème.
- Coût indicatif d'une vidéo de 64 s (tarifs fal.ai, octobre 2026 — à revérifier) :
  Grok Imagine 720p ≈ 0,07 $/s → **≈ 4,5 $** · Kling 2.6 Pro avec audio ≈ 0,14 $/s → **≈ 9 $** ·
  Veo 3.1 Fast avec audio ≈ 0,15 $/s → **≈ 10 $**. Images + scénario : quelques centimes en plus.
- Testez d'abord gratuitement avec `--mock` : aperçu animé dessiné avec voix de synthèse, pour valider
  le rythme et les répliques avant de payer l'animation IA.
- Relisez les premières vidéos : l'IA peut rater un visage ou une réplique. Le mode `draft` sert à ça.
