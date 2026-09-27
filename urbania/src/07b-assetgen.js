/* ================= bâtiments construits à partir des modèles SketchUp ================= */
// Chaque zone et chaque service choisit un modèle du paquet, l'ajuste à sa parcelle (sans jamais déborder) et le teinte.
// Si le paquet n'a pas pu être chargé, les générateurs procéduraux de 07-buildings.js prennent le relais.
const TINT = {
  wall:['#efe9dd','#e6dccb','#f2efe8','#d9cbb1','#e8d8b8','#c9b595','#dfe3df','#e9ddd0','#cfd6da','#b98f74','#e4d2b8','#d8c3a0'],
  white:['#f4f4f2','#eceae5','#e3e1dc','#f0ede6'],
  brick:['#9c5a44','#8a4a3a','#a86b4f','#7d4b3c','#b07a5c','#94634f'],
  roof:['#4a4543','#5b3d33','#7a4a36','#3e4247','#6b5a4b','#8a4b3a','#565c61','#3b3a3c','#6d3a2e'],
  shutter:['#3d5f4a','#2f4f6b','#6b2f2f','#4a4a4a','#7a5a3a','#e8e4da','#2d3b2d','#5a6b7a'],
  apt:['#d9d2c5','#c9c0b0','#b8ab9a','#e0dbd2','#a8988a','#cbb89c','#e6e3dc','#bfb3a6','#9c8b7b'],
  com:['#d9d4cc','#c2b6a6','#bfc5c8','#d6c3a5','#e3ded5','#c9bca8','#b9b1a5'],
  off:['#3c4750','#5a6770','#2e3740','#6f7b83','#4b5a52','#7d8b95','#8a949b','#2f3a46'],
  ind:['#a39e94','#8b8f91','#b3ad9f','#7d8487','#bdb5a4','#8e7f6d','#9aa39a'],
  indRoof:['#5b5f63','#6e6a62','#4c5a66','#7a3f33','#566152'],
};
// modèles par zone : [nom, niveau min, niveau max, pénalité] ; « #clé » = tour modulaire (socle + étages + couronnement)
const ZSET = {
  1:[['h_cottage',1,1],['h_bungalow',1,2],['h_house',2,3],['h_gablefront',2,3],['h_townhouse',3,4],['h_family',3,4],['h_villa',4,5],['h_modern',5,5]],
  2:[['a_walkup',1,1],['a_block',2,2],['a_mid',3,3],['#a4',4,4],['#a5',5,5]],
  3:[['c_shop1',1,1],['c_shop2',2,2],['c_shop3',3,3]],
  4:[['c_market',1,1],['c_mall',2,2],['#ht',3,3],['c_shop3',1,2,.9],['c_shop2',1,1,1.3]],
  5:[['i_warehouse',1,1],['i_factory',2,2],['i_plant',3,3]],
  6:[['o_low',1,1],['#o2',2,2],['#o3',3,3]],
};
const TOWER = { a4:{ base:4.5, fh:3.0, floors:[5,9] }, a5:{ base:6.6, fh:3.2, floors:[11,22] }, ht:{ base:8.4, fh:3.2, floors:[8,16], dz:-1.5 },
  o2:{ base:5.6, fh:3.6, floors:[5,10] }, o3:{ base:8.0, fh:3.8, floors:[12,26] } };
const LIT = { 1:.5, 2:.55, 3:.75, 4:.7, 5:.3, 6:.45 };
const assetsReady = () => !!ASSETS.h_house;
const fitDim = (avail, dim, hi) => clamp(avail/dim, .35, hi);   // jamais plus grand que la parcelle
// point du modèle donné dans le repère SketchUp (mètres, z vers le haut) -> repère local du bâtiment, échelle comprise
function assetPt(A, x, y, z, sx=1, sy=1, sz=1){ return [(x - A.off[0])*sx, (z - A.off[1])*sy, (-y - A.off[2])*sz]; }
// choix du modèle : respect du niveau, puis meilleur ajustement à la parcelle
function pickAsset(list, lv, W, D, r, uniform){
  let best = null, bs = 1e9;
  for(const [name, a, b, pen=0] of list){
    const tw = name[0] === '#', A = ASSETS[tw ? name.slice(1) + '_base' : name]; if(!A) continue;
    let score = pen + (lv < a ? a - lv : lv > b ? lv - b : 0)*1.4 + r()*.3;
    const f = (s, k) => s < 1 ? -Math.log(s)*k + Math.max(0, .72 - s)*(tw ? 2 : 6) : Math.log(s)*.6;
    if(uniform) score += f(Math.min((W - .6)/A.w, (D - .9)/A.d), 2);
    else score += f((W - .8)/A.w, tw ? .8 : 1.5) + f((D - 1.2)/A.d, tw ? .8 : 1.5);
    if(score < bs){ bs = score; best = name; } }
  return best; }
function tower(b, C, key, W, D, lit, wall, roof, acc){
  const T = TOWER[key], base = ASSETS[key + '_base'], top = ASSETS[key + '_top']; if(!base || !ASSETS[key + '_mid'] || !top) return false;
  const { r } = C, n = Math.max(3, Math.round(lerp(T.floors[0], T.floors[1], r())*clamp(Math.sqrt(W*D)/26, .6, 1.25)));
  const sx = fitDim(W - 1, base.w, 1.3), sz = fitDim(D - 1.5, base.d, 1.3), bz = C.hd - base.d*sz/2 - .8, tz = bz + (T.dz || 0)*sz;
  C.asset(key + '_base', 0, 0, bz, sx, 1, sz, wall, roof, acc, lit);
  for(let i=0;i<n;i++) C.asset(key + '_mid', 0, T.base + i*T.fh, tz, sx, 1, sz, wall, roof, acc, lit);
  C.asset(key + '_top', 0, T.base + n*T.fh, tz, sx, 1, sz, wall, roof, acc, lit);
  b.top = T.base + n*T.fh + top.h; return true; }
// modèle posé à l'avant de la parcelle ; renvoie la profondeur libre derrière lui
function front(C, name, sx, sy, sz, wall, roof, acc, lit, lx=0){ const A = ASSETS[name], lz = C.hd - A.d*sz/2 - .6;
  C.asset(name, lx, 0, lz, sx, sy, sz, wall, roof, acc, lit); return { A, lz, back:C.hd*2 - A.d*sz - 1.2 }; }
function zoneAsset(b, C){
  if(!assetsReady()) return false;
  const { r, hw, hd } = C, W = hw*2, D = hd*2, lv = b.level, z = b.zone, dead = b.abandoned;
  // bâtiment abandonné : fenêtres éteintes, toit et accents ternis (les murs sont assombris par buildModel)
  const lit = dead ? 0 : LIT[z], dim = c => dead ? '#' + _c.set(c).multiplyScalar(.55).getHexString() : c;
  const pad = c => C.part(P.pad, 0, -.4, 0, W - .3, .45, D - .3, c);
  /* spécialisations industrielles et pôle technologique : bâtiment à l'avant, activité derrière */
  if(z === 5 && b.spec === 'farm'){ pad('#6f8a4a'); const A = ASSETS.f_farm, s = Math.min(1.05, (W - 1)/A.w, D*.4/A.d);
    front(C, 'f_farm', s, s, s, pick(['#9b3b2e','#8a3a2c','#b04a36','#a0998c'], r), dim(pick(TINT.roof, r)), '#3d5f4a', lit*.4);
    const z1 = hd - A.d*s - 1.4, z0 = -hd + 1; if(z1 - z0 > 3) C.part(P.field, 0, 0, (z0 + z1)/2, W - 2, .08, z1 - z0, pick(PAL.crop, r));
    b.top = A.h*s; return true; }
  if(z === 5 && (b.spec === 'forest' || b.spec === 'ore' || b.spec === 'oil')){
    const k = { forest:'f_sawmill', ore:'f_mine', oil:'f_oil' }[b.spec], A = ASSETS[k]; pad({ forest:'#6d6552', ore:'#7a7064', oil:'#7c7a74' }[b.spec]);
    const sx = fitDim(W - 1, A.w, 1.1), sz = fitDim(D*.55, A.d, 1.1), sy = clamp((sx + sz)/2, .8, 1.1);
    const f = front(C, k, sx, sy, sz, b.spec === 'forest' ? pick(['#8b6f52','#7a5a3a','#9a8060'], r) : pick(TINT.ind, r), dim(pick(TINT.indRoof, r)), b.spec === 'ore' ? '#a14a2e' : '#b3302a', lit);
    const zb = hd - A.d*sz - 1.6, z0 = -hd + 1.5, L = zb - z0;
    if(L > 3){ if(b.spec === 'forest'){ for(let i=0;i<5;i++) C.part(P.log, (r() - .5)*(W - 8), 0, z0 + r()*L*.5 + 1, 6 + r()*3, 1.1 + r()*.5, 1.1 + r()*.5, '#6b4e35');
        for(let x = -hw + 2; x < hw - 1; x += 4) C.tree(x, -hd + 1.8, 10 + r()*4, 'C'); }
      else if(b.spec === 'ore'){ C.part(P.cone, -hw*.4, 0, (z0 + zb)/2, Math.min(hw*.5, L*.5), 5 + r()*5, Math.min(hw*.5, L*.5), '#7a6f62'); C.part(P.cone, hw*.35, 0, (z0 + zb)/2, Math.min(hw*.4, L*.45), 4 + r()*4, Math.min(hw*.4, L*.45), '#8a7e70'); }
      else for(let i=0, n=Math.max(2, Math.floor(W*L/160)); i<n; i++) C.part(P.pump, (r() - .5)*(W - 6), 0, z0 + 1 + r()*(L - 2), 1, 1, 1, '#ffffff', null, r()*6); }
    if(b.spec === 'ore' && !dead){ const p = assetPt(A, 8, 5, 11, sx, sy, sz); C.emit(p[0], p[1], f.lz + p[2], .8, .6); }
    b.top = A.h*sy; return true; }
  if(z === 6 && b.spec === 'tech'){ pad('#6f8a4a'); const A = ASSETS.o_tech, sx = fitDim(W - .8, A.w, 1.2), sz = fitDim(D - 1.2, A.d, 1.2), sy = clamp((sx + sz)/2, .8, 1.1);
    C.asset('o_tech', 0, 0, 0, sx, sy, sz, '#f2f2f0', dim('#555555'), dim('#3d6b50'), lit); if(W - A.w*sx > 5){ C.tree(-hw + 2, hd - 2, 7); C.tree(hw - 2, -hd + 2, 8); } b.top = A.h*sy; return true; }
  /* station-service pour les grands commerces de niveau 1 */
  const name = z === 3 && lv === 1 && W > 14 && D > 14 && r() < .3 ? 'c_gas' : pickAsset(ZSET[z] || [], lv, W, D, r, z === 1);
  if(!name) return false;
  let wall, roof = pick(TINT.roof, r), acc = pick(TINT.shutter, r);
  if(z === 1) wall = name === 'h_modern' ? pick(TINT.white, r) : name === 'h_townhouse' && r() < .6 ? pick(TINT.brick, r) : pick(TINT.wall, r);
  else if(z === 2) wall = name === 'a_walkup' ? pick(TINT.brick, r) : name === '#a5' ? pick(TINT.white, r) : pick(TINT.apt, r);
  else if(z === 3 || z === 4){ wall = pick(TINT.com, r); acc = pick(PAL.awn, r); }
  else if(z === 5){ wall = pick(TINT.ind, r); roof = pick(TINT.indRoof, r); acc = pick(PAL.awn, r); }
  else { wall = name === 'o_low' ? pick(TINT.com, r) : pick(TINT.off, r); acc = pick(PAL.awn, r); }
  roof = dim(roof); acc = dim(acc);
  pad(z === 1 ? '#6f8a4a' : z === 5 ? '#7c7a74' : '#8e8c86');
  if(name[0] === '#') return tower(b, C, name.slice(1), W, D, lit, wall, roof, acc);
  const A = ASSETS[name];
  if(z === 1){ // maison : échelle uniforme, jardin, clôture, piscine
    const s = Math.min(fitDim(W - .6, A.w, 1.1), fitDim(D - .9, A.d, 1.1)), free = W - A.w*s, lx = free > 3 ? (r() - .5)*(free - 1.5) : 0;
    const { back } = front(C, name, s, s, s, wall, roof, acc, lit, lx);
    if(back > 3 && r() < .85) C.tree(-hw + 1.8 + r()*(W - 3.6), -hd + 1.6, 6 + r()*5, r() < .2 ? 'C' : 'D');
    if(back > 6 && r() < .5) C.tree(hw - 1.6, -hd + 2.5 + r()*2, 5 + r()*4, 'D');
    if(lv >= 4 && back > 7) C.part(P.poolw, (r() - .5)*Math.max(0, W - 9), 0, -hd + 3.2, Math.min(7, W*.4), .12, 3.4, '#2a9fc7');
    if(r() < .7) C.fence(pick(['#e8e5de','#8b7355','#6a6d70'], r), .9);
    b.top = A.h*s; return true; }
  const sx = fitDim(W - .8, A.w, 1.25), sz = fitDim(D - 1.2, A.d, 1.25), sy = clamp((sx + sz)/2, .85, 1.15);
  const { lz, back } = front(C, name, sx, sy, sz, wall, roof, acc, lit);
  if(back > 7){ C.part(P.pad, 0, 0, -hd + back/2 + .3, W - 1.2, .05, back - .6, z === 5 ? '#6d6b66' : '#4a4c4f');
    if(z !== 5) for(let x = -hw + 2.2; x < hw - 1.5; x += 2.6) C.part(P.equip, x, .05, -hd + back/2 + .3, .1, .02, Math.min(5, back - 1.5), '#e6e4dc'); }
  else if(back > 3 && z !== 5) C.tree(-hw + 1.6, -hd + 1.6, 6 + r()*3, 'D');
  if(!dead && name === 'i_factory'){ const p = assetPt(A, 21, 21, 24.5, sx, sy, sz); C.emit(p[0], p[1], lz + p[2], 1.8, .55); }
  if(!dead && name === 'i_plant') for(const [x, y, h] of [[26, 12, 34.5], [26, 4, 28.5]]){ const p = assetPt(A, x, y, h, sx, sy, sz); C.emit(p[0], p[1], lz + p[2], 2.2, .5); }
  b.top = A.h*sy; return true;
}

/* ---------- services publics ---------- */
// teintes [murs, toit, accent] par service
const SVC_TINT = { _:['#dcd6ca','#6b3f35','#3d6b50'], police:['#c9cfd6','#555','#2a4f9a'], fire:['#9c4a3a','#555','#b3302a'], hospital:['#e6e8ea','#555','#c4302b'],
  clinic:['#f2f2f0','#555','#c4302b'], school:['#a4553c','#5b3d33','#2f6d9a'], lycee:['#d9cbb1','#555','#3f6e9a'], univ:['#e3d7b8','#6b3f35','#3d5f4a'],
  recycle:['#6b8e5a','#555','#4f8a3a'], cityhall:['#e8e1d3','#4a5a5c','#2f4f6b'], coal:['#b9b3a8','#555','#555'], inciner:['#a8a39b','#5b5f63','#555'],
  depot:['#c2c8cc','#5b5f63','#d8b43a'], tramdepot:['#9c5a44','#4a4543','#3fae57'], station:['#d6c6a4','#51565b','#3d5f4a'], port:['#9aa3ab','#555','#2f6d9a'],
  airport:['#cfd6db','#555','#1d4f91'], stadium:['#d6d6d0','#555','#2f6d9a'], cremat:['#d6d0c2','#3e4247','#555'], cemetery:['#d6d0c2','#4a4543','#555'] };
// compléments animés ou vivants : fumées, arbres, tombes, monticule de la décharge, piste de l'aéroport
const SVC_EXTRA = {
  coal(b, C, A){ for(const x of [8, 15]){ const p = assetPt(A, x, 36, 60.5); C.emit(p[0], p[1], p[2], 4, .35); }
    const t = assetPt(A, 41, 7.6, 26.5); C.emit(t[0], t[1], t[2], 6, .95, 1); },
  inciner(b, C, A){ const p = assetPt(A, 33, 26, 46.5); C.emit(p[0], p[1], p[2], 3, .5); },
  cremat(b, C, A){ const p = assetPt(A, 23.6, 16.6, 16.3); C.emit(p[0], p[1], p[2], .6, .7); },
  sewage(b, C){ C.emit(0, .5, -9, 2, .45); },
  landfill(b, C){ b.mound = C.part(P.cone, 0, .3, -2, 16, 2, 15, '#6a6153'); },
  airport(b, C){ b.runway = C.W(-150, -30).concat(C.W(150, -30)); },
  cemetery(b, C){ const { r } = C; for(let gz = 17.5; gz > -18; gz -= 2.5) for(let gx = -17.6; gx < 18; gx += 2.2){
      if(Math.abs(gx) < 2.2 || Math.abs(gz) < 1.8 || (gz < -4.5 && Math.abs(gx) < 6)) continue; if(r() < .8) C.part(P.grave, gx, .04, gz, 1, .8 + r()*.5, 1, '#ffffff'); } },
  park(b, C){ const { r } = C; for(const [x, z] of [[-4.2, -4.4], [4.4, -4.2], [-4.4, 4.6], [4.2, 4.4]]) C.tree(x, z, 8 + r()*4, r() < .25 ? 'C' : 'D'); },
  playground(b, C){ C.tree(-6.8, -6.8, 8); C.tree(6.8, -6.8, 9); },
  plaza(b, C){ for(const [x, z] of [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]]) C.tree(x, z, 7, 'P'); },
  bigpark(b, C){ const { r } = C; for(let k=0;k<30;k++){ const x = -21 + r()*42, z = -21 + r()*42;
      if(Math.abs(x) < 2.4 || Math.abs(z - 11) < 2.4 || ((x - 2)/12.5)**2 + ((z + 6)/8.5)**2 < 1 || Math.hypot(x + 14, z + 10) < 5.5 || (Math.abs(x - 1) < 5 && Math.abs(z + 1) < 3)) continue;
      C.tree(x, z, 8 + r()*6, r() < .25 ? 'C' : 'D'); } },
  cityhall(b, C){ C.tree(-16, 12, 8); C.tree(16, 12, 8); },
};
for(const k in SVC){
  if(k === 'wind' || k === 'dam' || !svcGen[k]) continue;
  const old = svcGen[k];
  svcGen[k] = (b, C) => { const A = ASSETS['svc_' + k]; if(!A) return old(b, C);
    const [wall, roof, acc] = SVC_TINT[k] || SVC_TINT._;
    C.asset('svc_' + k, 0, 0, 0, b.hw*2/A.w, 1, b.hd*2/A.d, wall, roof, acc, .6); b.top = A.h;
    if(SVC_EXTRA[k]) SVC_EXTRA[k](b, C, A); };
}
