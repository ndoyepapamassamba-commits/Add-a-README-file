/* ================= nouvelle partie, ville d'exemple, sauvegarde ================= */
function resetWorld(){
  for(let i=agents.length-1;i>=0;i--) removeAgent(i); laneLists.clear(); timers.length = 0; fires.clear(); for(const k in REQ) REQ[k].length = 0;
  for(const b of [...buildings.values()]){ for(const m of b.meshes) scene.remove(m); } buildings.clear(); bldGrid.clear(); growing.clear(); bldSeq = 1;
  for(const sg of segs.values()) clearDeco(sg); for(const nd of nodes.values()) clearDeco(nd); segs.clear(); nodes.clear(); nodeSeq = 1; segSeq = 1; NET_VERSION++;
  for(const ch of chunks){ ch.mesh.geometry.dispose(); ch.mesh.geometry = new THREE.BufferGeometry(); ch.dirty = false; }
  cells.length = 0; cellFree.length = 0; cellGrid.clear(); segGrid.clear(); zoneDirty = true;
  for(const p of POOLS) p.clear(); treeGrid.clear(); lampSpots.clear(); glowDirty = true;
  for(const L of [...lines]) lines.splice(lines.indexOf(L), 1); lineSeq = 1; ships.length = 0; planes.length = 0;
  districts.clear(); distGrid.fill(0); distSeq = 1; districtsDirty = true;
  cimTop = 0; cimFree.length = 0; CZ.flags.fill(0);
  for(const k in fld) fld[k].fill(k === 'lval' ? 25 : 0); covDirty = true; smN = 0; emitDirty = true; lastEnvKey = '';
  Object.assign(state, { money:120000, time:DAY*0 + 8*60, taxes:{ Rl:9, Rh:9, Cl:9, Ch:9, I:9, O:9 }, budgets:{ power:100, water:100, garbage:100, health:100, fire:100, police:100, edu:100, transit:100, parks:100, roads:100 },
    loans:[], policies:{}, pop:0, workers:0, unemployed:0, students:0, jobs:0, happy:.7, tourists:0, net:0, income:{}, expense:{}, history:[], milestones:0, goods:{ prod:0, need:0, imp:0, exp:0, local:0 }, fares:0, touristSpend:0 });
  select(null); simTickN = 0;
}
function buildOutside(){ // autoroute depuis le bord est, voie ferrée depuis le bord ouest
  const chain = (pts, type, outsideFirst) => { let prev = null; const made = [];
    for(let k=0;k<pts.length;k++){ const [x,z] = pts[k]; const nd = newNode(x, z, heightAt(x,z)); if(k === 0 && outsideFirst) nd.outside = true; if(prev){ const sg = newSeg(prev.id, nd.id, (prev.x+x)/2, (prev.z+z)/2, type); made.push(sg); } prev = nd; }
    for(const sg of made){ conformTerrain(sg); segAdded(sg); removeTrees((x,z) => distToSeg(sg, x, z) < RT[type].hw+3, sg.midX-80, sg.midZ-80, sg.midX+80, sg.midZ+80); } return prev; };
  const hw = chain([[EHALF-4, MAP.hwZ],[EHALF-110, MAP.hwZ],[EHALF-220, MAP.hwZ],[HALF+5, MAP.hwZ],[HALF-80, MAP.hwZ],[HALF-170, MAP.hwZ]], 'highway', true);
  const rl = chain([[-EHALF+4, MAP.railZ],[-EHALF+110, MAP.railZ],[-EHALF+220, MAP.railZ],[-HALF-5, MAP.railZ],[-HALF+90, MAP.railZ]], 'rail', true);
  return { hw, rl }; }
async function newGame(kind, seed){
  $('#loader').hidden = false; progress('Génération du relief…', .1); await nextFrame();
  resetWorld(); state.seed = seed; state.name = kind === 'demo' ? 'Val-Clair' : 'Nouvelle ville'; genTerrain(seed); updateTerrainRegion(); progress('Mise en eau de la rivière…', .25); await nextFrame();
  initWater(); for(let k=0;k<500;k++) stepWater(.25); updateWaterMesh();
  progress('Plantation des forêts…', .4); await nextFrame(); genTrees(quality === 'low' ? .55 : 1);
  progress('Connexions extérieures…', .5); await nextFrame(); const ext = buildOutside();
  if(kind === 'demo'){ progress('Construction de la ville…', .6); await nextFrame(); await buildDemo(ext); }
  else state.money = 150000;
  progress('Finalisation…', .95); await nextFrame(); rebuildChunks(999); refreshDistricts(); distributeUtilities(); updateFields(); updateStats(); refreshIcons();
  const tx = kind === 'demo' ? 200 : HALF-240, tz = kind === 'demo' ? -20 : MAP.hwZ; controls.target.set(tx, heightAt(tx,tz), tz); camera.position.set(tx-420, 330, tz+460);
  if(kind === 'demo') { camera.position.set(tx-360, 260, tz+420); }
  $('#cityName').textContent = state.name; $('#loader').hidden = true; setTool('select');
  if(kind !== 'demo') setTimeout(() => toast('Reliez-vous à l\'autoroute à l\'est, zonez le long des routes, puis construisez électricité, eau et égouts.', true), 800);
}
/* ---------- ville d'exemple ---------- */
async function buildDemo(ext){
  state.money = 1e9; quietToasts = true;
  const R = (ax, az, bx, bz, type, cx, cz) => { const A = snapAt(ax, az, type), B = snapAt(bx, bz, type); const C = cx === undefined ? { x:(A.x+B.x)/2, z:(A.z+B.z)/2 } : { x:cx, z:cz }; roadOpt.elev = 0; try { return commitRoad(A, C, B, type); } catch(e){ console.warn(e); return null; } };
  const snapAt = (x, z, type) => { const n = nearestNode(x, z, 8); if(n) return { x:n.x, z:n.z, node:n }; const r = nearestSeg(x, z, 14); if(r && r.s > 6 && r.s < r.sg.len-6) return { x:r.x, z:r.z, seg:r.sg, s:r.s }; return { x, z }; };
  const hwEnd = ext.hw; // x ≈ 790
  // axe principal : boulevard depuis l'autoroute
  R(hwEnd.x, hwEnd.z, 600, MAP.hwZ, 'boulevard'); R(600, MAP.hwZ, 136, MAP.hwZ, 'boulevard');
  const XS = [40, 136, 232, 328, 424, 520], ZS = [-342, -246, -150, -54, 42, 138, 234];
  for(const x of XS) for(let k=0;k<ZS.length-1;k++){ const t = x === 232 ? 'avenue' : x === 424 && k > 1 ? 'busave' : 'street'; R(x, ZS[k], x, ZS[k+1], t); }
  for(const z of ZS){ if(z === MAP.hwZ) { R(40, z, 136, z, 'avenue'); continue; } for(let k=0;k<XS.length-1;k++){ const t = z === 42 ? 'avenue' : 'street'; R(XS[k], z, XS[k+1], z, t); } }
  await nextFrame();
  // pont vers l'ouest et banlieue en courbes
  const rxA = riverX(42); R(40, 42, rxA - 140, 42, 'avenue');
  const W0 = rxA - 140; R(W0, 42, W0 - 120, 42, 'street'); roadOpt.radius = 32; buildRoundabout(W0 - 150, 42);
  R(W0 - 182, 42, W0 - 320, 42, 'street');
  R(W0 - 150, 10, W0 - 150, -120, 'street'); R(W0 - 150, 74, W0 - 150, 180, 'street');
  R(W0 - 150, -120, W0 - 300, -60, 'street', W0 - 260, -140); R(W0 - 150, 180, W0 - 300, 120, 'street', W0 - 270, 200);
  R(W0 - 300, -60, W0 - 320, 42, 'street', W0 - 340, -20); R(W0 - 320, 42, W0 - 300, 120, 'street', W0 - 345, 90);
  R(W0 - 60, 42, W0 - 60, 160, 'street', W0 - 20, 110); R(W0 - 60, 42, W0 - 70, -90, 'street', W0 - 20, -30);
  await nextFrame();
  // vers le port au sud
  const cz0 = x => coastZ(x) - 72; R(40, cz0(40), 200, cz0(200), 'street', 120, cz0(120)); R(200, cz0(200), 420, cz0(420), 'street', 310, cz0(310));
  R(232, 234, 232, 420, 'avenue'); const cz = coastZ(232); R(232, 420, 232, cz - 72, 'avenue'); R(40, 234, -30, 300, 'street'); R(136, 234, 136, 330, 'street'); R(136, 330, 232, 330, 'street'); R(328, 234, 328, 330, 'street'); R(328, 330, 232, 330, 'street');
  // routes le long de la rivière et de la côte (pompes en amont, rejets en aval, port)
  const rv = z => riverX(z) + 64; R(rv(-490), -490, rv(-320), -320, 'street', rv(-405), -405); R(40, -342, rv(-320), -320, 'street');
  R(rv(380), 380, rv(560), 560, 'street', rv(470), 470); R(136, 330, rv(380), 380, 'street');
  // zone industrielle au nord-est
  R(600, MAP.hwZ, 600, -380, 'avenue'); R(600, -380, 800, -380, 'street'); R(700, -380, 700, -260, 'street'); R(600, -260, 800, -260, 'street'); R(800, -380, 800, -260, 'street'); R(520, -342, 600, -342, 'street');
  // voie ferrée jusqu'à la gare
  const rlEnd = ext.rl; R(rlEnd.x, rlEnd.z, W0 - 420, MAP.railZ, 'rail'); R(W0 - 420, MAP.railZ, -60, MAP.railZ + 20, 'rail', W0 - 200, MAP.railZ - 10);
  await nextFrame(); rebuildChunks(999);
  // zonage
  const ctr = [280, -10];
  for(const c of cells){ if(!c || !c.valid) continue; const sg = segs.get(c.seg); if(!sg || sg.type === 'rail') continue; const x = c.x, z = c.z, d = Math.hypot(x-ctr[0], z-ctr[1]);
    let zz = 0;
    if(x > 560 && z < -200) zz = 5;
    else if(x < 20) zz = c.r < 2 && rnd() < .12 ? 3 : 1;
    else if(z > 250) zz = rnd() < .5 ? 1 : 2;
    else if(d < 150) zz = rnd() < .55 ? 6 : 4;
    else if(d < 260) zz = sg.type === 'avenue' || sg.type === 'boulevard' || sg.type === 'busave' ? (rnd() < .6 ? 4 : 2) : (rnd() < .7 ? 2 : 3);
    else if(d < 380) zz = sg.type !== 'street' ? 3 : (rnd() < .55 ? 2 : 1);
    else zz = rnd() < .8 ? 1 : 3;
    if(z < -290 && x > 20 && x < 560) zz = rnd() < .5 ? 5 : 1;
    if(c.r >= (zz === 1 ? 2 : 3)) zz = 0;
    c.zone = zz; }
  zoneDirty = true; await nextFrame();
  // services
  const S = (key, x, z) => { for(let r=0;r<260;r+=16) for(let a=0;a<6.28;a+=r ? 16/r : 7){ const pl = svcPlacement(key, x + Math.cos(a)*r, z + Math.sin(a)*r, 0); if(!svcValid(pl)) return placeService(pl); } return null; };
  S('coal', 760, -330); S('landfill', 690, -320); for(let k=0;k<4;k++) S('wind', 850, -430 + k*50);
  S('pump', riverX(-470) + 40, -470); S('pump', riverX(-430) + 40, -430); S('wtower', 300, -300); S('wtower', W0 - 200, -30);
  S('sewage', riverX(520) + 40, 520); S('sewage', riverX(545) + 40, 545);
  S('police', 180, 90); S('police', W0 - 110, 100); S('fire', 380, -100); S('fire', W0 - 220, 20); S('clinic', W0 - 90, -20); S('hospital', 470, 90);
  S('school', 90, -200); S('school', W0 - 250, 90); S('school', 380, 180); S('lycee', 180, 300); S('univ', 470, -300); S('cemetery', 70, 300); S('recycle', 650, -200);
  S('park', 280, 20); S('plaza', 180, -100); S('bigpark', 360, 300); S('playground', W0 - 280, -20); S('park', 280, -200); S('sports', 90, 180); S('cityhall', 280, -100);
  S('depot', 470, -200); S('metro', 185, -10); S('metro', 380, 90); S('metro', 470, -100); S('station', -60, MAP.railZ + 20); S('port', 310, coastZ(310) - 40);
  await nextFrame();
  // quartiers
  const dPl = newDistrict(); dPl.name = 'Le Plateau'; paintDistrict(280, -10, 220, dPl.id);
  const dJa = newDistrict(); dJa.name = 'Les Jardins'; dJa.policies.smoke = true; paintDistrict(W0 - 180, 40, 200, dJa.id);
  const dZi = newDistrict(); dZi.name = 'Zone industrielle'; dZi.policies.heavyBan = false; paintDistrict(700, -320, 150, dZi.id);
  refreshDistricts();
  // bâtiments existants
  const front = cells.filter(c => c && c.valid && c.zone && c.r === 0); for(let k=front.length-1;k>0;k--){ const q = Math.floor(rnd()*(k+1)); [front[k], front[q]] = [front[q], front[k]]; }
  for(let pass=0; pass<3; pass++) for(const c of front){ if(c.bld) continue; const lot = findLot(c, c.zone, null); if(!lot) continue; const d = Math.hypot(c.x-ctr[0], c.z-ctr[1]);
    const lv = c.zone <= 2 ? (d < 250 ? 2 + Math.floor(rnd()*3) : d < 450 ? 1 + Math.floor(rnd()*3) : 1 + Math.floor(rnd()*2)) : (d < 200 ? 2 + Math.floor(rnd()*2) : 1 + Math.floor(rnd()*2));
    const b = createZoneBuilding(lot, c.zone, null, Math.min(ZONES[c.zone].maxLv, lv), true); }
  for(const b of buildings.values()) b.built = 1;
  await nextFrame(); progress('Arrivée des habitants…', .8); await nextFrame();
  // habitants
  for(const b of buildings.values()){ if(b.kind !== 'zone' || !b.homes) continue; const n = Math.round(b.homes*(1.9 + rnd()*.9)); const edB = (b.level-1)/4;
    for(let q=0;q<n;q++){ const r = rnd(); const age = r < .22 ? rnd()*18 : r < .85 ? 18 + rnd()*47 : 65 + rnd()*25; const e = rnd() + edB*.5; const edu = age < 14 ? 0 : age < 18 ? 1 : e > 1.1 ? 3 : e > .75 ? 2 : e > .35 ? 1 : 0; newCim(b, age, edu); } }
  distributeUtilities(); updateFields();
  // besoins en énergie et en eau de la ville d'exemple
  for(let k=0;k<3 && state.power.use*1.15 > state.power.prod;k++){ S('coal', 700 + k*60, -420); distributeUtilities(); }
  for(let k=0;k<6 && state.water.use*1.1 > state.water.prod;k++){ S('pump', riverX(-500 + k*60) + 40, -500 + k*60); distributeUtilities(); }
  for(let k=0;k<4 && state.sewage.use*1.1 > state.sewage.prod;k++){ S('sewage', riverX(520 + k*20) - 40, 520 + k*20); distributeUtilities(); }
  bldArr.length = 0; for(const b of buildings.values()) bldArr.push(b); workList = bldArr.filter(b => !b.abandoned && (b.jobsCap[0]+b.jobsCap[1]+b.jobsCap[2]+b.jobsCap[3]) > 0); schoolList = bldArr.filter(b => b.kind === 'svc' && SVC[b.type].students);
  for(let i=0;i<cimTop;i++){ if(!(CZ.flags[i] & F_ALIVE)) continue; const a = CZ.age[i], home = buildings.get(CZ.home[i]); if(a >= 6 && a < 18) enrollSchool(i, home, a < 14 ? 1 : 2); else if(a >= 18 && a < 22 && rnd() < .5) enrollSchool(i, home, 3); if(a >= 18 && a < 65 && !CZ.school[i]) findJob(i, home); }
  // lignes de transport
  const bus1 = newLine('bus'); for(const [x,z] of [[136,-60],[232,-150],[330,-150],[424,-60],[424,40],[330,40],[232,40],[136,40]]){ const st = stopFromPoint(x, z); if(st){ addStopVisual(st); bus1.stops.push(st); } } if(bus1.stops.length > 2) finishLine(bus1);
  const bus2 = newLine('bus'); for(const [x,z] of [[40,40],[W0-60,42],[W0-150,-60],[W0-150,120],[W0-100,42]]){ const st = stopFromPoint(x, z); if(st){ addStopVisual(st); bus2.stops.push(st); } } if(bus2.stops.length > 2) finishLine(bus2);
  const mets = [...buildings.values()].filter(b => b.type === 'metro'); if(mets.length >= 2){ const m = newLine('metro'); for(const b of mets) m.stops.push({ x:b.x, z:b.z, b, wait:0 }); finishLine(m); }
  state.money = 185000; state.time = 7.5*60; state.milestones = 0;
  for(let k=0;k<4;k++){ simTick(); }
  updateStats(); state.milestones = MILESTONES.filter(m => state.pop >= m[0]).reduce((a,m) => m[0], 0); quietToasts = false;
}
/* ---------- sauvegarde ---------- */
const SAVE_KEY = 'urbania-save-v2';
function b64(u8){ let s = ''; for(let k=0;k<u8.length;k+=8192) s += String.fromCharCode.apply(null, u8.subarray(k, k+8192)); return btoa(s); }
function unb64(s){ return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function rle(a){ const out = []; let v = a[0], n = 0; for(let k=0;k<a.length;k++){ if(a[k] === v) n++; else { out.push(v, n); v = a[k]; n = 1; } } out.push(v, n); return out.join(','); }
function unrle(s, a){ const p = s.split(',').map(Number); let k = 0; for(let q=0;q<p.length;q+=2){ a.fill(p[q], k, k+p[q+1]); k += p[q+1]; } }
function save(){ try {
  const hs = new Int16Array(NE1*NE1); for(let k=0;k<hs.length;k++) hs[k] = Math.round(clamp(EH[k], -300, 300)*100);
  const wdd = new Uint16Array(WNN); for(let k=0;k<WNN;k++) wdd[k] = Math.min(65535, Math.round(wd[k]*100));
  const N_ = [...nodes.values()].map(n => [n.id, +n.x.toFixed(2), +n.z.toFixed(2), +n.y.toFixed(2), n.lights ? 1 : 0, n.outside ? 1 : 0]);
  const S_ = [...segs.values()].map(s => [s.id, s.a, s.b, +s.cx.toFixed(2), +s.cz.toFixed(2), s.type, s.name, s.tunnel ? 1 : 0]);
  const Z_ = []; for(const c of cells) if(c && c.zone) Z_.push([c.seg, c.side, c.k, c.r, c.zone]);
  const B_ = [...buildings.values()].map(b => b.kind === 'zone' ? ['z', b.id, b.zone, b.spec||'', b.level, +b.x.toFixed(2), +b.z.toFixed(2), +b.ang.toFixed(4), +b.hw.toFixed(2), +b.hd.toFixed(2), b.seed, b.abandoned ? 1 : 0, b.burned ? 1 : 0]
    : b.type === 'dam' ? ['d', b.id, b.dam.x0, b.dam.z0, b.dam.x1, b.dam.z1, b.dam.crest] : ['s', b.id, b.type, +b.x.toFixed(2), +b.z.toFixed(2), +b.ang.toFixed(4), Math.round(b.store||0)]);
  const n = cimTop, pack = (A) => b64(new Uint8Array(A.buffer, 0, n*A.BYTES_PER_ELEMENT));
  const C_ = { n, home:pack(CZ.home), work:pack(CZ.work), school:pack(CZ.school), age:pack(CZ.age), edu:pack(CZ.edu), health:pack(CZ.health), flags:pack(CZ.flags), name:pack(CZ.name), jl:pack(CZ.jl) };
  const L_ = lines.map(L => ({ type:L.type, name:L.name, color:L.color, stops:L.stops.map(s => L.type === 'bus' ? [s.x, s.z] : [s.b.id]) }));
  const D_ = [...districts.values()].map(d => [d.id, d.name, d.color, d.policies, d.spec]);
  const data = { v:2, seed:state.seed, name:state.name, st:{ money:state.money, time:state.time, taxes:state.taxes, budgets:state.budgets, loans:state.loans, policies:state.policies, weatherMode:state.weatherMode, milestones:state.milestones, history:state.history.slice(-240) },
    h:b64(new Uint8Array(hs.buffer)), wd:b64(new Uint8Array(wdd.buffer)), src:WATER.sources.filter(s => !s.natural).map(s => [s.x, s.z, s.q]),
    nodes:N_, segs:S_, zones:Z_, blds:B_, cims:C_, lines:L_, dist:D_, dgrid:rle(distGrid),
    cam:[camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z] };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch(e){ console.warn(e); return false; } }
async function load(){ let data; try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){ return false; } if(!data || data.v !== 2) return false;
  $('#loader').hidden = false; progress('Chargement de la sauvegarde…', .15); await nextFrame();
  resetWorld(); state.seed = data.seed; state.name = data.name; genTerrain(data.seed);
  const hs = new Int16Array(unb64(data.h).buffer); for(let k=0;k<hs.length;k++) EH[k] = hs[k]/100; updateTerrainRegion();
  initWater(); const wdd = new Uint16Array(unb64(data.wd).buffer); for(let k=0;k<WNN;k++) wd[k] = wdd[k]/100; for(const [x,z,q] of data.src||[]) addWaterSource(x, z, q);
  progress('Végétation…', .3); await nextFrame(); genTrees(quality === 'low' ? .55 : 1);
  progress('Routes…', .45); await nextFrame();
  for(const [id,x,z,y,li,out] of data.nodes){ const n = newNode(x, z, y, { id }); n.lights = !!li; n.outside = !!out; } nodeSeq = Math.max(1, ...data.nodes.map(n => n[0])) + 1;
  for(const [id,a,b,cx,cz,type,name,tun] of data.segs){ if(!nodes.has(a) || !nodes.has(b)) continue; const sg = newSeg(a, b, cx, cz, type, { id, name, tunnel:!!tun }); } segSeq = Math.max(1, ...data.segs.map(s => s[0])) + 1;
  for(const sg of [...segs.values()].sort((p,q) => p.id - q.id)){ conformTerrain(sg); segAdded(sg); removeTrees((x,z) => distToSeg(sg, x, z) < RT[sg.type].hw+2, sg.midX-sg.len/2-20, sg.midZ-sg.len/2-20, sg.midX+sg.len/2+20, sg.midZ+sg.len/2+20); }
  const zmap = new Map(); for(const [seg,side,k,r,z] of data.zones) zmap.set(seg+':'+side+':'+k+':'+r, z); for(const c of cells) if(c){ const z = zmap.get(c.seg+':'+c.side+':'+c.k+':'+c.r); if(z) c.zone = z; }
  progress('Bâtiments…', .65); await nextFrame();
  for(const e of data.blds){
    if(e[0] === 's'){ const [,id,type,x,z,ang,store] = e; const d = SVC[type]; if(!d) continue; const pl = { key:type, x, z, ang, hw:d.w/2, hd:d.d/2, seg:null }; const b = placeServiceAt(pl, id); b.store = store; }
    else if(e[0] === 'd'){ const [,id,x0,z0,x1,z1,crest] = e; placeDam({ x:x0, z:z0 }, { x:x1, z:z1 }, { crest }); }
    else { const [,id,zone,spec,level,x,z,ang,hw,hd,seed,ab,burn] = e; const b = newBuilding({ id, kind:'zone', zone, spec:spec||null, level, x, z, ang, hw, hd, seed, abandoned:!!ab, burned:!!burn, built:1 }); b.front = [Math.sin(ang), Math.cos(ang)];
      b.district = districtAt(x, z); flattenUnder(b); bldIndex(b, true); reattachBuilding(b); b.access = accessFor(x, z, b.front, b.hd); zoneCapacity(b); buildModel(b);
      removeTrees((tx,tz) => inOBB(tx, tz, b.x, b.z, b.ang, b.hw+1, b.hd+1), x-40, z-40, x+40, z+40); } }
  bldSeq = Math.max(1, ...[...buildings.keys()]) + 1;
  progress('Habitants…', .8); await nextFrame();
  const C = data.cims, n = C.n; if(n > CCAP) allocCims(Math.pow(2, Math.ceil(Math.log2(n))));
  const unpack = (A, s) => { const u = unb64(s); new Uint8Array(A.buffer, 0, u.length).set(u); };
  unpack(CZ.home, C.home); unpack(CZ.work, C.work); unpack(CZ.school, C.school); unpack(CZ.age, C.age); unpack(CZ.edu, C.edu); unpack(CZ.health, C.health); unpack(CZ.flags, C.flags); unpack(CZ.name, C.name); unpack(CZ.jl, C.jl);
  cimTop = n; for(let i=0;i<n;i++){ CZ.loc[i] = 0; CZ.happy[i] = 70; CZ.flags[i] &= ~(F_TRAVEL|F_HOSP); if(!(CZ.flags[i] & F_ALIVE)){ cimFree.push(i); continue; }
    const h = buildings.get(CZ.home[i]); if(!h){ CZ.flags[i] = 0; cimFree.push(i); continue; } h.res.push(i); if(CZ.flags[i] & F_DEAD) h.dead++; if(CZ.flags[i] & F_SICK) h.sick++;
    const w = buildings.get(CZ.work[i]); if(w) w.work.push(i); else CZ.work[i] = 0; const s = buildings.get(CZ.school[i]); if(s) s.stud.push(i); else CZ.school[i] = 0; }
  for(const b of buildings.values()) fixJobCounts(b);
  for(const [id,name,color,pol,spec] of data.dist){ districts.set(id, { id, name, color, policies:pol||{}, spec:spec||'', cx:0, cz:0, n:0 }); distSeq = Math.max(distSeq, id+1); } unrle(data.dgrid, distGrid); districtsDirty = true;
  for(const Ld of data.lines){ const L = newLine(Ld.type); L.name = Ld.name; L.color = Ld.color;
    for(const s of Ld.stops){ if(Ld.type === 'bus'){ const st = stopFromPoint(s[0], s[1]); if(st){ addStopVisual(st); L.stops.push(st); } } else { const b = buildings.get(s[0]); if(b) L.stops.push({ x:b.x, z:b.z, b, wait:0 }); } } if(L.stops.length >= 2) finishLine(L); }
  Object.assign(state, data.st); state.history = data.st.history || [];
  rebuildChunks(999); refreshDistricts(); distributeUtilities(); updateFields(); updateStats(); refreshIcons();
  if(data.cam){ camera.position.set(data.cam[0], data.cam[1], data.cam[2]); controls.target.set(data.cam[3], data.cam[4], data.cam[5]); }
  $('#cityName').textContent = state.name; $('#loader').hidden = true; setTool('select'); return true; }
function placeServiceAt(pl, id){ const d = SVC[pl.key]; const b = newBuilding({ id, kind:'svc', type:pl.key, x:pl.x, z:pl.z, ang:pl.ang, hw:pl.hw, hd:pl.hd, front:[Math.sin(pl.ang), Math.cos(pl.ang)], built:1 });
  b.jobsCap = (d.jobs || [1,1,0,0]).slice(); b.vehOut = 0; b.district = districtAt(b.x, b.z); flattenUnder(b); bldIndex(b, true);
  removeTrees((tx,tz) => inOBB(tx, tz, b.x, b.z, b.ang, b.hw+1, b.hd+1), b.x-b.hw-b.hd, b.z-b.hw-b.hd, b.x+b.hw+b.hd, b.z+b.hw+b.hd);
  b.access = d.noRoad ? null : d.rail ? accessNear(b.x, b.z, 90) : accessFor(b.x, b.z, b.front, b.hd); buildModel(b); const R = Math.hypot(b.hw, b.hd)+10; revalidate(b.x-R, b.z-R, b.x+R, b.z+R); covDirty = true; return b; }
