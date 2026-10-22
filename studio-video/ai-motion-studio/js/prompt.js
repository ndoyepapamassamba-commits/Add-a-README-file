/* MASSAMBA AI MOTION STUDIO — assistant de consigne (22/10/2026).
 * Règle : l'intention de l'utilisateur n'est JAMAIS modifiée en silence. L'assistant assemble les champs saisis
 * (sujet, action, décor, style, caméra, lumière, ambiance, mouvements, contraintes) dans l'ordre que recommandent les
 * guides Wan 2.2 / LTX (action → caméra → rythme → style), et montre le résultat dans une zone modifiable avant l'envoi.
 * La traduction anglaise (facultative, Pollinations gratuit) est elle aussi affichée avant l'envoi. */
(function (racine) {
  'use strict';
  // préréglages = instructions de style, pas des garanties de résultat
  var PRESETS = {
    'Cinéma réaliste': 'photorealistic cinematic footage, natural skin tones, shallow depth of field, filmic color grading',
    'Animation 3D familiale': 'high quality 3D family animation film style, soft global illumination, expressive characters, appealing shapes',
    'Cartoon africain': 'colorful African cartoon animation style, bold clean outlines, warm saturated colors, West African setting and outfits',
    'Anime': 'Japanese anime style, cel shading, expressive eyes, dynamic framing',
    'Stop-motion': 'stop-motion claymation look, tactile textures, slightly jerky handcrafted motion',
    'Publicité': 'premium commercial look, clean composition, product-friendly lighting, crisp details',
    'Documentaire': 'documentary footage, handheld observational camera, natural available light',
    'Clip musical': 'music video aesthetic, rhythmic motion, bold colored lights, stylish framing',
    'Comédie': 'lighthearted comedy tone, clear readable expressions, bright even lighting, comic timing',
    'Film d’action': 'action movie style, dynamic camera, high energy motion, dramatic contrast',
    'Vidéo sociale verticale': 'vertical 9:16 social video framing, subject centered, punchy and readable at phone size'
  };
  var CAMERAS = {
    'Plan fixe': 'static camera', 'Travelling avant lent': 'slow dolly in', 'Travelling arrière': 'slow dolly out revealing the scene',
    'Travelling latéral': 'smooth lateral tracking shot', 'Panoramique': 'slow pan', 'Orbite légère': 'gentle orbit around the subject',
    'Caméra à l’épaule': 'handheld camera with natural slight shake', 'Grue montante': 'crane shot rising up', 'Contre-plongée': 'low angle shot'
  };

  function propre(s) { return String(s || '').trim().replace(/\s+/g, ' ').replace(/[.;,]+$/, ''); }

  /**
   * assemble une consigne détaillée à partir des champs. Renvoie { texte, parties } ; chaque partie garde son origine
   * (champ de l'utilisateur, préréglage, caméra) pour l'affichage « d'où vient chaque morceau ».
   */
  function structurer(c) {
    c = c || {};
    var parties = [];
    function ajoute(origine, t) { t = propre(t); if (t) parties.push({ origine: origine, texte: t }); }
    var sujetAction = [propre(c.sujet), propre(c.action)].filter(Boolean).join(' ');
    ajoute('sujet + action', sujetAction || c.idee);
    ajoute('mouvements', c.mouvements);
    ajoute('décor', c.decor ? 'Setting: ' + propre(c.decor) : '');
    if (c.camera) ajoute('caméra', CAMERAS[c.camera] || c.camera);
    ajoute('éclairage', c.eclairage ? 'Lighting: ' + propre(c.eclairage) : '');
    ajoute('ambiance', c.ambiance ? 'Mood: ' + propre(c.ambiance) : '');
    if (c.preset && PRESETS[c.preset]) ajoute('préréglage « ' + c.preset + ' »', PRESETS[c.preset]);
    ajoute('contraintes', c.contraintes);
    if (c.continuite) ajoute('fiche de continuité', c.continuite);
    return { texte: parties.map(function (p) { return p.texte; }).join('. ') + (parties.length ? '.' : ''), parties: parties };
  }

  /** traduction anglaise gratuite (Pollinations, sans compte) ; renvoie le texte traduit, montré avant l'envoi. */
  async function traduire(texte, o) {
    o = o || {}; var f = o.fetch || fetch;
    var r = await f('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: o.signal,
      body: JSON.stringify({ model: 'openai-fast', messages: [
        { role: 'system', content: 'Translate the user text into English for a video generation model. Keep every detail and proper noun. Output only the translation.' },
        { role: 'user', content: String(texte).slice(0, 2000) }] }) });
    if (!r.ok) throw new Error('Traduction indisponible (' + r.status + ') : la consigne partira telle quelle.');
    var j = await r.json(); var t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!t) throw new Error('Traduction vide : la consigne partira telle quelle.');
    return String(t).trim();
  }

  /** fiche de continuité d'un personnage → phrase courte injectée dans la consigne (si l'utilisateur le demande). */
  function continuite(p) {
    if (!p) return '';
    var bouts = [p.nom, p.allure || p.description, p.vetements ? 'wearing ' + p.vetements : '', p.signes ? 'distinctive: ' + p.signes : ''].filter(Boolean);
    return 'Keep the same character: ' + bouts.join(', ');
  }

  var API = { PRESETS: PRESETS, CAMERAS: CAMERAS, structurer: structurer, traduire: traduire, continuite: continuite };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.prompt = API; }
})(typeof self !== 'undefined' ? self : this);
