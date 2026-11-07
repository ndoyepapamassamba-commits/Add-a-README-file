/* =====================================================================
   Skit Studio — 50-assets.js
   Polices, emojis (police système ou PNG 3D Fluent via jsDelivr), images.
   Tout est mis en cache ; chaque échec retombe sur un repli silencieux.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};

  const Assets = {};
  Assets.FONT_STACK = '"Montserrat", "Arial Black", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  Assets.EMOJI_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif';
  Assets.emojiStyle = 'fluent'; // 'fluent' | 'font'

  const FLUENT_BASE = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/';
  Assets.FLUENT = {
    '🤣': 'Rolling on the floor laughing', '😂': 'Face with tears of joy', '😱': 'Face screaming in fear', '😲': 'Astonished face',
    '😜': 'Winking face with tongue', '🔥': 'Fire', '😆': 'Grinning squinting face', '🎉': 'Party popper', '😏': 'Smirking face',
    '😭': 'Loudly crying face', '😅': 'Grinning face with sweat', '🤔': 'Thinking face', '😤': 'Face with steam from nose',
    '😢': 'Crying face', '🙏': 'Folded hands', '😍': 'Smiling face with heart-eyes', '🥰': 'Smiling face with hearts',
    '👏': 'Clapping hands', '💅': 'Nail polish', '🤯': 'Exploding head', '💀': 'Skull', '🙃': 'Upside-down face',
    '🙈': 'See-no-evil monkey', '🥲': 'Smiling face with tear', '😇': 'Smiling face with halo', '🤭': 'Face with hand over mouth',
    '😨': 'Fearful face', '🚕': 'Taxi', '💰': 'Money bag', '🙂': 'Slightly smiling face', '😎': 'Smiling face with sunglasses',
    '😡': 'Enraged face', '🤑': 'Money-mouth face', '😬': 'Grimacing face', '🤡': 'Clown face', '👀': 'Eyes', '💔': 'Broken heart',
    '❤️': 'Red heart', '❤': 'Red heart', '😮': 'Face with open mouth', '😳': 'Flushed face', '🙄': 'Face with rolling eyes', '😒': 'Unamused face',
    '🤪': 'Zany face', '🥺': 'Pleading face', '💯': 'Hundred points', '💥': 'Collision', '👍': 'Thumbs up', '✨': 'Sparkles', '🎊': 'Confetti ball'
  };

  Assets.fluentUrl = function (emoji) {
    const name = Assets.FLUENT[emoji];
    if (!name) return null;
    return FLUENT_BASE + encodeURIComponent(name) + '/3D/' + name.toLowerCase().replace(/ /g, '_') + '_3d.png';
  };

  const images = new Map(); // url → { img, ok }
  Assets.loadImage = function (url, timeoutMs) {
    if (!url) return Promise.resolve(null);
    if (images.has(url)) { const e = images.get(url); return e.promise; }
    const entry = {};
    entry.promise = new Promise((resolve) => {
      const img = new Image();
      if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => { entry.ok = false; resolve(null); }, timeoutMs || 8000);
      img.onload = () => { clearTimeout(timer); entry.ok = true; entry.img = img; resolve(img); };
      img.onerror = () => { clearTimeout(timer); entry.ok = false; resolve(null); };
      img.src = url;
    });
    images.set(url, entry);
    return entry.promise;
  };
  Assets.imageSync = (url) => { const e = images.get(url); return e && e.ok ? e.img : null; };

  /** Charge (sans bloquer) les emojis 3D d'un projet ; renvoie quand tout est tenté. */
  Assets.preloadEmojis = async function (list) {
    if (Assets.emojiStyle !== 'fluent') return;
    const urls = Array.from(new Set(list.map(Assets.fluentUrl).filter(Boolean)));
    await Promise.all(urls.map(u => Assets.loadImage(u)));
  };
  Assets.emojiImage = function (emoji) {
    if (Assets.emojiStyle !== 'fluent') return null;
    const u = Assets.fluentUrl(emoji); return u ? Assets.imageSync(u) : null;
  };

  /** Collecte tous les emojis d'un projet (répliques, titres, outro, décor). */
  Assets.projectEmojis = function (project) {
    const out = new Set(['🤣', '🎉', '😂', '👏', '🔥']);
    (project.sketches || []).forEach(s => { if (s.emoji) out.add(s.emoji); s.lines.forEach(l => { if (l.emoji) out.add(l.emoji); }); });
    if (project.layout && project.layout.outro && project.layout.outro.emoji) out.add(project.layout.outro.emoji);
    return Array.from(out);
  };

  Assets.fontsReady = false;
  Assets.loadFonts = async function () {
    if (!root.document || !document.fonts) { Assets.fontsReady = true; return; }
    try {
      await Promise.race([
        Promise.all([document.fonts.load('900 64px Montserrat'), document.fonts.load('800 64px Montserrat')]),
        new Promise(r => setTimeout(r, 4000))
      ]);
    } catch (e) { /* repli sur la pile système */ }
    Assets.fontsReady = true;
  };

  /** Précharge toutes les ressources d'un projet (images d'avatars, emojis, polices). */
  Assets.preloadProject = async function (project) {
    const tasks = [Assets.loadFonts(), Assets.preloadEmojis(Assets.projectEmojis(project))];
    (project.characters || []).forEach(c => { if (c.avatar) { if (c.avatar.imageWide) tasks.push(Assets.loadImage(c.avatar.imageWide)); if (c.avatar.imageClose) tasks.push(Assets.loadImage(c.avatar.imageClose)); } });
    (project.sketches || []).forEach(s => { if (s.imageWide) tasks.push(Assets.loadImage(s.imageWide)); if (s.imageClose) tasks.push(Assets.loadImage(s.imageClose)); s.lines.forEach(l => { if (l.image) tasks.push(Assets.loadImage(l.image)); }); });
    await Promise.all(tasks);
  };

  NS.Assets = Assets;
})(typeof window !== 'undefined' ? window : globalThis);
