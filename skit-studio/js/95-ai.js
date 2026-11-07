/* =====================================================================
   Skit Studio — 95-ai.js
   Génération de scripts par LLM : Pollinations texte (gratuit, sans clé,
   1 requête / 30 s par IP), Pollinations avec clé, ou toute API compatible
   OpenAI (OpenRouter, Groq, Mistral, serveur local…). Sortie JSON stricte.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Script = NS.Script;

  const AI = {};
  AI.PROVIDERS = [
    { id: 'pollinations', label: 'Pollinations texte (gratuit, sans clé)' },
    { id: 'pollinations-key', label: 'Pollinations avec clé (GPT, Gemini, DeepSeek…)' },
    { id: 'openai', label: 'API compatible OpenAI (OpenRouter, Groq, Mistral, local…)' }
  ];

  AI.SYSTEM = `Tu es un auteur de sketches comiques très courts pour TikTok/Reels, en français familier (public francophone d'Afrique de l'Ouest, humour satirique sur la famille, le couple, l'argent, le travail, le marché, l'école). Chaque sketch = 1 question/affirmation (A) + 1 punchline cynique et inattendue (B), 12 mots maximum par réplique, sans vulgarité, sans insulte sur l'origine/religion. Mets entre astérisques le ou les 1 à 3 mots-clés à surligner dans chaque réplique (ex : "Tu as oublié notre *anniversaire* !"). Réponds UNIQUEMENT avec un JSON valide, sans texte autour.`;

  AI.schema = (n) => `{"sketches":[{"title":"TITRE COURT EN MAJUSCULES","emoji":"un emoji","scene":"salon|chambre|cuisine|marche|bureau|rue|ecole|boutique","lines":[{"speaker":"A","text":"...","emotion":"angry|happy|sad|shocked|smug|confused|neutral","emoji":"un emoji"},{"speaker":"B","text":"...","emotion":"...","emoji":"..."}]}]} — exactement ${n} sketches.`;

  function extractJSON(text) {
    let s = String(text || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return JSON.parse(s);
  }

  AI.chat = async function (settings, messages, opts) {
    const S = settings.llm || {}; const provider = S.provider || 'pollinations';
    let url, headers = { 'Content-Type': 'application/json' }, model;
    if (provider === 'pollinations') { url = 'https://text.pollinations.ai/openai'; model = S.model || 'openai'; }
    else if (provider === 'pollinations-key') { url = 'https://gen.pollinations.ai/v1/chat/completions'; model = S.model || 'openai/gpt-5.4-nano'; headers.Authorization = 'Bearer ' + ((settings.pollinations || {}).apiKey || ''); }
    else { url = (S.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '') + '/chat/completions'; model = S.model || 'openai/gpt-4o-mini'; headers.Authorization = 'Bearer ' + (S.apiKey || ''); }
    const body = { model, messages, temperature: opts && opts.temperature != null ? opts.temperature : 0.9 };
    if (provider !== 'pollinations') body.response_format = { type: 'json_object' };
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts && opts.signal });
    if (!r.ok) { const txt = await r.text(); throw new Error('LLM ' + r.status + ' : ' + txt.slice(0, 220)); }
    const j = await r.json();
    const content = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : (typeof j === 'string' ? j : '');
    return content;
  };

  /** Génère n sketches ; opts { theme:'...', count:n, signal } */
  AI.generateSketches = async function (settings, opts) {
    const n = Math.max(1, Math.min(20, opts.count || 5));
    const user = `Thème : ${opts.theme || 'disputes de couple, famille, belle-mère, argent, marché, bureau'}. Personnages : A = ${opts.nameA || 'Awa'} (femme), B = ${opts.nameB || 'Moussa'} (homme). Génère ${n} sketches variés, titres différents. Format : ${AI.schema(n)}`;
    const content = await AI.chat(settings, [{ role: 'system', content: AI.SYSTEM }, { role: 'user', content: user }], opts);
    const obj = extractJSON(content);
    const sketches = Array.isArray(obj) ? obj : obj.sketches;
    if (!Array.isArray(sketches) || !sketches.length) throw new Error('Le modèle n\'a pas renvoyé de sketches');
    return Script.normalizeProject({ sketches }).sketches;
  };

  NS.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
