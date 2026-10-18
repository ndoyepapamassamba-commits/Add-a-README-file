// L'œil de JEV en ligne de commande : juge une image (rendu du bac à sable, image générée, aperçu d'export) contre une
// demande. Usage : npx tsx outils/eye-check.ts <image.png|jpg> "<demande>" [élément1|élément2…]
// Appel direct à TypeSafe (la clé vient de JEV_API_KEY ou du proxy du conteneur ; elle n'est jamais affichée).
import { readFileSync } from 'node:fs';
import { callEye, eyeBody, eyeProblems, fidelityQuestions, readEye } from '@workbench/server/jev/eye';
import { promptItems } from '../coeur/realize/realize';

// JEV coupé dans le studio (18/10/2026, consigne de l'utilisateur : « arrête les appels vers JEV, ça coûte beaucoup ») :
// cet outil ne l'appelle que si JEV_AUTORISE=1 est posé explicitement pour la commande.
if (process.env.JEV_AUTORISE !== '1') throw new Error('JEV coupé dans le studio : poser JEV_AUTORISE=1 pour cet appel ponctuel');
const [file, prompt = '', list] = process.argv.slice(2);
if (!file) throw new Error('usage : eye-check <image> "<demande>" [élément1|élément2]');
const { items, circumstances } = promptItems(prompt);
const elements = list ? list.split('|').map((name) => ({ name })) : items.map((i) => ({ name: i.text }));
const format = /\.png$/i.test(file) ? 'png' : 'jpg';
const r = await callEye(
  { endpoint: process.env.JEV_ENDPOINT ?? 'https://api.typesafe.ai/v1/systemone', timeoutMs: 20_000 },
  process.env.JEV_API_KEY ?? null,
  eyeBody(
    readFileSync(file).toString('base64'),
    format,
    fidelityQuestions(elements, circumstances, { boxes: true }),
  ),
  (u, i) => fetch(u, i) as never,
);
const v = readEye(r.raw as never, elements, circumstances);
console.log(JSON.stringify({ ms: r.ms, ...v, problems: eyeProblems(v) }, null, 1));
