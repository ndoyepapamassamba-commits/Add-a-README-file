"use strict";
/* ============================================================================================================
   Montage : compilation au design de la chaîne, calculée image par image puis encodée (WebCodecs + mp4-muxer).
   Mise en page reprise de chaine.py (maquette 576 × 1024 portée à 1080 × 1920).
   ============================================================================================================ */

const W = 1080, H = 1920, IPS = 30;
const K = 1080 / 576, k = (x) => Math.round(x * K);
const Y0 = k(282), CH = k(460), Y1 = Y0 + CH, Y_BANDEAU = k(214), H_BANDEAU = k(50), CX = W / 2;
const CYAN = "rgb(37,244,238)", ROSE = "rgb(254,44,85)", JAUNE = "rgb(255,210,63)", NUIT_H = "rgb(16,9,34)", NUIT_B = "rgb(36,16,58)";
const ENCRE = "rgb(24,12,34)", SAUMON = "rgb(255,138,128)";
const COUL_PERSO = ["rgb(37,244,238)", "rgb(254,44,85)", "rgb(255,210,63)", "rgb(160,130,255)"];
const TEASER_S = 1.4, ACCROCHE_S = 2.5, REACTION_S = 2.4, T_CARTE = 1.4, FIN_S = 2.6, QUEUE = FIN_S + 1.0, BOUCLE_S = 0.5;
const MARGE_CHUTE = 2.6, REJOUE_MAX = 3.0, METRE_S = 2.0, GAG_MAX = 4.0;
const POLICE = "Montserrat, 'Arial Black', Arial, sans-serif";

function pop(u) {        // échelle élastique 0 → 1,25 → 0,94 → 1 en 0,4 s
  if (u <= 0) return 0;
  if (u < 0.18) return 1.25 * (1 - (1 - u / 0.18) ** 3);
  if (u < 0.30) { const x = (u - 0.18) / 0.12; return 1.25 - 0.31 * x * x * (3 - 2 * x); }
  if (u < 0.40) { const x = (u - 0.30) / 0.10; return 0.94 + 0.06 * x * x * (3 - 2 * x); }
  return 1;
}
const police = (taille, graisse = 900) => `${graisse} ${Math.max(6, Math.round(taille))}px ${POLICE}`;
function texteDouble(g, txt, x, y, taille, couleur = "#fff", dec = k(3), align = "center") {
  g.font = police(taille); g.textAlign = align; g.textBaseline = "middle";
  g.fillStyle = CYAN; g.fillText(txt, x - dec, y - dec);
  g.fillStyle = ROSE; g.fillText(txt, x + dec, y + dec);
  g.fillStyle = couleur; g.fillText(txt, x, y);
}
function texteContour(g, txt, x, y, taille, couleur = "#fff", contour = k(4), align = "center", graisse = 900) {
  g.font = police(taille, graisse); g.textAlign = align; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = contour * 2; g.strokeStyle = "#000"; g.strokeText(txt, x, y);
  g.fillStyle = couleur; g.fillText(txt, x, y);
}
function ajuster(g, txt, tailleMax, largeurMax, graisse = 900) {
  let t = tailleMax;
  g.font = police(t, graisse);
  while (g.measureText(txt).width > largeurMax && t > 10) { t -= 2; g.font = police(t, graisse); }
  return t;
}
function couper(g, txt, largeur, taille) {
  g.font = police(taille);
  const mots = txt.split(/\s+/), lignes = [""];
  for (const m of mots) {
    const essai = (lignes[lignes.length - 1] + " " + m).trim();
    if (g.measureText(essai).width <= largeur || !lignes[lignes.length - 1]) lignes[lignes.length - 1] = essai;
    else lignes.push(m);
  }
  return lignes;
}
function emojiTexte(g, e, x, y, taille) {
  g.font = `${Math.round(taille)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff";
  g.fillText(e, x, y);
}
function dessinerCouverture(g, src, sw, sh, x, y, w, h, zoom = 1) {
  const r = w / h;
  let cw = sw, ch = sw / r;
  if (ch > sh) { ch = sh; cw = sh * r; }
  cw /= zoom; ch /= zoom;
  g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}

// ---------- éléments fixes (calculés une fois) ----------
function fondBandes() {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  for (const [a, b] of [[0, Y0], [Y1, H]]) {
    const gr = g.createLinearGradient(0, a, 0, b);
    gr.addColorStop(0, NUIT_H); gr.addColorStop(1, NUIT_B);
    g.fillStyle = gr; g.fillRect(0, a, W, b - a);
    g.save(); g.beginPath(); g.rect(0, a, W, b - a); g.clip();
    g.strokeStyle = "rgba(255,255,255,0.04)"; g.lineWidth = 2;
    for (let x = -H; x < W + H; x += k(28)) { g.beginPath(); g.moveTo(x, a); g.lineTo(x + (b - a), b); g.stroke(); g.beginPath(); g.moveTo(x, b); g.lineTo(x + (b - a), a); g.stroke(); }
    g.restore();
  }
  g.fillStyle = CYAN; g.fillRect(0, Y0 - k(3), W, k(3));
  g.fillStyle = ROSE; g.fillRect(0, Y1, W, k(3));
  return c;
}
function logo(d) {
  const c = document.createElement("canvas"); c.width = c.height = d;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, d, d); gr.addColorStop(0, CYAN); gr.addColorStop(1, ROSE);
  g.fillStyle = gr; g.beginPath(); g.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(d / 2, d / 2, d / 2 - d * 0.06, 0, Math.PI * 2); g.clip();
  if (AVATAR) dessinerCouverture(g, AVATAR, AVATAR.width, AVATAR.height, 0, 0, d, d);
  else { g.fillStyle = JAUNE; g.fillRect(0, 0, d, d); g.fillStyle = NUIT_H; g.font = police(d * 0.55); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText((R.nom || "?")[0], d / 2, d / 2 + d * 0.04); }
  g.restore();
  return c;
}
let AVATAR = null;
function bandeauMotif() {
  const items = [R.pseudo, "ABONNE-TOI", R.nom, "PARTAGE À TA FAMILLE"];
  const c0 = document.createElement("canvas").getContext("2d");
  c0.font = police(k(20), 800);
  const sep = k(46);
  const largeur = items.reduce((a, t) => a + c0.measureText(t).width + sep + k(42), 0);
  const reps = Math.ceil((W + largeur) / largeur) + 1;   // assez de répétitions pour couvrir l'écran à tout décalage
  const c = document.createElement("canvas"); c.width = Math.ceil(largeur) * reps; c.height = H_BANDEAU;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(8,4,18,0.92)"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = CYAN; g.fillRect(0, 0, c.width, 3); g.fillStyle = ROSE; g.fillRect(0, c.height - 3, c.width, 3);
  const lg = logo(k(34));
  let x = 0;
  for (let rep = 0; rep < reps; rep++) for (const t of items) {
    g.drawImage(lg, x, (c.height - lg.height) / 2); x += lg.width + k(8);
    g.font = police(k(20), 800); g.textAlign = "left"; g.textBaseline = "middle";
    g.fillStyle = t === "ABONNE-TOI" ? JAUNE : "#fff"; g.fillText(t, x, c.height / 2 + 1);
    x += c0.measureText(t).width + sep;
  }
  return { canvas: c, periode: Math.ceil(largeur) };
}

// ---------- bandes du haut ----------
function hautAccroche(g, u) {
  const p = pop(u); if (p < 0.05) return;
  texteContour(g, R.accroche1, CX, k(112), k(30) * p);
  texteDouble(g, R.accroche2, CX - k(24), k(166), k(40) * p, JAUNE);
  g.font = police(k(40) * p); emojiTexte(g, "😂", CX - k(24) + g.measureText(R.accroche2).width / 2 + k(40) * p, k(166), k(46) * p);
}
function hautTeaser(g, u) {
  const p = pop(u); if (p < 0.05) return;
  texteContour(g, "COMMENT ON EN EST", CX, k(112), k(30) * p);
  texteDouble(g, "ARRIVÉ LÀ ?", CX - k(24), k(166), k(40) * p, JAUNE);
  g.font = police(k(40) * p); emojiTexte(g, "😱", CX - k(24) + g.measureText("ARRIVÉ LÀ ?").width / 2 + k(40) * p, k(166), k(46) * p);
}
function hautTitre(g, titre, rang, total) {
  const lab = `SKETCH ${rang}/${total}`;
  g.font = police(k(13), 800);
  const lw = g.measureText(lab).width + k(20);
  g.fillStyle = "rgba(0,0,0,0.55)"; g.strokeStyle = JAUNE; g.lineWidth = 2;
  arrondi(g, CX - lw / 2, k(78), lw, k(22), k(11)); g.fill(); g.stroke();
  g.fillStyle = JAUNE; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(lab, CX, k(89));
  const taille = ajuster(g, titre, k(40), W - k(60));
  const lignes = taille < k(30) ? couper(g, titre, W - k(60), k(34)) : [titre];
  const t2 = lignes.length > 1 ? k(34) : taille;
  lignes.slice(0, 2).forEach((l, i) => texteDouble(g, l, CX, k(140) + (i - (lignes.length - 1) / 2) * t2 * 1.12, t2, JAUNE));
}
function hautReaction(g, u, rang) {
  const choc = u < 1.0, p = pop(choc ? u : u - 1.0);
  const e = choc ? "😱" : rang % 2 ? "🤣" : "😂", mot = choc ? "LE CHOC !" : "MDR !";
  g.font = police(k(44) * Math.max(p, 0.01));
  const larg = k(96) * p + k(14) + g.measureText(mot).width, x0 = CX - larg / 2;
  emojiTexte(g, e, x0 + k(48) * p, k(150), k(80) * p);
  texteDouble(g, mot, x0 + k(96) * p + k(14), k(150), k(44) * Math.max(p, 0.01), choc ? JAUNE : "#fff", k(3), "left");
}
function hautRejoue(g, u) {
  const p = pop(u); if (p < 0.05) return;
  g.font = police(k(42) * p);
  const larg = k(80) * p + k(12) + g.measureText("REVOIS LA CHUTE !").width, x0 = CX - larg / 2;
  emojiTexte(g, "🤣", x0 + k(40) * p, k(150), k(70) * p);
  texteDouble(g, "REVOIS LA CHUTE !", x0 + k(80) * p + k(12), k(150), k(42) * p, JAUNE, k(3), "left");
}
function hautLegende(g, txt, u) {
  const p = Math.min(pop(u), 1); if (p < 0.05) return;
  let taille = k(40);
  g.font = police(taille);
  while (g.measureText(txt).width > 2 * (W - k(60)) && taille > k(24)) { taille -= 2; g.font = police(taille); }
  const lignes = couper(g, txt, W - k(60), taille * p).slice(0, 2);
  lignes.forEach((l, i) => texteContour(g, l, CX, k(150) + (i - (lignes.length - 1) / 2) * taille * 1.1, taille * p));
}
function hautMetre(g, u) { const p = pop(u); if (p > 0.05) texteDouble(g, "RIRE-O-MÈTRE", CX, k(150), k(44) * p); }
function hautFin(g, a, LOGO) {
  g.save(); g.globalAlpha = Math.min(1, a);
  const d = k(96 + 16 * Math.min(1, a));
  g.drawImage(LOGO, CX - d / 2, k(118) - d / 2, d, d);
  texteDouble(g, (R.nom || "").toUpperCase(), CX, k(196), ajuster(g, (R.nom || "").toUpperCase(), k(40), W - k(80)));
  g.font = police(k(22), 800); g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText(R.pseudo, CX, k(236));
  g.font = police(k(16), 800); g.fillStyle = JAUNE; g.fillText("ABONNE-TOI POUR LA SUITE", CX, k(264));
  g.restore();
}
function arrondi(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- sous-titres karaoké (temps estimés d'après la voix détectée) ----------
function groupesMots(s, lignes) {
  const cles = new Set((s.cles || []).flatMap((c) => normaliser(c)));
  const groupes = [];
  s.dialogue.forEach(([qui, txt], i) => {
    const l = lignes[i]; if (!l) return;
    const mots = txt.split(/\s+/).filter(Boolean);
    const fusion = [];
    for (const m of mots) { if (fusion.length && !normaliser(m).length) fusion[fusion.length - 1] += " " + m; else fusion.push(m); }
    const n = fusion.length, pas = (l.fin - l.debut) / Math.max(1, n);
    const temps = fusion.map((m, j) => ({ m, a: l.debut + j * pas, b: l.debut + (j + 1) * pas, cle: normaliser(m).some((x) => cles.has(x)) }));
    // groupes de 2 à 4 mots, coupés aux ponctuations, jamais un mot seul
    let cur = [];
    const coupes = [];
    temps.forEach((w, j) => { cur.push(w); if (/[.!?…,:]$/.test(w.m) || cur.length === 4 || j === temps.length - 1) { coupes.push(cur); cur = []; } });
    for (let j = 0; j < coupes.length; j++) {
      if (coupes[j].length === 1 && coupes.length > 1) { if (j > 0 && coupes[j - 1].length < 4) { coupes[j - 1].push(...coupes[j]); coupes.splice(j, 1); j--; } else if (coupes[j + 1]) { coupes[j + 1].unshift(...coupes[j]); coupes.splice(j, 1); j--; } }
    }
    coupes.forEach((c) => groupes.push({ mots: c, couleur: COUL_PERSO[qui % COUL_PERSO.length], chute: i === s.dialogue.length - 1 }));
  });
  groupes.forEach((gr, j) => {
    gr.debut = gr.mots[0].a - 0.05;
    const suiv = groupes[j + 1] ? groupes[j + 1].mots[0].a - 0.05 : gr.mots[gr.mots.length - 1].b + 0.6;
    gr.fin = Math.max(gr.debut + 0.3, Math.min(suiv, gr.mots[gr.mots.length - 1].b + 1.2));
  });
  return groupes;
}
function dessinerSousTitres(g, groupes, t) {
  const gr = groupes.find((x) => x.debut <= t && t < x.fin);
  if (!gr) return;
  const taille = k(40);
  g.font = police(taille);
  const esp = g.measureText(" ").width;
  const mots = gr.mots.map((w) => ({ ...w, txt: w.m.toUpperCase().replace(/[.,…]+$/, "") }));
  const largeurs = mots.map((w) => g.measureText(w.txt).width);
  // une ou deux lignes, et police réduite si un mot très long déborde
  let lignes = [mots.map((_, i) => i)];
  const lg = (idx) => idx.reduce((a, i) => a + largeurs[i], 0) + esp * (idx.length - 1);
  if (lg(lignes[0]) > W - k(100)) {
    let best = 1, bestL = Infinity;
    for (let c = 1; c < mots.length; c++) { const m = Math.max(lg([...Array(c).keys()]), lg([...Array(mots.length - c).keys()].map((x) => x + c))); if (m < bestL) { bestL = m; best = c; } }
    lignes = [[...Array(best).keys()], [...Array(mots.length - best).keys()].map((x) => x + best)];
  }
  const maxL = Math.max(...lignes.map(lg));
  const echelle = maxL > W - k(60) ? (W - k(60)) / maxL : 1;
  const tf = taille * echelle;
  g.font = police(tf);
  let y = Y1 + k(32);                  // comme chaine.py : 1re ligne en haut de la bande, jamais sur la scène
  const actif = Math.max(0, ...mots.map((w, i) => (w.a - 0.02 <= t ? i : -1)));
  for (const ligne of lignes) {
    let x = CX - lg(ligne) * echelle / 2;
    for (const i of ligne) {
      const w = mots[i], ww = largeurs[i] * echelle;
      if (i === actif) {
        const kk = 1 + 0.06 * Math.max(0, 1 - Math.max(0, t - w.a) / 0.12), pad = k(7) * kk;
        g.fillStyle = gr.chute && w.cle ? SAUMON : gr.couleur;
        arrondi(g, x - pad, y - tf * 0.62 * kk, ww + pad * 2, tf * 1.22 * kk, k(13)); g.fill();
        g.fillStyle = ENCRE; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(w.txt, x, y);
      } else {
        g.textAlign = "left"; g.textBaseline = "middle";
        g.lineJoin = "round"; g.lineWidth = k(4) * 2; g.strokeStyle = ENCRE; g.strokeText(w.txt, x, y);
        g.fillStyle = w.cle ? JAUNE : "#fff"; g.fillText(w.txt, x, y);
      }
      x += ww + esp * echelle;
    }
    y += k(50);
  }
}

// ---------- scènes spéciales ----------
function sceneRejoue(g, src, sw, sh, u, R0) {
  const z = 1.08 + 0.10 * u / Math.max(R0, 0.1);
  dessinerCouverture(g, src, sw, sh, 0, Y0, W, CH, z);
  if (Math.floor(u * 3) % 2 === 0) {
    g.fillStyle = ROSE; arrondi(g, k(18), Y0 + k(16), k(132), k(36), k(8)); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(k(34), Y0 + k(34), k(6), 0, Math.PI * 2); g.fill();
    g.font = police(k(20)); g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("REPLAY", k(48), Y0 + k(35));
  }
}
function sceneMetre(g, fondImg, u) {
  g.drawImage(fondImg, 0, Y0);
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, Y0, W, CH);
  const x0 = k(60), x1 = W - k(60), y0 = Y0 + CH * 0.40, h = k(56);
  g.fillStyle = "rgba(255,255,255,0.15)"; g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = k(4);
  arrondi(g, x0, y0, x1 - x0, h, k(28)); g.fill(); g.stroke();
  const plein = Math.min(1, 1 - (1 - Math.min(1, u / 0.8)) ** 3);
  if (plein > 0.02) {
    const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, JAUNE); gr.addColorStop(1, ROSE);
    g.fillStyle = gr; arrondi(g, x0 + k(6), y0 + k(6), (x1 - x0 - k(12)) * plein, h - k(12), k(22)); g.fill();
  }
  ["PETIT RIRE", "FOU RIRE", "MAX"].forEach((c, i) => {
    g.font = police(k(15), 800); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(c, x0 + (x1 - x0) * (i + 1) / 3.2, y0 - k(18));
  });
  if (u > 0.85) {
    const q = pop(u - 0.85);
    g.font = police(k(46) * Math.max(q, 0.01));
    const lt = g.measureText("MORT DE RIRE").width, larg = lt + k(12) + k(84) * q, xm = CX - larg / 2, ym = Y0 + CH * 0.66;
    texteDouble(g, "MORT DE RIRE", xm, ym, k(46) * Math.max(q, 0.01), JAUNE, k(3), "left");
    emojiTexte(g, "💀", xm + lt + k(12) + k(42) * q, ym, k(80) * q);
  }
}
function basCommente(g, u) {
  const p = pop(u); if (p < 0.05) return;
  texteContour(g, "TU AS RI ?", CX, Y1 + k(60), k(34) * p, "#fff", k(3));
  const appel = "ÉCRIS « DÊH » EN COMMENTAIRE";
  const t = ajuster(g, appel, k(30), W - k(40));
  texteDouble(g, appel, CX, Y1 + k(112), t * Math.min(p, 1), JAUNE, k(2));
}
function basRires(g, u) {
  ["😂", "🤣", "💀"].forEach((e, i) => { const q = pop(u - 0.15 * i); if (q > 0.05) emojiTexte(g, e, CX + (i - 1) * k(150), Y1 + k(110), k(100) * q); });
}
function sceneCarte(g, fondImg, u, titre, rang, total) {
  g.drawImage(fondImg, 0, Y0);
  g.fillStyle = "rgba(0,0,0,0.38)"; g.fillRect(0, Y0, W, CH);
  const s = pop(u), ex = W / 2, ey = Y0 + CH * 0.40;
  if (s > 0) {
    g.save(); g.translate(ex, ey); g.rotate(u * 0.8);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? "rgba(37,244,238,0.55)" : "rgba(254,44,85,0.55)";
      g.beginPath(); g.moveTo(0, 0); const a = i * Math.PI / 6, r = k(260) * Math.min(1, s);
      g.lineTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); g.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); g.fill();
    }
    g.restore();
    emojiTexte(g, "😂", ex, ey, k(140) * s);
  }
  const q = pop(u - 0.15);
  if (q > 0.05) {
    g.save(); g.translate(ex, Y0 + CH * 0.74); g.rotate(-0.05); g.scale(q, q);
    g.font = police(k(30));
    const tw = Math.min(W - k(80), g.measureText(titre).width + k(60));
    g.fillStyle = ROSE; g.fillRect(-tw / 2, -k(30), tw, k(60));
    g.strokeStyle = CYAN; g.lineWidth = k(4); g.strokeRect(-tw / 2, -k(30), tw, k(60));
    const tt = ajuster(g, titre, k(30), tw - k(30));
    g.font = police(tt); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(titre, 0, 2);
    g.font = police(k(14), 800); g.fillStyle = JAUNE; g.fillText(`SKETCH ${rang}/${total}`, 0, -k(44));
    g.restore();
  }
}
function basVote(g, a, n, credit) {
  g.save(); g.globalAlpha = Math.min(1, a);
  const q = "TON SKETCH PRÉFÉRÉ ?";
  texteDouble(g, q, CX, Y1 + k(44), ajuster(g, q, k(34), W - k(60)), JAUNE, k(2));
  g.font = police(k(30), 800); g.fillStyle = "#fff"; g.textAlign = "center";
  g.fillText([...Array(n).keys()].map((i) => i + 1).join("   "), CX, Y1 + k(96));
  g.font = police(k(18), 800); g.fillStyle = CYAN; g.fillText("RÉPONDS PAR SON NUMÉRO EN COMMENTAIRE", CX, Y1 + k(142));
  if (credit) { g.font = police(k(13), 700); g.fillStyle = "rgba(255,255,255,0.8)"; g.fillText(`Extraits 3D : ${credit}`, CX, Y1 + k(190)); }
  g.restore();
}

// ---------- lecture image par image : mp4box.js (démultiplexage) + VideoDecoder (WebCodecs) ----------
// Chercher une image avec <video>.currentTime redécode depuis l'image-clé : ≈ 90 ms par image (mesuré). En lisant les
// images DANS L'ORDRE avec le décodeur, chaque image coûte ≈ 1 à 2 ms. Retour en arrière (replay) : on repart de la clé.
function demuxer(blob) {
  return blob.arrayBuffer().then((buf) => new Promise((ok, ko) => {
    const f = MP4Box.createFile();
    let piste = null;
    const ech = [];
    f.onError = (e) => ko(new Error(`MP4 illisible : ${e}`));
    f.onReady = (info) => {
      piste = info.videoTracks[0];
      if (piste) { f.setExtractionOptions(piste.id, null, { nbSamples: Infinity }); f.start(); }
    };
    f.onSamples = (id, user, samples) => { for (const s of samples) ech.push(s); };
    buf.fileStart = 0;
    f.appendBuffer(buf);
    f.flush();
    if (!piste || !ech.length) { ko(new Error("MP4 sans piste vidéo lisible")); return; }
    const DS = typeof DataStream !== "undefined" ? DataStream : MP4Box.DataStream;
    let description;
    for (const e of f.getTrackById(piste.id).mdia.minf.stbl.stsd.entries) {
      const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
      if (box) { const ds = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(ds); description = new Uint8Array(ds.buffer, 8); break; }
    }
    const base = Math.min(...ech.map((s) => s.cts / s.timescale));
    ok({ codec: piste.codec, largeur: piste.video.width, hauteur: piste.video.height, description,
      ech: ech.map((s) => ({ data: s.data, cle: s.is_sync, t: Math.round((s.cts / s.timescale - base) * 1e6), d: Math.round(s.duration / s.timescale * 1e6) })) });
  }));
}
class Lecteur {
  constructor(info) { this.info = info; this.dec = null; this.file = []; this.courant = null; this.suivant = 0; this.fin = false; this.erreur = null; }
  get largeur() { return this.info.largeur; }
  get hauteur() { return this.info.hauteur; }
  reprendre(t) {                           // (re)part de la dernière image-clé avant t
    if (this.dec && this.dec.state !== "closed") try { this.dec.close(); } catch (e) { }
    this.file.forEach((x) => x.close()); this.file = [];
    if (this.courant) { this.courant.close(); this.courant = null; }
    this.dec = new VideoDecoder({ output: (fr) => this.file.push(fr), error: (e) => { this.erreur = e; } });
    this.dec.configure({ codec: this.info.codec, codedWidth: this.info.largeur, codedHeight: this.info.hauteur, description: this.info.description });
    const us = t * 1e6;
    let k = 0;
    this.info.ech.forEach((s, i) => { if (s.cle && s.t <= us) k = i; });
    this.suivant = k; this.fin = false;
  }
  async image(t) {
    const us = t * 1e6;
    if (!this.dec || (this.courant && this.courant.timestamp > us + 1000)) this.reprendre(t);
    for (let garde = 0; garde < 2000; garde++) {
      if (this.erreur) throw this.erreur;
      while (this.file.length && this.file[0].timestamp <= us + 1000) { if (this.courant) this.courant.close(); this.courant = this.file.shift(); }
      if ((this.file.length || this.fin) && (this.courant || this.file.length)) return this.courant || this.file[0];
      if (this.suivant < this.info.ech.length) {
        const n = Math.min(this.info.ech.length, this.suivant + 6);
        for (; this.suivant < n; this.suivant++) {
          const s = this.info.ech[this.suivant];
          this.dec.decode(new EncodedVideoChunk({ type: s.cle ? "key" : "delta", timestamp: s.t, duration: s.d, data: s.data }));
        }
        while (this.dec.decodeQueueSize > 0) await dormir(1);
        await dormir(0);
      } else if (!this.fin) { await this.dec.flush(); this.fin = true; }
      else return this.courant;
    }
    throw new Error("décodage bloqué");
  }
  fermer() { try { this.file.forEach((x) => x.close()); if (this.courant) this.courant.close(); if (this.dec && this.dec.state !== "closed") this.dec.close(); } catch (e) { } }
}
async function creerLecteur(blob) {
  if (!window.VideoDecoder || !window.MP4Box) return null;
  try {
    const info = await demuxer(blob);
    const ok = await VideoDecoder.isConfigSupported({ codec: info.codec, codedWidth: info.largeur, codedHeight: info.hauteur, description: info.description });
    return ok.supported ? new Lecteur(info) : null;
  } catch (e) { console.warn("lecture séquentielle impossible, recherche image par image", e); return null; }
}
// image du clip à l'instant t : décodeur séquentiel si possible, sinon recherche dans l'élément <video>
async function imageA(c, t) {
  if (c.lecteur) {
    try { const fr = await c.lecteur.image(t); if (fr) return { src: fr, w: fr.displayWidth, h: fr.displayHeight }; } catch (e) { console.warn(e); c.lecteur = null; }
  }
  await allerA(c.video, t);
  return { src: c.video, w: c.video.videoWidth, h: c.video.videoHeight };
}

// ---------- préparation des clips ----------
async function preparerClip(id, options) {
  const s = SKETCHS.get(id);
  const blob = await DB.get("fichiers", `${id}:video`);
  if (!blob) throw new Error(`${id} : pas de clip`);
  const video = await chargerVideo(blob);
  const audio = await decoderAudio(blob);
  const segs = segmentsParole(audio);
  const lignes = tempsLignes(s, segs, video.duration);
  const finParole = lignes.length ? lignes[lignes.length - 1].fin : video.duration - MARGE_CHUTE;
  const d = Math.min(video.duration - 0.05, finParole + MARGE_CHUTE, s.coupe || 99);
  let R0 = 0, r0 = 0;
  if (options.rejouer && lignes.length) {
    const r1 = Math.min(d, finParole + 0.45);
    r0 = Math.max(0, lignes[lignes.length - 1].debut - 0.15, r1 - REJOUE_MAX);
    R0 = r1 - r0;
  }
  return { id, s, video, audio, lignes, finParole, d, R0, r0, groupes: groupesMots(s, lignes), titre: (s.titre || "").toUpperCase(),
    lecteur: await creerLecteur(blob) };
}
async function preparerGag(fichier) {
  const video = await chargerVideo(fichier.blob);
  const audio = await decoderAudio(fichier.blob);
  return { video, audio, G: Math.min(GAG_MAX, video.duration), lecteur: await creerLecteur(fichier.blob) };
}

const CIBLE = 62.5;              // monétisation TikTok : plus d'une minute (62 s + marge)
function planifier(clips, gags, options) {
  const t0 = options.teaser ? TEASER_S : 0;
  const n = clips.length;
  clips.forEach((c, r) => {
    c.gag = options.gags && gags.length ? gags[r % gags.length] : null;
    c.G = c.gag ? c.gag.G : 0;
    c.M = options.metre && r < n - 1 ? METRE_S : 0;
  });
  let queue = QUEUE;
  const calculer = () => {
    let t = t0;
    clips.forEach((c, r) => {
      c.debut = t;
      c.chute = t + c.finParole;
      c.apres = r === n - 1 ? c.R0 + c.G + queue : c.R0 + c.G + c.M + T_CARTE;
      t += c.d + c.apres;
    });
    return t;
  };
  let tFin = calculer();
  const boucle = options.boucle ? BOUCLE_S : 0;
  let manque = CIBLE - (tFin + boucle);
  if (options.atteindre && manque > 0) {           // temps gratuit : RIRE-O-MÈTRE plus long (2 s max chacun), vote plus long (6 s max)
    const metres = clips.filter((c) => c.M);
    const parM = metres.length ? Math.min(2, manque / (metres.length + 1)) : 0;
    metres.forEach((c) => { c.M += parM; });
    manque -= parM * metres.length;
    queue += Math.min(6, Math.max(0, manque));
    tFin = calculer();
  }
  return { t0, tFin, total: tFin + boucle, queue };
}

function estimerDuree(ids, options, nGags) {
  // estimation avant préparation : clip ≈ durée demandée − 0,8 s ; replay ≈ 2,9 s ; gag ≈ 3,5 s
  let t = options.teaser ? TEASER_S : 0;
  ids.forEach((id, r) => {
    const s = SKETCHS.get(id); if (!s) return;
    const dernier = r === ids.length - 1;
    const R0 = options.rejouer ? 2.9 : 0, G = options.gags && nGags ? 3.5 : 0;
    t += dureeClip(s) - 0.8 + (dernier ? R0 + G + QUEUE : R0 + G + (options.metre ? METRE_S : 0) + T_CARTE);
  });
  const brut = t + (options.boucle ? BOUCLE_S : 0);
  if (!options.atteindre || brut >= CIBLE) return { brut, final: brut };
  const nM = options.metre ? Math.max(0, ids.length - 1) : 0;
  const ajout = Math.min(CIBLE - brut, nM * 2 + 6);
  return { brut, final: brut + ajout };
}

// ---------- son (rendu hors temps réel) ----------
function bruitSouffle(ctx, t, dur = 0.5, vol = 0.5) {
  const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + dur);
  const gn = ctx.createGain(); gn.gain.value = vol;
  src.connect(f).connect(gn).connect(ctx.destination); src.start(t);
}
function gainNormal(buffer, debut, fin) {
  const d = buffer.getChannelData(0), a = Math.floor(debut * buffer.sampleRate), b = Math.min(d.length, Math.floor(fin * buffer.sampleRate));
  let e = 0, n = 0;
  for (let i = a; i < b; i += 4) { e += d[i] * d[i]; n++; }
  const rms = Math.sqrt(e / Math.max(1, n));
  return rms > 1e-4 ? Math.min(4, 0.12 / rms) : 1;
}
async function mixer(clips, plan, options, sons) {
  const taux = 48000, ctx = new OfflineAudioContext(2, Math.ceil(plan.total * taux), taux);
  const compresseur = ctx.createDynamicsCompressor();
  compresseur.threshold.value = -8; compresseur.ratio.value = 10; compresseur.attack.value = 0.003; compresseur.release.value = 0.2;
  compresseur.connect(ctx.destination);
  const jouer = (buffer, quand, offset, duree, vol, fondu = 0.15) => {
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(vol, quand);
    if (duree && fondu) { gn.gain.setValueAtTime(vol, quand + Math.max(0, duree - fondu)); gn.gain.linearRampToValueAtTime(0.0001, quand + duree); }
    src.connect(gn).connect(compresseur);
    src.start(quand, offset, duree || undefined);
  };
  const voix = [];
  clips.forEach((c, i) => {
    const gv = gainNormal(c.audio, 0, c.finParole);
    jouer(c.audio, c.debut, 0, c.d, gv);
    voix.push([c.debut, c.debut + c.finParole]);
    if (sons.rires.length) jouer(sons.rires[i % sons.rires.length], c.chute + 0.15, 0, null, 0.9, 0);
    let t = c.debut + c.d;
    if (c.R0) {
      bruitSouffle(ctx, Math.max(0, t - 0.2), 0.45, 0.35);
      jouer(c.audio, t, c.r0, c.R0, gv, 0.2);
      voix.push([t, t + c.R0]);
      if (sons.rires.length) jouer(sons.rires[(i + 2) % sons.rires.length], t + c.R0 - 0.25, 0, null, 0.9, 0);
      t += c.R0;
    }
    if (c.gag) {
      jouer(c.gag.audio, t, 0, c.G, 0.7, 0.2);
      if (sons.rires.length) jouer(sons.rires[(i + 1) % sons.rires.length], t + 0.4, 0, null, 0.7, 0);
      t += c.G;
    }
    t += c.M;
    if (i < clips.length - 1) bruitSouffle(ctx, t, 0.5, 0.45);
  });
  if (options.teaser) bruitSouffle(ctx, Math.max(0, plan.t0 - 0.25), 0.5, 0.5);
  if (sons.musique) {
    const src = ctx.createBufferSource(); src.buffer = sons.musique; src.loop = true;
    const gn = ctx.createGain(), base = 0.22, bas = 0.07;
    gn.gain.setValueAtTime(base, 0);
    for (const [a, b] of voix) {
      gn.gain.setTargetAtTime(bas, Math.max(0, a - 0.1), 0.05);
      gn.gain.setTargetAtTime(base, b + 0.05, 0.25);
    }
    gn.gain.setValueAtTime(base, Math.max(0, plan.total - 1.5));
    gn.gain.linearRampToValueAtTime(0.0001, plan.total);
    src.connect(gn).connect(compresseur); src.start(0);
  }
  return ctx.startRendering();
}

// ---------- encodage ----------
async function choisirCodecs() {
  const v = [["avc1.640028", "avc"], ["avc1.4d0028", "avc"], ["avc1.42E028", "avc"]];
  let video = null;
  for (const [codec, nom] of v) {
    try { if ((await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 6e6, framerate: IPS })).supported) { video = { codec, nom }; break; } } catch (e) { }
  }
  const essaiA = async (codec) => { try { return (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) { return false; } };
  if (video) {
    if (await essaiA("mp4a.40.2")) return { conteneur: "mp4", video, audio: { codec: "mp4a.40.2", nom: "aac" }, note: "MP4 H.264 + AAC (idéal pour TikTok)" };
    if (await essaiA("opus")) return { conteneur: "mp4", video, audio: { codec: "opus", nom: "opus" }, note: "MP4 H.264 + Opus (si TikTok refuse le son, ouvre l'application dans Chrome ou Edge sous Windows ou Mac)" };
  }
  try {
    if ((await VideoEncoder.isConfigSupported({ codec: "vp09.00.40.08", width: W, height: H, bitrate: 6e6, framerate: IPS })).supported && await essaiA("opus"))
      return { conteneur: "webm", video: { codec: "vp09.00.40.08", nom: "V_VP9" }, audio: { codec: "opus", nom: "A_OPUS" }, note: "WebM VP9 + Opus" };
  } catch (e) { }
  return null;
}

async function encoder(canvas, nbImages, dessiner, mix, codecs, progres) {
  let muxer, cible;
  if (codecs.conteneur === "mp4") {
    cible = new Mp4Muxer.ArrayBufferTarget();
    muxer = new Mp4Muxer.Muxer({ target: cible, video: { codec: "avc", width: W, height: H, frameRate: IPS },
      audio: { codec: codecs.audio.nom, numberOfChannels: 2, sampleRate: 48000 }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
  } else {
    cible = new WebMMuxer.ArrayBufferTarget();
    muxer = new WebMMuxer.Muxer({ target: cible, video: { codec: "V_VP9", width: W, height: H, frameRate: IPS },
      audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: 48000 }, firstTimestampBehavior: "offset" });
  }
  let erreur = null;
  const ve = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { erreur = e; } });
  ve.configure(Object.assign({ codec: codecs.video.codec, width: W, height: H, bitrate: 6e6, framerate: IPS, latencyMode: "quality" },
    codecs.conteneur === "mp4" ? { avc: { format: "avc" } } : {}));
  const ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { erreur = e; } });
  ae.configure({ codec: codecs.audio.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
  // son : tranches de 1024 échantillons
  const g = mix.getChannelData(0), d = mix.numberOfChannels > 1 ? mix.getChannelData(1) : g;
  for (let i = 0; i < mix.length; i += 1024) {
    const n = Math.min(1024, mix.length - i), plan = new Float32Array(n * 2);
    plan.set(g.subarray(i, i + n), 0); plan.set(d.subarray(i, i + n), n);
    ae.encode(new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data: plan }));
  }
  for (let f = 0; f < nbImages; f++) {
    if (erreur) throw erreur;
    await dessiner(f);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / IPS), duration: Math.round(1e6 / IPS) });
    ve.encode(vf, { keyFrame: f % (IPS * 2) === 0 });
    vf.close();
    while (ve.encodeQueueSize > 8) await dormir(5);
    if (f % 15 === 0) progres(f / nbImages);
  }
  await ve.flush(); await ae.flush();
  if (erreur) throw erreur;
  muxer.finalize();
  return new Blob([cible.buffer], { type: codecs.conteneur === "mp4" ? "video/mp4" : "video/webm" });
}

// ---------- montage complet ----------
async function decoderSon(b64, type) {
  if (!b64) return null;
  const bin = atob(b64), o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return decoderAudio(new Blob([o], { type }));
}
let SONS = null;
async function chargerSons() {
  if (SONS) return SONS;
  const rires = [];
  for (const r of (SONS_EMBARQUES.rires || [])) { const b = await decoderSon(r, "audio/mp4"); if (b) rires.push(b); }
  let musique = null;
  const perso = await DB.get("fichiers", "montage:musique");
  if (perso) musique = await decoderAudio(perso);
  else if (SONS_EMBARQUES.musique) musique = await decoderSon(SONS_EMBARQUES.musique, "audio/mp4");
  SONS = { rires, musique };
  return SONS;
}

async function creerCompilation(ids, options, progres) {
  const codecs = await choisirCodecs();
  if (!codecs) throw new Error("ce navigateur ne sait pas encoder la vidéo (utilise Chrome ou Edge récent)");
  await document.fonts.load(police(40)); await document.fonts.load(police(20, 800));
  progres(0, "Préparation des clips…");
  const clips = [];
  for (const id of ids) clips.push(await preparerClip(id, options));
  const gags = [];
  if (options.gags) for (const f of await listeGags()) gags.push(await preparerGag(f));
  const plan = planifier(clips, gags, options);
  const sons = await chargerSons();
  progres(0.02, "Mixage du son…");
  const mix = await mixer(clips, plan, options, sons);
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { alpha: false });
  const FOND = fondBandes(), LOGO = logo(k(112)), BANDEAU = bandeauMotif();
  const dernieres = new Map();             // dernière image de chaque clip (pour cartes, mètre, ouverture)
  const capture = (src, sw, sh) => { const c = document.createElement("canvas"); c.width = W; c.height = CH; dessinerCouverture(c.getContext("2d"), src, sw, sh, 0, 0, W, CH); return c; };
  for (const c of clips) { await allerA(c.video, c.d - 0.08); dernieres.set(c.id, capture(c.video, c.video.videoWidth, c.video.videoHeight)); }
  const premiereRejouee = new Map();
  const nb = Math.round(plan.total * IPS);
  const n = clips.length;
  let premiere = null;
  async function dessiner(f) {
    const tg = f / IPS;
    // boucle : la fin se fond dans la toute première image
    if (options.boucle && tg >= plan.tFin) {
      const x = Math.min(1, (tg - plan.tFin) / BOUCLE_S);
      await dessinerTemps(plan.tFin - 1 / IPS);
      if (premiere) { g.globalAlpha = x; g.drawImage(premiere, 0, 0); g.globalAlpha = 1; }
      return;
    }
    await dessinerTemps(tg);
    if (f === 0 && !premiere) { premiere = document.createElement("canvas"); premiere.width = W; premiere.height = H; premiere.getContext("2d").drawImage(canvas, 0, 0); }
  }
  async function dessinerTemps(tg) {
    // la scène (1080 × 862) est toujours peinte en entier ci-dessous ; les bandes sont repeintes à la fin
    let haut = null, bas = null;
    if (options.teaser && tg < plan.t0) {           // ouverture choc : visage de la fin du 1er sketch, zoom lent
      const u = tg, z = 1 + 0.12 * u / TEASER_S;
      dessinerCouverture(g, dernieres.get(clips[0].id), W, CH, 0, Y0, W, CH, z);
      haut = () => hautTeaser(g, u);
    } else {
      const i = Math.max(0, clips.findIndex((c, j) => tg >= c.debut && (j === n - 1 || tg < clips[j + 1].debut)));
      const c = clips[i];
      const u = tg - c.debut;
      if (u < c.d) {                                    // le sketch
        const im = await imageA(c, u);
        dessinerCouverture(g, im.src, im.w, im.h, 0, Y0, W, CH);
        bas = () => dessinerSousTitres(g, c.groupes, u);
      } else {
        const v = u - c.d;
        if (v < c.R0) {                                 // replay de la chute
          const im = await imageA(c, c.r0 + v);
          sceneRejoue(g, im.src, im.w, im.h, v, c.R0);
          if (!premiereRejouee.has(c.id) && v > c.R0 - 0.1) premiereRejouee.set(c.id, capture(im.src, im.w, im.h));
          haut = () => hautRejoue(g, v);
          bas = () => dessinerSousTitres(g, c.groupes, c.r0 + v);
        } else if (v < c.R0 + c.G) {                    // gag 3D
          const w = v - c.R0;
          const im = await imageA(c.gag, w);
          dessinerCouverture(g, im.src, im.w, im.h, 0, Y0, W, CH);
          if (R.creditGags) { g.font = police(k(11), 700); const tw = g.measureText(R.creditGags).width; g.fillStyle = "rgba(0,0,0,0.55)"; arrondi(g, k(10), Y1 - k(30), tw + k(14), k(20), k(6)); g.fill(); g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(R.creditGags, k(17), Y1 - k(20)); }
          haut = () => hautLegende(g, c.s.gag_legende || "MOI APRÈS CETTE CHUTE :", w);
          bas = () => basRires(g, w);
        } else if (v < c.R0 + c.G + c.M) {              // RIRE-O-MÈTRE
          const w = v - c.R0 - c.G;
          sceneMetre(g, premiereRejouee.get(c.id) || dernieres.get(c.id), w);
          haut = () => hautMetre(g, w);
          bas = () => basCommente(g, w);
        } else {
          const w = v - c.R0 - c.G - c.M;
          if (i < n - 1) sceneCarte(g, dernieres.get(c.id), w, clips[i + 1].titre, i + 2, n);
          else g.drawImage(dernieres.get(c.id), 0, Y0);
          if (i === n - 1 && tg >= plan.tFin - plan.queue) bas = () => basVote(g, (tg - (plan.tFin - plan.queue)) / 0.3, n, options.gags && gags.length ? R.creditGags : "");
        }
      }
      // bande du haut par défaut : fin, accroche, réaction, titre
      if (!haut) {
        if (tg >= plan.tFin - FIN_S) haut = () => hautFin(g, (tg - (plan.tFin - FIN_S)) / 0.35, LOGO);
        else {
          const reac = clips.find((q) => q.chute <= tg && tg < q.chute + REACTION_S);
          if (options.accroche && tg >= plan.t0 && tg < plan.t0 + ACCROCHE_S) haut = () => hautAccroche(g, tg - plan.t0);
          else if (reac) haut = () => hautReaction(g, tg - reac.chute, clips.indexOf(reac));
          else {
            const it = Math.max(0, ...clips.map((q, j) => (q.debut - T_CARTE <= tg ? j : 0)));
            haut = () => hautTitre(g, clips[it].titre, it + 1, n);
          }
        }
      }
    }
    // fond des bandes, bandeau défilant, puis contenus
    g.drawImage(FOND, 0, 0, W, Y0, 0, 0, W, Y0);
    g.drawImage(FOND, 0, Y1, W, H - Y1, 0, Y1, W, H - Y1);      // filet rose compris : rien ne reste d'une image à l'autre
    if (haut) haut();
    const dec = (Math.round(tg * IPS) * 4) % BANDEAU.periode;
    g.drawImage(BANDEAU.canvas, dec, 0, W, H_BANDEAU, 0, Y_BANDEAU, W, H_BANDEAU);
    if (bas) bas();
  }
  progres(0.05, "Encodage des images…");
  const blob = await encoder(canvas, nb, dessiner, mix, codecs, (x) => progres(0.05 + 0.95 * x, `Encodage… ${Math.round(x * 100)} %`));
  for (const c of clips) { URL.revokeObjectURL(c.video.src); if (c.lecteur) c.lecteur.fermer(); }
  for (const gg of gags) { URL.revokeObjectURL(gg.video.src); if (gg.lecteur) gg.lecteur.fermer(); }
  return { blob, duree: plan.total, codecs };
}

// ---------- gags 3D fournis par l'utilisateur ----------
async function listeGags() {
  const cles = (await DB.cles("fichiers")).filter((c) => String(c).startsWith("gag:")).sort();
  const res = [];
  for (const c of cles) res.push({ cle: c, nom: c.slice(4), blob: await DB.get("fichiers", c) });
  return res;
}

// ---------- interface ----------
const MONTAGE = { ordre: [], dernier: null };
function clipsDisponibles() {
  return FILE.concat([...ETATS.keys()].filter((id) => !FILE.includes(id)))
    .filter((id) => ["video_ok", "pret", "a_revoir"].includes((ETATS.get(id) || {}).statut) && SKETCHS.has(id));
}
function scoreMontage(id) {
  const s = SKETCHS.get(id), c = (ETATS.get(id) || {}).controle || {};
  return (s.note ?? 6) + (c.drole ?? 6) / 2 + (c.naturel ?? 5) / 4;
}
function optionsMontage() {
  return { teaser: $("#m-teaser").checked, boucle: $("#m-boucle").checked, rejouer: $("#m-rejouer").checked,
    metre: $("#m-metre").checked, gags: $("#m-gags").checked, accroche: $("#m-accroche").checked, atteindre: $("#m-atteindre").checked };
}
async function afficherMontage() {
  const dispo = clipsDisponibles();
  MONTAGE.ordre = MONTAGE.ordre.filter((id) => dispo.includes(id));
  const zone = $("#m-clips");
  zone.innerHTML = "";
  if (!dispo.length) zone.append(el("p", { class: "vide" }, "Aucun clip prêt. Lance d'abord la production de quelques sketchs."));
  const tries = [...dispo].sort((a, b) => scoreMontage(b) - scoreMontage(a));
  for (const id of tries) {
    const s = SKETCHS.get(id), e = ETATS.get(id) || {};
    const coche = el("input", { type: "checkbox", checked: MONTAGE.ordre.includes(id) });
    coche.addEventListener("change", () => {
      if (coche.checked) MONTAGE.ordre.push(id); else MONTAGE.ordre = MONTAGE.ordre.filter((x) => x !== id);
      afficherOrdre();
    });
    zone.append(el("label", { class: "ligne-clip" }, coche, el("span", { class: "note" }, scoreMontage(id).toFixed(1)),
      el("b", {}, s.titre), " ", el("span", { class: "id" }, id), " ", puceStatut(id),
      e.controle ? el("span", { class: "petit" }, ` drôle ${e.controle.drole ?? "?"}/10 · naturel ${e.controle.naturel ?? "?"}/10`) : null));
  }
  const gags = await listeGags();
  $("#m-gags-liste").innerHTML = "";
  for (const gg of gags) $("#m-gags-liste").append(el("div", { class: "petit" }, `🎬 ${gg.nom} `,
    el("button", { onclick: async () => { await DB.del("fichiers", gg.cle); afficherMontage(); } }, "retirer")));
  afficherOrdre();
}
function afficherOrdre() {
  const z = $("#m-ordre");
  z.innerHTML = "";
  MONTAGE.ordre.forEach((id, i) => {
    const s = SKETCHS.get(id);
    z.append(el("div", { class: "ligne-ordre" }, el("b", {}, `${i + 1}. `), s.titre, " ",
      el("button", { onclick: () => { if (i > 0) { [MONTAGE.ordre[i - 1], MONTAGE.ordre[i]] = [MONTAGE.ordre[i], MONTAGE.ordre[i - 1]]; afficherOrdre(); } } }, "▲"),
      el("button", { onclick: () => { if (i < MONTAGE.ordre.length - 1) { [MONTAGE.ordre[i + 1], MONTAGE.ordre[i]] = [MONTAGE.ordre[i], MONTAGE.ordre[i + 1]]; afficherOrdre(); } } }, "▼")));
  });
  listeGags().then((gg) => {
    const { brut, final } = estimerDuree(MONTAGE.ordre, optionsMontage(), gg.length);
    const z2 = $("#m-estimation");
    const allonge = final > brut + 0.5 ? ` (${brut.toFixed(0)} s, allongée gratuitement par les transitions)` : "";
    z2.textContent = MONTAGE.ordre.length ? `Durée estimée : ${final.toFixed(0)} s${allonge} ${final < 62 ? "— moins de 62 s : ajoute un sketch (monétisation TikTok)" : "— au-dessus des 62 s de la monétisation"}` : "";
    z2.className = final < 62 ? "attention" : "";
  });
}
function initMontage() {
  for (const id of ["#m-teaser", "#m-boucle", "#m-rejouer", "#m-metre", "#m-gags", "#m-accroche", "#m-atteindre"]) $(id).addEventListener("change", afficherOrdre);
  $("#m-meilleurs").addEventListener("click", () => {
    const n = +$("#m-nombre").value || 3;
    MONTAGE.ordre = [...clipsDisponibles()].sort((a, b) => scoreMontage(b) - scoreMontage(a)).slice(0, n);
    afficherMontage();
  });
  $("#m-ajout-gag").addEventListener("change", async (ev) => {
    for (const f of ev.target.files) await DB.put("fichiers", `gag:${f.name}`, f);
    ev.target.value = "";
    $("#m-gags").checked = true;
    afficherMontage();
  });
  $("#m-musique").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    await DB.put("fichiers", "montage:musique", f); SONS = null;
    alerte(`Musique de fond remplacée par « ${f.name} ».`);
  });
  $("#m-creer").addEventListener("click", async () => {
    if (MONTAGE.ordre.length < 1) { alerte("Coche au moins un clip.", "attention"); return; }
    const b = $("#m-creer"); b.disabled = true;
    const barre = $("#m-progres"), texte = $("#m-progres-texte");
    try {
      const { blob, duree, codecs } = await creerCompilation(MONTAGE.ordre, optionsMontage(), (x, msg) => { barre.value = x; if (msg) texte.textContent = msg; });
      const nom = `compilation_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${codecs.conteneur}`;
      await DB.put("fichiers", `montage:${nom}`, blob);
      MONTAGE.dernier = { nom, blob };
      $("#m-apercu").src = URL.createObjectURL(blob);
      $("#m-apercu").hidden = false;
      texte.textContent = `Terminé : ${duree.toFixed(1)} s, ${(blob.size / 1e6).toFixed(1)} Mo — ${codecs.note}.`;
      barre.value = 1;
      if (!(await ecrireFichier("compilations", nom, blob))) telecharger(nom, blob);
      else alerte(`Compilation enregistrée dans le dossier choisi : compilations/${nom}`);
    } catch (e) {
      console.error(e);
      texte.textContent = `Échec du montage : ${e.message}`;
      alerte(`Échec du montage : ${e.message}`, "erreur");
    } finally { b.disabled = false; }
  });
  $("#m-telecharger").addEventListener("click", () => { if (MONTAGE.dernier) telecharger(MONTAGE.dernier.nom, MONTAGE.dernier.blob); });
}
