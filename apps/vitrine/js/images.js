/* Teranga Vitrine — images à partager, dessinées dans un canvas (rien n'est envoyé sur Internet).
   6 modèles × 2 formats (carré 1080×1080, statut 1080×1920) × 2 mises en page (un produit, catalogue de 4/6/9). */
(function (racine) {
  'use strict';
  var VT = racine.VT;
  var SERIF = '"Playfair Display", "Noto Serif", Georgia, "Times New Roman", serif';
  var SANS = 'Montserrat, Roboto, "Helvetica Neue", Arial, sans-serif';
  var NB = ' ';
  var VERT = '#1fa855', JAUNE = '#ffd23f';

  var MODELES = [
    { id: 'elegant', nom: 'Élégant', gratuit: true, desc: 'Crème, arche et lettres fines' },
    { id: 'promo', nom: 'Promo', gratuit: true, desc: 'Couleur vive et macaron de remise' },
    { id: 'wax', nom: 'Wax', desc: 'Cadre en motifs wax' },
    { id: 'nuit', nom: 'Nuit d\'or', desc: 'Fond noir et filets dorés' },
    { id: 'pastel', nom: 'Pastel', desc: 'Doux, arrondi, lumineux' },
    { id: 'magazine', nom: 'Magazine', desc: 'Photo pleine page, titre de une' }
  ];
  var COULEURS = [
    { v: '#7b1e5a', nom: 'Prune' }, { v: '#b4232c', nom: 'Rouge' }, { v: '#c2560c', nom: 'Terracotta' }, { v: '#b8860b', nom: 'Or' },
    { v: '#0f766e', nom: 'Émeraude' }, { v: '#1d4ed8', nom: 'Bleu roi' }, { v: '#db2777', nom: 'Fuchsia' }, { v: '#1f1f1f', nom: 'Noir' }
  ];
  var FORMATS = { carre: { l: 1080, h: 1080, nom: 'Carré' }, statut: { l: 1080, h: 1920, nom: 'Statut' } };
  function modele(id) { for (var i = 0; i < MODELES.length; i++) if (MODELES[i].id === id) return MODELES[i]; return MODELES[0]; }

  // ------------------------------------------------------------ Polices embarquées (fichiers locaux)
  var polices = null;
  function chargerPolices() {
    if (polices) return polices;
    if (!racine.FontFace || !racine.document || !document.fonts) return (polices = Promise.resolve());
    var l = [['Playfair Display', 'fonts/playfair-display-700.woff2', { weight: '700' }],
      ['Playfair Display', 'fonts/playfair-display-400-italique.woff2', { weight: '400', style: 'italic' }],
      ['Montserrat', 'fonts/montserrat-600.woff2', { weight: '600' }], ['Montserrat', 'fonts/montserrat-800.woff2', { weight: '800' }]];
    polices = Promise.all(l.map(function (x) {
      try {
        var ff = new FontFace(x[0], 'url(' + x[1] + ')', x[2]);
        return ff.load().then(function (fo) { document.fonts.add(fo); }).catch(function () {});
      } catch (e) { return null; }
    }));
    return polices;
  }

  // ------------------------------------------------------------ Couleurs
  function hexRgb(h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16) || 0;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbHex(c) { return '#' + c.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function melange(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] * (1 - t) + y[i] * t; })); }
  function clair(h, t) { return melange(h, '#ffffff', t); }
  function fonce(h, t) { return melange(h, '#000000', t); }
  function lum(h) {
    var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function encre(h) { return lum(h) > 0.42 ? '#1a1410' : '#ffffff'; }
  function rgba(h, a) { return 'rgba(' + hexRgb(h).join(',') + ',' + a + ')'; }
  // Couleur d'accent lisible sur fond clair (assombrie si trop claire)
  function lisibleSurClair(h) { var c = h; for (var i = 0; i < 6 && lum(c) > 0.3; i++) c = fonce(c, 0.18); return c; }

  // ------------------------------------------------------------ Outils de dessin
  function police(t, poids, fam, style) { return (style ? style + ' ' : '') + (poids || 400) + ' ' + Math.round(t) + 'px ' + fam; }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function arche(ctx, x, y, w, h) {
    var r = Math.min(w / 2, h);
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r);
    ctx.arc(x + w / 2, y + r, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
  }
  function couvrir(ctx, img, x, y, w, h, fy) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * (fy == null ? 0.4 : fy), dw, dh);
  }
  // Remplit la forme courante (déjà tracée) avec la photo, ou un visuel de remplacement
  function photoDans(ctx, p, x, y, w, h, A) {
    ctx.save(); ctx.clip();
    if (p.img) couvrir(ctx, p.img, x, y, w, h);
    else sansPhoto(ctx, p, x, y, w, h, A);
    ctx.restore();
  }
  function sansPhoto(ctx, p, x, y, w, h, A) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, clair(A, 0.5)); g.addColorStop(1, fonce(A, 0.15));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = Math.max(2, w / 120);
    for (var i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(x + w * 0.85, y + h * 0.15, Math.min(w, h) * 0.16 * i, 0, Math.PI * 2); ctx.stroke(); }
    var t = Math.min(w, h) * 0.42;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = police(t, 700, SERIF);
    ctx.fillText(String(p.nom || '?').trim().charAt(0).toUpperCase() || '?', x + w / 2, y + h * 0.46);
    var c = VT.categorie(p.categorie).nom.toUpperCase();
    ctx.font = police(Math.max(14, t * 0.16), 600, SANS); ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(c, x + w / 2, y + h * 0.46 + t * 0.55);
  }
  function largeur(ctx, s) { return ctx.measureText(s).width; }
  function couperMots(ctx, texte, maxL) {
    var mots = String(texte || '').trim().split(/\s+/), l = [], cur = '';
    mots.forEach(function (m) {
      var e = cur ? cur + ' ' + m : m;
      if (!cur || largeur(ctx, e) <= maxL) cur = e; else { l.push(cur); cur = m; }
    });
    if (cur) l.push(cur);
    return l;
  }
  function raccourcir(ctx, s, maxL) {
    if (largeur(ctx, s) <= maxL) return s;
    while (s.length > 1 && largeur(ctx, s + '…') > maxL) s = s.slice(0, -1);
    return s.replace(/\s+$/, '') + '…';
  }
  // Texte sur au plus n lignes, taille réduite si besoin (jusqu'à min), points de suspension en dernier recours
  function ajusterBloc(ctx, texte, maxL, n, t, min, poids, fam, style) {
    for (var s = t; s >= min; s -= 2) {
      ctx.font = police(s, poids, fam, style);
      var l = couperMots(ctx, texte, maxL);
      if (l.length <= n && l.every(function (x) { return largeur(ctx, x) <= maxL; })) return { t: s, lignes: l };
    }
    ctx.font = police(min, poids, fam, style);
    var lignes = couperMots(ctx, texte, maxL);
    if (lignes.length > n) { lignes = lignes.slice(0, n); lignes[n - 1] += '…'; }
    return { t: min, lignes: lignes.map(function (x) { return raccourcir(ctx, x, maxL); }) };
  }
  function ajusterLigne(ctx, texte, maxL, t, min, poids, fam, style) {
    var s = t;
    ctx.font = police(s, poids, fam, style);
    while (s > min && largeur(ctx, texte) > maxL) { s -= 2; ctx.font = police(s, poids, fam, style); }
    return s;
  }
  // Texte espacé (lettres écartées), dessiné caractère par caractère
  function largeurEspace(ctx, s, e) { var w = 0; for (var i = 0; i < s.length; i++) w += largeur(ctx, s[i]); return w + e * Math.max(0, s.length - 1); }
  function texteEspace(ctx, s, x, y, e, align) {
    var w = largeurEspace(ctx, s, e), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    var a = ctx.textAlign; ctx.textAlign = 'left';
    for (var i = 0; i < s.length; i++) { ctx.fillText(s[i], x0, y); x0 += largeur(ctx, s[i]) + e; }
    ctx.textAlign = a;
    return w;
  }
  function ornement(ctx, cx, cy, l, couleur) {
    ctx.save(); ctx.strokeStyle = couleur; ctx.fillStyle = couleur; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - l, cy); ctx.lineTo(cx - 14, cy); ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + l, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 7, cy); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function bulle(ctx, cx, cy, r, couleur) {
    ctx.save(); ctx.strokeStyle = couleur; ctx.fillStyle = couleur; ctx.lineWidth = Math.max(2, r * 0.2);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.62, cy + r * 0.62); ctx.lineTo(cx - r * 1.15, cy + r * 1.12); ctx.lineTo(cx - r * 0.18, cy + r * 0.95); ctx.closePath(); ctx.fill();
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(cx + i * r * 0.42, cy, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function etoile(ctx, cx, cy, r, couleur) {
    ctx.save(); ctx.fillStyle = couleur; ctx.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr2 = i % 2 ? r * 0.28 : r; ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function macaron(ctx, cx, cy, r, couleur, pointes) {
    ctx.beginPath();
    var n = pointes || 18;
    for (var i = 0; i < n * 2; i++) { var a = i * Math.PI / n - Math.PI / 2, q = i % 2 ? r * 0.86 : r; ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
    ctx.closePath(); ctx.fillStyle = couleur; ctx.fill();
  }
  function ombre(ctx, couleur, flou, dy) { ctx.shadowColor = couleur; ctx.shadowBlur = flou; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = dy || 0; }
  function sansOmbre(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  function pastilleTexte(ctx, cx, cy, r, texte, fond, enc, n) {
    if (n) macaron(ctx, cx, cy, r, fond, n); else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fond; ctx.fill(); }
    ctx.fillStyle = enc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var t = ajusterLigne(ctx, texte, r * 1.5, r * 0.62, r * 0.3, 800, SANS);
    ctx.font = police(t, 800, SANS); ctx.fillText(texte, cx, cy + t * 0.04);
  }
  function remiseTexte(p) { return '-' + VT.remisePct(p) + NB + '%'; }

  // ------------------------------------------------------------ Blocs empilés (mise en page verticale)
  // Chaque bloc : { h, ecart, draw(y, h), option (priorité de suppression si la place manque), flex (la photo), lie (pas d'espace ajouté après) }
  function disposer(blocs, haut, bas, pmin, pmax, ed) {
    var l = blocs.filter(Boolean);
    ed = ed || 0;
    function ec(b) { return b.ecart != null ? b.ecart : ed; }
    function somme() { var s = 0; l.forEach(function (b) { s += (b.flex ? 0 : b.h) + ec(b); }); return s; }
    while (bas - haut - somme() < pmin) {
      var k = -1, pr = Infinity;
      l.forEach(function (b, i) { if (b.option && b.option < pr) { pr = b.option; k = i; } });
      if (k < 0) break;
      l.splice(k, 1);
    }
    var dispo = bas - haut - somme(), aFlex = l.some(function (b) { return b.flex; });
    var ph = aFlex ? Math.max(80, Math.min(pmax, dispo)) : 0;
    var fentes = 1; l.forEach(function (b, i) { if (!b.lie && i < l.length - 1) fentes++; });
    var extra = Math.max(0, dispo - ph) / (fentes + 1);
    var y = haut + extra, pos = [];
    l.forEach(function (b, i) {
      var h = b.flex ? ph : b.h;
      pos.push({ b: b, y: y, h: h });
      y += h + ec(b) + (b.lie || i === l.length - 1 ? 0 : extra);
    });
    return pos;
  }
  function tracer(pos) { pos.forEach(function (x) { var m = x.b.pad || 0; x.b.draw(x.y + m, x.h - 2 * m); }); }
  function position(pos, b) { for (var i = 0; i < pos.length; i++) if (pos[i].b === b) return pos[i]; return null; }

  function blocTexte(ctx, texte, s) {
    if (!texte) return null;
    var b = ajusterBloc(ctx, s.maj ? texte.toUpperCase() : texte, s.maxL, s.lignes || 1, s.t, s.min || s.t * 0.7, s.poids, s.fam, s.style);
    var il = s.il || 1.16;
    return { h: b.t * il * b.lignes.length, ecart: s.ecart, option: s.option, lie: s.lie, draw: function (y) {
      ctx.font = police(b.t, s.poids, s.fam, s.style); ctx.fillStyle = s.couleur; ctx.textBaseline = 'top'; ctx.textAlign = s.align || 'center';
      b.lignes.forEach(function (l, i) { ctx.fillText(l, s.x, y + i * b.t * il); });
    } };
  }
  function blocEspace(ctx, texte, s) {
    if (!texte) return null;
    texte = texte.toUpperCase();
    ctx.font = police(s.t, s.poids || 600, s.fam || SANS);
    var t = s.t, e = s.esp;
    while (t > 14 && largeurEspace(ctx, texte, e) > s.maxL) { t -= 1; e = Math.max(1, e * 0.94); ctx.font = police(t, s.poids || 600, s.fam || SANS); }
    if (largeurEspace(ctx, texte, e) > s.maxL) texte = raccourcir(ctx, texte, s.maxL - e * texte.length);
    return { h: t * 1.1, ecart: s.ecart, lie: s.lie, option: s.option, draw: function (y) {
      ctx.font = police(t, s.poids || 600, s.fam || SANS); ctx.fillStyle = s.couleur; ctx.textBaseline = 'top';
      texteEspace(ctx, texte, s.x, y, e, s.align || 'center');
    } };
  }
  // Prix : [ancien prix barré] [prix] [F CFA]
  function mesurePrix(ctx, p, s) {
    var n = VT.formatNombre(VT.prixVente(p), NB), suf = NB + 'F' + NB + 'CFA', promo = VT.enPromo(p);
    var anc = promo ? VT.formatNombre(p.prix, NB) + NB + 'F' : '';
    ctx.font = police(s.t, 800, s.fam || SANS); var wN = largeur(ctx, n);
    ctx.font = police(s.t * 0.4, 800, s.fam || SANS); var wS = largeur(ctx, suf);
    ctx.font = police(s.t * 0.44, 600, SANS); var wA = anc ? largeur(ctx, anc) : 0;
    var g = s.t * 0.22;
    return { n: n, suf: suf, anc: anc, wN: wN, wS: wS, wA: wA, g: g, w: wN + g * 0.35 + wS + (anc ? wA + g : 0) };
  }
  function dessinerPrix(ctx, p, s, x, y) {
    var m = mesurePrix(ctx, p, s);
    var x0 = s.align === 'left' ? x : s.align === 'right' ? x - m.w : x - m.w / 2, base = y + s.t * 0.84;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (m.anc) {
      ctx.font = police(s.t * 0.44, 600, SANS); ctx.fillStyle = s.ancien || 'rgba(0,0,0,.45)';
      ctx.fillText(m.anc, x0, base - s.t * 0.08);
      ctx.fillRect(x0 - 2, base - s.t * 0.08 - s.t * 0.15, m.wA + 4, Math.max(2, s.t * 0.045));
      x0 += m.wA + m.g;
    }
    ctx.fillStyle = s.couleur;
    ctx.font = police(s.t, 800, s.fam || SANS); ctx.fillText(m.n, x0, base);
    ctx.font = police(s.t * 0.4, 800, s.fam || SANS); ctx.fillText(m.suf, x0 + m.wN + m.g * 0.35, base);
    return m.w;
  }
  function blocPrix(ctx, p, s) {
    var t = s.t;
    while (t > 24 && mesurePrix(ctx, p, { t: t, fam: s.fam }).w > s.maxL) t -= 2;
    var s2 = Object.assign({}, s, { t: t });
    return { h: t * 1.02, ecart: s.ecart, option: s.option, draw: function (y) { dessinerPrix(ctx, p, s2, s.x, y); } };
  }
  function pastilleCouleur(ctx, cx, cy, r, hex, contour) {
    ctx.save();
    if (hex === 'multi') {
      ['#e63946', '#f4a261', '#2a9d8f', '#264653'].forEach(function (c, i) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
      });
    } else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = hex; ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = contour; ctx.lineWidth = Math.max(2, r * 0.18); ctx.stroke();
    ctx.restore();
  }
  // Tailles (texte) et couleurs (pastilles si toutes reconnues, sinon texte)
  function blocDetails(ctx, d, s) {
    var p = d.p;
    if (!d.opt.details) return null;
    var cat = VT.categorie(p.categorie).id, mot = cat === 'vetements' || cat === 'chaussures' ? 'Tailles' : 'Formats';
    if (p.tailles && p.tailles.length === 1) mot = mot.slice(0, -1);
    var l1 = p.tailles && p.tailles.length ? mot + ' : ' + p.tailles.join(' · ') : '';
    var cs = (p.couleurs || []).slice(0, 10), hex = cs.map(VT.couleurHex), toutes = cs.length && hex.every(Boolean);
    var l2 = cs.length && !toutes ? (cs.length > 1 ? 'Couleurs : ' : 'Couleur : ') + cs.join(', ') : '';
    var r = s.t * 0.62, lignes = [];
    ctx.font = police(s.t, 600, SANS);
    if (l1) lignes = lignes.concat(ajusterBloc(ctx, l1, s.maxL, 2, s.t, s.t * 0.8, 600, SANS).lignes);
    if (l2) lignes = lignes.concat(ajusterBloc(ctx, l2, s.maxL, 1, s.t, s.t * 0.8, 600, SANS).lignes);
    if (!lignes.length && !toutes) return null;
    var h = lignes.length * s.t * 1.3 + (toutes ? r * 2 + (lignes.length ? s.t * 0.5 : 0) : 0);
    return { h: h, ecart: s.ecart, option: s.option || 1, draw: function (y) {
      ctx.font = police(s.t, 600, SANS); ctx.fillStyle = s.couleur; ctx.textBaseline = 'top'; ctx.textAlign = s.align || 'center';
      lignes.forEach(function (l, i) { ctx.fillText(l, s.x, y + i * s.t * 1.3); });
      if (toutes) {
        var n = hex.length, pas = r * 2.7, w = (n - 1) * pas, x0 = s.align === 'left' ? s.x + r : s.x - w / 2;
        var cy = y + lignes.length * s.t * 1.3 + (lignes.length ? s.t * 0.5 : 0) + r;
        hex.forEach(function (c, i) { pastilleCouleur(ctx, x0 + i * pas, cy, r, c, s.contour || '#ffffff'); });
      }
    } };
  }
  function texteStock(d) {
    var p = d.p;
    if (!d.opt.stock || !VT.suiviStock(p)) return '';
    if (p.stock <= 0) return 'Épuisé pour le moment';
    if (p.stock <= 5) return p.stock === 1 ? 'Dernière pièce !' : 'Plus que ' + p.stock + ' en stock !';
    return '';
  }
  // Bouton « Commandez sur WhatsApp » (+ numéro dessous)
  function blocCta(ctx, d, s) {
    var txt = 'Commandez sur WhatsApp', h = s.h, t = s.t || h * 0.36;
    t = ajusterLigne(ctx, txt, s.maxL - h * 1.6, t, 18, 800, SANS);
    var ic = h * 0.2, w = largeur(ctx, txt) + h * 1.45 + ic;
    var num = d.opt.numero && d.numero ? d.numero : '', tn = s.tn || h * 0.36;
    var hh = h + (num ? tn * 1.55 : 0);
    return { h: hh, ecart: s.ecart, draw: function (y) {
      var x = (s.align === 'left' ? s.x : s.x - w / 2);
      ctx.save();
      if (s.ombre) ombre(ctx, s.ombre, 24, 8);
      rr(ctx, x, y, w, h, h / 2);
      if (s.fond) { ctx.fillStyle = s.fond; ctx.fill(); }
      sansOmbre(ctx);
      if (s.contour) { ctx.strokeStyle = s.contour; ctx.lineWidth = s.lw || 3; ctx.stroke(); }
      ctx.restore();
      bulle(ctx, x + h * 0.52, y + h / 2 - ic * 0.08, ic, s.encre);
      ctx.font = police(t, 800, SANS); ctx.fillStyle = s.encre; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x + h * 0.52 + ic * 1.9, y + h / 2 + 1);
      if (num) {
        ctx.font = police(tn, 600, SANS); ctx.fillStyle = s.numCouleur || s.fond; ctx.textBaseline = 'top'; ctx.textAlign = s.align === 'left' ? 'left' : 'center';
        texteEspace(ctx, num, s.align === 'left' ? s.x + h * 0.3 : s.x, y + h + tn * 0.45, tn * 0.06, s.align === 'left' ? 'left' : 'center');
      }
    } };
  }
  function blocPhoto(ctx, s) { return { flex: true, ecart: s.ecart, pad: s.pad || 0, draw: s.draw }; }

  // ------------------------------------------------------------ Motif wax (tuile dessinée une fois)
  var tuiles = {};
  function motifWax(ctx, A) {
    var k = A;
    if (!tuiles[k]) {
      var n = 180, c = (racine.document ? document.createElement('canvas') : null);
      if (!c) return A;
      c.width = n; c.height = n;
      var x = c.getContext('2d'), sombre = '#1d1a33', or = '#e8a317', creme = '#f6ead2', a2 = clair(A, 0.35);
      x.fillStyle = A; x.fillRect(0, 0, n, n);
      [[70, sombre], [58, or], [46, a2], [33, creme], [20, sombre], [9, or]].forEach(function (r) { x.beginPath(); x.arc(n / 2, n / 2, r[0], 0, Math.PI * 2); x.fillStyle = r[1]; x.fill(); });
      // feuilles aux coins
      [[0, 0], [n, 0], [0, n], [n, n]].forEach(function (pt) {
        for (var i = 0; i < 4; i++) {
          x.save(); x.translate(pt[0], pt[1]); x.rotate(i * Math.PI / 2 + Math.PI / 4);
          x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(14, 22, 0, 46); x.quadraticCurveTo(-14, 22, 0, 0);
          x.fillStyle = creme; x.fill(); x.lineWidth = 2.5; x.strokeStyle = sombre; x.stroke();
          x.restore();
        }
      });
      [[n / 2, 0], [n / 2, n], [0, n / 2], [n, n / 2]].forEach(function (pt) {
        x.beginPath(); x.arc(pt[0], pt[1], 8, 0, Math.PI * 2); x.fillStyle = or; x.fill();
        x.beginPath(); x.arc(pt[0], pt[1], 3.5, 0, Math.PI * 2); x.fillStyle = sombre; x.fill();
      });
      tuiles[k] = c;
    }
    return ctx.createPattern(tuiles[k], 'repeat');
  }

  // ------------------------------------------------------------ Les 6 modèles : un produit
  var T = {};

  T.elegant = {
    marge: 76, margeV: 58,
    fond: function (ctx, d) {
      ctx.fillStyle = melange('#fbf8f3', d.A, 0.035); ctx.fillRect(0, 0, d.W, d.H);
      ctx.strokeStyle = d.Al; ctx.lineWidth = 3; ctx.strokeRect(34, 34, d.W - 68, d.H - 68);
      ctx.lineWidth = 1.2; ctx.strokeRect(46, 46, d.W - 92, d.H - 92);
    },
    seul: function (ctx, d) {
      var P = d.P, W = d.W, p = d.p, A = d.Al, cx = W / 2, L = W - 220;
      this.fond(ctx, d);
      var bPhoto;
      var blocs = [
        blocEspace(ctx, d.boutique, { t: P ? 34 : 28, esp: 7, maxL: L, x: cx, couleur: A, lie: true, ecart: 14 }),
        { h: 14, lie: !d.titre, ecart: 0, draw: function (y) { ornement(ctx, cx, y + 7, 90, A); } },
        blocTexte(ctx, d.titre, { t: P ? 50 : 38, min: 26, fam: SERIF, poids: 400, style: 'italic', couleur: '#7a6a5e', maxL: L, x: cx, option: 2 }),
        bPhoto = blocPhoto(ctx, { pad: 20, draw: function (y, h) {
          var w = Math.min(P ? 800 : 560, h * (P ? 0.86 : 1.08)), x = cx - w / 2;
          ctx.save(); ctx.strokeStyle = A; ctx.lineWidth = 2; arche(ctx, x - 14, y - 14, w + 28, h + 14); ctx.stroke(); ctx.restore();
          arche(ctx, x, y, w, h); photoDans(ctx, p, x, y, w, h, d.A);
          if (VT.enPromo(p)) pastilleTexte(ctx, x + w - 8, y + w * 0.16, P ? 88 : 70, remiseTexte(p), A, encre(A));
        } }),
        blocTexte(ctx, p.nom, { t: P ? 80 : 60, min: P ? 50 : 40, lignes: 2, fam: SERIF, poids: 700, couleur: '#2a211c', maxL: L, x: cx, il: 1.12 }),
        blocPrix(ctx, p, { t: P ? 74 : 56, couleur: A, ancien: '#9a8b80', maxL: L, x: cx }),
        blocDetails(ctx, d, { t: P ? 32 : 26, couleur: '#6f6259', maxL: L, x: cx, contour: '#e8dfd6' }),
        blocTexte(ctx, texteStock(d), { t: P ? 32 : 26, fam: SANS, poids: 800, couleur: '#b42318', maxL: L, x: cx, option: 3 }),
        blocCta(ctx, d, { h: P ? 100 : 82, maxL: L, x: cx, fond: A, encre: encre(A), numCouleur: '#4a3f38' })
      ];
      tracer(disposer(blocs, P ? 110 : 82, d.H - (P ? 100 : 74), P ? 760 : 450, P ? 1060 : 600, P ? 26 : 12));
    },
    cellule: function (ctx, d, p, z) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = rgba(d.Al, 0.35); ctx.lineWidth = 1.5; ctx.strokeRect(z.x, z.y, z.w, z.h);
      celluleTexte(ctx, d, p, z, { pad: z.w * 0.05, fam: SERIF, poids: 700, nom: '#2a211c', prix: d.Al, ancien: '#9a8b80', badge: d.Al, rayon: 0, bande: 'rgba(255,255,255,.94)' });
    },
    entete: function (ctx, d, z) { enteteStd(ctx, d, z, { boutique: { fam: SERIF, poids: 700, couleur: '#2a211c' }, titre: { couleur: d.Al }, orn: d.Al }); },
    pied: function (ctx, d, z) { piedStd(ctx, d, z, { fond: d.Al, encre: encre(d.Al), num: '#4a3f38' }); }
  };

  T.promo = {
    nomFam: SANS, nomPoids: 800, maj: true,
    fond: function (ctx, d) {
      var A = d.A;
      var g = ctx.createLinearGradient(0, 0, d.W, d.H); g.addColorStop(0, clair(A, 0.08)); g.addColorStop(1, fonce(A, 0.22));
      ctx.fillStyle = g; ctx.fillRect(0, 0, d.W, d.H);
      ctx.save(); ctx.translate(d.W / 2, d.H / 2); ctx.rotate(-Math.PI / 4); ctx.fillStyle = 'rgba(255,255,255,.06)';
      for (var i = -30; i < 30; i++) ctx.fillRect(i * 110, -d.H * 1.5, 50, d.H * 3);
      ctx.restore();
    },
    seul: function (ctx, d) {
      var P = d.P, W = d.W, H = d.H, p = d.p, A = d.A, cx = W / 2, L = W - 200;
      this.fond(ctx, d);
      // bandeau haut : boutique + petit titre
      var yb = P ? 120 : 82, pw = 0;
      if (d.titre) {
        var tt = ajusterLigne(ctx, d.titre.toUpperCase(), W * 0.4, P ? 38 : 30, 20, 800, SANS), tx = raccourcir(ctx, d.titre.toUpperCase(), W * 0.4);
        ctx.font = police(tt, 800, SANS); var tw = largeur(ctx, tx), ph = tt * 1.9;
        pw = tw + tt * 1.6;
        rr(ctx, W - 64 - pw, yb - ph / 2, pw, ph, ph / 2); ctx.fillStyle = JAUNE; ctx.fill();
        ctx.fillStyle = '#111111'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(tx, W - 64 - tt * 0.8, yb + 1);
      }
      var lb = W - 128 - (pw ? pw + 30 : 0);
      var tb = ajusterLigne(ctx, d.boutique.toUpperCase(), lb, P ? 50 : 40, 20, 800, SANS);
      ctx.font = police(tb, 800, SANS); ctx.fillStyle = encre(A); ctx.textBaseline = 'middle'; ctx.textAlign = pw ? 'left' : 'center';
      ctx.fillText(raccourcir(ctx, d.boutique.toUpperCase(), lb), pw ? 64 : W / 2, yb);
      var bNom, bCta;
      var blocs = [
        blocPhoto(ctx, { ecart: 70, pad: 26, draw: function (y, h) {
          var w = Math.min(P ? 860 : 620, h * (P ? 0.9 : 1.12)), x = cx - w / 2;
          ctx.save(); ctx.translate(cx, y + h / 2); ctx.rotate(-0.04); ctx.translate(-cx, -(y + h / 2));
          ombre(ctx, 'rgba(0,0,0,.35)', 40, 18); rr(ctx, x - 16, y - 16, w + 32, h + 32, 30); ctx.fillStyle = '#ffffff'; ctx.fill(); sansOmbre(ctx);
          rr(ctx, x, y, w, h, 18); photoDans(ctx, p, x, y, w, h, A);
          ctx.restore();
          var mac = VT.enPromo(p) ? remiseTexte(p) : '';
          if (mac) {
            var r = P ? 150 : 118;
            ctx.save(); ctx.translate(x + w - r * 0.35, y + r * 0.55); ctx.rotate(0.18);
            ombre(ctx, 'rgba(0,0,0,.3)', 20, 8); macaron(ctx, 0, 0, r, JAUNE, 20); sansOmbre(ctx);
            ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            var t1 = ajusterLigne(ctx, mac, r * 1.45, r * 0.6, 20, 800, SANS); ctx.font = police(t1, 800, SANS); ctx.fillText(mac, 0, -r * 0.08);
            ctx.font = police(r * 0.2, 800, SANS); ctx.fillText('PROMO', 0, r * 0.38);
            ctx.restore();
          }
        } }),
        bNom = blocTexte(ctx, p.nom, { t: P ? 62 : 46, min: 30, lignes: 2, fam: SANS, poids: 800, maj: true, couleur: '#ffffff', maxL: L - 40, x: cx, il: 1.1, ecart: 10 }),
        blocPrix(ctx, p, { t: P ? 100 : 74, couleur: JAUNE, ancien: 'rgba(255,255,255,.65)', maxL: L - 40, x: cx, ecart: 6 }),
        blocDetails(ctx, d, { t: P ? 30 : 24, couleur: 'rgba(255,255,255,.85)', maxL: L - 40, x: cx, contour: '#ffffff' }),
        blocTexte(ctx, texteStock(d), { t: P ? 32 : 26, fam: SANS, poids: 800, couleur: JAUNE, maxL: L, x: cx, option: 3 }),
        bCta = blocCta(ctx, d, { h: P ? 96 : 78, maxL: L - 20, x: cx, fond: VERT, encre: '#ffffff', numCouleur: '#ffffff', ombre: 'rgba(0,0,0,.25)' })
      ];
      var pos = disposer(blocs, P ? 210 : 140, H - (P ? 130 : 86), P ? 740 : 420, P ? 1040 : 560, P ? 22 : 10);
      var a = position(pos, bNom), b = position(pos, bCta);
      if (a && b) {
        var y0 = a.y - (P ? 46 : 34), y1 = b.y + b.h + (P ? 40 : 30);
        rr(ctx, 48, y0, W - 96, y1 - y0, 36); ctx.fillStyle = 'rgba(12,10,10,.84)'; ctx.fill();
      }
      tracer(pos);
    },
    cellule: function (ctx, d, p, z) {
      ctx.save(); ombre(ctx, 'rgba(0,0,0,.28)', 22, 10); rr(ctx, z.x, z.y, z.w, z.h, 22); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
      celluleTexte(ctx, d, p, z, { pad: z.w * 0.045, fam: SANS, poids: 800, maj: true, nom: '#151515', prix: '#111111', etiquette: JAUNE, ancien: '#8a8a8a', badge: '#e11d48', rayon: 16 });
    },
    entete: function (ctx, d, z) { enteteStd(ctx, d, z, { boutique: { fam: SANS, poids: 800, couleur: encre(d.A), maj: true }, titre: { couleur: '#111', fond: JAUNE }, orn: null }); },
    pied: function (ctx, d, z) { piedStd(ctx, d, z, { fond: VERT, encre: '#fff', num: encre(d.A), ombre: 'rgba(0,0,0,.25)' }); }
  };

  T.wax = {
    marge: 64, margeV: 34,
    fond: function (ctx, d) { ctx.fillStyle = motifWax(ctx, d.A); ctx.fillRect(0, 0, d.W, d.H); },
    panneau: function (ctx, x, y, w, h, d) {
      ctx.save(); ombre(ctx, 'rgba(0,0,0,.35)', 30, 10); rr(ctx, x, y, w, h, 40); ctx.fillStyle = '#fbf4e6'; ctx.fill(); sansOmbre(ctx);
      rr(ctx, x + 14, y + 14, w - 28, h - 28, 30); ctx.strokeStyle = d.Al; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    },
    seul: function (ctx, d) {
      var P = d.P, W = d.W, H = d.H, p = d.p, A = d.Al, cx = W / 2, M = P ? 70 : 58, L = W - 2 * M - 110;
      this.fond(ctx, d); this.panneau(ctx, M, M, W - 2 * M, H - 2 * M, d);
      var blocs = [
        blocTexte(ctx, d.boutique, { t: P ? 58 : 44, min: 28, fam: SERIF, poids: 700, couleur: A, maxL: L, x: cx, lie: !!d.titre, ecart: 6 }),
        blocEspace(ctx, d.titre, { t: P ? 28 : 22, esp: 6, maxL: L, x: cx, couleur: '#9a6b12', option: 2 }),
        blocPhoto(ctx, { pad: 22, draw: function (y, h) {
          var rond = !P && h < 620, w = rond ? h : Math.min(L + 40, h * 0.86), x = cx - w / 2;
          ctx.save();
          if (rond) { ctx.beginPath(); ctx.arc(cx, y + h / 2, h / 2 + 16, 0, Math.PI * 2); ctx.fillStyle = A; ctx.fill(); ctx.beginPath(); ctx.arc(cx, y + h / 2, h / 2 + 6, 0, Math.PI * 2); ctx.fillStyle = '#e8a317'; ctx.fill(); ctx.beginPath(); ctx.arc(cx, y + h / 2, h / 2, 0, Math.PI * 2); }
          else { rr(ctx, x - 16, y - 16, w + 32, h + 32, 46); ctx.fillStyle = A; ctx.fill(); rr(ctx, x - 6, y - 6, w + 12, h + 12, 38); ctx.fillStyle = '#e8a317'; ctx.fill(); rr(ctx, x, y, w, h, 32); }
          ctx.restore();
          photoDans(ctx, p, x, y, w, h, d.A);
          if (VT.enPromo(p)) {
            var r = P ? 84 : 66, bx = rond ? cx + h * 0.36 : x + w - 10, by = rond ? y + h * 0.12 : y + 30;
            pastilleTexte(ctx, bx, by, r, remiseTexte(p), '#1d1a33', '#ffd88a', 16);
          }
        } }),
        blocTexte(ctx, p.nom, { t: P ? 76 : 54, min: 36, lignes: 2, fam: SERIF, poids: 700, couleur: '#2b1d14', maxL: L, x: cx, il: 1.12 }),
        blocPrix(ctx, p, { t: P ? 70 : 52, couleur: A, ancien: '#9a8070', maxL: L, x: cx }),
        blocDetails(ctx, d, { t: P ? 30 : 24, couleur: '#6b5444', maxL: L, x: cx, contour: '#e9dcc2' }),
        blocTexte(ctx, texteStock(d), { t: P ? 30 : 24, fam: SANS, poids: 800, couleur: '#b42318', maxL: L, x: cx, option: 3 }),
        blocCta(ctx, d, { h: P ? 96 : 76, maxL: L, x: cx, fond: A, encre: encre(A), numCouleur: '#4a3426' })
      ];
      tracer(disposer(blocs, M + (P ? 70 : 40), H - M - (P ? 66 : 40), P ? 720 : 420, P ? 1000 : 560, P ? 24 : 10));
    },
    cellule: function (ctx, d, p, z) {
      rr(ctx, z.x, z.y, z.w, z.h, 22); ctx.fillStyle = '#fbf4e6'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#e8a317'; ctx.stroke();
      celluleTexte(ctx, d, p, z, { pad: z.w * 0.06, fam: SERIF, poids: 700, nom: '#2b1d14', prix: d.Al, ancien: '#9a8070', badge: '#1d1a33', badgeEncre: '#ffd88a', rayon: 14, bande: 'rgba(251,244,230,.95)' });
    },
    entete: function (ctx, d, z) {
      this.panneau(ctx, z.x - 10, z.y + 6, z.w + 20, z.h - 18, d);
      enteteStd(ctx, d, { x: z.x, y: z.y + 6, w: z.w, h: z.h - 18 }, { boutique: { fam: SERIF, poids: 700, couleur: d.Al }, titre: { couleur: '#9a6b12' }, orn: null });
    },
    pied: function (ctx, d, z) {
      this.panneau(ctx, z.x - 10, z.y + 4, z.w + 20, z.h - 10, d);
      piedStd(ctx, d, { x: z.x, y: z.y + 4, w: z.w, h: z.h - 10 }, { fond: d.Al, encre: encre(d.Al), num: '#4a3426' });
    }
  };

  var OR = ['#b8892d', '#f5d98b', '#b8892d'];
  function degradeOr(ctx, x0, x1) { var g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, OR[0]); g.addColorStop(0.5, OR[1]); g.addColorStop(1, OR[2]); return g; }
  T.nuit = {
    marge: 66, margeV: 48,
    fond: function (ctx, d) {
      var g = ctx.createRadialGradient(d.W / 2, d.H * 0.42, 40, d.W / 2, d.H * 0.42, d.H * 0.85);
      g.addColorStop(0, '#2b2522'); g.addColorStop(1, '#070606');
      ctx.fillStyle = g; ctx.fillRect(0, 0, d.W, d.H);
      var h = ctx.createRadialGradient(d.W / 2, d.H * 0.42, 10, d.W / 2, d.H * 0.42, d.W * 0.6);
      h.addColorStop(0, rgba(d.A, 0.38)); h.addColorStop(1, rgba(d.A, 0));
      ctx.fillStyle = h; ctx.fillRect(0, 0, d.W, d.H);
      ctx.strokeStyle = degradeOr(ctx, 0, d.W); ctx.lineWidth = 1.5; ctx.strokeRect(30, 30, d.W - 60, d.H - 60);
      [[0.1, 0.07, 16], [0.9, 0.12, 12], [0.84, 0.9, 18], [0.12, 0.86, 11], [0.95, 0.5, 9], [0.05, 0.4, 8]].forEach(function (s) { etoile(ctx, d.W * s[0], d.H * s[1], s[2], 'rgba(245,217,139,.75)'); });
    },
    seul: function (ctx, d) {
      var P = d.P, W = d.W, H = d.H, p = d.p, cx = W / 2, L = W - 220, or = degradeOr(ctx, 160, W - 160);
      this.fond(ctx, d);
      var blocs = [
        blocEspace(ctx, d.boutique, { t: P ? 34 : 28, esp: 8, maxL: L, x: cx, couleur: '#e9c979', lie: true, ecart: 16 }),
        { h: 14, lie: !d.titre, draw: function (y) { ornement(ctx, cx, y + 7, 110, '#d9b45f'); } },
        blocTexte(ctx, d.titre, { t: P ? 52 : 40, min: 26, fam: SERIF, poids: 400, style: 'italic', couleur: '#ead9b0', maxL: L, x: cx, option: 2 }),
        blocPhoto(ctx, { pad: 24, draw: function (y, h) {
          var w = Math.min(P ? 800 : 600, h * (P ? 0.85 : 1.15)), x = cx - w / 2, e = 18, c = 46;
          ctx.save(); ctx.strokeStyle = or; ctx.lineWidth = 2; ctx.strokeRect(x - e, y - e, w + 2 * e, h + 2 * e);
          ctx.lineWidth = 6;
          [[x - e, y - e, 1, 1], [x + w + e, y - e, -1, 1], [x - e, y + h + e, 1, -1], [x + w + e, y + h + e, -1, -1]].forEach(function (k) {
            ctx.beginPath(); ctx.moveTo(k[0] + k[2] * c, k[1]); ctx.lineTo(k[0], k[1]); ctx.lineTo(k[0], k[1] + k[3] * c); ctx.stroke();
          });
          ctx.restore();
          ctx.beginPath(); ctx.rect(x, y, w, h); photoDans(ctx, p, x, y, w, h, d.A);
          if (VT.enPromo(p)) pastilleTexte(ctx, x + w, y + 10, P ? 84 : 66, remiseTexte(p), '#e9c979', '#14110f');
        } }),
        blocTexte(ctx, p.nom, { t: P ? 78 : 58, min: 36, lignes: 2, fam: SERIF, poids: 700, couleur: '#f7f1e6', maxL: L, x: cx, il: 1.12 }),
        blocPrix(ctx, p, { t: P ? 72 : 54, couleur: or, ancien: 'rgba(247,241,230,.5)', maxL: L, x: cx }),
        blocDetails(ctx, d, { t: P ? 30 : 24, couleur: '#cfc5b3', maxL: L, x: cx, contour: '#e9c979' }),
        blocTexte(ctx, texteStock(d), { t: P ? 30 : 24, fam: SANS, poids: 800, couleur: '#f5d98b', maxL: L, x: cx, option: 3 }),
        blocCta(ctx, d, { h: P ? 96 : 78, maxL: L, x: cx, contour: or, lw: 3, encre: '#f0d48a', numCouleur: '#d9c39a' })
      ];
      tracer(disposer(blocs, P ? 110 : 76, H - (P ? 100 : 68), P ? 740 : 450, P ? 1040 : 580, P ? 26 : 12));
    },
    cellule: function (ctx, d, p, z) {
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = degradeOr(ctx, z.x, z.x + z.w); ctx.lineWidth = 2; ctx.strokeRect(z.x, z.y, z.w, z.h);
      celluleTexte(ctx, d, p, z, { pad: z.w * 0.05, fam: SERIF, poids: 700, nom: '#f7f1e6', prix: '#f0d48a', ancien: 'rgba(247,241,230,.5)', badge: '#e9c979', badgeEncre: '#14110f', rayon: 0, bande: 'rgba(14,11,9,.86)' });
    },
    entete: function (ctx, d, z) { enteteStd(ctx, d, z, { boutique: { fam: SERIF, poids: 700, couleur: '#f0d48a' }, titre: { couleur: '#ead9b0', italique: true }, orn: '#d9b45f' }); },
    pied: function (ctx, d, z) { piedStd(ctx, d, z, { contour: degradeOr(ctx, z.x, z.x + z.w), encre: '#f0d48a', num: '#d9c39a' }); }
  };

  T.pastel = {
    nomFam: SANS, nomPoids: 800,
    fond: function (ctx, d) {
      var A = d.A, c1 = clair(A, 0.87), c2 = melange(clair(A, 0.85), '#ffe1cc', 0.65);
      var g = ctx.createLinearGradient(0, 0, d.W, d.H); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, d.W, d.H);
      [[0.92, 0.08, 0.38, clair(A, 0.62), 0.55], [0.04, 0.78, 0.34, '#ffcdb5', 0.55], [0.75, 0.97, 0.24, clair(A, 0.7), 0.5]].forEach(function (b) {
        ctx.beginPath(); ctx.arc(d.W * b[0], d.H * b[1], d.W * b[2], 0, Math.PI * 2); ctx.fillStyle = rgba(b[3], b[4]); ctx.fill();
      });
      ctx.fillStyle = rgba(A, 0.16);
      for (var i = 0; i < 6; i++) for (var j = 0; j < 6; j++) { ctx.beginPath(); ctx.arc(60 + i * 26, d.H * 0.32 + j * 26, 4, 0, Math.PI * 2); ctx.fill(); }
    },
    seul: function (ctx, d) {
      var P = d.P, W = d.W, H = d.H, p = d.p, A = d.Al, cx = W / 2, L = W - 200, sombre = fonce(d.A, 0.55);
      this.fond(ctx, d);
      var blocs = [
        { h: P ? 76 : 62, ecart: 0, lie: false, draw: function (y, h) {
          var w2 = 0, tt = '';
          if (d.titre) {
            var t2 = ajusterLigne(ctx, d.titre, W * 0.36, P ? 30 : 24, 18, 800, SANS); ctx.font = police(t2, 800, SANS);
            tt = raccourcir(ctx, d.titre, W * 0.36); w2 = largeur(ctx, tt) + h * 0.8;
          }
          var lb = (w2 ? W - 140 - w2 - 24 : W - 200) - h * 0.8;
          var t = ajusterLigne(ctx, d.boutique, lb, P ? 32 : 26, 18, 800, SANS);
          ctx.font = police(t, 800, SANS);
          var nb = raccourcir(ctx, d.boutique, lb), w = largeur(ctx, nb) + h * 0.8, x = w2 ? 70 : cx - w / 2;
          rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill();
          ctx.fillStyle = A; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nb, x + w / 2, y + h / 2 + 1);
          if (w2) {
            ctx.font = police(t2, 800, SANS);
            rr(ctx, W - 70 - w2, y, w2, h, h / 2); ctx.fillStyle = A; ctx.fill();
            ctx.fillStyle = encre(A); ctx.fillText(tt, W - 70 - w2 / 2, y + h / 2 + 1);
          }
        } },
        blocPhoto(ctx, { pad: 22, draw: function (y, h) {
          var w = Math.min(P ? 840 : 620, h * (P ? 0.86 : 1.12)), x = cx - w / 2;
          ctx.save(); ombre(ctx, rgba(fonce(d.A, 0.4), 0.28), 46, 18); rr(ctx, x - 18, y - 18, w + 36, h + 36, 64); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
          rr(ctx, x, y, w, h, 48); photoDans(ctx, p, x, y, w, h, d.A);
          if (VT.enPromo(p)) { var rp = P ? 86 : 66; pastilleTexte(ctx, x + w - rp - 14, y + rp + 14, rp, remiseTexte(p), '#ffffff', A); }
        } }),
        blocTexte(ctx, p.nom, { t: P ? 68 : 52, min: 32, lignes: 2, fam: SANS, poids: 800, couleur: sombre, maxL: L, x: cx, il: 1.14 }),
        (function () {
          var t = P ? 66 : 50;
          while (t > 26 && mesurePrix(ctx, p, { t: t }).w > L - 80) t -= 2;
          var hp = t * 1.55;
          return { h: hp, draw: function (y) {
            var m = mesurePrix(ctx, p, { t: t }), w = m.w + t * 1.3;
            ctx.save(); ombre(ctx, 'rgba(0,0,0,.08)', 18, 6); rr(ctx, cx - w / 2, y, w, hp, hp / 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
            dessinerPrix(ctx, p, { t: t, couleur: A, ancien: '#a19aa6', align: 'center' }, cx, y + (hp - t) / 2 + t * 0.04);
          } };
        })(),
        blocDetails(ctx, d, { t: P ? 30 : 24, couleur: fonce(d.A, 0.45), maxL: L, x: cx, contour: '#ffffff' }),
        blocTexte(ctx, texteStock(d), { t: P ? 30 : 24, fam: SANS, poids: 800, couleur: '#c2185b', maxL: L, x: cx, option: 3 }),
        blocCta(ctx, d, { h: P ? 96 : 78, maxL: L, x: cx, fond: A, encre: encre(A), numCouleur: sombre, ombre: rgba(fonce(d.A, 0.3), 0.3) })
      ];
      tracer(disposer(blocs, P ? 96 : 56, H - (P ? 100 : 62), P ? 740 : 430, P ? 1040 : 580, P ? 24 : 10));
    },
    cellule: function (ctx, d, p, z) {
      ctx.save(); ombre(ctx, rgba(fonce(d.A, 0.4), 0.2), 26, 10); rr(ctx, z.x, z.y, z.w, z.h, 30); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
      celluleTexte(ctx, d, p, z, { pad: z.w * 0.05, fam: SANS, poids: 800, nom: fonce(d.A, 0.55), prix: d.Al, ancien: '#a19aa6', badge: d.Al, rayon: 22 });
    },
    entete: function (ctx, d, z) { enteteStd(ctx, d, z, { boutique: { fam: SANS, poids: 800, couleur: fonce(d.A, 0.55) }, titre: { couleur: encre(d.Al), fond: d.Al }, orn: null }); },
    pied: function (ctx, d, z) { piedStd(ctx, d, z, { fond: d.Al, encre: encre(d.Al), num: fonce(d.A, 0.55) }); }
  };

  T.magazine = {
    fond: function (ctx, d) {
      var g = ctx.createLinearGradient(0, 0, 0, d.H); g.addColorStop(0, fonce(d.A, 0.55)); g.addColorStop(1, '#0d0d0d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, d.W, d.H);
    },
    seul: function (ctx, d) {
      var P = d.P, W = d.W, H = d.H, p = d.p, A = d.A, M = 64, L = W - 2 * M;
      ctx.beginPath(); ctx.rect(0, 0, W, H); photoDans(ctx, p, 0, 0, W, H, A);
      var g = ctx.createLinearGradient(0, 0, 0, H * 0.32); g.addColorStop(0, 'rgba(0,0,0,.62)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.32);
      var g2 = ctx.createLinearGradient(0, H * 0.38, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.45, 'rgba(0,0,0,.6)'); g2.addColorStop(1, 'rgba(0,0,0,.9)');
      ctx.fillStyle = g2; ctx.fillRect(0, H * 0.38, W, H * 0.62);
      // titre de une
      var tm = ajusterLigne(ctx, d.boutique, L, P ? 150 : 118, 46, 700, SERIF);
      ctx.font = police(tm, 700, SERIF); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var ym = P ? 90 : 48;
      ctx.fillText(raccourcir(ctx, d.boutique, L), W / 2, ym);
      var yl = ym + tm * 1.12;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(M, yl, L, 2);
      ctx.font = police(P ? 26 : 22, 600, SANS); ctx.textBaseline = 'top';
      texteEspace(ctx, (d.titre || VT.categorie(p.categorie).nom).toUpperCase(), M, yl + 14, 5, 'left');
      texteEspace(ctx, (VT.MOIS[new Date().getMonth()] + ' ' + new Date().getFullYear()).toUpperCase(), W - M, yl + 14, 5, 'right');
      if (VT.enPromo(p)) pastilleTexte(ctx, W - M - (P ? 90 : 70), yl + (P ? 170 : 130), P ? 96 : 76, remiseTexte(p), A, encre(A));
      // bas de page, de bas en haut
      var y = H - (P ? 110 : 64);
      var cta = blocCta(ctx, d, { h: P ? 92 : 74, maxL: L, x: M, align: 'left', fond: '#ffffff', encre: '#111111', numCouleur: '#ffffff' });
      y -= cta.h; cta.draw(y);
      var st = texteStock(d);
      if (st) { var bs = blocTexte(ctx, st, { t: P ? 30 : 24, fam: SANS, poids: 800, couleur: JAUNE, maxL: L, x: M, align: 'left' }); y -= bs.h + 18; bs.draw(y); }
      var det = blocDetails(ctx, d, { t: P ? 30 : 24, couleur: 'rgba(255,255,255,.88)', maxL: L, x: M, align: 'left', contour: '#ffffff' });
      if (det && (P || !st)) { y -= det.h + 22; det.draw(y); }
      var tp = P ? 64 : 50;
      while (tp > 26 && mesurePrix(ctx, p, { t: tp }).w > L - 60) tp -= 2;
      var mp = mesurePrix(ctx, p, { t: tp }), hp = tp * 1.5, wp = mp.w + tp * 1.0;
      y -= hp + 24;
      rr(ctx, M, y, wp, hp, 14); ctx.fillStyle = A; ctx.fill();
      dessinerPrix(ctx, p, { t: tp, couleur: encre(A), ancien: encre(A) === '#ffffff' ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.55)', align: 'left' }, M + tp * 0.5, y + (hp - tp) / 2 + tp * 0.04);
      var bn = ajusterBloc(ctx, p.nom, L, P ? 3 : 2, P ? 104 : 78, 40, 700, SERIF);
      y -= bn.lignes.length * bn.t * 1.08 + 22;
      ctx.font = police(bn.t, 700, SERIF); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      bn.lignes.forEach(function (l, i) { ctx.fillText(l, M - 2, y + i * bn.t * 1.08); });
    },
    cellule: function (ctx, d, p, z) {
      ctx.save(); rr(ctx, z.x, z.y, z.w, z.h, 18); photoDans(ctx, p, z.x, z.y, z.w, z.h, d.A); ctx.restore();
      ctx.save(); rr(ctx, z.x, z.y, z.w, z.h, 18); ctx.clip();
      var g = ctx.createLinearGradient(0, z.y + z.h * 0.25, 0, z.y + z.h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,.62)'); g.addColorStop(1, 'rgba(0,0,0,.92)');
      ctx.fillStyle = g; ctx.fillRect(z.x, z.y, z.w, z.h); ctx.restore();
      var pad = z.w * 0.07, tn = Math.min(42, z.w * 0.1), tp = Math.min(46, z.w * 0.115);
      var bp = blocPrix(ctx, p, { t: tp, couleur: '#ffffff', ancien: 'rgba(255,255,255,.65)', maxL: z.w - 2 * pad, x: z.x + pad, align: 'left' });
      bp.draw(z.y + z.h - pad - bp.h);
      var bn = ajusterBloc(ctx, p.nom, z.w - 2 * pad, 2, tn, Math.max(18, tn * 0.75), 700, SERIF);
      ctx.save(); ombre(ctx, 'rgba(0,0,0,.8)', 10, 2);
      ctx.font = police(bn.t, 700, SERIF); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var yn = z.y + z.h - pad - bp.h - 8 - bn.lignes.length * bn.t * 1.08;
      bn.lignes.forEach(function (l, i) { ctx.fillText(l, z.x + pad, yn + i * bn.t * 1.08); });
      ctx.restore();
      if (VT.enPromo(p)) pastilleTexte(ctx, z.x + z.w - z.w * 0.14, z.y + z.w * 0.14, z.w * 0.11, remiseTexte(p), d.A, encre(d.A));
      if (VT.suiviStock(p) && p.stock <= 0) epuise(ctx, z);
    },
    entete: function (ctx, d, z) { enteteStd(ctx, d, z, { boutique: { fam: SERIF, poids: 700, couleur: '#ffffff' }, titre: { couleur: 'rgba(255,255,255,.85)' }, orn: null, filet: '#ffffff' }); },
    pied: function (ctx, d, z) { piedStd(ctx, d, z, { fond: '#ffffff', encre: '#111', num: '#ffffff' }); }
  };

  // ------------------------------------------------------------ Catalogue en grille (4, 6 ou 9 produits)
  function epuise(ctx, z) {
    var h = Math.max(30, z.w * 0.12);
    ctx.save(); ctx.fillStyle = 'rgba(180,35,24,.92)'; ctx.fillRect(z.x, z.y + z.w * 0.08, z.w, h);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = police(h * 0.5, 800, SANS);
    ctx.fillText('ÉPUISÉ', z.x + z.w / 2, z.y + z.w * 0.08 + h / 2 + 1); ctx.restore();
  }
  // Hauteur du texte sous la photo (nom sur n lignes + prix)
  function hTexteCellule(z, n, etiquette) {
    var tn = Math.min(40, z.w * 0.095), tp = Math.min(48, z.w * 0.118), pad = z.w * 0.05;
    return tn * 1.2 * n + tn * 0.08 + tp * 1.15 + pad * 1.4 + (etiquette ? tp * 0.35 : 0);
  }
  function prixCellule(ctx, p, s, x, y, maxL, tp, align) {
    if (s.etiquette) {
      var t2 = tp; while (t2 > 14 && mesurePrix(ctx, p, { t: t2 }).w > maxL - t2) t2 -= 1;
      var m = mesurePrix(ctx, p, { t: t2 }), w = m.w + t2 * 0.9, h = t2 * 1.35, x0 = align === 'left' ? x : x - w / 2;
      rr(ctx, x0, y, w, h, 10); ctx.fillStyle = s.etiquette; ctx.fill();
      dessinerPrix(ctx, p, { t: t2, couleur: s.prix, ancien: 'rgba(0,0,0,.5)', align: 'center' }, x0 + w / 2, y + (h - t2) / 2 + t2 * 0.04);
      return h;
    }
    var bp = blocPrix(ctx, p, { t: tp, couleur: s.prix, ancien: s.ancien, maxL: maxL, x: x, align: align });
    bp.draw(y);
    return bp.h;
  }
  function decorPhoto(ctx, d, p, x, y, w, h, s) {
    if (VT.suiviStock(p) && p.stock <= 0) epuise(ctx, { x: x, y: y, w: w, h: h });
    if (VT.enPromo(p)) { var r = Math.min(w * 0.12, h * 0.2, 56); pastilleTexte(ctx, x + w - r * 1.15, y + r * 1.15, r, remiseTexte(p), s.badge, s.badgeEncre || encre(s.badge)); }
  }
  function celluleTexte(ctx, d, p, z, s) {
    var pad = s.pad, tn = Math.min(40, z.w * 0.095), tp = Math.min(48, z.w * 0.118), nl = d.lignesNom || 1, mode = d.modeCellule || 'pile';
    var nom = s.maj ? p.nom.toUpperCase() : p.nom;
    if (mode === 'cote') {
      var c = Math.min(z.h - 2 * pad, z.w * 0.5), tw = z.w - c - 3 * pad, x = z.x + 2 * pad + c, tn2 = Math.min(44, tw * 0.2), tp2 = Math.min(52, tw * 0.22);
      rr(ctx, z.x + pad, z.y + pad, c, c, s.rayon); photoDans(ctx, p, z.x + pad, z.y + pad, c, c, d.A);
      decorPhoto(ctx, d, p, z.x + pad, z.y + pad, c, c, s);
      var b = ajusterBloc(ctx, nom, tw, 3, tn2, Math.max(18, tn2 * 0.7), s.poids, s.fam);
      var hb = b.lignes.length * b.t * 1.16, hp = s.etiquette ? tp2 * 1.35 : tp2 * 1.02, y = z.y + (z.h - hb - hp - tn2 * 0.5) / 2;
      ctx.font = police(b.t, s.poids, s.fam); ctx.fillStyle = s.nom; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      b.lignes.forEach(function (l, i) { ctx.fillText(l, x, y + i * b.t * 1.16); });
      prixCellule(ctx, p, s, x, y + hb + tn2 * 0.5, tw, tp2, 'left');
      return;
    }
    var pw = z.w - 2 * pad, cx = z.x + z.w / 2;
    if (mode === 'bande') {
      var ph0 = z.h - 2 * pad, hb2 = hTexteCellule(z, nl, s.etiquette) - pad * 0.6;
      rr(ctx, z.x + pad, z.y + pad, pw, ph0, s.rayon); photoDans(ctx, p, z.x + pad, z.y + pad, pw, ph0, d.A);
      decorPhoto(ctx, d, p, z.x + pad, z.y + pad, pw, ph0 - hb2, s);
      var yb = z.y + pad + ph0 - hb2;
      ctx.save(); rr(ctx, z.x + pad, z.y + pad, pw, ph0, s.rayon); ctx.clip(); ctx.fillStyle = s.bande || 'rgba(255,255,255,.93)'; ctx.fillRect(z.x + pad, yb, pw, hb2); ctx.restore();
      ecrireNom(ctx, nom, s, cx, yb + pad * 0.5, pw - pad, tn, nl);
      prixCellule(ctx, p, s, cx, yb + pad * 0.5 + tn * 1.2 * nl + tn * 0.08, pw - pad, tp, 'center');
      return;
    }
    var ph = z.h - hTexteCellule(z, nl, s.etiquette) - pad;
    rr(ctx, z.x + pad, z.y + pad, pw, ph, s.rayon); photoDans(ctx, p, z.x + pad, z.y + pad, pw, ph, d.A);
    decorPhoto(ctx, d, p, z.x + pad, z.y + pad, pw, ph, s);
    var y2 = z.y + pad + ph + pad * 0.7;
    ecrireNom(ctx, nom, s, cx, y2, z.w - 2 * pad, tn, nl);
    prixCellule(ctx, p, s, cx, y2 + tn * 1.2 * nl + tn * 0.08, z.w - 2 * pad, tp, 'center');
  }
  function ecrireNom(ctx, nom, s, cx, y, maxL, tn, nl) {
    var bn = ajusterBloc(ctx, nom, maxL, nl, tn, Math.max(18, tn * 0.78), s.poids, s.fam);
    ctx.font = police(bn.t, s.poids, s.fam); ctx.fillStyle = s.nom; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var y0 = y + (nl - bn.lignes.length) * tn * 0.6;
    bn.lignes.forEach(function (l, i) { ctx.fillText(l, cx, y0 + i * tn * 1.2 + (tn - bn.t) / 2); });
  }
  function enteteStd(ctx, d, z, s) {
    var cx = z.x + z.w / 2, titre = d.titre || 'Disponible maintenant';
    var tt = d.P ? 34 : (z.h < 190 ? 22 : 26), ht = tt * 1.9;
    var tb = ajusterLigne(ctx, s.boutique.maj ? d.boutique.toUpperCase() : d.boutique, z.w * 0.94, Math.min(d.P ? 96 : 70, (z.h - ht - 18 - 24) / 1.1), 28, s.boutique.poids, s.boutique.fam);
    var total = tb * 1.1 + 18 + ht;
    var y = z.y + (z.h - total) / 2;
    ctx.font = police(tb, s.boutique.poids, s.boutique.fam); ctx.fillStyle = s.boutique.couleur; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(raccourcir(ctx, s.boutique.maj ? d.boutique.toUpperCase() : d.boutique, z.w * 0.94), cx, y);
    y += tb * 1.1 + 18;
    if (s.titre.fond) {
      var t = ajusterLigne(ctx, titre.toUpperCase(), z.w * 0.7, tt, 14, 800, SANS); ctx.font = police(t, 800, SANS);
      var w = largeurEspace(ctx, titre.toUpperCase(), 3) + ht;
      rr(ctx, cx - w / 2, y, w, ht, ht / 2); ctx.fillStyle = s.titre.fond; ctx.fill();
      ctx.fillStyle = s.titre.couleur; ctx.textBaseline = 'middle'; texteEspace(ctx, titre.toUpperCase(), cx, y + ht / 2 + 1, 3, 'center');
    } else if (s.titre.italique) {
      ctx.font = police(tt * 1.3, 400, SERIF, 'italic'); ctx.fillStyle = s.titre.couleur; ctx.textBaseline = 'middle';
      ctx.fillText(raccourcir(ctx, titre, z.w * 0.8), cx, y + ht / 2);
      if (s.orn) { ornement(ctx, cx - z.w * 0.36, y + ht / 2, 40, s.orn); ornement(ctx, cx + z.w * 0.36, y + ht / 2, 40, s.orn); }
    } else {
      ctx.font = police(tt, 600, SANS); ctx.fillStyle = s.titre.couleur; ctx.textBaseline = 'middle';
      if (s.filet) { ctx.fillStyle = s.filet; ctx.fillRect(z.x, y, z.w, 2); ctx.fillStyle = s.titre.couleur; }
      texteEspace(ctx, raccourcir(ctx, titre.toUpperCase(), z.w * 0.8), cx, y + ht / 2 + 2, 5, 'center');
      if (s.orn) ornement(ctx, cx, y + ht + 4, 70, s.orn);
    }
  }
  function piedStd(ctx, d, z, s) {
    var cx = z.x + z.w / 2, ts = d.P ? 30 : 23;
    var extra = d.slogan ? ts * 1.5 + (d.P ? 14 : 8) : 0, num = d.opt.numero && d.numero;
    var hc = Math.min(d.P ? 100 : 78, (z.h - extra - 8) / (num ? 1.56 : 1));
    var b = blocCta(ctx, d, { h: hc, maxL: z.w * 0.94, x: cx, fond: s.fond, contour: s.contour, lw: 3, encre: s.encre, numCouleur: s.num, ombre: s.ombre });
    var y = z.y + (z.h - b.h - extra) / 2;
    b.draw(y);
    if (d.slogan) {
      ctx.font = police(ts, 600, SANS); ctx.fillStyle = s.num; ctx.globalAlpha = 0.85; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(raccourcir(ctx, d.slogan, z.w * 0.94), cx, y + b.h + (d.P ? 14 : 8)); ctx.globalAlpha = 1;
    }
  }
  function grille(ctx, d, M) {
    var W = d.W, H = d.H, P = d.P, n = d.produits.length;
    var cols = n <= 4 ? 2 : (n <= 6 ? (P ? 2 : 3) : 3), rows = Math.ceil(n / cols);
    var marge = M.marge || 56, mv = M.margeV || marge * 0.5, gap = P ? 30 : 22;
    M.fond(ctx, d);
    var hE = P ? 280 : 172, hP = P ? 250 : (d.slogan ? 172 : 144);
    if (n >= 9 && !P) { hE = 150; hP = d.slogan ? 156 : 132; }
    M.entete(ctx, d, { x: marge, y: mv, w: W - 2 * marge, h: hE });
    var gy0 = mv + hE + (P ? 20 : 8), gy1 = H - mv - hP - (P ? 16 : 8);
    var cw = (W - 2 * marge - (cols - 1) * gap) / cols, ch = (gy1 - gy0 - (rows - 1) * gap) / rows;
    var tn = Math.min(40, cw * 0.095), mx = cw - 2 * cw * 0.06;
    ctx.font = police(tn * 0.8, M.nomPoids || 700, M.nomFam || SERIF);
    d.lignesNom = d.produits.some(function (p) { return largeur(ctx, M.maj ? p.nom.toUpperCase() : p.nom) > mx; }) ? 2 : 1;
    var zc = { w: cw, h: ch };
    if (cw / ch >= 1.3 && cw - Math.min(ch, cw * 0.5) - cw * 0.15 >= 130) d.modeCellule = 'cote';
    else {
      d.modeCellule = 'pile';
      if (d.lignesNom === 2 && ch - hTexteCellule(zc, 2) < ch * 0.58) d.lignesNom = 1;
      if (ch - hTexteCellule(zc, d.lignesNom) < ch * 0.55) d.modeCellule = 'bande';
    }
    d.produits.forEach(function (p, i) {
      var c = i % cols, r = Math.floor(i / cols);
      M.cellule(ctx, d, p, { x: marge + c * (cw + gap), y: gy0 + r * (ch + gap), w: cw, h: ch });
    });
    M.pied(ctx, d, { x: marge, y: H - mv - hP, w: W - 2 * marge, h: hP });
  }

  function filigrane(ctx, W, H) {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 6);
    ctx.font = police(58, 800, SANS); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (var i = -6; i <= 6; i++) { ctx.strokeText('APERÇU · PASS VITRINE', 0, i * 230); ctx.fillText('APERÇU · PASS VITRINE', 0, i * 230); }
    ctx.restore();
  }

  // o : { format, mise: 'produit' | 'grille', modele, couleur, produits: [{ …produit, img }], boutique, numero, slogan, titre, opt: { details, stock, numero }, filigrane }
  function dessiner(canvas, o) {
    return chargerPolices().then(function () {
      var F = FORMATS[o.format] || FORMATS.carre;
      canvas.width = F.l; canvas.height = F.h;
      var ctx = canvas.getContext('2d');
      var A = /^#[0-9a-f]{6}$/i.test(o.couleur || '') ? o.couleur : COULEURS[0].v;
      var d = { W: F.l, H: F.h, P: F.h > F.l * 1.3, A: A, Al: lisibleSurClair(A), boutique: String(o.boutique || 'Ma boutique').trim(), numero: o.numero || '',
        slogan: String(o.slogan || '').trim(), titre: String(o.titre || '').trim(), opt: o.opt || { details: true, stock: true, numero: true },
        produits: o.produits || [], p: (o.produits || [])[0] || { nom: 'Produit', prix: 0 } };
      var M = T[o.modele] || T.elegant;
      ctx.save();
      ctx.clearRect(0, 0, d.W, d.H);
      if (o.mise === 'grille') grille(ctx, d, M); else M.seul(ctx, d);
      ctx.restore();
      if (o.filigrane) filigrane(ctx, d.W, d.H);
      return canvas;
    });
  }
  function chargerImage(blob) {
    if (!blob) return Promise.resolve(null);
    if (racine.createImageBitmap) { try { return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return viaImg(blob); }); } catch (e) { return viaImg(blob); } }
    return viaImg(blob);
  }
  function viaImg(blob) {
    return new Promise(function (ok) {
      var u = URL.createObjectURL(blob), i = new Image();
      i.onload = function () { ok(i); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      i.onerror = function () { URL.revokeObjectURL(u); ok(null); };
      i.src = u;
    });
  }
  function versBlob(canvas, type, q) {
    return new Promise(function (ok, ko) {
      if (canvas.toBlob) canvas.toBlob(function (b) { if (b) ok(b); else ko(new Error('Image impossible à créer.')); }, type || 'image/jpeg', q || 0.92);
      else ko(new Error('Navigateur trop ancien.'));
    });
  }

  racine.VTImages = { MODELES: MODELES, COULEURS: COULEURS, FORMATS: FORMATS, modele: modele, dessiner: dessiner, chargerPolices: chargerPolices,
    chargerImage: chargerImage, versBlob: versBlob, clair: clair, fonce: fonce, encre: encre, lisibleSurClair: lisibleSurClair };
})(typeof self !== 'undefined' ? self : this);
