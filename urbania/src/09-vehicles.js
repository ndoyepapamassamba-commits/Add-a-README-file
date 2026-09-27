/* ================= véhicules et piétons ================= */
const VP = {}; // pools par modèle
for(const k of ['sedan','hatch','suv','van','truck','bus','fire','police','ambulance','garbage','hearse','train']){ const v = VEH[k];
  VP[k] = new Pool(v.geo, MAT.veh, k === 'sedan' || k === 'hatch' ? 1024 : 256, { receive:false });
  if(v.lights) VP[k].link(v.lights, MAT.vlight); if(v.siren) VP[k].link(v.siren, MAT.siren); }
VP.ped = new Pool(PED, MAT.walker, 1024, { receive:false });
const agents = []; let agentSeq = 1;
const CAPS = { veh:900, ped:500 };
const laneLists = new Map();
const CAR_MODELS = ['sedan','sedan','hatch','hatch','suv','van'];
const MODEL_LEN = k => k === 'ped' ? .6 : VEH[k].len;
const counts = () => { let v = 0, p = 0; for(const a of agents){ if(a.kind === 'ped') p++; else v++; } return { v, p }; };
let agentCount = { v:0, p:0 };

function laneIndexFor(sg, dir, kind, turn){
  const t = RT[sg.type]; let best = -1, bv = 0; const cands = [];
  t.lanes.forEach((l, i) => { if(l.dir !== dir && !(kind === 'ped')) return; if(kind === 'ped') return;
    const ok = l.kind === 'car' || (l.kind === 'bus' && (kind === 'bus' || kind === 'fire' || kind === 'police' || kind === 'ambulance')) || (l.kind === 'rail' && kind === 'train');
    if(kind === 'train' && l.kind !== 'rail') return; if(ok && (kind !== 'train' || l.kind === 'rail')) cands.push(i); });
  if(!cands.length) return -1;
  if(turn > .3){ for(const i of cands){ const v = t.lanes[i].off*dir; if(best < 0 || v > bv){ best = i; bv = v; } } return best; }
  if(turn < -.3){ for(const i of cands){ const v = t.lanes[i].off*dir; if(best < 0 || v < bv){ best = i; bv = v; } } return best; }
  if(kind === 'bus'){ for(const i of cands) if(t.lanes[i].kind === 'bus') return i; }
  return cands[Math.floor(rnd()*cands.length)];
}
function legPrep(legs, kind){
  const out = [];
  for(let q=0;q<legs.length;q++){ const L = legs[q], sg = L.sg, dir = L.to >= L.from ? 1 : -1; let from = L.from, to = L.to;
    const tA = sg.trimA||0, tB = sg.trimB||0;
    if(q > 0) from = dir > 0 ? Math.max(from, tA) : Math.min(from, sg.len - tB);
    if(q < legs.length-1) to = dir > 0 ? Math.min(Math.max(to, from), sg.len - tB) : Math.max(Math.min(to, from), tA);
    out.push({ sg, from, to, dir }); }
  // choix des voies selon le prochain virage
  for(let q=0;q<out.length;q++){ const L = out[q]; let turn = 0;
    if(q < out.length-1){ const N2 = out[q+1]; const p0 = segPoint(L.sg, L.to, {}), p1 = segPoint(N2.sg, N2.from, {}); const h0 = [p0.dx*L.dir, p0.dz*L.dir], h1 = [p1.dx*N2.dir, p1.dz*N2.dir]; turn = h0[0]*h1[1] - h0[1]*h1[0]; }
    if(kind === 'ped'){ const t = RT[L.sg.type]; L.off = t.ped ? (L.dir > 0 ? t.ped[1] : t.ped[0]) : 0; L.lane = -1; }
    else { L.lane = laneIndexFor(L.sg, L.dir, kind, turn); if(L.lane < 0) return null; L.off = RT[L.sg.type].lanes[L.lane].off; } }
  return out;
}
function spawnAgent(o){ // o : { kind, model, route:[legs], color, cim, onArrive, speed }
  if(!o.route || !o.route.length) return null;
  const legs = legPrep(o.route, o.kind === 'ped' ? 'ped' : o.model === 'train' ? 'train' : o.kind); if(!legs) return null;
  const pool = VP[o.model]; _c.set(o.color || '#ffffff'); const h = place(pool, 0, -500, 0, 1, 1, 1, 0, _c); if(!h) return null;
  const a = Object.assign({ id:agentSeq++, legs, li:0, s:legs[0].from, v:0, yaw:0, h, pool, len:MODEL_LEN(o.model), node:null, wait:0, x:0, y:0, z:0, age:0 }, o);
  a.vmax = o.kind === 'ped' ? 1.2 + rnd()*.5 : 30; enterLane(a); agents.push(a); positionAgent(a); a.yaw = a.tyaw; return a; }
function laneKey(a){ const L = a.legs[a.li]; return a.kind === 'ped' ? null : L.sg.id*16 + L.lane; }
const laneU = (L, s) => L.dir > 0 ? s : L.sg.len - s;
function enterLane(a){ const k = laneKey(a); if(k === null) return; let l = laneLists.get(k); if(!l) laneLists.set(k, l = []); const L = a.legs[a.li], u = laneU(L, a.s);
  let q = 0; while(q < l.length && laneU(L, l[q].s) > u) q++; l.splice(q, 0, a); }
function leaveLane(a){ const k = laneKey(a); if(k === null) return; const l = laneLists.get(k); if(!l) return; const q = l.indexOf(a); if(q >= 0) l.splice(q,1); if(!l.length) laneLists.delete(k); }
function removeAgent(idx){ const a = agents[idx]; if(a.node) leaveNode(a); else leaveLane(a); a.pool.remove(a.h); agents[idx] = agents[agents.length-1]; agents.pop(); if(followAgent === a) followAgent = null; if(selected && selected.obj === a) select(null); }
function leaveNode(a){ const nd = a.node.nd; if(nd.occ){ const q = nd.occ.indexOf(a); if(q >= 0) nd.occ.splice(q,1); } a.node = null; }
function nodeCurve(a){ // courbe de liaison entre la voie courante et la suivante
  const L = a.legs[a.li], N2 = a.legs[a.li+1]; const p0 = laneXYZ(L.sg, L.off, L.to, {}), p1 = laneXYZ(N2.sg, N2.off, N2.from, {});
  const t0 = segPoint(L.sg, L.to, {}), t1 = segPoint(N2.sg, N2.from, {}); const h0 = [t0.dx*L.dir, t0.dz*L.dir], h1 = [t1.dx*N2.dir, t1.dz*N2.dir];
  const d = Math.hypot(p1.x-p0.x, p1.z-p0.z), k = d*.4; const pts = [], n = 8; let len = 0;
  for(let i=0;i<=n;i++){ const t = i/n, u = 1-t; const c1 = [p0.x+h0[0]*k, p0.z+h0[1]*k], c2 = [p1.x-h1[0]*k, p1.z-h1[1]*k];
    const x = u*u*u*p0.x + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p1.x, z = u*u*u*p0.z + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p1.z, y = lerp(p0.y, p1.y, t);
    if(i) len += Math.hypot(x-pts[pts.length-3], z-pts[pts.length-1]); pts.push(x, y, z); }
  const sharp = h0[0]*h1[0]+h0[1]*h1[1] < .7; const nid = L.dir > 0 ? L.sg.b : L.sg.a;
  return { pts, len, t:0, nd:nodes.get(nid), sharp, from:L.sg.id }; }
function canEnterNode(a){
  const L = a.legs[a.li], N2 = a.legs[a.li+1]; const nd = nodes.get(L.dir > 0 ? L.sg.b : L.sg.a); if(!nd) return true;
  // voie suivante libre
  if(a.kind !== 'ped'){ const l = laneLists.get(N2.sg.id*16 + N2.lane); if(l && l.length){ const last = l[l.length-1]; if(laneU(N2, last.s) - laneU(N2, N2.from) < a.len/2 + last.len/2 + 2.5) return false; } }
  if(a.kind === 'ped' || a.kind === 'train') return true;
  const emerg = a.siren; if(nd.lights){ const st = lightState(nd, L.sg.id); if(st === 2 && !emerg) return false; if(st === 1 && a.v < 6 && !emerg) return false; return true; }
  if(nd.segs.length <= 2) return true;
  nd.occ ||= []; const busy = nd.occ.filter(o => o.node && o.node.from !== L.sg.id);
  if(busy.length && a.wait < 5 && !emerg){ // priorité aux routes plus importantes
    return false; }
  return true; }
function positionAgent(a){
  let x, y, z, hx, hz;
  if(a.node){ const c = a.node, P = c.pts; let d = c.t, i = 0, acc = 0; for(;i<8;i++){ const sl = Math.hypot(P[i*3+3]-P[i*3], P[i*3+5]-P[i*3+2]); if(acc + sl >= d || i === 7){ const f = sl ? clamp((d-acc)/sl,0,1) : 0;
        x = P[i*3]+(P[i*3+3]-P[i*3])*f; y = P[i*3+1]+(P[i*3+4]-P[i*3+1])*f; z = P[i*3+2]+(P[i*3+5]-P[i*3+2])*f; hx = P[i*3+3]-P[i*3]; hz = P[i*3+5]-P[i*3+2]; break; } acc += sl; } }
  else { const L = a.legs[a.li]; const p = laneXYZ(L.sg, L.off, a.s, _sp); x = p.x; y = p.y; z = p.z; hx = p.dx*L.dir; hz = p.dz*L.dir;
    if(a.kind === 'ped'){ const t = RT[L.sg.type]; y += t.ped && t.cw > 0 ? .18 : .08; } }
  a.x = x; a.y = y; a.z = z; if(hx || hz) a.tyaw = Math.atan2(hx, hz); }
function writeMatrix(a){ const A = a.pool.mesh.instanceMatrix.array, o = a.h.i*16, cs = Math.cos(a.yaw), sn = Math.sin(a.yaw);
  A[o]=cs; A[o+1]=0; A[o+2]=-sn; A[o+3]=0; A[o+4]=0; A[o+5]=1; A[o+6]=0; A[o+7]=0; A[o+8]=sn; A[o+9]=0; A[o+10]=cs; A[o+11]=0; A[o+12]=a.x; A[o+13]=a.y; A[o+14]=a.z; A[o+15]=1; a.pool.dirty = true; }
function updateAgents(dt, simSpeed){
  const mdt = dt*Math.min(simSpeed, 3);
  for(let idx=agents.length-1; idx>=0; idx--){ const a = agents[idx];
    if(mdt > 0){ a.age += mdt;
      if(a.dwell > 0){ a.dwell -= mdt; if(a.dwell <= 0 && a.afterDwell){ const f = a.afterDwell; a.afterDwell = null; f(a); } positionAgent(a); writeMatrix(a); continue; }
      if(!stepAgent(a, mdt)){ if(a.loop && a.loop(a)){ positionAgent(a); writeMatrix(a); continue; } const cb = a.onArrive; removeAgent(idx); if(cb) cb(a); continue; }
      if(a.age > 900 || (a.wait > 45 && a.kind !== 'bus')){ const cb = a.onFail || a.onArrive; removeAgent(idx); if(cb) cb(a, true); continue; } }
    positionAgent(a); let dy = angDiff(a.tyaw, a.yaw); a.yaw += dy*Math.min(1, dt*10); writeMatrix(a);
    if(a.train) placeTrainCars(a); }
}
function stepAgent(a, dt){ // renvoie false quand l'agent est arrivé
  const ped = a.kind === 'ped';
  if(a.node){ const c = a.node; const vmax = ped ? a.vmax : c.sharp ? 7 : 12; a.v = Math.min(vmax, a.v + 3*dt); c.t += a.v*dt;
    if(c.t >= c.len){ leaveNode(a); a.li++; const L = a.legs[a.li]; a.s = L.from; enterLane(a); } return true; }
  const L = a.legs[a.li], t = RT[L.sg.type], last = a.li === a.legs.length-1; const uEnd = laneU(L, L.to), u = laneU(L, a.s);
  let vmax = ped ? a.vmax : Math.min(a.vcap || 99, t.speed*(a.siren ? 1.25 : 1)*(weather.kind === 'snow' ? .7 : weather.kind === 'rain' || weather.kind === 'storm' ? .85 : 1));
  let limit = 1e9; // distance libre devant
  if(!ped){ const l = laneLists.get(laneKey(a)); if(l){ const q = l.indexOf(a); if(q > 0){ const ld = l[q-1]; limit = laneU(L, ld.s) - u - (ld.len + a.len)/2 - 2.2; } } }
  if(!last){ const dEnd = uEnd - u; if(dEnd < 30){ if(!canEnterNode(a)){ limit = Math.min(limit, dEnd - (ped ? 0 : 1.5)); a.blocked = true; } else a.blocked = false; } }
  const vt = Math.min(vmax, Math.max(0, limit)*1.1); if(vt < a.v) a.v = Math.max(vt, a.v - 9*dt); else a.v = Math.min(vt, a.v + (ped ? 2 : 3)*dt);
  if(a.v < .3 && !ped) a.wait += dt; else a.wait = Math.max(0, a.wait - dt*2);
  let nu = u + a.v*dt; if(nu > u + Math.max(0, limit)) nu = u + Math.max(0, limit);
  a.s = L.dir > 0 ? nu : L.sg.len - nu;
  if(!ped && a.pool !== VP.train){ L.sg.traffic += dt*.02; const k = fIdx(a.x, a.z); if(k >= 0) fld.traffic[k] += dt*.01; }
  if(nu >= uEnd - .05){ if(last) return false;
    if(ped || a.kind === 'train' || canEnterNode(a) || a.wait > 8){ leaveLane(a); a.node = nodeCurve(a); const nd = a.node.nd; if(nd){ nd.occ ||= []; nd.occ.push(a); } a.s = L.to; } else { a.s = L.to; a.v = 0; } }
  return true; }
function placeTrainCars(a){ // wagons derrière la motrice, le long de l'historique de positions
  const H = a.hist ||= []; const last = H.length ? H[H.length-1] : null; if(!last || Math.hypot(last[0]-a.x, last[2]-a.z) > 2) { H.push([a.x, a.y, a.z]); if(H.length > 80) H.shift(); }
  for(let k=0;k<a.cars.length;k++){ const want = (k+1)*16.3; let acc = 0, px = a.x, py = a.y, pz = a.z, done = false;
    for(let i=H.length-1;i>=0;i--){ const q = H[i], d = Math.hypot(q[0]-px, q[2]-pz); if(acc + d >= want){ const f = (want-acc)/d; const x = px+(q[0]-px)*f, z = pz+(q[2]-pz)*f, y = py+(q[1]-py)*f;
        const c = a.cars[k]; c.x = x; c.y = y; c.z = z; c.yaw = Math.atan2(px-q[0], pz-q[2]); writeMatrix(c); done = true; break; } acc += d; px = q[0]; py = q[1]; pz = q[2]; }
    if(!done){ const c = a.cars[k]; c.x = a.x; c.y = -200; c.z = a.z; writeMatrix(c); } } }
function rebuildLaneLists(){ laneLists.clear(); for(const a of agents){ if(!a.node) enterLane(a); } }
bus.on('segRemoved', sg => { for(let i=agents.length-1;i>=0;i--){ const a = agents[i]; if(a.legs.some(L => L.sg === sg)){ const cb = a.onFail || a.onArrive; removeAgent(i); if(cb) cb(a, true); } } });

/* ---------- trajets des habitants ---------- */
function outsideNodes(mode='car'){ const out = []; for(const n of nodes.values()) if(n.outside && n.segs.some(id => { const s = segs.get(id); return s && netOK(RT[s.type], mode); })) out.push(n); return out; }
function nodeAccess(n){ const sg = segs.get(n.segs[0]); return sg ? { sg, s:sg.a === n.id ? .5 : sg.len-.5, x:n.x, z:n.z } : null; }
function routeBetween(A, B, mode, truck){ if(!A || !B) return null; const r = findRoute(A, B, mode, truck); return r && r.length ? r : null; }
function tripTo(i, from, to, loc){
  const d = Math.hypot(from.x-to.x, from.z-to.z); CZ.flags[i] |= F_TRAVEL; const car = (CZ.flags[i] & F_CAR) && d > 450;
  let mode = d < 450 ? 'walk' : car ? 'car' : 'transit';
  if(mode === 'car' && transitNear(from) && transitNear(to) && rnd() < (policyAt(from).freeTransit ? .6 : .3)) mode = 'transit';
  if(mode === 'transit' && !(transitNear(from) && transitNear(to))) mode = car ? 'car' : 'walk';
  const done = (fail) => { CZ.flags[i] &= ~F_TRAVEL; CZ.loc[i] = loc; if(loc === LOC_SHOP && !fail){ to.visits = (to.visits||0) + 1; to.sales = (to.sales||0) + 1; CZ.arrive[i] = state.time + 60 + rnd()*120; } };
  if(mode === 'transit'){ transitTrip(from, to); CZ.arrive[i] = state.time + d/8/60*4; setTimeout0(() => done(false), d/10); return; }
  const budget = mode === 'walk' ? agentCount.p < CAPS.ped : agentCount.v < CAPS.veh;
  if(budget && from.access && to.access){ const route = routeBetween(from.access, to.access, mode === 'walk' ? 'ped' : 'car');
    if(route){ const a = spawnAgent({ kind:mode === 'walk' ? 'ped' : 'car', model:mode === 'walk' ? 'ped' : pick(CAR_MODELS, rnd), route, cim:i,
        color:mode === 'walk' ? pick(['#c23b2b','#2d5d9a','#e0b43a','#3f7a3f','#ececec','#222','#8a4a8a','#d77a2a'], rnd) : pick(PAL.car, rnd), onArrive:(ag, fail) => done(fail) }); if(a) return; } }
  setTimeout0(() => done(false), d/(mode === 'walk' ? 1.4 : 11)); }
// minuteries en temps de jeu (secondes simulées)
const timers = []; function setTimeout0(f, sec){ timers.push({ t:sec, f }); }
function tickTimers(dt){ for(let i=timers.length-1;i>=0;i--){ const tm = timers[i]; tm.t -= dt; if(tm.t <= 0){ timers[i] = timers[timers.length-1]; timers.pop(); tm.f(); } } }
function spawnTrips(){
  if(!cimTop) return; const h = hourOf(), wd = (dayOf() % 7) < 5; const n = Math.min(60, Math.ceil(state.pop/150));
  for(let t=0;t<n;t++){ const i = Math.floor(rnd()*cimTop); const f = CZ.flags[i]; if(!(f & F_ALIVE) || (f & (F_DEAD|F_TRAVEL|F_HOSP))) continue;
    const home = buildings.get(CZ.home[i]); if(!home) continue; const loc = CZ.loc[i];
    if(loc === LOC_HOME){
      if(wd && CZ.work[i] && h > 6.5 && h < 9.2 && rnd() < .35){ const w = buildings.get(CZ.work[i]); if(w) tripTo(i, home, w, LOC_WORK); continue; }
      if(wd && CZ.school[i] && h > 7 && h < 8.6 && rnd() < .4){ const s = buildings.get(CZ.school[i]); if(s) tripTo(i, home, s, LOC_SCHOOL); continue; }
      if(((h > 17 && h < 22) || (!wd && h > 10 && h < 20) || (!CZ.work[i] && h > 10 && h < 18)) && rnd() < .06){ const shop = shopNear(home); if(shop) tripTo(i, home, shop, LOC_SHOP); } }
    else if(loc === LOC_WORK && (h > 16 && h < 19.5 || h > 21) && rnd() < .3){ const w = buildings.get(CZ.work[i]) || home; tripTo(i, w, home, LOC_HOME); }
    else if(loc === LOC_SCHOOL && h > 14.5 && rnd() < .35){ const s = buildings.get(CZ.school[i]) || home; tripTo(i, s, home, LOC_HOME); }
    else if(loc === LOC_SHOP && state.time > CZ.arrive[i]){ tripTo(i, home, home, LOC_HOME); CZ.loc[i] = LOC_HOME; CZ.flags[i] &= ~F_TRAVEL; } }
  goodsTraffic(); tourists();
}
function shopNear(b){ let best = null, bd = 1e18; for(let t=0;t<10;t++){ const o = workList.length ? bldArr[Math.floor(rnd()*bldArr.length)] : null; if(!o || o.kind !== 'zone' || (o.zone !== 3 && o.zone !== 4) || !o.access) continue; const d = dist2(o.x,o.z,b.x,b.z); if(d < bd){ bd = d; best = o; } } return best; }
/* camions de marchandises, déménagements, touristes */
function goodsTraffic(){
  if(simTickN % 3 || agentCount.v >= CAPS.veh) return;
  const inds = bldArr.filter(b => b.kind === 'zone' && b.zone === 5 && b.access && b.work.length && !b.abandoned), shops = bldArr.filter(b => b.kind === 'zone' && (b.zone === 3 || b.zone === 4) && b.access && !b.abandoned);
  const outs = outsideNodes('car'); const r = rnd();
  const truck = (A, B, onA) => { if(!A || !B) return; const route = routeBetween(A, B, 'car', true); if(route) spawnAgent({ kind:'truck', model:'truck', route, color:rnd() < .5 ? '#e8e8e4' : pick(PAL.car, rnd), onArrive:onA }); };
  if(r < .5 && inds.length && shops.length){ const a = pick(inds, rnd), b = pick(shops, rnd); truck(a.access, b.access, () => { b.goods = (b.goods||0) + 20; state.goods.local = (state.goods.local||0) + 20; }); }
  else if(r < .75 && shops.length && outs.length){ const b = pick(shops, rnd); truck(nodeAccess(pick(outs, rnd)), b.access, () => { b.goods = (b.goods||0) + 20; state.goods.imp += 20; }); }
  else if(inds.length && outs.length){ const a = pick(inds, rnd); truck(a.access, nodeAccess(pick(outs, rnd)), () => { state.goods.exp += 20; }); } }
function spawnMovingVan(b){ const outs = outsideNodes('car'); if(!outs.length || !b.access || agentCount.v >= CAPS.veh) return; const route = routeBetween(nodeAccess(pick(outs, rnd)), b.access, 'car'); if(route) spawnAgent({ kind:'car', model:'van', route, color:'#f0f0ec' }); }
function tourists(){ if(simTickN % 4 || agentCount.v >= CAPS.veh) return; const attr = tourismScore(); state.tourists = Math.round(state.tourists*.97 + attr*.6); if(attr <= 0) return;
  const outs = outsideNodes('car'); if(!outs.length || rnd() > Math.min(.8, attr/40)) return;
  const dests = bldArr.filter(b => b.access && ((b.kind === 'svc' && SVC[b.type].tourism) || (b.kind === 'zone' && (b.spec === 'tourism' || b.spec === 'leisure' || b.zone === 4))));
  if(!dests.length) return; const d = pick(dests, rnd), o = nodeAccess(pick(outs, rnd)); const route = routeBetween(o, d.access, 'car');
  if(route) spawnAgent({ kind:'car', model:pick(['sedan','suv','hatch'], rnd), route, color:pick(PAL.car, rnd), onArrive:() => { d.visits = (d.visits||0) + 2; state.touristSpend = (state.touristSpend||0) + 1; } }); }
function tourismScore(){ let s = 0; for(const b of bldArr){ if(b.kind === 'svc'){ s += (SVC[b.type].tourism||0)*6; if(b.type === 'airport') s += 30; if(b.type === 'station') s += 6; } else if(b.spec === 'tourism') s += 2*b.level; else if(b.spec === 'leisure') s += 1.2*b.level; }
  return s*(outsideNodes('car').length ? 1 : .2); }

/* ---------- services : demandes et interventions ---------- */
const REQ = { garbage:[], crime:[], fire:[], sick:[], dead:[] };
const REQ_FLAG = { garbage:'reqG', crime:'reqC', fire:'reqF', sick:'reqS', dead:'reqD' };
const REQ_SVC = { garbage:'garbage', crime:'police', fire:'fire', sick:'ambulance', dead:'hearse' };
function queueReq(kind, b){ if(b[REQ_FLAG[kind]]) return; b[REQ_FLAG[kind]] = 1; REQ[kind].push(b); }
function facilityFor(kind, b){ let best = null, bd = 1e18; const veh = REQ_SVC[kind];
  for(const f of bldArr){ if(f.kind !== 'svc' || f.abandoned || !buildings.has(f.id)) continue; const d = SVC[f.type]; if(d.veh !== veh || !f.access) continue;
    const cap = Math.max(1, Math.round(d.vehN*budgetEff(d.cat))); if((f.vehOut||0) >= cap) continue;
    if(kind === 'garbage' && d.garbageCap && (f.store||0) >= d.garbageCap) continue;
    if(kind === 'dead' && d.graves && (f.store||0) >= d.graves) continue;
    if(kind === 'sick' && d.beds && (f.patients||[]).length >= d.beds*budgetEff('health')) continue;
    if(d.radius && Math.hypot(f.x-b.x, f.z-b.z) > d.radius*2.2) continue;
    const dd = dist2(f.x,f.z,b.x,b.z); if(dd < bd){ bd = dd; best = f; } }
  return best; }
function dispatchRequests(){
  for(const kind in REQ){ const q = REQ[kind]; let tries = 0;
    while(q.length && tries++ < 4){ const b = q[0]; if(!buildings.has(b.id)){ q.shift(); continue; }
      const still = kind === 'garbage' ? b.garbage > 30 : kind === 'crime' ? b.crime > 20 : kind === 'fire' ? !!b.fire : kind === 'sick' ? b.sick > 0 : b.dead > 0;
      if(!still){ q.shift(); b[REQ_FLAG[kind]] = 0; continue; }
      const f = facilityFor(kind, b); if(!f){ q.push(q.shift()); break; }
      q.shift(); sendVehicle(kind, f, b); } } }
function sendVehicle(kind, f, b){
  f.vehOut = (f.vehOut||0) + 1; const model = REQ_SVC[kind];
  const back = () => { f.vehOut = Math.max(0, (f.vehOut||0) - 1); };
  const act = () => { // intervention sur place
    if(kind === 'garbage'){ let load = 0; for(const o of buildingsNear(b.x, b.z, 90)){ if(o.garbage < 15 || load > 500) continue; load += o.garbage; o.garbage = 0; o.reqG = 0; } f.store = (f.store||0) + load; b.reqG = 0; }
    else if(kind === 'crime'){ for(const o of buildingsNear(b.x, b.z, 100)){ o.crime *= .3; } b.crime *= .15; b.reqC = 0; }
    else if(kind === 'fire'){ if(b.fire) b.fire.ext = true; b.reqF = 0; }
    else if(kind === 'sick'){ let n = 0; for(const o of [b, ...buildingsNear(b.x, b.z, 90)]){ if(!o.sick || n >= 6) continue; for(const i of o.res){ if(n >= 6) break; if((CZ.flags[i] & F_SICK) && !(CZ.flags[i] & F_HOSP)){ CZ.flags[i] |= F_HOSP; o.sick = Math.max(0, o.sick-1); (f.patients ||= []).push({ i, until:state.time + 720 }); n++; } } if(!o.sick) o.reqS = 0; }
      if(!n) b.sick = 0; b.reqS = 0; }
    else if(kind === 'dead'){ let n = 0; for(const o of [b, ...buildingsNear(b.x, b.z, 110)]){ if(!o.dead || n >= 12) continue; for(const i of o.res.slice()){ if(n >= 12) break; if(CZ.flags[i] & F_DEAD){ removeCim(i); o.dead = Math.max(0, o.dead-1); n++; } } if(!o.dead) o.reqD = 0; }
      if(!n) b.dead = 0; f.store = (f.store||0) + n; b.reqD = 0; } };
  const route = agentCount.v < CAPS.veh + 150 ? routeBetween(f.access, b.access, 'car') : null;
  if(!route){ const d = Math.hypot(f.x-b.x, f.z-b.z); setTimeout0(() => { act(); setTimeout0(back, d/14); }, d/14 + 10); return; }
  const siren = kind === 'fire' || kind === 'crime' || kind === 'sick';
  const a = spawnAgent({ kind:model, model, route, siren, color:{ fire:'#c8201f', police:'#f2f2f2', ambulance:'#f5f5f2', garbage:'#3d7a3a', hearse:'#1b1c1e' }[model], mission:{ kind, f, b },
    onArrive:(ag, fail) => { if(fail){ act(); back(); return; } const dwell = kind === 'fire' ? 25 : kind === 'garbage' ? 5 : 8;
      // stationne pendant l'intervention puis rentre
      setTimeout0(() => { act(); const r2 = routeBetween(b.access, f.access, 'car'); if(r2 && agentCount.v < CAPS.veh + 150){ spawnAgent({ kind:model, model, route:r2, color:ag.color, onArrive:back, onFail:back }); } else setTimeout0(back, 20); }, dwell); } });
  if(!a){ setTimeout0(() => { act(); back(); }, 30); }
}
/* ---------- incendies ---------- */
const fires = new Set();
function addFire(b){ fires.add(b); }
function updateFires(dt){ for(const b of fires){ if(!buildings.has(b.id) || !b.fire){ fires.delete(b); continue; } const f = b.fire; f.t += dt;
    if(f.ext){ f.hp = Math.min(100, f.hp + dt*2); f.ext = (f.ext === true ? 0 : f.ext) + dt; if(f.ext > 25){ b.fire = null; fires.delete(b); chirpBuilding(b, 'Les pompiers ont maîtrisé l\'incendie'); continue; } }
    else f.hp -= dt*.35;
    if(rnd() < dt*3) emitFire(b);
    if(f.hp <= 0){ b.fire = null; fires.delete(b); b.burned = true; for(const i of b.res.slice()) removeCim(i); for(const i of b.work.slice()) CZ.work[i] = 0; b.work.length = 0; b.jl = [0,0,0,0]; buildModel(b); chirpBuilding(b, 'Un bâtiment a brûlé'); } } }
