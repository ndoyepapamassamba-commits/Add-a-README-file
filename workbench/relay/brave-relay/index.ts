// Relais BRAVE SEARCH (Supabase Edge Function / Deno) : l'API Brave ne répond pas aux appels d'un navigateur (CORS).
// - Une seule destination : https://api.search.brave.com/res/v1/web/search (pas de proxy ouvert), GET uniquement.
// - La clé Brave de l'utilisateur arrive dans l'en-tête X-Subscription-Token et n'est jamais journalisée ;
//   si le secret BRAVE_API_KEY est défini, il est utilisé quand l'en-tête est absent.
// Déploiement : supabase functions deploy brave-relay --no-verify-jwt
const UPSTREAM = 'https://api.search.brave.com/res/v1/web/search';
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());
const ALLOWED = new Set(['q', 'count', 'country', 'search_lang', 'ui_lang', 'freshness', 'offset', 'safesearch', 'extra_snippets']);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? 'null';
  const allow = ORIGINS.includes('*') ? '*' : ORIGINS.includes(origin) ? origin : ORIGINS[0]!;
  const cors = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'x-subscription-token, content-type, authorization, apikey',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const token = req.headers.get('x-subscription-token') || Deno.env.get('BRAVE_API_KEY') || '';
  if (!token) return json(401, { error: 'clé Brave manquante (en-tête X-Subscription-Token)' });
  const inUrl = new URL(req.url);
  const out = new URL(UPSTREAM);
  for (const [k, v] of inUrl.searchParams) if (ALLOWED.has(k)) out.searchParams.set(k, v.slice(0, 400));
  if (!out.searchParams.get('q')) return json(400, { error: 'paramètre q manquant' });
  try {
    const r = await fetch(out, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': token },
      signal: AbortSignal.timeout(12_000),
    });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json(502, { error: `Brave injoignable : ${(e as Error).name}` });
  }
});
