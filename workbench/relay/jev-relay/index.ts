// Relais JEV (Supabase Edge Function / Deno) : contourne le blocage CORS du
// navigateur vers https://api.typesafe.ai/v1/systemone.
// - Aucune clé stockée par défaut : le relais transmet l'en-tête Authorization
//   envoyé par l'application (la clé JEV de l'utilisateur), sans le journaliser.
// - Si le secret TYPESAFE_API_KEY est défini, il remplace l'en-tête absent.
// - Une seule destination possible (pas de proxy ouvert), POST JSON ≤ 200 ko ;
//   ≤ 3 Mo quand l'application envoie une image à l'œil de JEV (Jev 1.14, en-tête
//   TypeSafe-Danger-Zone-Images: true, seul en-tête supplémentaire transmis).
// Déploiement : supabase functions deploy jev-relay --no-verify-jwt
const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? 'null';
  const allow = ORIGINS.includes('*') ? '*' : ORIGINS.includes(origin) ? origin : ORIGINS[0]!;
  const cors = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, content-type, x-client-info, apikey, typesafe-danger-zone-images',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const auth = req.headers.get('authorization') ?? '';
  const secret = Deno.env.get('TYPESAFE_API_KEY');
  const bearer = /^Bearer\s+\S{8,}/i.test(auth) ? auth : secret ? `Bearer ${secret}` : '';
  if (!bearer) return json(401, { error: 'clé JEV manquante (en-tête Authorization: Bearer …)' });
  const images = req.headers.get('typesafe-danger-zone-images') === 'true';
  const limit = images ? 3_000_000 : 200_000;
  const body = await req.text();
  if (body.length > limit)
    return json(413, { error: `requête trop volumineuse (> ${images ? '3 Mo' : '200 ko'})` });
  try {
    JSON.parse(body);
  } catch {
    return json(400, { error: 'JSON invalide' });
  }
  try {
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: bearer,
        ...(images ? { 'TypeSafe-Danger-Zone-Images': 'true' } : {}),
      },
      body,
      signal: AbortSignal.timeout(images ? 25_000 : 15_000),
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return json(502, { error: `TypeSafe injoignable : ${(e as Error).name}` });
  }
});
