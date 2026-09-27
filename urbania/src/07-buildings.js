/* ================= bâtiments : registre, modèles procéduraux, services ================= */
MAT.vc = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.7, metalness:.15, envMapIntensity:.5 });
const LOGG = new THREE.CylinderGeometry(.5,.5,1,8).rotateZ(Math.PI/2).translate(0,.5,0);
const P = {
  fac: new Pool(BOX, MAT.fac, 2048, { extras:{ aStyle:4, aStyle2:4 } }),
  facC: new Pool(CYL, MAT.fac, 128, { extras:{ aStyle:4, aStyle2:4 } }),
  roofG: new Pool(PRISM, MAT.roof, 1024), roofH: new Pool(HIP, MAT.roof, 512), saw: new Pool(SAW, MAT.roof, 512),
  pad: new Pool(BOX, MAT.pad, 2048, { cast:false }), equip: new Pool(BOX, MAT.equip, 4096), metal: new Pool(CYL, MAT.metal, 512), metalB: new Pool(BOX, MAT.metal, 512),
  chim: new Pool(CHIM, MAT.chim, 256), glass: new Pool(BOX, MAT.glass, 256), sign: new Pool(BOX, MAT.sign, 1024), field: new Pool(BOX, MAT.field, 256, { cast:false }),
  solar: new Pool(BOX, MAT.solar, 1024), poolw: new Pool(BOX, MAT.poolw, 128, { cast:false }), cone: new Pool(CONE, MAT.equip, 256), sphere: new Pool(SPHERE, MAT.equip, 128),
  dome: new Pool(DOME, MAT.equip, 128), log: new Pool(LOGG, MAT.chim, 512), bench: new Pool(BENCH, MAT.vc, 512), grave: new Pool(GRAVE, MAT.vc, 2048),
  pump: new Pool(PUMPJACK, MAT.vc, 128), crane: new Pool(CRANE, MAT.vc, 32), cont: new Pool(CONTAINER, MAT.equip, 512), white: new Pool(BOX, MAT.white, 256),
};
const ST = { // [hauteur d'étage, pas des fenêtres, remplissage x, y] / [allumées, vitrine, métal du verre, teinte]
  house:[[2.9,3.2,.32,.42],[.55,0,.3,0]], modern:[[3.2,2.2,.72,.62],[.5,0,.75,.2]], brick:[[3.0,2.6,.42,.5],[.5,0,.4,0]], apt:[[3.0,2.4,.5,.5],[.5,0,.45,0]],
  aptM:[[3.1,1.8,.8,.62],[.45,0,.8,.25]], shop:[[3.6,2.4,.56,.48],[.62,1,.5,0]], offO:[[3.6,2.0,.6,.55],[.45,1,.6,.1]], offG:[[3.8,1.6,.9,.8],[.42,1,.88,.3]],
  ind:[[6,4.5,.42,.2],[.3,0,.3,0]], ware:[[8,6,.25,.12],[.2,0,.3,0]], svc:[[3.6,2.8,.5,.5],[.6,0,.45,0]], blank:[[4,4,0,0],[0,0,0,0]], hotel:[[3.2,2.2,.62,.55],[.6,1,.6,.1]] };
const PAL = {
  wall:['#e8e1d3','#d9cfbf','#f0ebe0','#cdbfa6','#e3d7b8','#b9a58a','#d6d9d4','#c9b8a4','#e6ddd0','#a8826a','#c7cfd3','#e9d9c4'],
  roof:['#4a4543','#5b3d33','#7a4a36','#3e4247','#6b5a4b','#8a4b3a','#565c61','#3b3a3c'],
  brick:['#9c5a44','#8a4a3a','#a86b4f','#7d4b3c','#b07a5c'],
  apt:['#cfc8bb','#b8b0a2','#a39486','#d8d2c7','#8f7a6a','#c7b299','#e0dcd4','#9c8b7b','#b4a597','#7f6e62','#d9d4ca'],
  com:['#d9d4cc','#c2b6a6','#bfc5c8','#d6c3a5','#a9a39a','#e3ded5','#c9bca8'],
  off:['#5a6770','#3c4750','#8a949b','#2e3740','#6f7b83','#b0b6ba','#4b5a52','#7d8b95'],
  ind:['#9a958c','#8b8f91','#a8a293','#7d8487','#b5ad9c','#6f6a62','#8e7f6d'],
  awn:['#b23a2e','#2f6d9a','#3f7a3f','#c98a1e','#6a3f7a','#2d5d5a','#8b2f3c'],
  neon:['#ff3b6b','#35d0ff','#ffd23f','#7cff5b','#c86bff','#ff8c2a'],
  crop:['#b9a24a','#8fa33c','#6f8a2f','#a58a4a','#c7b35a','#7f9a3a'],
  car:['#f2f2f0','#f2f2f0','#1a1b1d','#1a1b1d','#8c9096','#b9bcc0','#5a5f66','#233a66','#7a1c1c','#c7b9a0','#2d4a3a','#b33b1f','#3d5f8c'],
};
const buildings = new Map(); let bldSeq = 1; const bldGrid = new Map();
function bldIndex(b, add){ const cs = obbCorners(b.x, b.z, b.ang, b.hw, b.hd); const xs = cs.map(c=>c[0]), zs = cs.map(c=>c[1]);
  for(let gx=Math.floor((Math.min(...xs)+EHALF)/32); gx<=Math.floor((Math.max(...xs)+EHALF)/32); gx++) for(let gz=Math.floor((Math.min(...zs)+EHALF)/32); gz<=Math.floor((Math.max(...zs)+EHALF)/32); gz++){
    const k = gx*4096+gz; let s = bldGrid.get(k); if(add){ if(!s) bldGrid.set(k, s = new Set()); s.add(b.id); } else if(s){ s.delete(b.id); if(!s.size) bldGrid.delete(k); } } }
function buildingsNear(x, z, R){ const out = []; for(const id of gridQuery(bldGrid, x-R, z-R, x+R, z+R, 32)){ const b = buildings.get(id); if(b) out.push(b); } return out; }
function blockedByBuilding(x, z, except){ for(const b of buildingsNear(x, z, 4)){ if(b.id === except || (b.kind === 'zone' && b.cells.length)) continue; if(inOBB(x, z, b.x, b.z, b.ang, b.hw+1, b.hd+1)) return true; } return false; }
function buildingAt(x, z){ let best = null; for(const b of buildingsNear(x, z, 4)){ if(inOBB(x, z, b.x, b.z, b.ang, b.hw, b.hd)) best = b; } return best; }
function accessFor(x, z, front, hd){ const px = x + front[0]*(hd+3), pz = z + front[1]*(hd+3);
  const r = nearestSeg(px, pz, 40, s => RT[s.type].car || RT[s.type].pedOK); if(!r) return null; const p = segPoint(r.sg, r.s, {}); const side = ((px-p.x)*(-p.dz) + (pz-p.z)*p.dx) >= 0 ? 1 : -1;
  return { sg:r.sg, s:clamp(r.s, 1, r.sg.len-1), side, x:r.x, z:r.z }; }
function accessNear(x, z, R){ const r = nearestSeg(x, z, R, s => RT[s.type].car); if(!r) return null; const p = segPoint(r.sg, r.s, {}); const side = ((x-p.x)*(-p.dz) + (z-p.z)*p.dx) >= 0 ? 1 : -1; return { sg:r.sg, s:clamp(r.s, 1, r.sg.len-1), side, x:r.x, z:r.z }; }
function flattenUnder(b){ const R = Math.hypot(b.hw, b.hd)+CELL, ei0 = Math.floor((b.x-R+EHALF)/CELL), ej0 = Math.floor((b.z-R+EHALF)/CELL), ei1 = Math.ceil((b.x+R+EHALF)/CELL), ej1 = Math.ceil((b.z+R+EHALF)/CELL);
  let s = 0, n = 0, mn = 1e9; const inside = [];
  for(let ej=ej0;ej<=ej1;ej++) for(let ei=ei0;ei<=ei1;ei++){ const x = ei*CELL-EHALF, z = ej*CELL-EHALF; if(inOBB(x, z, b.x, b.z, b.ang, b.hw+2, b.hd+2)){ const k = ej*NE1+ei; inside.push(k); s += EH[k]; n++; mn = Math.min(mn, EH[k]); } }
  const avg = n ? s/n : heightAt(b.x, b.z); b.y = Math.max(avg, SEA+.6); b.locked = [];
  for(const k of inside){ if(tLock[k]) continue; EH[k] = b.y - .05; tLock[k]++; b.locked.push(k); }
  if(n) updateTerrainRegion(ei0, ej0, ei1, ej1); }

/* ---------- constructeur local ---------- */
function ctx(b){ const cs = Math.cos(b.ang), sn = Math.sin(b.ang), r = mulberry32(b.seed*7 + b.level*131);
  const W = (lx, lz) => [b.x + lx*cs + lz*sn, b.z - lx*sn + lz*cs];
  const part = (pool, lx, ly, lz, sx, sy, sz, color, ex, rot=0) => { const [x,z] = W(lx,lz); const c = typeof color === 'string' ? _c.set(color) : color;
    const h = place(pool, x, b.y+ly, z, sx, sy, sz, b.ang+rot, c, ex); if(h){ b.parts.push(h); b.pp.push([x, b.y+ly, z, sx, sy, sz, b.ang+rot]); } return h; };
  return { r, W, part, hw:b.hw, hd:b.hd,
    fac:(lx,ly,lz,sx,sy,sz,color,st,rot=0) => part(P.fac, lx,ly,lz,sx,sy,sz,color,{ aStyle:ST[st][0], aStyle2:ST[st][1] }, rot),
    facC:(lx,ly,lz,rad,h,color,st) => part(P.facC, lx,ly,lz,rad,h,rad,color,{ aStyle:ST[st][0], aStyle2:ST[st][1] }),
    tree:(lx, lz, h, type='D') => { const [x,z] = W(lx,lz); const t = addTree(x, z, h, type, r, false); if(t){ b.parts.push(t.h); b.pp.push(null); } },
    emit:(lx, ly, lz, rate, shade, big=0) => { const [x,z] = W(lx,lz); b.emit.push({ x, y:b.y+ly, z, rate, shade, acc:0, big }); emitDirty = true; },
    fence:(color='#9a958c', h=1.1) => { part(P.equip, -b.hw+.3, 0, 0, .12, h, b.hd*2-.6, color); part(P.equip, b.hw-.3, 0, 0, .12, h, b.hd*2-.6, color); part(P.equip, 0, 0, -b.hd+.3, b.hw*2-.6, h, .12, color); },
  }; }
const LV = (b) => b.level;
/* ----- résidentiel faible densité ----- */
function genHouse(b, C){ const { r, hw, hd } = C, lv = LV(b), wall = pick(PAL.wall, r), roofc = pick(PAL.roof, r);
  C.part(P.pad, 0, -.4, 0, hw*2-.3, .45, hd*2-.3, '#6f8a4a');
  const fw = Math.min(hw*2-2.5, [6.2,7,8.4,10,11][lv-1]*(.92+r()*.12)), fd = Math.min(hd*2-4, [5.6,6.6,7.4,8.5,9][lv-1]*(.92+r()*.1)), lz0 = hd - fd/2 - 2.2;
  C.part(P.pad, fw/4, 0, hd-1.1, 3, .05, 2.2, '#9c988e');
  if(lv <= 3){ const fl = lv === 1 ? 1 : 2, hh = fl*2.9+.3;
    C.fac(0, 0, lz0, fw, hh, fd, wall, 'house');
    C.part(r() < .5 ? P.roofG : P.roofH, 0, hh, lz0, fw+.7, 1.3+fw*.16, fd+.7, roofc);
    if(r() < .6) C.part(P.chim, fw*.25, hh, lz0-fd*.2, .4, 2.4, .4, '#7d4b3c');
    if(lv >= 2 && hw*2 - fw > 5){ const gx = (fw/2+1.8)*(r()<.5?1:-1); C.fac(gx, 0, lz0+fd/2-2.4, 3.4, 2.8, 5, wall, 'blank'); C.part(P.roofG, gx, 2.8, lz0+fd/2-2.4, 3.8, .9, 5.4, roofc); }
    if(lv >= 3){ C.part(P.equip, 0, 0, lz0+fd/2+.9, fw*.5, .25, 1.8, '#8a7a66'); C.part(P.equip, -fw*.22, 0, lz0+fd/2+1.6, .15, 2.6, .15, '#e6e2da'); C.part(P.equip, fw*.22, 0, lz0+fd/2+1.6, .15, 2.6, .15, '#e6e2da'); C.part(P.equip, 0, 2.6, lz0+fd/2+.9, fw*.55, .15, 1.9, roofc); }
  } else if(lv === 4){ const hh = 6.2; C.fac(-fw*.15, 0, lz0, fw*.7, hh, fd, wall, 'house'); C.part(P.roofH, -fw*.15, hh, lz0, fw*.7+.8, 2.2, fd+.8, roofc);
    C.fac(fw*.3, 0, lz0-fd*.2, fw*.4, 3.3, fd*.8, wall, 'house'); C.part(P.roofH, fw*.3, 3.3, lz0-fd*.2, fw*.4+.8, 1.6, fd*.8+.8, roofc);
    if(hd*2 > 14) C.part(P.poolw, 0, 0, -hd+3.2, Math.min(7, hw*1.2), .12, 3.4, '#2a9fc7');
  } else { C.fac(0, 0, lz0, fw, 3.4, fd, '#eceae5', 'modern'); C.fac(fw*.12, 3.4, lz0-1, fw*.75, 3.2, fd*.9, '#3a3d42', 'modern');
    C.part(P.equip, fw*.12, 6.6, lz0-1, fw*.75+.4, .3, fd*.9+.4, '#2d3035'); if(hd*2 > 14) C.part(P.poolw, -hw*.2, 0, -hd+3, Math.min(8, hw*1.3), .12, 3.6, '#2a9fc7'); }
  if(r() < .85) C.tree(-hw+1.8+r()*(hw*2-3.6), -hd+1.8, 6+r()*5, r() < .2 ? 'C' : 'D');
  if(r() < .5) C.tree(hw-1.6, -hd+2.5+r()*2, 5+r()*4, 'D');
  if(r() < .7) C.fence(pick(['#e8e5de','#8b7355','#6a6d70'], r), .9);
  b.top = 8 + lv; }
/* ----- résidentiel haute densité ----- */
function genApartments(b, C){ const { r, hw, hd } = C, lv = LV(b), area = hw*hd*4, big = area > 500;
  C.part(P.pad, 0, -.4, 0, hw*2-.3, .45, hd*2-.3, '#8b8981');
  const hMul = clamp(Math.sqrt(area)/28, .5, 1.3), H = [11, 17, 26, 40, 62][lv-1]*(.8+r()*.4)*hMul;
  const fw = hw*2-2.4, fd = hd*2-2.4, st = lv >= 5 ? 'aptM' : lv === 1 ? 'brick' : 'apt', c = lv === 1 ? pick(PAL.brick, r) : pick(PAL.apt, r);
  if(lv <= 2){ C.fac(0, 0, 0, fw, H, fd, c, st); C.part(P.equip, 0, H, 0, fw, .8, fd, '#6c6a66');
    if(lv === 2) for(let f=1; f*3 < H-2; f++) C.part(P.equip, 0, f*3, fd/2+.5, fw*.8, .18, 1, '#b5b2ab');
    C.part(P.equip, fw*.2, H, -fd*.1, 3, 2.6, 3.4, '#7a7874'); }
  else if(lv <= 4 || !big){ if(big && r() < .6){ C.fac(-fw/4, 0, 0, fw/2, H, fd, c, st); C.fac(fw/4, 0, fd/4, fw/2, H*.7, fd/2, c, st); }
    else C.fac(0, 0, 0, fw*.92, H, fd*.92, c, st);
    for(let f=1; f*3 < H-3; f+=1) C.part(P.equip, 0, f*3, fd*.46+.45, fw*.6, .16, .9, '#c9c6bf');
    C.part(P.equip, 0, H, 0, fw*.3, 2.8, fd*.3, '#77746f'); C.part(P.metal, fw*.25, H, fd*.2, 1.2, 2.4, 1.2, '#9ea4a8'); }
  else { const pod = 7; C.fac(0, 0, 0, fw, pod, fd, '#b9b3aa', 'shop'); C.fac(0, pod, 0, fw*.55, H-pod, fd*.55, c, st);
    C.part(P.glass, 0, H, 0, fw*.4, 3.2, fd*.4, '#7fa6c2'); C.part(P.pad, fw*.3, pod, -fd*.3, fw*.3, .3, fd*.3, '#56703a'); C.tree(fw*.3, -fd*.3, 5, 'D'); }
  for(let k=0, n=1+Math.floor(r()*3); k<n; k++) C.part(P.equip, (r()-.5)*fw*.5, H, (r()-.5)*fd*.5, 1.4+r()*1.4, 1+r(), 1.4+r()*1.6, '#8f9193');
  if(r() < .6) C.tree(-hw+1.5, hd-1.5, 7, 'D'); b.top = H + 4; }
/* ----- commerces ----- */
function genShop(b, C){ const { r, hw, hd } = C, lv = LV(b);
  C.part(P.pad, 0, -.4, 0, hw*2-.3, .45, hd*2-.3, '#95928a');
  if(lv === 1 && hw > 7 && hd > 7 && r() < .35){ // station-service
    C.part(P.pad, 0, 0, 0, hw*2-1, .06, hd*2-1, '#5d5f62'); C.part(P.equip, 0, 5, hd*.25, hw*1.4, .5, hd*.9, '#e8e8e4'); for(const x of [-hw*.5, hw*.5]) C.part(P.equip, x, 0, hd*.25, .4, 5, .4, '#cfd2d4');
    C.part(P.sign, 0, 5, hd*.25+hd*.45+.05, hw*1.4, .5, .1, pick(PAL.awn, r)); for(const x of [-hw*.3, hw*.3]) C.part(P.equip, x, 0, hd*.25, .8, 1.6, .5, '#b83a2d');
    C.fac(0, 0, -hd*.6, hw*1.2, 4, hd*.6, '#e6e2da', 'shop'); b.top = 7; return; }
  const H = [4.2, 7.5, 11][lv-1]*(.85+r()*.3), fw = hw*2-1.2, fd = hd*2-2.2, c = pick(PAL.com, r);
  C.fac(0, 0, -.6, fw, H, fd, c, 'shop');
  C.part(P.equip, 0, 3.3, fd/2-.6+.6, fw*.92, .22, 1.3, pick(PAL.awn, r));
  C.part(P.sign, 0, H-1.4, fd/2-.6+.07, fw*.6, 1, .14, pick(PAL.neon, r));
  C.part(P.equip, 0, H, -.6, fw, .6, fd, '#6d6b67');
  for(let k=0, n=1+Math.floor(r()*3); k<n; k++) C.part(P.equip, (r()-.5)*fw*.6, H, (r()-.5)*fd*.6, 1.5+r()*2, 1+r()*.8, 1.5+r()*2, '#8c8e90');
  for(let x=-hw+2; x<hw-1; x+=4) C.part(P.bench, x, 0, hd-.8, 1, 1, 1, '#ffffff'); b.top = H + 2; }
function genBigShop(b, C){ const { r, hw, hd } = C, lv = LV(b), fw = hw*2-2, fd = hd*2-2;
  C.part(P.pad, 0, -.4, 0, hw*2-.3, .45, hd*2-.3, '#8e8c86');
  if(lv === 1){ const H = 12+r()*4; C.fac(0, 0, 0, fw, H, fd, pick(PAL.com, r), 'blank'); C.fac(0, 0, fd/2-1, fw*.8, 4.5, 2, '#dcd8d0', 'shop'); C.part(P.sign, 0, H-3, fd/2+.05, fw*.5, 2, .2, pick(PAL.neon, r)); b.top = H+2; }
  else if(lv === 2){ const H = 16+r()*5; C.fac(-fw*.2, 0, -fd*.1, fw*.6, H, fd*.8, pick(PAL.com, r), 'shop'); C.part(P.glass, fw*.25, 0, 0, fw*.4, H*.8, fd*.6, '#9dbbd0'); C.part(P.dome, fw*.25, H*.8, 0, fw*.18, fw*.12, fd*.28, '#a7c4d6');
    C.part(P.sign, -fw*.2, H-3, fd*.3+.05, fw*.4, 2.2, .2, pick(PAL.neon, r)); C.part(P.pad, 0, 0, fd*.42, fw, .06, fd*.16, '#5d5f62'); b.top = H+4; }
  else { const pod = 9, H = (34+r()*28)*clamp(Math.sqrt(hw*hd*4)/28, .6, 1.3); C.fac(0, 0, 0, fw, pod, fd, '#c4bdb1', 'shop'); C.fac(0, pod, -fd*.08, fw*.5, H-pod, fd*.45, pick(PAL.apt, r), 'hotel');
    C.part(P.sign, 0, H-5, -fd*.08+fd*.225+.1, fw*.4, 3, .25, pick(PAL.neon, r)); C.part(P.equip, 0, H, -fd*.08, fw*.3, 3, fd*.3, '#5d5c5a'); C.part(P.poolw, fw*.3, pod, fd*.25, fw*.25, .2, fd*.2, '#2a9fc7'); b.top = H+5; } }
/* ----- bureaux ----- */
function genOffice(b, C){ const { r, hw, hd } = C, lv = LV(b), fw = hw*2-2.6, fd = hd*2-2.6, c = pick(PAL.off, r), area = hw*hd*4;
  C.part(P.pad, 0, -.4, 0, hw*2-.3, .45, hd*2-.3, '#8e8c86');
  if(b.spec === 'tech'){ C.fac(0, 0, 0, fw, 8, fd*.7, '#e8e6e0', 'offG'); for(let x=-fw*.4; x<fw*.4; x+=3) C.part(P.solar, x, 8.1, 0, 2.6, .12, fd*.6, '#1b2a44'); C.tree(-hw+2, hd-2, 7); C.tree(hw-2, -hd+2, 8); b.top = 10; return; }
  const hMul = clamp(Math.sqrt(area)/30, .45, 1.3), H = [16, 34, 72][lv-1]*(.75+r()*.5)*hMul, st = lv === 1 ? 'offO' : 'offG';
  if(lv === 3 && r() < .25){ const rad = Math.min(fw, fd)*.42; C.facC(0, 0, 0, rad, H, c, st); C.part(P.metal, 0, H, 0, rad*.8, 2, rad*.8, '#9aa0a5'); C.part(P.equip, 0, H+2, 0, .4, 14, .4, '#c9ced2'); b.top = H+16; return; }
  if(H > 45){ const h1 = H*(.5+r()*.15), h2 = (H-h1)*.6; C.fac(0, 0, 0, fw, h1, fd, c, st); C.fac(0, h1, 0, fw*.74, h2, fd*.74, c, st); C.fac(0, h1+h2, 0, fw*.5, H-h1-h2, fd*.5, c, st);
    C.part(P.equip, 0, H, 0, fw*.35, 2, fd*.35, '#3d4247'); if(H > 70) C.part(P.equip, 0, H+2, 0, .4, 10+r()*14, .4, '#c9ced2'); }
  else { C.fac(0, 0, 0, fw, H, fd, c, st); C.part(P.equip, 0, H, 0, fw*.8, 1.3, fd*.8, '#43484d'); }
  C.fac(0, 0, fd/2+.5, fw*.5, 4.5, 1.2, '#2f3338', 'offG'); b.top = H + 4; }
/* ----- industrie ----- */
function genIndustry(b, C){ const { r, hw, hd } = C, lv = LV(b), fw = hw*2-2, fd = hd*2-2, c = pick(PAL.ind, r), spec = b.spec;
  C.part(P.pad, 0, -.4, 0, hw*2-.3, .45, hd*2-.3, '#7c7a74');
  if(spec === 'farm'){ const cc = pick(PAL.crop, r); C.part(P.field, 0, 0, -hd*.1, fw, .08, fd*.78, cc);
    C.fac(-hw*.55, 0, hd*.62, Math.min(12, hw*.7), 6, Math.min(8, hd*.5), '#9b3b2e', 'blank'); C.part(P.roofG, -hw*.55, 6, hd*.62, Math.min(12, hw*.7)+.6, 3, Math.min(8, hd*.5)+.6, '#5b5d60');
    C.part(P.metal, hw*.55, 0, hd*.62, 2.4, 11, 2.4, '#b8bcbf'); C.part(P.dome, hw*.55, 11, hd*.62, 2.4, 1.6, 2.4, '#b8bcbf'); b.top = 13; return; }
  if(spec === 'forest'){ C.fac(0, 0, hd*.45, fw*.6, 8, fd*.35, '#8b6f52', 'ware'); C.part(P.saw, 0, 8, hd*.45, fw*.6, 1.6, fd*.35, '#5b5d60');
    for(let k=0;k<6;k++) C.part(P.log, -hw*.5+r()*hw, 0, -hd*.3+r()*hd*.4, 6+r()*4, 1.2+r()*.6, 1.2+r()*.6, '#6b4e35');
    for(let x=-hw+2; x<hw-1; x+=4) C.tree(x, -hd+2, 10+r()*4, 'C'); b.top = 12; return; }
  if(spec === 'ore'){ C.part(P.cone, -hw*.4, 0, -hd*.3, hw*.6, 8+r()*5, hw*.6, '#7a6f62'); C.part(P.cone, hw*.35, 0, -hd*.4, hw*.45, 6+r()*4, hw*.45, '#8a7e70');
    C.fac(hw*.3, 0, hd*.45, fw*.45, 10, fd*.35, '#6d6860', 'ind'); for(const x of [-2.2, 2.2]) C.part(P.equip, -hw*.4+x, 0, hd*.4, .5, 22, .5, '#a14a2e'); C.part(P.equip, -hw*.4, 20, hd*.4, 5, 1, 3, '#a14a2e'); C.part(P.metal, -hw*.4, 21, hd*.4, 1.6, 1.6, 1.6, '#555');
    C.emit(hw*.3, 12, hd*.45, .8, .6); b.top = 24; return; }
  if(spec === 'oil'){ for(let k=0;k<Math.max(2, Math.floor(hw*hd/40));k++) C.part(P.pump, (r()-.5)*fw*.8, 0, (r()-.5)*fd*.6, 1, 1, 1, '#ffffff', null, r()*6);
    C.part(P.metal, hw*.5, 0, hd*.5, 3.5, 7, 3.5, '#d7d9db'); C.part(P.metal, hw*.1, 0, hd*.5, 3.5, 7, 3.5, '#d7d9db'); b.top = 9; return; }
  const H = [7, 9, 12][lv-1]*(.85+r()*.3);
  if(lv === 1){ C.fac(0, 0, .8, fw, H, fd-1.6, c, 'ware'); for(let x=-fw/2+2; x<fw/2-1; x+=4) C.part(P.saw, x, H, .8, 4, 1.8, fd-1.6, '#6e6b66');
    for(let x=-fw/2+3; x<fw/2-2; x+=5) C.part(P.equip, x, 0, (fd-1.6)/2+.85, 3.2, 4, .2, '#3e4145'); }
  else { C.fac(0, 0, hd*.2, fw, H, fd*.6, c, 'ind'); C.part(P.equip, 0, H, hd*.2, fw*.9, .6, fd*.55, '#77736c');
    const ch = H+10+r()*14; C.part(P.chim, fw*.32, 0, -hd+3, 1.1, ch, 1.1, '#8a7a6a'); C.emit(fw*.32, ch+.5, -hd+3, .9*lv, .55);
    for(let k=0;k<(lv === 3 ? 3 : 2);k++) C.part(P.metal, -fw*.35 + k*5, 0, -hd*.55, 2.2, 7+lv*2, 2.2, '#c3c6c4');
    if(lv === 3){ C.part(P.sphere, fw*.05, 5, -hd*.55, 3.5, 3.5, 3.5, '#d4d6d8'); C.part(P.equip, 0, 9, -hd*.2, fw*.7, .8, .8, '#8b8f93'); } }
  C.part(P.cont, -hw+3, 0, hd-4, 1, 1, 1, pick(PAL.awn, r), null, Math.PI/2); b.top = H + 4; }

/* ---------- services publics ---------- */
const SVC = {
  wind:{ name:'Éolienne', cat:'power', w:16, d:16, cost:3500, upkeep:90, power:8, noRoad:true, desc:'8 MW selon le vent' },
  coal:{ name:'Centrale à charbon', cat:'power', w:48, d:40, cost:26000, upkeep:1300, power:90, jobs:[20,30,10,0], pollution:5, noise:3 },
  solar:{ name:'Centrale solaire', cat:'power', w:40, d:40, cost:22000, upkeep:600, power:32, jobs:[2,4,4,2], desc:'32 MW en journée' },
  pump:{ name:'Station de pompage', cat:'water', w:16, d:24, cost:3000, upkeep:220, water:60, shore:true, jobs:[2,3,1,0], desc:'Au bord de l\'eau, en amont des rejets' },
  wtower:{ name:"Château d'eau", cat:'water', w:16, d:16, cost:2500, upkeep:180, water:25, jobs:[1,2,0,0] },
  sewage:{ name:'Rejet des eaux usées', cat:'water', w:16, d:16, cost:2200, upkeep:160, sewage:60, shore:true, jobs:[1,2,0,0], desc:'Pollue l\'eau en aval' },
  treat:{ name:"Station d'épuration", cat:'water', w:40, d:32, cost:18000, upkeep:900, sewage:120, shore:true, clean:true, jobs:[4,8,6,2] },
  landfill:{ name:'Décharge', cat:'garbage', w:48, d:48, cost:4500, upkeep:260, veh:'garbage', vehN:10, garbageCap:120000, jobs:[8,4,0,0], pollution:2 },
  inciner:{ name:'Incinérateur', cat:'garbage', w:40, d:32, cost:20000, upkeep:1100, veh:'garbage', vehN:12, burn:1400, power:15, jobs:[6,10,4,0], pollution:3 },
  recycle:{ name:'Centre de recyclage', cat:'garbage', w:40, d:32, cost:16000, upkeep:800, veh:'garbage', vehN:12, burn:1000, jobs:[6,8,4,0] },
  clinic:{ name:'Clinique', cat:'health', w:24, d:24, cost:8000, upkeep:500, radius:300, veh:'ambulance', vehN:4, beds:40, jobs:[2,6,6,4] },
  hospital:{ name:'Hôpital', cat:'health', w:48, d:40, cost:30000, upkeep:1700, radius:600, veh:'ambulance', vehN:12, beds:220, jobs:[6,20,30,24] },
  cemetery:{ name:'Cimetière', cat:'health', w:40, d:40, cost:6000, upkeep:300, veh:'hearse', vehN:8, graves:3000, jobs:[4,4,0,0] },
  cremat:{ name:'Crématorium', cat:'health', w:32, d:24, cost:12000, upkeep:800, veh:'hearse', vehN:10, burnDead:60, jobs:[4,6,2,0], pollution:1 },
  fire:{ name:'Caserne de pompiers', cat:'fire', w:24, d:24, cost:9000, upkeep:600, radius:400, veh:'fire', vehN:4, jobs:[6,12,4,0] },
  police:{ name:'Commissariat', cat:'police', w:24, d:24, cost:9000, upkeep:600, radius:400, veh:'police', vehN:4, jobs:[4,12,6,2] },
  school:{ name:'École primaire', cat:'edu', w:32, d:32, cost:8000, upkeep:500, radius:350, students:300, eduLv:1, jobs:[2,4,8,6] },
  lycee:{ name:'Lycée', cat:'edu', w:48, d:40, cost:16000, upkeep:1000, radius:700, students:900, eduLv:2, jobs:[4,6,12,14] },
  univ:{ name:'Université', cat:'edu', w:72, d:56, cost:40000, upkeep:2200, radius:1400, students:2200, eduLv:3, jobs:[6,10,20,40] },
  depot:{ name:'Dépôt de bus', cat:'transit', w:40, d:32, cost:12000, upkeep:600, jobs:[4,10,4,0] },
  metro:{ name:'Station de métro', cat:'transit', w:16, d:16, cost:8000, upkeep:400, jobs:[2,4,2,0] },
  station:{ name:'Gare', cat:'transit', w:64, d:24, cost:25000, upkeep:1100, rail:true, jobs:[6,12,8,2], desc:'À placer le long d\'une voie ferrée' },
  port:{ name:'Port de fret', cat:'transit', w:64, d:48, cost:38000, upkeep:1500, shore:true, jobs:[20,30,10,2], noise:3, desc:'Exporte les marchandises par bateau' },
  airport:{ name:'Aéroport', cat:'transit', w:320, d:110, cost:110000, upkeep:4000, jobs:[30,60,60,40], noise:4, unique:true, desc:'Attire les touristes' },
  park:{ name:'Petit parc', cat:'parks', w:16, d:16, cost:800, upkeep:60, radius:160, ent:1 },
  playground:{ name:'Aire de jeux', cat:'parks', w:16, d:16, cost:900, upkeep:70, radius:160, ent:1 },
  plaza:{ name:'Place piétonne', cat:'parks', w:24, d:24, cost:1600, upkeep:100, radius:200, ent:1.2 },
  bigpark:{ name:'Grand parc', cat:'parks', w:48, d:48, cost:6000, upkeep:300, radius:350, ent:2 },
  sports:{ name:'Terrain de sport', cat:'parks', w:40, d:24, cost:4000, upkeep:200, radius:300, ent:1.5 },
  stadium:{ name:'Stade', cat:'parks', w:96, d:80, cost:80000, upkeep:2600, radius:1200, ent:4, unique:true, tourism:3, noise:3 },
  cityhall:{ name:'Hôtel de ville', cat:'parks', w:40, d:32, cost:40000, upkeep:900, radius:900, ent:2, unique:true, tourism:1 },
  tower:{ name:'Tour panoramique', cat:'parks', w:24, d:24, cost:60000, upkeep:1400, radius:1200, ent:3, unique:true, tourism:4 },
};
for(const k in SVC) SVC[k].key = k;
const svcGen = {
  wind(b, C){ C.part(P.pad, 0, -.3, 0, 10, .4, 10, '#8d8a83'); const grp = new THREE.Group(); const [x,z] = C.W(0,0); grp.position.set(x, b.y, z); grp.rotation.y = -.6;
    const tower = new THREE.Mesh(TURB.tower, MAT.white); tower.castShadow = true; grp.add(tower); const nac = new THREE.Mesh(TURB.nac, MAT.white); nac.position.set(0, 58, .6); nac.castShadow = true; grp.add(nac);
    const rotor = new THREE.Group(); rotor.position.set(0, 58, 3.2); for(let k=0;k<3;k++){ const bl = new THREE.Mesh(TURB.blade, MAT.white); bl.rotation.z = k*Math.PI*2/3; bl.castShadow = true; rotor.add(bl); }
    rotor.rotation.z = C.r()*6; grp.add(rotor); scene.add(grp); b.meshes.push(grp); b.rotor = rotor; b.top = 82; },
  coal(b, C){ C.part(P.pad, 0, -.4, 0, 47, .45, 39, '#6d6a64'); C.fac(-8, 0, 6, 22, 18, 20, '#6d6862', 'ind'); C.part(P.equip, -8, 18, 6, 22, .8, 20, '#55524d');
    for(const x of [-14, -6]){ C.part(P.chim, x, 0, -12, 2.2, 60, 2.2, '#8b7f73'); C.emit(x, 61, -12, 4, .35); }
    const [x,z] = C.W(12, -4); const ct = new THREE.Mesh(TURB.cool, MAT.concrete); ct.position.set(x, b.y, z); ct.castShadow = ct.receiveShadow = true; scene.add(ct); b.meshes.push(ct);
    b.emit.push({ x, y:b.y+34, z, rate:6, shade:.95, acc:0, big:1 }); C.part(P.cone, 12, 0, 13, 7, 5, 5, '#222'); b.top = 62; },
  solar(b, C){ C.part(P.pad, 0, -.4, 0, 39, .45, 39, '#8a8a70'); for(let z=-16; z<=14; z+=4.5) for(let x=-16; x<=16; x+=8.4) C.part(P.solar, x, .8, z, 7.8, .15, 3.2, '#1b2a44', null); C.fac(15, 0, 16, 7, 3.5, 5, '#e6e2da', 'svc'); b.top = 5; },
  pump(b, C){ C.part(P.pad, 0, -.4, 0, 15, .45, 23, '#8d8a83'); C.fac(0, 0, 5, 10, 6, 9, '#c9c4ba', 'svc'); C.part(P.metal, 0, 0, -6, 1.2, 1.2, 10, '#5a6b78'); C.part(P.metal, 0, -3, -11, 1.4, 4, 1.4, '#5a6b78'); b.top = 8; },
  wtower(b, C){ C.part(P.pad, 0, -.4, 0, 15, .45, 15, '#8d8a83'); for(const [x,z] of [[2,2],[-2,2],[2,-2],[-2,-2]]) C.part(P.equip, x, 0, z, .45, 18, .45, '#7d858b');
    C.part(P.metal, 0, 17, 0, 4.4, 7, 4.4, '#b7c3cc'); C.part(P.cone, 0, 24, 0, 4.6, 2.5, 4.6, '#8e9aa3'); b.top = 27; },
  sewage(b, C){ C.part(P.pad, 0, -.4, 0, 15, .45, 15, '#8d8a83'); C.fac(0, 0, 3, 8, 4, 6, '#b8b2a6', 'svc'); C.part(P.metal, 0, 0, -5, 1.6, 1.6, 8, '#6b5a44'); C.emit(0, .5, -9, 2, .45); b.top = 6; },
  treat(b, C){ C.part(P.pad, 0, -.4, 0, 39, .45, 31, '#8d8a83'); for(const [x,z] of [[-10,-5],[5,-5],[-10,8],[5,8]]){ C.part(P.metal, x, 0, z, 5.5, 2.2, 5.5, '#c9ccce'); C.part(P.poolw, x, 2.2, z, 9.6, .05, 9.6, '#4b6b4a'); }
    C.fac(15, 0, 10, 8, 6, 9, '#d8d4cc', 'svc'); b.top = 8; },
  landfill(b, C){ C.part(P.pad, 0, -.4, 0, 47, .45, 47, '#6e6452'); C.part(P.pad, 0, 0, 0, 40, .6, 38, '#5a5044'); b.mound = C.part(P.cone, 0, .3, -2, 16, 2, 15, '#6a6153'); C.fac(-18, 0, 20, 8, 4, 6, '#b4ada0', 'svc'); C.fence('#7a756c', 2); b.top = 12; },
  inciner(b, C){ C.part(P.pad, 0, -.4, 0, 39, .45, 31, '#77736c'); C.fac(-4, 0, 3, 24, 14, 20, '#8d8a84', 'ind'); C.part(P.chim, 12, 0, -10, 2, 42, 2, '#8a7a6a'); C.emit(12, 43, -10, 3, .5); b.top = 44; },
  recycle(b, C){ C.part(P.pad, 0, -.4, 0, 39, .45, 31, '#77736c'); C.fac(-3, 0, 4, 26, 10, 18, '#6b8e5a', 'ware'); for(let k=0;k<5;k++) C.part(P.cont, -14+k*6, 0, -10, 1, 1, 1, pick(PAL.awn, C.r)); b.top = 12; },
  clinic(b, C){ C.part(P.pad, 0, -.4, 0, 23, .45, 23, '#8d8a83'); C.fac(0, 0, 1, 18, 8, 14, '#e9ecee', 'svc'); C.part(P.sign, 0, 8, 1, 4, .3, 1.2, '#d22b2b'); C.part(P.sign, 0, 8, 1, 1.2, .31, 4, '#d22b2b'); C.tree(-8, -9, 7); b.top = 10; },
  hospital(b, C){ C.part(P.pad, 0, -.4, 0, 47, .45, 39, '#8d8a83'); C.fac(-6, 0, 2, 30, 24, 18, '#e4e7ea', 'svc'); C.fac(12, 0, -4, 16, 12, 26, '#d9dde1', 'svc');
    C.part(P.sign, -6, 24, 2, 6, .35, 1.8, '#d22b2b'); C.part(P.sign, -6, 24, 2, 1.8, .36, 6, '#d22b2b'); C.part(P.pad, 12, 12, -4, 10, .15, 10, '#4f5357'); C.part(P.sign, 12, 12.15, -4, 5, .05, .6, '#f0f0ea'); b.top = 26; },
  cemetery(b, C){ C.part(P.pad, 0, -.4, 0, 39, .45, 39, '#5f7d43'); for(let z=-15; z<=12; z+=2.6) for(let x=-15; x<=15; x+=2.2) if(C.r() < .8) C.part(P.grave, x, 0, z, 1, .8+C.r()*.5, 1, '#ffffff');
    C.fac(0, 0, 16, 8, 6, 5, '#d8d2c4', 'svc'); C.part(P.roofG, 0, 6, 16, 8.6, 3.5, 5.6, '#4a4543'); C.fence('#3e3f41', 1.4); for(let x=-16;x<=16;x+=8) C.tree(x, -18, 9, 'P'); b.top = 10; },
  cremat(b, C){ C.part(P.pad, 0, -.4, 0, 31, .45, 23, '#6f8a4a'); C.fac(0, 0, 2, 20, 8, 12, '#d6d0c2', 'svc'); C.part(P.roofG, 0, 8, 2, 20.6, 4, 12.6, '#3e4247'); C.part(P.chim, 7, 8, -2, .9, 8, .9, '#8a7a6a'); C.emit(7, 16.5, -2, .6, .7); b.top = 16; },
  fire(b, C){ C.part(P.pad, 0, -.4, 0, 23, .45, 23, '#8d8a83'); C.fac(-2, 0, 1, 16, 9, 16, '#9a3a2c', 'svc'); for(const x of [-7, -2, 3]) C.part(P.equip, x, 0, 9.05, 4, 4.2, .15, '#c9ccd0');
    C.fac(8, 0, -5, 4, 17, 4, '#8d3528', 'svc'); b.top = 18; },
  police(b, C){ C.part(P.pad, 0, -.4, 0, 23, .45, 23, '#8d8a83'); C.fac(0, 0, 1, 18, 10, 14, '#3e5374', 'svc'); C.part(P.sign, 0, 10, 8.1, 8, 1.2, .2, '#2a6bd6'); C.part(P.equip, 8, 0, 9, .12, 8, .12, '#cfd3d6'); C.part(P.sign, 8.6, 6.5, 9, 1.2, .8, .05, '#2a6bd6'); b.top = 12; },
  school(b, C){ C.part(P.pad, 0, -.4, 0, 31, .45, 31, '#8d8a83'); C.fac(-6, 0, 5, 18, 9, 16, '#a4553c', 'svc'); C.fac(6, 0, 8, 10, 9, 8, '#a4553c', 'svc');
    C.part(P.pad, 7, 0, -8, 14, .06, 12, '#b5714c'); C.part(P.equip, 7, 0, -8, 3, 2.2, 3, '#e0b43a'); C.tree(-12, -12, 8); b.top = 11; },
  lycee(b, C){ C.part(P.pad, 0, -.4, 0, 47, .45, 39, '#8d8a83'); C.fac(-10, 0, 8, 24, 13, 16, '#b8a48a', 'svc'); C.fac(12, 0, 10, 14, 10, 12, '#b8a48a', 'svc');
    C.part(P.pad, 0, 0, -10, 36, .06, 16, '#b8674a'); C.part(P.pad, 0, .07, -10, 26, .06, 9, '#4f8a3a'); b.top = 15; },
  univ(b, C){ C.part(P.pad, 0, -.4, 0, 71, .45, 55, '#6f8a4a'); C.fac(-20, 0, 12, 24, 16, 20, '#c9b89a', 'svc'); C.fac(20, 0, 12, 24, 16, 20, '#c9b89a', 'svc'); C.fac(0, 0, -16, 40, 12, 16, '#c9b89a', 'svc');
    C.fac(0, 0, 18, 8, 30, 8, '#b5a383', 'svc'); C.part(P.cone, 0, 30, 18, 5.5, 8, 5.5, '#4a4f55'); C.part(P.pad, 0, 0, 0, 30, .06, 4, '#b3a78d'); for(let k=0;k<8;k++) C.tree(-30+k*8.5, 0, 9); b.top = 40; },
  depot(b, C){ C.part(P.pad, 0, -.4, 0, 39, .45, 31, '#5d5f62'); C.fac(-6, 0, 6, 26, 8, 16, '#8f9aa3', 'ware'); for(let k=0;k<4;k++) C.part(P.equip, 10, 0, -12+k*4, 12, 3, 2.5, '#d8b43a'); b.top = 10; },
  metro(b, C){ C.part(P.pad, 0, -.4, 0, 15, .45, 15, '#8d8a83'); C.part(P.glass, 0, 0, 1, 10, 4, 7, '#8fb6cc'); C.part(P.equip, 0, 4, 1, 11, .4, 8, '#2f3338'); C.part(P.sign, 0, 5, 1, 2.2, 2.2, .3, '#e0b43a'); b.top = 7; },
  station(b, C){ C.part(P.pad, 0, -.4, 0, 63, .45, 23, '#8d8a83'); C.fac(0, 0, 4, 36, 12, 12, '#d6c6a4', 'svc'); C.part(P.roofG, 0, 12, 4, 37, 5, 12.6, '#51565b'); C.fac(0, 0, 4, 8, 22, 8, '#cbb993', 'svc');
    C.part(P.equip, 0, 3.5, -8, 60, .3, 6, '#6c7075'); for(let x=-28;x<=28;x+=8) C.part(P.equip, x, 0, -8, .3, 3.5, .3, '#3d4145'); b.top = 24; },
  port(b, C){ C.part(P.pad, 0, -.4, 0, 63, .45, 47, '#6e6c68'); for(let k=0;k<30;k++) C.part(P.cont, -26+(k%6)*5.2, (Math.floor(k/12))*2.6, 4+Math.floor(k%12/6)*6.5, 1, 1, 1, pick(PAL.awn, C.r), null, Math.PI/2);
    C.part(P.crane, -10, 0, -18, 1, 1, 1, '#ffffff', null, Math.PI); C.part(P.crane, 14, 0, -18, 1, 1, 1, '#ffffff', null, Math.PI); C.fac(22, 0, 16, 16, 9, 12, '#9aa3ab', 'svc'); b.top = 32; },
  airport(b, C){ C.part(P.pad, 0, -.4, 0, 319, .45, 109, '#6f8a4a'); C.part(P.pad, 0, .05, -30, 300, .06, 30, '#3e4043'); for(let x=-140; x<140; x+=12) C.part(P.pad, x, .12, -30, 7, .02, .8, '#e6e4dc');
    C.part(P.pad, 0, .05, 18, 220, .06, 36, '#56585b'); C.fac(-40, 0, 44, 120, 14, 18, '#cfd6db', 'offG'); C.part(P.glass, -40, 14, 44, 120, 1, 18, '#9fbfd6');
    C.fac(80, 0, 40, 8, 34, 8, '#d8dbde', 'svc'); C.part(P.glass, 80, 34, 40, 11, 5, 11, '#6f97b3'); C.part(P.equip, 80, 39, 40, 12, .6, 12, '#3d4145'); b.top = 40; b.runway = C.W(-150, -30).concat(C.W(150, -30)); },
  park(b, C){ C.part(P.pad, 0, -.4, 0, 15.8, .5, 15.8, '#4f7e35'); C.part(P.pad, 0, .1, 0, 1.6, .05, 15, '#b3a78d'); C.part(P.pad, 0, .1, 0, 15, .05, 1.6, '#b3a78d');
    C.tree(-4.2,-4.2,9+C.r()*4); C.tree(4.2,-4,8+C.r()*4); C.tree(-4,4.3,10,'C'); C.tree(4.2,4.2,8); C.part(P.bench, -2.2, .1, -1.5, 1, 1, 1, '#fff'); C.part(P.bench, 2.2, .1, 1.5, 1, 1, 1, '#fff', null, Math.PI); b.top = 12; },
  playground(b, C){ C.part(P.pad, 0, -.4, 0, 15.8, .5, 15.8, '#4f7e35'); C.part(P.pad, 0, .1, 0, 10, .06, 10, '#c9a96e'); C.part(P.equip, -2, .1, -1, 3, 2.6, 1.6, '#d23b2b'); C.part(P.equip, 2.5, .1, 2, .15, 2.2, 3, '#2f6d9a');
    C.part(P.equip, 2.5, 2.2, 2, .15, .15, 3.2, '#2f6d9a'); C.part(P.sphere, -2.5, .6, 3, .8, .5, .8, '#e0b43a'); C.tree(-6, 6, 8); C.tree(6, -6, 9); b.top = 10; },
  plaza(b, C){ C.part(P.pad, 0, -.4, 0, 23.8, .5, 23.8, '#bcb4a4'); C.part(P.metal, 0, .1, 0, 4, .6, 4, '#9aa0a6'); C.part(P.poolw, 0, .7, 0, 6.8, .05, 6.8, '#3aa3c9');
    for(const [x,z] of [[-8,-8],[8,-8],[-8,8],[8,8]]) C.tree(x, z, 8, 'P'); for(let k=0;k<4;k++) C.part(P.bench, [-5,5,0,0][k], .1, [0,0,-5,5][k], 1, 1, 1, '#fff', null, k*Math.PI/2); b.top = 10; },
  bigpark(b, C){ C.part(P.pad, 0, -.4, 0, 47.8, .5, 47.8, '#4c7c33'); C.part(P.poolw, 6, .12, 4, 18, .05, 12, '#2f7d99'); C.part(P.pad, -12, .1, 0, 2, .05, 46, '#b3a78d'); C.part(P.pad, 0, .1, -14, 46, .05, 2, '#b3a78d');
    for(let k=0;k<22;k++){ const x = -21+C.r()*42, z = -21+C.r()*42; if(Math.abs(x-6) < 10 && Math.abs(z-4) < 7) continue; C.tree(x, z, 8+C.r()*6, C.r() < .25 ? 'C' : 'D'); } b.top = 14; },
  sports(b, C){ C.part(P.pad, 0, -.4, 0, 39.8, .5, 23.8, '#8d8a83'); C.part(P.pad, 0, .1, 0, 34, .06, 19, '#3f8a3a'); C.part(P.pad, 0, .17, 0, .15, .02, 19, '#f0f0ea');
    for(const x of [-16.5, 16.5]) C.part(P.equip, x, .1, 0, .2, 2.4, 7, '#f0f0ea'); b.top = 6; },
  stadium(b, C){ C.part(P.pad, 0, -.4, 0, 95, .45, 79, '#8d8a83'); C.part(P.pad, 0, .1, 0, 60, .06, 40, '#3f8a3a');
    for(let k=0;k<24;k++){ const a = k/24*Math.PI*2, x = Math.cos(a)*38, z = Math.sin(a)*30; C.fac(x, 0, z, 11, 14 + (k%6===0?4:0), 7, '#d6d6d0', 'blank', -a+Math.PI/2); }
    for(const [x,z] of [[-40,-32],[40,-32],[-40,32],[40,32]]){ C.part(P.equip, x, 0, z, .8, 34, .8, '#8d9196'); C.part(P.sign, x, 34, z, 5, 3, 1, '#fff6d8'); } b.top = 36; },
  cityhall(b, C){ C.part(P.pad, 0, -.4, 0, 39.8, .5, 31.8, '#bcb4a4'); C.fac(0, 0, 2, 32, 16, 18, '#e3dccd', 'svc'); for(let x=-12;x<=12;x+=4) C.part(P.equip, x, 0, 11.5, 1.1, 14, 1.1, '#f2efe8');
    C.part(P.equip, 0, 14, 11.5, 28, 2, 2, '#e8e3d8'); C.part(P.dome, 0, 16, 2, 7, 7, 7, '#6f8a8c'); C.part(P.equip, 0, 23, 2, .3, 5, .3, '#c9a64a'); b.top = 30; },
  tower(b, C){ C.part(P.pad, 0, -.4, 0, 23.8, .5, 23.8, '#bcb4a4'); C.part(P.metal, 0, 0, 0, 3.2, 150, 3.2, '#d9dcdf'); C.part(P.sphere, 0, 150, 0, 9, 9, 9, '#c7ccd1'); C.part(P.glass, 0, 146, 0, 9.5, 4, 9.5, '#7fa6c2');
    C.part(P.metal, 0, 158, 0, .8, 40, .8, '#e6e8ea'); C.part(P.sign, 0, 197, 0, .8, .8, .8, '#ff2a2a'); for(const a of [0, 2.1, 4.2]) C.part(P.equip, Math.cos(a)*5, 0, Math.sin(a)*5, 1.5, 24, 1.5, '#cfd3d6'); b.top = 200; },
};
const TURB = { tower:new THREE.CylinderGeometry(1,1.9,58,14).translate(0,29,0), nac:new THREE.BoxGeometry(2.4,2.6,6.5), blade:new THREE.BoxGeometry(1.2,24,.3).translate(0,12.5,0),
  cool:new THREE.LatheGeometry(Array.from({length:16},(_,k)=>{ const y = k/15*34; return new THREE.Vector2(9*Math.sqrt(1+((y-24)/12)**2)*.62, y); }), 32) };
TURB.cool.computeVertexNormals();

/* ---------- cycle de vie ---------- */
function newBuilding(o){ const b = Object.assign({ id:bldSeq++, parts:[], pp:[], meshes:[], emit:[], cells:[], level:1, seed:Math.floor(rnd()*1e9), y:0, top:10,
    res:[], work:[], stud:[], homes:0, jobsCap:[0,0,0,0], garbage:0, crime:0, fire:null, dead:0, sick:0, happy:.7, lv:30, problems:0,
    powered:true, watered:true, sewered:true, abandoned:false, burned:false, goods:0, visits:0, access:null, built:0 }, o);
  buildings.set(b.id, b); return b; }
function buildModel(b){
  for(const h of b.parts) if(h.pool) h.pool.remove(h); for(const m of b.meshes) scene.remove(m); b.parts.length = 0; b.pp.length = 0; b.meshes.length = 0; b.emit.length = 0; emitDirty = true;
  const C = ctx(b);
  if(b.burned){ C.part(P.pad, 0, -.4, 0, b.hw*2-.3, .45, b.hd*2-.3, '#2d2a27'); for(let k=0;k<6;k++) C.part(P.equip, (C.r()-.5)*b.hw*1.4, 0, (C.r()-.5)*b.hd*1.4, 2+C.r()*3, .6+C.r()*1.8, 2+C.r()*3, '#232120'); b.top = 3; return; }
  if(b.kind === 'svc') svcGen[b.type](b, C);
  else if(b.zone <= 1) genHouse(b, C); else if(b.zone === 2) genApartments(b, C); else if(b.zone === 3) genShop(b, C); else if(b.zone === 4) genBigShop(b, C);
  else if(b.zone === 5) genIndustry(b, C); else genOffice(b, C);
  if(b.abandoned) for(const h of b.parts){ if(!h.pool || h.pool === TREES.D || h.pool === TREES.C || h.pool === TREES.P) continue; const a = h.pool.mesh.instanceColor.array; a[h.i*3]*=.42; a[h.i*3+1]*=.4; a[h.i*3+2]*=.38; }
  if(b.kind === 'zone' && !b.built){ b.grow = 0; animateGrowth(b, .02); }
}
function animateGrowth(b, f){ for(let k=0;k<b.parts.length;k++){ const h = b.parts[k], p = b.pp[k]; if(!h.pool || !p) continue; _q.setFromAxisAngle(UP, p[6]);
    _m.compose(_p.set(p[0], b.y + (p[1]-b.y)*f, p[2]), _q, _s.set(p[3], Math.max(.01, p[4]*f), p[5])); h.pool.setMatrix(h, _m); } }
const growing = new Set();
function tickGrowth(dt){ for(const b of growing){ if(!buildings.has(b.id)){ growing.delete(b); continue; } b.grow = Math.min(1, (b.grow||0) + dt*.35); animateGrowth(b, smooth(0, 1, b.grow)); if(b.grow >= 1){ b.built = 1; growing.delete(b); } } }
function zoneCapacity(b){ const area = b.hw*b.hd*4, lv = b.level, z = b.zone; b.homes = 0; b.jobsCap = [0,0,0,0];
  const J = (n, dist) => dist.map(f => Math.round(n*f));
  if(z === 1) b.homes = Math.max(1, Math.round(area/80*[1,1.2,1.4,1.5,1.6][lv-1]));
  else if(z === 2) b.homes = Math.round(area/20*[1,1.6,2.4,3.4,4.6][lv-1]);
  else if(z === 3) b.jobsCap = J(area/28*[1,1.4,1.8][lv-1], [.45,.35,.15,.05]);
  else if(z === 4) b.jobsCap = J(area/22*[1,1.6,2.4][lv-1], [.3,.4,.2,.1]);
  else if(z === 5) b.jobsCap = J(area/30*[1,1.3,1.6][lv-1]*(b.spec === 'farm' ? .5 : 1), lv === 1 ? [.55,.3,.1,.05] : lv === 2 ? [.35,.4,.2,.05] : [.2,.35,.3,.15]);
  else if(z === 6) b.jobsCap = J(area/14*[1,1.8,3][lv-1]*(b.spec === 'tech' ? .6 : 1), b.spec === 'tech' ? [0,.1,.3,.6] : [.05,.2,.4,.35]); }
function createZoneBuilding(lot, z, spec, level=1, built=false){
  const cs = lot.cells, mid = cs[Math.floor(cs.length/2)];
  let x = 0, zz = 0; for(const c of cs){ x += c.x; zz += c.z; } x /= cs.length; zz /= cs.length;
  let sx = 0, sz = 0; for(const c of cs) if(c.r === 0){ sx += Math.sin(c.ang); sz += Math.cos(c.ang); } const ang = (sx || sz) ? Math.atan2(sx, sz) : mid.ang;
  const b = newBuilding({ kind:'zone', zone:z, spec, level, x, z:zz, ang, hw:lot.w*ZC/2-.2, hd:lot.d*ZC/2-.2, segId:lot.seg.id, cells:cs.map(c => c.id), built:built ? 1 : 0 });
  b.front = [Math.sin(ang), Math.cos(ang)]; for(const c of cs) c.bld = b.id; zoneDirty = true;
  b.district = districtAt(x, zz); flattenUnder(b); bldIndex(b, true); removeTrees((tx,tz) => inOBB(tx, tz, b.x, b.z, b.ang, b.hw+1, b.hd+1), x-40, zz-40, x+40, zz+40);
  b.access = accessFor(x, zz, b.front, b.hd); zoneCapacity(b); buildModel(b); if(!built) growing.add(b);
  bus.emit('buildingAdded', b); return b; }
function reattachBuilding(b){ // après la découpe d'un segment : rattache le bâtiment aux nouvelles cellules
  const ids = []; for(const c of cellsInRadius(b.x, b.z, Math.hypot(b.hw, b.hd)+4)){ if(inOBB(c.x, c.z, b.x, b.z, b.ang, b.hw+.5, b.hd+.5) && !c.bld){ c.bld = b.id; c.zone = b.zone; ids.push(c.id); b.segId = c.seg; } }
  b.cells = ids; zoneDirty = true; }
function removeBuilding(b, silent=false){
  if(!buildings.has(b.id)) return; for(const h of b.parts) if(h.pool) h.pool.remove(h); for(const m of b.meshes) scene.remove(m); b.parts.length = 0; emitDirty = true;
  for(const id of b.cells){ const c = cells[id]; if(c && c.bld === b.id) c.bld = 0; } for(const k of b.locked||[]) if(tLock[k]) tLock[k]--;
  bldIndex(b, false); buildings.delete(b.id); growing.delete(b); zoneDirty = true;
  if(b.kind === 'svc'){ const R = Math.hypot(b.hw, b.hd)+10; revalidate(b.x-R, b.z-R, b.x+R, b.z+R); covDirty = true; if(b.dam) { applyDam(b.dam, -1); WATER.dams = WATER.dams.filter(d => d !== b.dam); } }
  bus.emit('buildingRemoved', b); if(selected && selected.obj === b) select(null);
}
function upgradeBuilding(b){ b.level++; zoneCapacity(b); b.built = 0; buildModel(b); growing.add(b); bus.emit('buildingLevel', b); }

/* placement d'un service : aligné sur la route la plus proche */
function svcPlacement(key, x, z, rot=0){
  const d = SVC[key]; const hw = d.w/2, hd = d.d/2;
  let ang = rot, cx = x, cz = z, seg = null;
  if(!d.noRoad){ const r = nearestSeg(x, z, Math.max(60, hd+40), s => d.rail ? RT[s.type].net === 'rail' : (RT[s.type].car || (key === 'metro' || d.cat === 'parks') && RT[s.type].pedOK));
    if(r){ const p = segPoint(r.sg, r.s, {}), t = RT[r.sg.type]; const side = ((x-p.x)*(-p.dz) + (z-p.z)*p.dx) >= 0 ? 1 : -1; const rx = -p.dz*side, rz = p.dx*side;
      cx = p.x + rx*(t.hw + hd + 1.2); cz = p.z + rz*(t.hw + hd + 1.2); ang = Math.atan2(-rx, -rz); seg = r.sg; } }
  return { key, x:cx, z:cz, ang, hw, hd, seg };
}
function svcValid(pl){
  const d = SVC[pl.key];
  if(!d.noRoad && !pl.seg) return d.rail ? 'Doit longer une voie ferrée' : 'Doit être le long d\'une route';
  if(d.unique && [...buildings.values()].some(b => b.type === pl.key)) return 'Bâtiment unique déjà construit';
  const cs = obbCorners(pl.x, pl.z, pl.ang, pl.hw, pl.hd); for(const [x,z] of cs) if(!inPlay(x, z, 2)) return 'Hors de la carte';
  const front = [Math.sin(pl.ang), Math.cos(pl.ang)];
  let hmin = 1e9, hmax = -1e9, wet = 0, n = 0;
  for(let u=-1; u<=1.001; u+=.25) for(let v=-1; v<=1.001; v+=.25){ const lx = u*pl.hw, lz = v*pl.hd, x = pl.x + lx*Math.cos(pl.ang) + lz*Math.sin(pl.ang), z = pl.z - lx*Math.sin(pl.ang) + lz*Math.cos(pl.ang);
    const h = heightAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); n++; if(isWet(x, z, .3)) wet++;
    if(!roadClear(x, z, .5, -1)) return 'Chevauche une route';
    for(const o of buildingsNear(x, z, 2)) if(o.kind === 'svc' && inOBB(x, z, o.x, o.z, o.ang, o.hw, o.hd)) return 'Chevauche un bâtiment'; }
  if(d.shore){ let ok = false; for(const dd of [6, 14, 24, 36]) for(const lat of [-.5, 0, .5]){ const bx = pl.x - front[0]*(pl.hd+dd) + front[1]*lat*pl.hw, bz = pl.z - front[1]*(pl.hd+dd) - front[0]*lat*pl.hw; if(isWet(bx, bz, .5)) ok = true; }
    if(!ok) return 'Doit être au bord de l\'eau (arrière vers l\'eau)'; if(wet > n*.35) return 'Trop dans l\'eau'; }
  else if(wet) return 'Terrain inondé';
  if(hmax - hmin > (d.w > 60 ? 14 : 9)) return 'Terrain trop pentu';
  if(state.money < d.cost) return 'Fonds insuffisants';
  return ''; }
function placeService(pl, free=false){
  const d = SVC[pl.key];
  for(const o of buildingsNear(pl.x, pl.z, Math.hypot(pl.hw, pl.hd)+4)) if(o.kind === 'zone' && obbOverlap({ x:o.x, z:o.z, ang:o.ang, hw:o.hw, hd:o.hd }, pl)) removeBuilding(o, true);
  const b = newBuilding({ kind:'svc', type:pl.key, x:pl.x, z:pl.z, ang:pl.ang, hw:pl.hw, hd:pl.hd, front:[Math.sin(pl.ang), Math.cos(pl.ang)], built:1 });
  b.jobsCap = (d.jobs || [1,1,0,0]).slice(); b.vehOut = 0; b.store = 0; b.district = districtAt(b.x, b.z);
  flattenUnder(b); bldIndex(b, true); removeTrees((tx,tz) => inOBB(tx, tz, b.x, b.z, b.ang, b.hw+1, b.hd+1), b.x-b.hw-b.hd, b.z-b.hw-b.hd, b.x+b.hw+b.hd, b.z+b.hw+b.hd);
  b.access = d.noRoad ? null : d.rail ? accessNear(b.x, b.z, 90) : accessFor(b.x, b.z, b.front, b.hd); buildModel(b);
  const R = Math.hypot(b.hw, b.hd)+10; revalidate(b.x-R, b.z-R, b.x+R, b.z+R);
  if(!free) state.money -= d.cost; covDirty = true; bus.emit('buildingAdded', b); return b; }

/* ---------- icônes de problèmes au-dessus des bâtiments ---------- */
const PROB = { power:1, water:2, sewage:4, garbage:8, fire:16, sick:32, dead:64, crime:128, road:256, aband:512, work:1024, flood:2048 };
const ICON_ORDER = ['fire','flood','dead','power','water','sewage','garbage','sick','crime','road','aband','work'];
const iconTex = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
  const draw = (k, bg, fn) => { const x = (k%4)*64+32, y = Math.floor(k/4)*64+32; g.fillStyle = bg; g.beginPath(); g.arc(x, y, 27, 0, Math.PI*2); g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke(); g.save(); g.translate(x, y); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round'; fn(); g.restore(); };
  draw(0, '#e5532d', () => { g.beginPath(); g.moveTo(0,-15); g.bezierCurveTo(12,-2,10,14,0,15); g.bezierCurveTo(-10,14,-12,-2,0,-15); g.fill(); });
  draw(1, '#2f7fd6', () => { for(const y of [-6, 4]){ g.beginPath(); g.moveTo(-14,y); for(let x=-14;x<=14;x+=2) g.lineTo(x, y+Math.sin(x/3)*3); g.stroke(); } });
  draw(2, '#3a3f45', () => { g.beginPath(); g.arc(0,-3,10,0,Math.PI*2); g.fill(); g.fillRect(-6,4,12,8); g.fillStyle = '#3a3f45'; g.beginPath(); g.arc(-4,-3,3,0,7); g.arc(4,-3,3,0,7); g.fill(); });
  draw(3, '#e8b21c', () => { g.beginPath(); g.moveTo(3,-16); g.lineTo(-8,2); g.lineTo(0,2); g.lineTo(-3,16); g.lineTo(8,-2); g.lineTo(0,-2); g.closePath(); g.fill(); });
  draw(4, '#2a8fd6', () => { g.beginPath(); g.moveTo(0,-15); g.bezierCurveTo(10,-2,10,12,0,12); g.bezierCurveTo(-10,12,-10,-2,0,-15); g.fill(); });
  draw(5, '#7a5a3a', () => { g.beginPath(); g.moveTo(-12,-6); g.lineTo(12,-6); g.stroke(); g.beginPath(); g.moveTo(-9,-6); g.lineTo(-7,13); g.lineTo(7,13); g.lineTo(9,-6); g.stroke(); });
  draw(6, '#6a8a3a', () => { g.strokeRect(-10,-8,20,20); g.beginPath(); g.moveTo(-13,-8); g.lineTo(13,-8); g.moveTo(-4,-8); g.lineTo(-3,-13); g.lineTo(3,-13); g.lineTo(4,-8); g.stroke(); });
  draw(7, '#d63a4a', () => { g.fillRect(-4,-13,8,26); g.fillRect(-13,-4,26,8); });
  draw(8, '#2a3a7a', () => { g.beginPath(); g.arc(-6,0,6,0,7); g.stroke(); g.beginPath(); g.arc(6,0,6,0,7); g.stroke(); });
  draw(9, '#8a8f95', () => { g.beginPath(); g.moveTo(-12,12); g.lineTo(-4,-12); g.moveTo(12,12); g.lineTo(4,-12); g.moveTo(0,-9); g.lineTo(0,-5); g.moveTo(0,1); g.lineTo(0,5); g.stroke(); });
  draw(10, '#5a5048', () => { g.beginPath(); g.moveTo(-12,12); g.lineTo(-12,-2); g.lineTo(0,-12); g.lineTo(12,-2); g.lineTo(12,12); g.stroke(); g.beginPath(); g.moveTo(-6,-6); g.lineTo(6,6); g.moveTo(6,-6); g.lineTo(-6,6); g.stroke(); });
  draw(11, '#8a6ad6', () => { g.strokeRect(-12,-6,24,16); g.beginPath(); g.moveTo(-5,-6); g.lineTo(-5,-11); g.lineTo(5,-11); g.lineTo(5,-6); g.stroke(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const ICON_IDX = { fire:0, flood:1, dead:2, power:3, water:4, sewage:6, garbage:5, crime:8, sick:7, road:9, aband:10, work:11 };
const ICAP = 3000, iconPos = new Float32Array(ICAP*3), iconIdx = new Float32Array(ICAP);
const iconGeo = new THREE.BufferGeometry(); iconGeo.setAttribute('position', new THREE.BufferAttribute(iconPos,3).setUsage(THREE.DynamicDrawUsage)); iconGeo.setAttribute('aI', new THREE.BufferAttribute(iconIdx,1).setUsage(THREE.DynamicDrawUsage));
const iconMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{ uTex:{value:iconTex}, uScale:{value:500}, uTime:U.uTime },
  vertexShader:`attribute float aI; uniform float uScale, uTime; varying float vI; void main(){ vec3 p = position; p.y += sin(uTime*3.0 + p.x*0.1)*0.6; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(9.0*uScale/-mv.z, 14.0, 44.0); vI = aI; }`,
  fragmentShader:`uniform sampler2D uTex; varying float vI; void main(){ vec2 uv = gl_PointCoord; uv.y = 1.0 - uv.y; vec2 cell = vec2(mod(vI,4.0), 3.0 - floor(vI/4.0)); vec4 c = texture2D(uTex, (cell + uv)/4.0); if(c.a < 0.1) discard; gl_FragColor = c; }` });
const icons = new THREE.Points(iconGeo, iconMat); icons.frustumCulled = false; icons.renderOrder = 20; scene.add(icons);
function refreshIcons(){ let n = 0;
  for(const b of buildings.values()){ if(!b.problems || n >= ICAP) continue; let k = null; for(const name of ICON_ORDER) if(b.problems & PROB[name]){ k = name; break; } if(!k) continue;
    iconPos[n*3] = b.x; iconPos[n*3+1] = b.y + b.top + 5; iconPos[n*3+2] = b.z; iconIdx[n] = ICON_IDX[k]; n++; }
  iconGeo.setDrawRange(0, n); iconGeo.attributes.position.needsUpdate = true; iconGeo.attributes.aI.needsUpdate = true; }
