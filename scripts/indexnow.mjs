// Signale à IndexNow (Bing, Yandex, Seznam, Naver…) toutes les pages listées dans cv/sitemap.xml.
// À lancer seulement après la publication sur gh-pages :  node scripts/indexnow.mjs
// La clé est publique par conception (protocole IndexNow) : elle est servie dans cv/<clé>.txt.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HOST = "ndoyepapamassamba-commits.github.io";
export const KEY = "ebb4ea75c352a571bd0b205056c2b276";
export const KEY_LOCATION = `https://${HOST}/Add-a-README-file/cv/${KEY}.txt`;
export const ENDPOINT = "https://api.indexnow.org/indexnow";

const SITEMAP = fileURLToPath(new URL("../cv/sitemap.xml", import.meta.url));

export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

export function buildPayload(xml) {
  const urlList = sitemapUrls(xml);
  if (urlList.length === 0) throw new Error("Aucune URL trouvée dans cv/sitemap.xml");
  for (const url of urlList) {
    if (new URL(url).host !== HOST) throw new Error(`URL hors du site : ${url}`);
  }
  return { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };
}

async function main() {
  const payload = buildPayload(readFileSync(SITEMAP, "utf8"));
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  // 200 = reçu, 202 = reçu (clé en cours de vérification), 403 = clé introuvable, 422 = URL refusée, 429 = trop de requêtes.
  console.log(`IndexNow : HTTP ${res.status} ${res.statusText} pour ${payload.urlList.length} URL`);
  if (!res.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`IndexNow : échec de l'envoi (${err.message})`);
    process.exitCode = 1;
  });
}
