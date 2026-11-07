/* =====================================================================
   Skit Studio — 10-script.js
   Modèle de projet, normalisation, import (JSON / CSV / texte brut),
   export, et générateur hors ligne de sketches par gabarits.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core || (typeof require !== 'undefined' ? require('./00-core.js') : null);

  const Script = {};

  Script.EMOTIONS = ['neutral', 'happy', 'angry', 'shocked', 'sad', 'smug', 'confused'];
  Script.SCENES = ['salon', 'chambre', 'cuisine', 'marche', 'bureau', 'rue', 'ecole', 'boutique'];
  Script.SHOTS = ['wide', 'close'];

  Script.EMOJI_BY_EMOTION = {
    neutral: '🙂', happy: '😂', angry: '🔥', shocked: '😱', sad: '😢', smug: '😏', confused: '🤔'
  };

  Script.THEMES = [
    { id: 'violet', bg: '#2b1b4f', bg2: '#4a2a8a', accent: '#ffd23f', text: '#ffffff' },
    { id: 'nuit', bg: '#0f172a', bg2: '#1e3a8a', accent: '#38bdf8', text: '#ffffff' },
    { id: 'rouge', bg: '#3b0d0d', bg2: '#7f1d1d', accent: '#fbbf24', text: '#ffffff' },
    { id: 'vert', bg: '#052e16', bg2: '#166534', accent: '#a3e635', text: '#ffffff' },
    { id: 'rose', bg: '#3f0a2e', bg2: '#9d174d', accent: '#fde047', text: '#ffffff' },
    { id: 'orange', bg: '#431407', bg2: '#9a3412', accent: '#fef08a', text: '#ffffff' }
  ];

  /** Projet par défaut complet (toutes les clés que les modules lisent). */
  Script.defaultProject = function () {
    return {
      id: Core.uid('prj'),
      title: 'Compilation de sketches',
      lang: 'fr',
      fps: 30,
      width: 1080,
      height: 1920,
      theme: Object.assign({ font: 'Montserrat' }, Script.THEMES[0]),
      characters: [
        { id: 'A', name: 'Awa', color: '#ffd23f', voice: { provider: 'piper', voiceId: 'fr_FR-siwis-medium', rate: 1, pitch: 1 },
          look: 'a 30 year old Senegalese woman, dark black skin, big expressive eyes, high bun hairstyle, gold hoop earrings, colorful wax-print dress',
          avatar: { skin: '#6b3a1e', hair: '#1a0d08', outfit: '#e11d48', style: 'f' } },
        { id: 'B', name: 'Moussa', color: '#38bdf8', voice: { provider: 'piper', voiceId: 'fr_FR-tom-medium', rate: 1, pitch: 1 },
          look: 'a 35 year old Senegalese man, dark black skin, big expressive eyes, short hair, thin beard, khaki t-shirt',
          avatar: { skin: '#4a2511', hair: '#0a0604', outfit: '#2563eb', style: 'm' } }
      ],
      sketches: [],
      visual: { style: 'afro3d', provider: 'openrouter', seed: 11, cropWatermark: true, parallax: true, depthAI: false, strength: 1, fallbackSketch: true, extra: '' },
      layout: {
        hookFirst: true,
        titleCards: true,
        reactionCards: true,
        titlePrefix: 'SKETCH',
        outro: { enabled: true, line1: 'LA SUITE DEMAIN', line2: 'ABONNE-TOI', emoji: '🎉' },
        watermark: ''
      },
      subtitles: { mode: 'phrase', size: 64, highlight: 'auto', uppercase: true, position: 0.78, speakerColors: true, emojiBadge: true },
      audio: { music: { volume: 0.25, duck: 0.5, url: '' }, sfx: { enabled: true, volume: 0.6 }, laughOnPunchline: true, laughUrl: '' },
      timing: { reaction: 3.2, title: 2.0, minLine: 2.0, closeMin: 2.2, pad: 0.5, outro: 2.0 },
      seed: 1
    };
  };

  /** Normalise un objet projet partiel → projet complet et cohérent. */
  Script.normalizeProject = function (input) {
    const base = Script.defaultProject();
    const p = Object.assign({}, base, input || {});
    p.theme = Object.assign({}, base.theme, (input && input.theme) || {});
    p.layout = Object.assign({}, base.layout, (input && input.layout) || {});
    p.layout.outro = Object.assign({}, base.layout.outro, (input && input.layout && input.layout.outro) || {});
    p.subtitles = Object.assign({}, base.subtitles, (input && input.subtitles) || {});
    p.audio = Object.assign({}, base.audio, (input && input.audio) || {});
    p.audio.music = Object.assign({}, base.audio.music, (input && input.audio && input.audio.music) || {});
    p.audio.sfx = Object.assign({}, base.audio.sfx, (input && input.audio && input.audio.sfx) || {});
    p.timing = Object.assign({}, base.timing, (input && input.timing) || {});
    p.visual = Object.assign({}, base.visual, (input && input.visual) || {});
    p.fps = Core.clamp(Number(p.fps) || 30, 12, 60);
    p.width = Number(p.width) || 1080;
    p.height = Number(p.height) || 1920;

    // Personnages
    const chars = Array.isArray(p.characters) && p.characters.length ? p.characters : base.characters;
    p.characters = chars.map((c, i) => {
      const d = base.characters[i % base.characters.length];
      const out = Object.assign({}, d, c);
      out.id = String(out.id || String.fromCharCode(65 + i));
      out.voice = Object.assign({}, d.voice, c.voice || {});
      out.avatar = Object.assign({}, d.avatar, c.avatar || {});
      out.look = String(out.look || d.look || '');
      return out;
    });
    const ids = new Set(p.characters.map(c => c.id));

    // Sketches
    p.sketches = (Array.isArray(p.sketches) ? p.sketches : []).map((s, si) => {
      const sk = {
        id: s.id || Core.uid('sk'),
        title: String(s.title || `SKETCH ${si + 1}`).trim(),
        emoji: s.emoji || '🤣',
        scene: Script.SCENES.includes(s.scene) ? s.scene : Script.SCENES[si % Script.SCENES.length],
        imageWide: s.imageWide || '', imageClose: s.imageClose || '',
        lines: []
      };
      const lines = Array.isArray(s.lines) ? s.lines : [];
      sk.lines = lines.map((l, li) => {
        let speaker = String(l.speaker || (li % 2 === 0 ? 'A' : 'B')).toUpperCase();
        if (!ids.has(speaker)) speaker = p.characters[li % p.characters.length].id;
        const emotion = Script.EMOTIONS.includes(l.emotion) ? l.emotion : (li === lines.length - 1 ? 'shocked' : 'angry');
        return {
          speaker,
          text: String(l.text || '').trim(),
          emoji: l.emoji || Script.EMOJI_BY_EMOTION[emotion],
          shot: Script.SHOTS.includes(l.shot) ? l.shot : (li === lines.length - 1 && lines.length > 1 ? 'close' : 'wide'),
          emotion,
          audioUrl: l.audioUrl || '',
          image: l.image || ''
        };
      }).filter(l => l.text.length);
      return sk;
    }).filter(s => s.lines.length);
    return p;
  };

  /* ------------------------------------------------------------------
     Import
     ------------------------------------------------------------------ */

  /**
   * Format texte brut :
   *   # Titre du sketch 🤣        (nouveau sketch ; emoji optionnel en fin)
   *   @scene salon                (décor optionnel)
   *   A: Réplique avec *mot clé* ! | 🔥   (emoji optionnel après |)
   *   B: Punchline. | 😱 [close] (angry)
   *   ---                          (séparateur de sketch, équivalent à un # sans titre)
   */
  Script.parseText = function (raw) {
    const sketches = [];
    let cur = null;
    const ensure = (title, emoji) => { cur = { title: title || `SKETCH ${sketches.length + 1}`, emoji: emoji || '', lines: [] }; sketches.push(cur); return cur; };
    const lines = String(raw || '').replace(/\r/g, '').split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (/^-{3,}$/.test(line)) { cur = null; continue; }
      let m;
      if ((m = /^#+\s*(.*)$/.exec(line))) {
        let title = m[1].trim();
        let emoji = '';
        const em = /(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*$/u.exec(title);
        if (em) { emoji = em[1]; title = title.slice(0, em.index).trim(); }
        ensure(title, emoji);
        continue;
      }
      if ((m = /^@scene\s+(\w+)/i.exec(line))) { if (!cur) ensure(); cur.scene = m[1].toLowerCase(); continue; }
      if ((m = /^([A-Za-z]{1,2})\s*[:：]\s*(.+)$/.exec(line))) {
        if (!cur) ensure();
        let text = m[2].trim(), emoji = '', shot = '', emotion = '';
        const sh = /\[(wide|close)\]/i.exec(text); if (sh) { shot = sh[1].toLowerCase(); text = text.replace(sh[0], '').trim(); }
        const emo = /\((neutral|happy|angry|shocked|sad|smug|confused)\)/i.exec(text); if (emo) { emotion = emo[1].toLowerCase(); text = text.replace(emo[0], '').trim(); }
        const pipe = text.indexOf('|');
        if (pipe >= 0) { emoji = text.slice(pipe + 1).trim(); text = text.slice(0, pipe).trim(); }
        cur.lines.push({ speaker: m[1].toUpperCase(), text, emoji, shot, emotion });
        continue;
      }
      // ligne orpheline : on l'ajoute au dernier locuteur en alternance
      if (!cur) ensure();
      const prev = cur.lines[cur.lines.length - 1];
      cur.lines.push({ speaker: prev && prev.speaker === 'A' ? 'B' : 'A', text: line });
    }
    return sketches.filter(s => s.lines.length);
  };

  /** CSV avec en-tête : sketch,title,title_emoji,scene,speaker,text,emoji,shot,emotion */
  Script.parseCSVRows = function (raw) {
    const rows = []; let row = [], field = '', q = false;
    const s = String(raw || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(f => f.trim().length));
  };

  Script.parseCSV = function (raw) {
    const rows = Script.parseCSVRows(raw);
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim().toLowerCase());
    const idx = (n) => head.indexOf(n);
    const iS = idx('sketch'), iT = idx('title'), iTE = idx('title_emoji'), iSc = idx('scene'), iSp = idx('speaker'), iTx = idx('text'), iE = idx('emoji'), iSh = idx('shot'), iEm = idx('emotion');
    if (iTx < 0) throw new Error('CSV : colonne "text" manquante');
    const map = new Map();
    rows.slice(1).forEach((r, n) => {
      const key = iS >= 0 ? (r[iS] || '').trim() || String(n) : String(Math.floor(n / 2));
      if (!map.has(key)) map.set(key, { title: iT >= 0 ? (r[iT] || '').trim() : '', emoji: iTE >= 0 ? (r[iTE] || '').trim() : '', scene: iSc >= 0 ? (r[iSc] || '').trim() : '', lines: [] });
      const sk = map.get(key);
      if (!sk.title && iT >= 0 && r[iT]) sk.title = r[iT].trim();
      sk.lines.push({
        speaker: iSp >= 0 ? (r[iSp] || '').trim().toUpperCase() : (sk.lines.length % 2 ? 'B' : 'A'),
        text: (r[iTx] || '').trim(),
        emoji: iE >= 0 ? (r[iE] || '').trim() : '',
        shot: iSh >= 0 ? (r[iSh] || '').trim().toLowerCase() : '',
        emotion: iEm >= 0 ? (r[iEm] || '').trim().toLowerCase() : ''
      });
    });
    return Array.from(map.values()).filter(s => s.lines.length);
  };

  Script.parseJSON = function (raw) {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(obj)) return { sketches: obj };
    if (obj && Array.isArray(obj.sketches)) return obj;
    if (obj && Array.isArray(obj.lines)) return { sketches: [obj] };
    throw new Error('JSON : attendu un projet, un tableau de sketches ou un sketch');
  };

  /** Détecte le format et renvoie { sketches, project? } */
  Script.importAny = function (raw) {
    const s = String(raw || '').trim();
    if (!s) return { sketches: [] };
    if (s[0] === '{' || s[0] === '[') { const o = Script.parseJSON(s); return { sketches: o.sketches, project: Array.isArray(o) ? null : o }; }
    const first = s.split('\n')[0].toLowerCase();
    if (/(^|[,;])\s*text\s*([,;]|$)/.test(first)) return { sketches: Script.parseCSV(s) };
    return { sketches: Script.parseText(s) };
  };

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */
  Script.toText = function (project) {
    return (project.sketches || []).map(s => {
      const head = `# ${s.title}${s.emoji ? ' ' + s.emoji : ''}\n@scene ${s.scene || 'salon'}`;
      const body = s.lines.map(l => `${l.speaker}: ${l.text}${l.emoji ? ' | ' + l.emoji : ''} [${l.shot}] (${l.emotion})`).join('\n');
      return head + '\n' + body;
    }).join('\n\n');
  };

  Script.toCSV = function (project) {
    const esc = (v) => { v = String(v == null ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const out = ['sketch,title,title_emoji,scene,speaker,text,emoji,shot,emotion'];
    (project.sketches || []).forEach((s, i) => s.lines.forEach(l => out.push([i + 1, s.title, s.emoji, s.scene, l.speaker, l.text, l.emoji, l.shot, l.emotion].map(esc).join(','))));
    return out.join('\n');
  };

  /* ------------------------------------------------------------------
     Générateur hors ligne par gabarits (français, satirique, tout public)
     Slots : {F} prénom féminin, {M} prénom masculin, {LIEU}, {OBJET},
             {SOMME}, {PLAT}, {VILLE}, {METIER}
     ------------------------------------------------------------------ */
  Script.SLOTS = {
    F: ['Awa', 'Fatou', 'Aminata', 'Mariama', 'Khady', 'Bineta', 'Ndeye', 'Coumba', 'Rokhaya', 'Adja', 'Sokhna', 'Dieynaba'],
    M: ['Moussa', 'Ibrahima', 'Mamadou', 'Ousmane', 'Cheikh', 'Pape', 'Modou', 'Abdou', 'Lamine', 'Babacar', 'Serigne', 'Idrissa'],
    LIEU: ['au marché', 'à la boutique', 'au mariage', 'à la mosquée', 'chez le tailleur', 'au salon de coiffure', 'au bureau', 'à la gare routière'],
    OBJET: ['le téléphone', 'la télécommande', 'la voiture', 'le chargeur', 'le wifi', 'la clé de la maison', 'le portefeuille', 'la bouteille de gaz'],
    SOMME: ['5 000 francs', '10 000 francs', '50 000 francs', '100 000 francs', '2 000 francs', '25 000 francs'],
    PLAT: ['le thiéboudienne', 'le yassa', 'le mafé', 'le thiéré', 'les beignets', 'le ndambé', 'le soupe kandia'],
    VILLE: ['Dakar', 'Thiès', 'Touba', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Mbour', 'Pikine'],
    METIER: ['chauffeur', 'commerçant', 'coiffeuse', 'tailleur', 'instituteur', 'infirmière', 'mécanicien', 'vendeuse']
  };

  // Chaque gabarit : titre, emoji titre, décor, catégorie, réplique A (setup) et B (punchline).
  Script.TEMPLATES = [
    { cat: 'couple', title: 'LE BÉBÉ', emoji: '😱', scene: 'chambre', a: { text: 'Le bébé ne me *ressemble pas* !', emotion: 'angry', emoji: '🔥' }, b: { text: 'Justement, je cherche à qui il *ressemble*.', emotion: 'shocked', emoji: '😜' } },
    { cat: 'couple', title: "L'ANNIVERSAIRE", emoji: '😱', scene: 'salon', a: { text: 'Tu as oublié notre anniversaire de *mariage* !', emotion: 'angry', emoji: '🔥' }, b: { text: "Moi j'essaie d'oublier le *mariage même*.", emotion: 'shocked', emoji: '😱' } },
    { cat: 'couple', title: 'LA SŒUR', emoji: '😆', scene: 'rue', a: { text: 'Aucun homme ne veut de moi, je suis *maudite*.', emotion: 'sad', emoji: '🔥' }, b: { text: 'Moi je veux de toi... pour me présenter *ta sœur*.', emotion: 'smug', emoji: '😆' } },
    { cat: 'famille', title: 'LE TESTAMENT', emoji: '🤣', scene: 'salon', a: { text: 'Mamie, tu vas nous laisser *la maison* ?', emotion: 'happy', emoji: '🙏' }, b: { text: 'Non. Je vais enfin *dormir*.', emotion: 'shocked', emoji: '🤣' } },
    { cat: 'famille', title: 'LE COPAIN', emoji: '😲', scene: 'salon', a: { text: 'Papa, je te présente mon copain, il est *professeur*.', emotion: 'happy', emoji: '😍' }, b: { text: 'Il était dans *ta classe*.', emotion: 'shocked', emoji: '😲' } },
    { cat: 'couple', title: 'LE RÉGIME', emoji: '😂', scene: 'cuisine', a: { text: 'Chéri, tu trouves que *j\'ai grossi* ?', emotion: 'confused', emoji: '🤔' }, b: { text: 'Non. Mais la balance a demandé un *deuxième avis*.', emotion: 'smug', emoji: '😂' } },
    { cat: 'couple', title: 'LE TÉLÉPHONE', emoji: '🔥', scene: 'chambre', a: { text: 'Pourquoi ton téléphone a un *code* maintenant ?', emotion: 'angry', emoji: '🔥' }, b: { text: 'Pour protéger ta *tension artérielle*.', emotion: 'smug', emoji: '😏' } },
    { cat: 'couple', title: 'LA BELLE-MÈRE', emoji: '😱', scene: 'salon', a: { text: 'Ta mère vient dormir ici *trois jours* ?', emotion: 'shocked', emoji: '😨' }, b: { text: 'Trois jours... par *semaine*.', emotion: 'smug', emoji: '😱' } },
    { cat: 'argent', title: 'LE PRÊT', emoji: '😂', scene: 'rue', a: { text: '{M}, rends-moi mes {SOMME} depuis *deux ans* !', emotion: 'angry', emoji: '🔥' }, b: { text: "Deux ans ? Déjà ? Le temps passe quand on est *riche*.", emotion: 'smug', emoji: '😂' } },
    { cat: 'argent', title: 'LE SALAIRE', emoji: '😭', scene: 'bureau', a: { text: 'Patron, mon salaire est en *retard* !', emotion: 'angry', emoji: '😤' }, b: { text: "Ton travail aussi. On est *synchronisés*.", emotion: 'smug', emoji: '😭' } },
    { cat: 'marche', title: 'LE PRIX', emoji: '🤣', scene: 'marche', a: { text: '{SOMME} pour ce poisson ? Il est *en or* ?', emotion: 'shocked', emoji: '😤' }, b: { text: "Non madame, mais il a nagé *jusqu'ici*.", emotion: 'smug', emoji: '🤣' } },
    { cat: 'marche', title: 'LA MONNAIE', emoji: '😂', scene: 'boutique', a: { text: "Boutiquier, tu n'as jamais la *monnaie* !", emotion: 'angry', emoji: '🔥' }, b: { text: "Et toi tu n'as jamais *l'argent*. On est quittes.", emotion: 'smug', emoji: '😂' } },
    { cat: 'ecole', title: 'LE BULLETIN', emoji: '😲', scene: 'salon', a: { text: 'Tu as eu 2 sur 20 en maths ? *Explique-moi* !', emotion: 'angry', emoji: '🔥' }, b: { text: "C'est déjà le *double* du trimestre dernier.", emotion: 'smug', emoji: '😲' } },
    { cat: 'ecole', title: 'LE DEVOIR', emoji: '🤣', scene: 'ecole', a: { text: "Qui a fait ce devoir ? C'est *parfait* !", emotion: 'happy', emoji: '👏' }, b: { text: 'Mon père. Il a besoin du *diplôme*.', emotion: 'shocked', emoji: '🤣' } },
    { cat: 'couple', title: 'LE PLAT', emoji: '😂', scene: 'cuisine', a: { text: "Tu n'aimes pas mon {PLAT} ? *Dis-le* !", emotion: 'angry', emoji: '🔥' }, b: { text: "Si. C'est le chat qui ne veut *plus*.", emotion: 'shocked', emoji: '😂' } },
    { cat: 'famille', title: 'LE MARIAGE', emoji: '😱', scene: 'salon', a: { text: 'Maman, à 35 ans je veux *choisir* mon mari.', emotion: 'angry', emoji: '💅' }, b: { text: "À 35 ans, on ne choisit plus. On *accepte*.", emotion: 'smug', emoji: '😱' } },
    { cat: 'famille', title: 'LE PETIT-FILS', emoji: '🤣', scene: 'salon', a: { text: 'Mamie, tu me donnes {SOMME} pour *l\'école* ?', emotion: 'happy', emoji: '🙏' }, b: { text: "L'école de qui ? Tu as *trente ans*.", emotion: 'shocked', emoji: '🤣' } },
    { cat: 'voisinage', title: 'LE BRUIT', emoji: '😂', scene: 'rue', a: { text: 'Voisin, ta musique à 3h du matin, *ça suffit* !', emotion: 'angry', emoji: '🔥' }, b: { text: "Et ton ronflement, c'est un *concert* ?", emotion: 'smug', emoji: '😂' } },
    { cat: 'voisinage', title: "L'ÉLECTRICITÉ", emoji: '😅', scene: 'rue', a: { text: 'Depuis quand tu branches ta prise *chez moi* ?', emotion: 'shocked', emoji: '😤' }, b: { text: "Depuis que ta facture est moins chère que *la mienne*.", emotion: 'smug', emoji: '😅' } },
    { cat: 'bureau', title: 'LA RÉUNION', emoji: '😂', scene: 'bureau', a: { text: 'Pourquoi tu dors en *réunion* ?', emotion: 'angry', emoji: '😤' }, b: { text: "Je donne l'exemple. Tout le monde *rêvait* déjà.", emotion: 'smug', emoji: '😂' } },
    { cat: 'bureau', title: 'LE RETARD', emoji: '🤣', scene: 'bureau', a: { text: 'Encore en retard ! *Quelle excuse* ce matin ?', emotion: 'angry', emoji: '🔥' }, b: { text: "Aucune. Je suis venu *vous surprendre*.", emotion: 'happy', emoji: '🤣' } },
    { cat: 'couple', title: 'LE CADEAU', emoji: '😱', scene: 'salon', a: { text: "Tu m'as offert un *balai* pour la fête ?", emotion: 'shocked', emoji: '😤' }, b: { text: "Un balai *électrique*. Je ne suis pas un monstre.", emotion: 'smug', emoji: '😱' } },
    { cat: 'couple', title: 'LA PROMESSE', emoji: '😂', scene: 'rue', a: { text: 'Tu avais promis de *changer* !', emotion: 'angry', emoji: '🔥' }, b: { text: "J'ai changé. De *numéro*.", emotion: 'smug', emoji: '😂' } },
    { cat: 'famille', title: 'LE DIPLÔME', emoji: '😲', scene: 'salon', a: { text: 'Mon fils, ton diplôme, *il sert à quoi* ?', emotion: 'confused', emoji: '🤔' }, b: { text: "À caler la table. Elle ne *bouge plus*.", emotion: 'shocked', emoji: '😲' } },
    { cat: 'marche', title: 'LE TAILLEUR', emoji: '😭', scene: 'boutique', a: { text: 'Tailleur, ma robe pour le mariage, *c\'est quand* ?', emotion: 'angry', emoji: '😤' }, b: { text: "Pour quel mariage ? Le prochain ou *celui d'hier* ?", emotion: 'smug', emoji: '😭' } },
    { cat: 'tech', title: 'LE WIFI', emoji: '😂', scene: 'salon', a: { text: 'Le wifi ne marche pas, *fais quelque chose* !', emotion: 'angry', emoji: '🔥' }, b: { text: "J'ai prié. Maintenant c'est entre lui *et Dieu*.", emotion: 'smug', emoji: '😂' } },
    { cat: 'tech', title: 'LE STATUT', emoji: '😱', scene: 'chambre', a: { text: "Pourquoi tu as mis « *célibataire* » sur ton statut ?", emotion: 'angry', emoji: '🔥' }, b: { text: "C'est pour les *réductions*.", emotion: 'shocked', emoji: '😱' } },
    { cat: 'couple', title: 'LE TRAJET', emoji: '🤣', scene: 'rue', a: { text: 'Tu dis que tu étais {LIEU} *toute la journée* ?', emotion: 'confused', emoji: '🤔' }, b: { text: "Oui. Et {LIEU} était chez *{F}*.", emotion: 'shocked', emoji: '🤣' } },
    { cat: 'famille', title: 'LE PRÉNOM', emoji: '😂', scene: 'chambre', a: { text: "On l'appelle {M}, comme *ton père* ?", emotion: 'happy', emoji: '🥰' }, b: { text: "Non. Comme ton père, il faut d'abord *vérifier*.", emotion: 'shocked', emoji: '😂' } },
    { cat: 'argent', title: 'LA TONTINE', emoji: '😱', scene: 'salon', a: { text: "{F}, c'est toi qui gardes l'argent de la *tontine* ?", emotion: 'confused', emoji: '🤔' }, b: { text: 'Je le gardais. Maintenant il est *en voyage*.', emotion: 'smug', emoji: '😱' } },
    { cat: 'couple', title: 'LE SILENCE', emoji: '😂', scene: 'salon', a: { text: 'Tu ne me parles plus depuis *une semaine* !', emotion: 'sad', emoji: '😢' }, b: { text: "Je voulais pas t'interrompre.", emotion: 'smug', emoji: '😂' } },
    { cat: 'famille', title: 'LE FOOT', emoji: '🤣', scene: 'salon', a: { text: 'Entre moi et le foot, tu choisis *qui* ?', emotion: 'angry', emoji: '🔥' }, b: { text: "Attends, c'est la *mi-temps* je réponds.", emotion: 'shocked', emoji: '🤣' } },
    { cat: 'marche', title: 'LE CHAUFFEUR', emoji: '😂', scene: 'rue', a: { text: 'Chauffeur, {VILLE} c\'est *combien* ?', emotion: 'neutral', emoji: '🚕' }, b: { text: "Ça dépend. Tu veux arriver *vivant* ?", emotion: 'smug', emoji: '😂' } },
    { cat: 'bureau', title: 'LE CV', emoji: '😲', scene: 'bureau', a: { text: 'Sur votre CV vous parlez *cinq langues* ?', emotion: 'confused', emoji: '🤔' }, b: { text: "Oui. Mais je n'écoute dans *aucune*.", emotion: 'smug', emoji: '😲' } },
    { cat: 'couple', title: 'LE SECRET', emoji: '😱', scene: 'chambre', a: { text: "Dis-moi ton plus grand *secret*.", emotion: 'happy', emoji: '🥰' }, b: { text: "J'ai un deuxième *compte*... Instagram.", emotion: 'shocked', emoji: '😱' } },
    { cat: 'famille', title: 'LA VAISSELLE', emoji: '😂', scene: 'cuisine', a: { text: 'Qui a cassé *toutes* les assiettes ?', emotion: 'angry', emoji: '🔥' }, b: { text: "Personne. Elles ont *démissionné*.", emotion: 'shocked', emoji: '😂' } },
    { cat: 'tech', title: 'LE MOT DE PASSE', emoji: '🤣', scene: 'salon', a: { text: 'Pourquoi ton mot de passe est *mon prénom* ?', emotion: 'happy', emoji: '🥰' }, b: { text: "Parce que personne ne le *devinerait*.", emotion: 'smug', emoji: '🤣' } },
    { cat: 'argent', title: 'LA DOT', emoji: '😱', scene: 'salon', a: { text: 'Pour épouser ma fille, il faut *{SOMME}*.', emotion: 'neutral', emoji: '💰' }, b: { text: "Et pour la *rendre*, c'est combien ?", emotion: 'shocked', emoji: '😱' } },
    { cat: 'voisinage', title: 'LE CHIEN', emoji: '😂', scene: 'rue', a: { text: 'Ton chien a encore *mordu* mon fils !', emotion: 'angry', emoji: '🔥' }, b: { text: "Ton fils a encore *goûté* mon chien.", emotion: 'smug', emoji: '😂' } },
    { cat: 'ecole', title: 'LE MAÎTRE', emoji: '🤣', scene: 'ecole', a: { text: 'Pourquoi tu es en retard, *{M}* ?', emotion: 'angry', emoji: '😤' }, b: { text: "Le panneau disait « *école, ralentir* ».", emotion: 'happy', emoji: '🤣' } }
  ];

  Script.CATEGORIES = Array.from(new Set(Script.TEMPLATES.map(t => t.cat)));

  Script.fillSlots = function (text, rng, memo) {
    memo = memo || {};
    return String(text).replace(/\{(F|M|LIEU|OBJET|SOMME|PLAT|VILLE|METIER)\}/g, (_, k) => {
      if (!memo[k]) memo[k] = rng.pick(Script.SLOTS[k]);
      return memo[k];
    });
  };

  /**
   * Génère `count` sketches à partir des gabarits.
   * opts : { seed, categories:[...], allowRepeats:false, names:{A,B} }
   */
  Script.generateSketches = function (count, opts) {
    opts = opts || {};
    const rng = Core.rng(opts.seed == null ? Date.now() : opts.seed);
    let pool = Script.TEMPLATES.filter(t => !opts.categories || !opts.categories.length || opts.categories.includes(t.cat));
    if (!pool.length) pool = Script.TEMPLATES.slice();
    let order = rng.shuffle(pool);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (i >= order.length) { if (opts.allowRepeats === false) break; order = order.concat(rng.shuffle(pool)); }
      const t = order[i];
      const memo = {};
      out.push({
        id: Core.uid('sk'),
        title: Script.fillSlots(t.title, rng, memo).toUpperCase(),
        emoji: t.emoji,
        scene: t.scene,
        category: t.cat,
        lines: [
          { speaker: 'A', text: Script.fillSlots(t.a.text, rng, memo), emotion: t.a.emotion, emoji: t.a.emoji, shot: 'wide' },
          { speaker: 'B', text: Script.fillSlots(t.b.text, rng, memo), emotion: t.b.emotion, emoji: t.b.emoji, shot: 'close' }
        ]
      });
    }
    return out;
  };

  /** Projet d'exemple reproduisant la structure de la vidéo de référence. */
  Script.sampleProject = function () {
    const p = Script.defaultProject();
    p.title = 'Sketches du jour';
    p.sketches = Script.TEMPLATES.slice(0, 5).map((t, i) => ({
      id: 'sk' + (i + 1), title: t.title, emoji: t.emoji, scene: t.scene,
      lines: [
        { speaker: 'A', text: t.a.text, emotion: t.a.emotion, emoji: t.a.emoji, shot: 'wide' },
        { speaker: 'B', text: t.b.text, emotion: t.b.emotion, emoji: t.b.emoji, shot: 'close' }
      ]
    }));
    return Script.normalizeProject(p);
  };

  NS.Script = Script;
  if (typeof module !== 'undefined' && module.exports) module.exports = Script;
})(typeof window !== 'undefined' ? window : globalThis);
