/* ================= zonage le long des routes (cellules de 8 m, profondeur 4) ================= */
const ZONES = {
  1:{ key:'R', tax:'Rl', name:'Résidentiel faible densité', short:'Pavillons', color:'#7ed36b', maxLv:5 },
  2:{ key:'R', tax:'Rh', name:'Résidentiel haute densité', short:'Immeubles', color:'#3f9d4a', maxLv:5 },
  3:{ key:'C', tax:'Cl', name:'Commercial faible densité', short:'Commerces', color:'#6fa9e8', maxLv:3 },
  4:{ key:'C', tax:'Ch', name:'Commercial haute densité', short:'Grands commerces', color:'#2f6fc9', maxLv:3 },
  5:{ key:'I', tax:'I', name:'Industriel', short:'Industrie', color:'#e8c13c', maxLv:3 },
  6:{ key:'O', tax:'O', name:'Bureaux', short:'Bureaux', color:'#3fc6c6', maxLv:3 },
};
const cells = []; const cellFree = [];
const cellGrid = new Map(), segGrid = new Map();
const gk = (x, z, S) => (Math.floor((x+EHALF)/S)*4096 + Math.floor((z+EHALF)/S));
function gridAdd(G, x, z, S, v){ const k = gk(x,z,S); let s = G.get(k); if(!s) G.set(k, s = new Set()); s.add(v); }
function gridDel(G, x, z, S, v){ const k = gk(x,z,S), s = G.get(k); if(s){ s.delete(v); if(!s.size) G.delete(k); } }
function gridQuery(G, x0, z0, x1, z1, S, out = new Set()){ for(let gx=Math.floor((x0+EHALF)/S); gx<=Math.floor((x1+EHALF)/S); gx++) for(let gz=Math.floor((z0+EHALF)/S); gz<=Math.floor((z1+EHALF)/S); gz++){ const s = G.get(gx*4096+gz); if(s) for(const v of s) out.add(v); } return out; }
// index spatial des segments (points échantillonnés)
function indexSeg(sg, add=true){ const P = sg.P; const seen = new Set(); for(let i=0;i<=sg.n;i+=2){ const k = gk(P[i*3], P[i*3+2], 32); if(seen.has(k)) continue; seen.add(k); add ? gridAdd(segGrid, P[i*3], P[i*3+2], 32, sg.id) : gridDel(segGrid, P[i*3], P[i*3+2], 32, sg.id); }
  const k2 = gk(P[sg.n*3], P[sg.n*3+2], 32); if(!seen.has(k2)) add ? gridAdd(segGrid, P[sg.n*3], P[sg.n*3+2], 32, sg.id) : gridDel(segGrid, P[sg.n*3], P[sg.n*3+2], 32, sg.id); }
function segsNear(x, z, R){ const out = []; for(const id of gridQuery(segGrid, x-R-16, z-R-16, x+R+16, z+R+16, 32)){ const s = segs.get(id); if(s) out.push(s); } return out; }
function distToSeg(sg, x, z){ const P = sg.P; let best = 1e9; for(let i=0;i<sg.n;i++){ const d = closestOnSeg(x,z,P[i*3],P[i*3+2],P[i*3+3],P[i*3+5]).d; if(d < best) best = d; } return best; }
function roadClear(x, z, extra, ignoreSeg){ for(const sg of segsNear(x, z, 24)){ const t = RT[sg.type]; if(sg.tunnel) continue; const d = distToSeg(sg, x, z); if(d < t.hw + extra && !(sg.id === ignoreSeg && d > t.hw + extra - .6)) return false; } return true; }

function newCell(o){ const id = cellFree.length ? cellFree.pop() : cells.length; const c = Object.assign({ id, zone:0, valid:false, bld:0, alive:true }, o); cells[id] = c; gridAdd(cellGrid, c.x, c.z, 16, id); return c; }
function genCells(sg){
  const t = RT[sg.type]; if(!t.zoning || sg.tunnel) return;
  const sa = (sg.trimA||0), sb = sg.len - (sg.trimB||0), n = Math.floor((sb-sa)/ZC); if(n < 1) return;
  const start = sa + ((sb-sa) - n*ZC)/2;
  for(const side of [1,-1]) for(let k=0;k<n;k++){ const p = segPoint(sg, start + (k+.5)*ZC, {}); const rx = -p.dz*side, rz = p.dx*side;
    for(let r=0;r<4;r++){ const off = t.hw + ZC/2 + ZC*r; const x = p.x + rx*off, z = p.z + rz*off;
      const c = newCell({ seg:sg.id, side, k, r, x, z, ang:Math.atan2(-rx, -rz) }); sg.cells.push(c.id); } }
}
function dropCells(sg, keepBuildings=false){ for(const id of sg.cells){ const c = cells[id]; if(!c) continue; if(c.bld && !keepBuildings){ const b = buildings.get(c.bld); if(b) removeBuilding(b, true); }
    gridDel(cellGrid, c.x, c.z, 16, id); c.alive = false; cells[id] = null; cellFree.push(id); } sg.cells.length = 0; }
function cellHeightOK(c){ const hs = obbCorners(c.x, c.z, c.ang, 4, 4).map(([x,z]) => heightAt(x,z)); return Math.max(...hs) - Math.min(...hs) < 5 && Math.min(...hs) > SEA + .5; }
function validateCell(c){
  if(!inPlay(c.x, c.z, 4)) return false;
  if(isWet(c.x, c.z, .15) || !cellHeightOK(c)) return false;
  if(!roadClear(c.x, c.z, 3.6, c.seg)) return false;
  if(blockedByBuilding(c.x, c.z, c.bld)) return false;
  if(c.r > 0){ const sg = segs.get(c.seg); const prev = sg && sg.cells.map(i => cells[i]).find(o => o && o.side === c.side && o.k === c.k && o.r === c.r-1); if(!prev || !prev.valid) return false; }
  for(const id of gridQuery(cellGrid, c.x-8, c.z-8, c.x+8, c.z+8, 16)){ if(id >= c.id) continue; const o = cells[id]; if(!o || !o.valid || o.seg === c.seg) continue; if(dist2(o.x,o.z,c.x,c.z) < 6.6*6.6) return false; }
  return true;
}
let zoneDirty = true;
function revalidate(x0, z0, x1, z1){
  const ids = [...gridQuery(cellGrid, x0-8, z0-8, x1+8, z1+8, 16)].sort((a,b) => a-b);
  for(const id of ids){ const c = cells[id]; if(!c) continue; const v = validateCell(c);
    if(!v && c.valid){ if(c.bld){ const b = buildings.get(c.bld); if(b && b.kind === 'zone') removeBuilding(b, true); } c.zone = 0; }
    c.valid = v; }
  zoneDirty = true;
}
function cellAt(x, z){ let best = null, bd = 1e9; for(const id of gridQuery(cellGrid, x-8, z-8, x+8, z+8, 16)){ const c = cells[id]; if(!c || !c.valid) continue; if(!inOBB(x, z, c.x, c.z, c.ang, 4.2, 4.2)) continue; const d = dist2(x,z,c.x,c.z); if(d < bd){ bd = d; best = c; } } return best; }
function cellsInRadius(x, z, R){ const out = []; for(const id of gridQuery(cellGrid, x-R, z-R, x+R, z+R, 16)){ const c = cells[id]; if(c && c.valid && dist2(x,z,c.x,c.z) <= R*R) out.push(c); } return out; }
function setZone(c, z){ if(!c || !c.valid || c.zone === z) return; if(c.bld){ const b = buildings.get(c.bld); if(b && b.kind === 'zone') removeBuilding(b, true); } c.zone = z; zoneDirty = true; }
function fillZone(start, z){ const sg = segs.get(start.seg); if(!sg) return 0; const from = start.zone; let n = 0;
  const map = new Map(); for(const id of sg.cells){ const c = cells[id]; if(c && c.side === start.side) map.set(c.k*4+c.r, c); }
  const q = [start], seen = new Set([start.id]);
  while(q.length){ const c = q.pop(); if(c.valid && (c.zone === from) && !c.bld){ setZone(c, z); n++; }
    for(const [dk,dr] of [[1,0],[-1,0],[0,1],[0,-1]]){ const o = map.get((c.k+dk)*4 + c.r+dr); if(o && !seen.has(o.id) && o.valid && o.zone === from && Math.abs(o.r - c.r) <= 1 && o.r >= 0 && o.r < 4 && o.k === c.k+dk){ seen.add(o.id); q.push(o); } } }
  return n; }
bus.on('segRemoved', (sg, splitting) => { dropCells(sg, splitting); indexSeg(sg, false); const P = sg.P; revalidate(Math.min(P[0],P[sg.n*3])-40, Math.min(P[2],P[sg.n*3+2])-40, Math.max(P[0],P[sg.n*3])+40, Math.max(P[2],P[sg.n*3+2])+40); });
function segAdded(sg){ indexSeg(sg, true); genCells(sg); const P = sg.P; let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9; for(let i=0;i<=sg.n;i++){ x0=Math.min(x0,P[i*3]); x1=Math.max(x1,P[i*3]); z0=Math.min(z0,P[i*3+2]); z1=Math.max(z1,P[i*3+2]); } revalidate(x0-44, z0-44, x1+44, z1+44); }
bus.on('segSplit', (old, s1, s2) => { // conserve les zones et les bâtiments d'un segment coupé en deux
  for(const s of [s1, s2]){ indexSeg(s, true); genCells(s); }
  const P = old.P; revalidate(Math.min(P[0],P[old.n*3])-44, Math.min(P[2],P[old.n*3+2])-44, Math.max(P[0],P[old.n*3])+44, Math.max(P[2],P[old.n*3+2])+44);
  for(const b of buildings.values()) if(b.kind === 'zone' && b.segId === old.id) reattachBuilding(b);
  for(const b of buildings.values()) if(b.access && b.access.sg === old) b.access = accessFor(b.x, b.z, b.front, b.hd);
});

/* ---------- lots : regroupement de cellules pour un bâtiment ---------- */
const LOT = { 1:[[1,2],[1,2]], 2:[[2,3],[2,4]], 3:[[1,2],[1,2]], 4:[[2,4],[2,4]], 5:[[2,4],[2,4]], 6:[[2,3],[2,4]] };
function sgDepth(map, k){ let d = 0; while(d < 4 && map.get(k*4+d) && map.get(k*4+d).zone) d++; return Math.max(1, d); }
function findLot(c, z, spec){
  const sg = segs.get(c.seg); if(!sg) return null; const map = new Map(); for(const id of sg.cells){ const o = cells[id]; if(o && o.side === c.side) map.set(o.k*4+o.r, o); }
  const ok = o => o && o.valid && o.zone === z && !o.bld;
  let [wr, dr] = LOT[z]; if(z <= 2 || z === 3){ const maxD = sgDepth(map, c.k); dr = [Math.min(dr[0], maxD), dr[1]]; } if(spec === 'farm') { wr = [3,4]; dr = [3,4]; } if(spec === 'forest' || spec === 'ore' || spec === 'oil') { wr = [2,4]; dr = [2,4]; }
  const wantW = wr[0] + Math.floor(rnd()*(wr[1]-wr[0]+1)), wantD = dr[0] + Math.floor(rnd()*(dr[1]-dr[0]+1));
  let k0 = c.k, k1 = c.k; while(k1 - k0 + 1 < wantW){ if(ok(map.get((k1+1)*4))) k1++; else if(ok(map.get((k0-1)*4))) k0--; else break; }
  const w = k1 - k0 + 1; if(w < wr[0]) return null;
  let d = wantD; for(let k=k0;k<=k1;k++){ let dd = 0; while(dd < d && ok(map.get(k*4+dd))) dd++; d = Math.min(d, dd); } if(d < dr[0]) return null;
  const list = []; for(let k=k0;k<=k1;k++) for(let r=0;r<d;r++) list.push(map.get(k*4+r));
  return { cells:list, w, d, seg:sg };
}

/* ---------- rendu des cellules de zonage (collées au relief) ---------- */
const zoneMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false,
  uniforms:Object.assign({ uShowAll:{value:0}, uNight:U.uNight }, { uHTex:U.uHTex, uEHalf:U.uEHalf, uCell:U.uCell, uNE1:U.uNE1 }),
  vertexShader:`${GLSL_HEIGHT}
    attribute float aA; varying vec3 vC; varying float vA; varying vec2 vUv2;
    void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0); w.y = terrainH(w.xz) + 0.28; vC = instanceColor; vA = aA; vUv2 = uv; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader:`uniform float uNight; varying vec3 vC; varying float vA; varying vec2 vUv2;
    void main(){ vec2 e = min(vUv2, 1.0-vUv2); float edge = 1.0 - smoothstep(0.0, 0.07, min(e.x,e.y)); gl_FragColor = vec4(mix(vC, vec3(1.0), edge*0.35)*mix(1.0, 0.18, uNight), vA*(0.55+edge*0.45)); }` });
const ZQ = new THREE.PlaneGeometry(1,1,2,2).rotateX(-Math.PI/2);
ZQ.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(0), 1));
let zoneMesh = null, zoneCap = 0, zoneShowAll = false;
function rebuildZoneMesh(){
  zoneDirty = false; const list = [];
  for(const c of cells){ if(!c || !c.valid || c.bld) continue; if(c.zone || zoneShowAll) list.push(c); }
  if(list.length > zoneCap || !zoneMesh){ if(zoneMesh){ scene.remove(zoneMesh); zoneMesh.dispose(); } zoneCap = Math.max(1024, list.length*2);
    const g = ZQ.clone(); g.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(zoneCap), 1));
    zoneMesh = new THREE.InstancedMesh(g, zoneMat, zoneCap); zoneMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(zoneCap*3), 3); zoneMesh.frustumCulled = false; zoneMesh.renderOrder = 2; scene.add(zoneMesh); }
  const A = zoneMesh.geometry.getAttribute('aA');
  list.forEach((c, i) => { _q.setFromAxisAngle(UP, c.ang); _m.compose(_p.set(c.x, 0, c.z), _q, _s.set(7.5, 1, 7.5)); zoneMesh.setMatrixAt(i, _m);
    if(c.zone){ _c.set(ZONES[c.zone].color); A.array[i] = zoneShowAll ? .62 : .38; } else { _c.setRGB(.9,.93,.95); A.array[i] = .14; } zoneMesh.setColorAt(i, _c); });
  zoneMesh.count = list.length; zoneMesh.instanceMatrix.needsUpdate = true; zoneMesh.instanceColor.needsUpdate = true; A.needsUpdate = true;
}
