/* ================= transports en commun ================= */
const lines = []; let lineSeq = 1;
const LINE_COLORS = ['#e8453c','#2f7fd6','#3fae57','#e8a23a','#8e5bd6','#1fb3b3','#d6457f','#8a6a3a','#5a6bd6','#b3b31f'];
const shelterPool = new Pool(SHELTER, MAT.vc, 256);
VP.ship = new Pool(VEH.ship.geo, MAT.vc, 8); VP.plane = new Pool(VEH.plane.geo, MAT.vc, 8);
const LINE_T = { bus:{ n:'Bus', stop:'arrêts', veh:'bus', road:true }, tram:{ n:'Tram', stop:'arrêts', veh:'rames', road:true }, metro:{ n:'Métro', stop:'stations', veh:'rames', st:'metro', speed:20 },
  mono:{ n:'Monorail', stop:'stations', veh:'rames', st:'monost', speed:24 }, ferry:{ n:'Ferry', stop:'embarcadères', veh:'ferries', st:'pier', speed:9 } };
function newLine(type){ const L = { id:lineSeq++, type, name:LINE_T[type].n + ' ' + (lines.filter(l => l.type === type).length + 1), color:LINE_COLORS[(lineSeq-2) % LINE_COLORS.length], stops:[], closed:false, veh:[], pass:0, passDay:0, trains:[] }; return L; }
function stopFromPoint(x, z, type='bus'){ const r = nearestSeg(x, z, 30, s => (type === 'tram' ? RT[s.type].tram : RT[s.type].car) && !s.tunnel); if(!r) return null; const p = segPoint(r.sg, r.s, {}), t = RT[r.sg.type];
  const side = ((x-p.x)*(-p.dz) + (z-p.z)*p.dx) >= 0 ? 1 : -1; const off = t.cw + (t.hw - t.cw)*.5;
  return { sg:r.sg, s:clamp(r.s, 3, r.sg.len-3), side, x:p.x - p.dz*off*side, z:p.z + p.dx*off*side, y:p.y, ang:Math.atan2(-p.dz*side, p.dx*side), wait:0 }; }
function addStopVisual(st){ _c.setRGB(1,1,1); st.h = place(shelterPool, st.x, st.y + .18, st.z, 1, 1, 1, st.ang + Math.PI, _c); }
function finishLine(L){ L.closed = true; lines.push(L); covDirty = true; L.len = 0;
  if(LINE_T[L.type].road){ for(let k=0;k<L.stops.length;k++){ const a = L.stops[k], b = L.stops[(k+1)%L.stops.length]; L.len += Math.hypot(a.x-b.x, a.z-b.z); } setTimeout0(() => refillBuses(L), 1); }
  else { if(L.type === 'mono') buildMonoTrack(L); for(let k=0;k<L.stops.length;k++){ const a = L.stops[k], b = L.stops[(k+1)%L.stops.length]; L.len += Math.hypot(a.x-b.x, a.z-b.z); } const n = Math.max(1, Math.round(L.len/(L.type === 'ferry' ? 1400 : 900))); for(let k=0;k<n;k++){ const tr = { seg:Math.floor(k*L.stops.length/n), t:0, dwell:0, pass:0 }; if(L.type !== 'metro'){ _c.set(L.type === 'ferry' ? '#ffffff' : L.color); tr.h = place(L.type === 'mono' ? monoPool : ferryPool, 0, -300, 0, 1, 1, 1, 0, _c); } L.trains.push(tr); } }
  transitDirty = true; }
function removeLine(L){ const i = lines.indexOf(L); if(i >= 0) lines.splice(i,1); for(const st of L.stops) if(st.h) shelterPool.remove(st.h); for(const tr of L.trains) if(tr.h) tr.h.pool.remove(tr.h); if(L.track){ scene.remove(L.track); L.track.geometry.dispose(); }
  for(let k=agents.length-1;k>=0;k--) if(agents[k].line === L) removeAgent(k); covDirty = true; transitDirty = true; }
function stopAccess(st){ return { sg:st.sg, s:st.s, x:st.x, z:st.z }; }
function refillBuses(L){ if(!lines.includes(L) || !LINE_T[L.type].road) return; const tram = L.type === 'tram';
  const want = Math.max(1, Math.round(L.len/700*budgetEff('transit'))); const have = agents.filter(a => a.line === L).length;
  const depots = [...buildings.values()].filter(b => b.type === (tram ? 'tramdepot' : 'depot') && b.access);
  if(!depots.length){ if(tram) toast('Construisez un dépôt de tramways relié aux voies de tram.'); else hint('depot'); setTimeout0(() => refillBuses(L), 60); return; }
  for(let k=have;k<want;k++){ const st = L.stops[(k*Math.max(1, Math.floor(L.stops.length/want))) % L.stops.length]; const dep = depots.reduce((a,b) => dist2(a.x,a.z,st.x,st.z) < dist2(b.x,b.z,st.x,st.z) ? a : b);
    const route = routeBetween(tram ? tramAccess(dep) : dep.access, stopAccess(st), tram ? 'tram' : 'bus'); if(!route) continue;
    spawnAgent({ kind:tram ? 'tram' : 'bus', model:tram ? 'tram' : 'bus', route, color:L.color, line:L, next:L.stops.indexOf(st), onboard:0, loop:busLoop }); }
  setTimeout0(() => refillBuses(L), 120); }
function busLoop(a){ // arrivée à un arrêt : échange de voyageurs puis trajet vers l'arrêt suivant
  const L = a.line; if(!lines.includes(L)) return false; const st = L.stops[a.next]; if(!st) return false;
  const off = Math.round(a.onboard*(.3 + rnd()*.4)); a.onboard -= off; const on = Math.min(st.wait, (a.kind === 'tram' ? 180 : 60) - a.onboard); st.wait -= on; a.onboard += on; L.pass += on; state.fares = (state.fares||0) + on;
  const ni = (a.next+1) % L.stops.length, nx = L.stops[ni]; const route = routeBetween(stopAccess(st), stopAccess(nx), a.kind === 'tram' ? 'tram' : 'bus'); if(!route) return false;
  resetAgentRoute(a, route); a.next = ni; a.dwell = 5 + on*.08; return true; }
function resetAgentRoute(a, route){ const legs = legPrep(route, a.kind); if(!legs) return false; if(a.node) leaveNode(a); else leaveLane(a); a.legs = legs; a.li = 0; a.s = legs[0].from; a.v = 0; a.age = 0; a.wait = 0; enterLane(a); return true; }
function transitNear(b){ if(!b) return null; for(const L of lines){ for(const st of L.stops){ const R = LINE_T[L.type].road ? 320 : 480; if(dist2(st.x, st.z, b.x, b.z) < R*R) return { L, st }; } } return null; }
function transitTrip(from, to){ for(const L of lines){ let sa = null, sb = null; const R = LINE_T[L.type].road ? 320 : 480;
    for(const st of L.stops){ if(!sa && dist2(st.x,st.z,from.x,from.z) < R*R) sa = st; if(!sb && dist2(st.x,st.z,to.x,to.z) < R*R) sb = st; }
    if(sa && sb){ if(LINE_T[L.type].road) sa.wait = Math.min(200, sa.wait + 1); else { L.pass++; state.fares = (state.fares||0) + 1; } return true; } } return false; }
/* métro : rames souterraines entre les stations */
const metroPool = new Pool(new THREE.BoxGeometry(3, 3.4, 60).translate(0, 1.7, 0), MAT.vc, 64, { cast:false });
function updateMetro(dt){ for(const L of lines){ if(LINE_T[L.type].road) continue; const n = L.stops.length; if(n < 2) continue; const spd = LINE_T[L.type].speed;
    for(const tr of L.trains){ if(tr.dwell > 0){ tr.dwell -= dt; continue; } const a = L.stops[tr.seg % n], b = L.stops[(tr.seg+1) % n]; const len = Math.hypot(b.x-a.x, b.z-a.z) || 1;
      tr.t += dt*spd*budgetEff('transit')/len; if(tr.t >= 1){ tr.t = 0; tr.seg = (tr.seg+1) % n; tr.dwell = L.type === 'ferry' ? 25 : 15; if(L.type !== 'metro'){ const m = Math.round(4 + rnd()*20); L.pass += m; state.fares = (state.fares||0) + m*(L.type === 'ferry' ? 2 : 1); } }
      const e = smooth(0, 1, tr.t)*.7 + tr.t*.3, x = lerp(a.x, b.x, e), z = lerp(a.z, b.z, e); tr.x = x; tr.z = z; tr.ang = Math.atan2(b.x-a.x, b.z-a.z);
      if(tr.h){ let y; if(L.type === 'mono') y = monoY(a, b, e); else { y = waterSurfAt(x, z) - .3; tr.bob = Math.sin(U.uTime.value*1.3 + tr.seg)*.04; }
        _e.set(tr.bob||0, tr.ang, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(1,1,1)); tr.h.pool.setMatrix(tr.h, _m); } } } }
/* monorail : poutre surélevée sur piliers entre les stations */
const MONO_H = 14; const monoPool = new Pool(VEH.mono.geo, MAT.veh, 64); const ferryPool = new Pool(VEH.ferry.geo, MAT.veh, 48);
function monoY(a, b, t){ const ya = (a.b ? a.b.y : heightAt(a.x, a.z)) + MONO_H, yb = (b.b ? b.b.y : heightAt(b.x, b.z)) + MONO_H; const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
  return Math.max(lerp(ya, yb, t), Math.max(heightAt(x, z), SEA) + 9); }
function buildMonoTrack(L){ const g = GB(), n = L.stops.length, beam = col('#d9dcdf'), pil = col('#b9bcbf');
  const box = (x, y, z, w, h, d, ang, cc) => { const ca = Math.cos(ang), sa = Math.sin(ang), P = (dx, dy, dz) => [x + dx*ca + dz*sa, y + dy, z - dx*sa + dz*ca];
    const v = [P(-w,0,-d),P(w,0,-d),P(w,0,d),P(-w,0,d),P(-w,h,-d),P(w,h,-d),P(w,h,d),P(-w,h,d)];
    quad(g, v[4],v[7],v[6],v[5], cc, [0,1,0]); quad(g, v[0],v[1],v[5],v[4], cc, [-sa,0,-ca]); quad(g, v[2],v[3],v[7],v[6], cc, [sa,0,ca]); quad(g, v[3],v[0],v[4],v[7], cc, [-ca,0,sa]); quad(g, v[1],v[2],v[6],v[5], cc, [ca,0,-sa]); };
  for(let k=0;k<n;k++){ const a = L.stops[k], b = L.stops[(k+1)%n], len = Math.hypot(b.x-a.x, b.z-a.z), ang = Math.atan2(b.x-a.x, b.z-a.z), m = Math.max(1, Math.ceil(len/6));
    for(let i=0;i<m;i++){ const t0 = i/m, t1 = (i+1)/m, tm = (t0+t1)/2, x = lerp(a.x, b.x, tm), z = lerp(a.z, b.z, tm), y = monoY(a, b, tm); box(x, y - 3.4, z, .9, 1.6, len/m/2 + .05, ang, beam); }
    for(let s=20; s<len-10; s+=34){ const t = s/len, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), gy = Math.max(heightAt(x, z), isWet(x, z) ? wb[wIdx(x, z)] ?? SEA - 4 : -1e9), y = monoY(a, b, t);
      box(x, gy - .5, z, .8, y - 3.4 - gy + .5, .8, ang, pil); box(x, y - 4.2, z, 1.3, .8, 1.3, ang, pil); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p,3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n,3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c,3));
  L.track = new THREE.Mesh(geo, MAT.vc); L.track.castShadow = L.track.receiveShadow = true; scene.add(L.track); }
function stationStop(type, b){ return type === 'ferry' ? { ...pierDock(b), b, wait:0 } : { x:b.x, z:b.z, b, wait:0 }; }
function tramAccess(dep){ const r = nearestSeg(dep.x, dep.z, Math.max(dep.hw, dep.hd) + 40, s => RT[s.type].tram); return r ? { sg:r.sg, s:clamp(r.s, 2, r.sg.len-2), x:r.x, z:r.z } : null; }
/* embarcadère : point d'accostage côté eau */
function pierDock(b){ return { x:b.x - b.front[0]*(b.hd + 14), z:b.z - b.front[1]*(b.hd + 14) }; }
function drawMetro(){ metroPool.clear(); if(overlay !== 'transit') return; for(const L of lines){ if(L.type !== 'metro') continue; for(const tr of L.trains){ if(tr.x === undefined) continue; _c.set(L.color); place(metroPool, tr.x, heightAt(tr.x, tr.z)+3, tr.z, 1, 1, 1, tr.ang, _c); } } }
/* ruban d'affichage des lignes (vue « Transports ») */
let transitMesh = null, transitDirty = true;
function rebuildTransitMesh(){ transitDirty = false; if(transitMesh){ scene.remove(transitMesh); transitMesh.geometry.dispose(); transitMesh = null; } if(overlay !== 'transit') return;
  const g = GB();
  const ribbon = (pts, cc, w, lift) => { for(let i=0;i<pts.length-1;i++){ const [x0,z0] = pts[i], [x1,z1] = pts[i+1]; const dx = x1-x0, dz = z1-z0, l = Math.hypot(dx,dz)||1, nx = -dz/l*w, nz = dx/l*w;
      const y0 = Math.max(heightAt(x0,z0), SEA)+lift, y1 = Math.max(heightAt(x1,z1), SEA)+lift; quad(g, [x0-nx,y0,z0-nz],[x0+nx,y0,z0+nz],[x1+nx,y1,z1+nz],[x1-nx,y1,z1-nz], cc, [0,1,0]); } };
  for(const L of lines){ const cc = col(L.color);
    if(LINE_T[L.type].road){ for(let k=0;k<L.stops.length;k++){ const a = L.stops[k], b = L.stops[(k+1)%L.stops.length]; const r = routeBetween(stopAccess(a), stopAccess(b), L.type === 'tram' ? 'tram' : 'bus'); if(!r) continue; const pts = [];
        for(const leg of r){ const n = Math.max(2, Math.ceil(Math.abs(leg.to-leg.from)/6)); for(let i=0;i<=n;i++){ const p = segPoint(leg.sg, lerp(leg.from, leg.to, i/n), _sp); pts.push([p.x, p.z]); } } ribbon(pts, cc, 1.6, 1.2); } }
    else { const pts = L.stops.map(s => [s.x, s.z]); pts.push(pts[0]); const dense = []; for(let k=0;k<pts.length-1;k++) for(let i=0;i<8;i++) dense.push([lerp(pts[k][0], pts[k+1][0], i/8), lerp(pts[k][1], pts[k+1][1], i/8)]); dense.push(pts[pts.length-1]); ribbon(dense, cc, 2.4, 1.6); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p,3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n,3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c,3));
  transitMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors:true, depthTest:true })); transitMesh.renderOrder = 6; scene.add(transitMesh); }
/* trains de voyageurs entre la connexion extérieure et les gares */
function railAccess(b){ const r = nearestSeg(b.x, b.z, Math.max(b.hw, b.hd)+30, s => RT[s.type].net === 'rail'); return r ? { sg:r.sg, s:clamp(r.s, 2, r.sg.len-2), x:r.x, z:r.z } : null; }
let trainT = 0;
function trainService(dt){ trainT -= dt; if(trainT > 0) return; trainT = 90;
  const stations = bldArr.filter(b => b.type === 'station'); const outs = outsideNodes('rail'); if(!stations.length || !outs.length) return;
  const st = pick(stations, rnd), ra = railAccess(st); if(!ra) return; const o = nodeAccess(pick(outs, rnd)); const route = routeBetween(o, ra, 'rail'); if(!route) return;
  const a = spawnAgent({ kind:'train', model:'train', route, color:'#f2f2f0', train:true, loop:(ag) => { if(ag.stage){ return false; } ag.stage = 1; state.fares = (state.fares||0) + 40; state.touristSpend = (state.touristSpend||0) + 10;
      const r2 = routeBetween(ra, nodeAccess(pick(outs, rnd)), 'rail'); if(!r2) return false; resetAgentRoute(ag, r2); ag.dwell = 20; return true; } });
  if(a){ a.cars = []; for(let k=0;k<3;k++){ _c.set(k === 2 ? '#e8e8e4' : '#f2f2f0'); const h = place(VP.train, 0, -200, 0, 1, 1, 1, 0, _c); if(h) a.cars.push({ h, pool:VP.train, x:0, y:-200, z:0, yaw:0 }); }
    const rm = a.onArrive; a.onArrive = () => { for(const c of a.cars) c.pool.remove(c.h); if(rm) rm(); }; a.onFail = a.onArrive; } }
/* port : cargos ; aéroport : avions */
const ships = [], planes = [];
function updatePortAir(dt){
  for(const b of bldArr){ if(b.type === 'port' && buildings.has(b.id) && !ships.some(s => s.b === b) && ships.length < 6){ _c.setRGB(1,1,1); const h = place(VP.ship, 0, -99, 0, 1, 1, 1, 0, _c); if(h) ships.push({ b, h, t:rnd(), phase:0 }); }
    if(b.type === 'airport' && buildings.has(b.id) && !planes.some(p => p.b === b) && planes.length < 4){ _c.setRGB(1,1,1); const h = place(VP.plane, 0, -99, 0, 1, 1, 1, 0, _c); if(h) planes.push({ b, h, t:0 }); } }
  for(let i=ships.length-1;i>=0;i--){ const s = ships[i]; if(!buildings.has(s.b.id)){ VP.ship.remove(s.h); ships.splice(i,1); continue; }
    const back = [-s.b.front[0], -s.b.front[1]], dock = [s.b.x + back[0]*(s.b.hd+26), s.b.z + back[1]*(s.b.hd+26)], far = [dock[0] + back[0]*2600, dock[1] + back[1]*2600];
    s.t += dt/320; if(s.t > 1){ s.t = 0; state.goods.exp += 200; } const k = s.t < .4 ? 1 - s.t/.4 : s.t < .6 ? 0 : (s.t-.6)/.4; const e = k*k*(3-2*k);
    const x = lerp(dock[0], far[0], e), z = lerp(dock[1], far[1], e);
    _q.setFromAxisAngle(UP, Math.atan2(back[0], back[1])); _m.compose(_p.set(x, SEA - 2, z), _q, _s.set(1,1,1)); VP.ship.setMatrix(s.h, _m); }
  for(let i=planes.length-1;i>=0;i--){ const p = planes[i]; if(!buildings.has(p.b.id)){ VP.plane.remove(p.h); planes.splice(i,1); continue; }
    const [x0,z0,x1,z1] = p.b.runway; const dx = x1-x0, dz = z1-z0, L = Math.hypot(dx,dz), ux = dx/L, uz = dz/L, y0 = p.b.y + 2.6;
    p.t += dt; const T = p.t % 150; let x, y, z, yaw = Math.atan2(ux, uz), pitch = 0;
    if(T < 40){ const f = T/40; x = x0 - ux*(3500*(1-f)); z = z0 - uz*(3500*(1-f)); y = y0 + 260*(1-f)*(1-f)*1.4 + 0; pitch = .05; }
    else if(T < 60){ const f = (T-40)/20, e = 1-(1-f)*(1-f); x = x0 + ux*L*.8*e; z = z0 + uz*L*.8*e; y = y0; }
    else if(T < 110){ x = x0 + ux*L*.8; z = z0 + uz*L*.8; y = y0; }
    else { const f = (T-110)/40, e = f*f; x = x0 + ux*(L*.8 - L*.8*Math.min(1,f*1.5)) ; z = z0 + uz*(L*.8 - L*.8*Math.min(1,f*1.5)); yaw += Math.PI; if(f > .6){ const g = (f-.6)/.4; x = x0 - ux*g*3000; z = z0 - uz*g*3000; y = y0 + g*g*500; pitch = -.12; } else y = y0; }
    _e.set(pitch, yaw, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(1,1,1)); VP.plane.setMatrix(p.h, _m); if(T > 55 && T < 56) state.touristSpend = (state.touristSpend||0) + 30; }
}
