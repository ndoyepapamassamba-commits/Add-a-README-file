// Signale à IndexNow (Bing, Yandex, Seznam, Naver…) toutes les pages listées dans cv/sitemap.xml, puis celles de
// formation/sitemap.xml (deuxième envoi : IndexNow n'accepte que les URL placées sous le dossier du fichier-clé).
// À lancer seulement après la publication sur gh-pages :  node scripts/indexnow.mjs
// La clé est publique par conception (protocole IndexNow) : elle est servie dans cv/<clé>.txt et formation/<clé>.txt.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HOST = "ndoyepapamassamba-commits.github.io";
export const KEY = "ebb4ea75c352a571bd0b205056c2b276";
export const KEY_LOCATION = `https://${HOST}/Add-a-README-file/cv/${KEY}.txt`;
export const FORMATION_KEY_LOCATION = `https://${HOST}/Add-a-README-file/formation/${KEY}.txt`;
export const ENDPOINT = "https://api.indexnow.org/indexnow";

const SITEMAPS = [
  { file: fileURLToPath(new URL("../cv/sitemap.xml", import.meta.url)), keyLocation: KEY_LOCATION },
  { file: fileURLToPath(new URL("../formation/sitemap.xml", import.meta.url)), keyLocation: FORMATION_KEY_LOCATION },
];

export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** Payload for one sitemap; every URL must sit on HOST, under the folder of `keyLocation`. */
export function buildPayload(xml, keyLocation = KEY_LOCATION) {
  const urlList = sitemapUrls(xml);
  if (urlList.length === 0) throw new Error("Aucune URL trouvée dans le sitemap");
  const folder = keyLocation.slice(0, keyLocation.lastIndexOf("/") + 1);
  for (const url of urlList) {
    if (new URL(url).host !== HOST) throw new Error(`URL hors du site : ${url}`);
    if (!url.startsWith(folder)) throw new Error(`URL hors du dossier de la clé (${folder}) : ${url}`);
  }
  return { host: HOST, key: KEY, keyLocation, urlList };
}

async function main() {
  for (const { file, keyLocation } of SITEMAPS) {
    const payload = buildPayload(readFileSync(file, "utf8"), keyLocation);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    // 200 = reçu, 202 = reçu (clé en cours de vérification), 403 = clé introuvable, 422 = URL refusée, 429 = trop de requêtes.
    console.log(`IndexNow : HTTP ${res.status} ${res.statusText} pour ${payload.urlList.length} URL (${keyLocation})`);
    if (!res.ok) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`IndexNow : échec de l'envoi (${err.message})`);
    process.exitCode = 1;
  });
}
