/* ================= outils ================= */
SVC.dam = { name:'Barrage hydroélectrique', cat:'power', w:0, d:0, cost:40000, upkeep:900, noRoad:true, key:'dam', desc:'Tracez-le en travers d\'une rivière : la chute d\'eau produit l\'électricité' };
svcGen.dam = (b, C) => { const L = b.hw*2; C.part(P.equip, 0, 0, 0, L, b.crest - b.y + .6, 8, '#a9a6a0'); C.part(P.equip, 0, b.crest - b.y + .6, 0, L, .8, 10, '#8f8c86');
  for(let x=-L/2+6; x<L/2-4; x+=12) C.part(P.equip, x, b.crest - b.y - 10, -5, 3, 10, 3, '#9a978f'); b.top = b.crest - b.y + 2; };
const CATS = [
  { id:'roads', label:'Routes', items:['street','oneway','avenue','busave','tramst','tramave','boulevard','highway','ramp','path','rail'] },
  { id:'zones', label:'Zonage', items:['z1','z2','z3','z4','z5','z6','z0'] },
  { id:'districts', label:'Quartiers', items:['distNew','distPaint','distErase'] },
  { id:'power', label:'Électricité', items:['wind','solar','coal','dam'] },
  { id:'water', label:'Eau', items:['pump','wtower','sewage','treat'] },
  { id:'garbage', label:'Déchets', items:['landfill','recycle','inciner'] },
  { id:'health', label:'Santé', items:['clinic','hospital','cemetery','cremat'] },
  { id:'fire', label:'Pompiers', items:['fire'] },
  { id:'police', label:'Police', items:['police'] },
  { id:'edu', label:'Éducation', items:['school','lycee','univ'] },
  { id:'transit', label:'Transports', items:['busline','depot','tramline','tramdepot','metroline','metro','monoline','monost','ferryline','pier','station','port','airport'] },
  { id:'parks', label:'Parcs', items:['park','playground','plaza','bigpark','sports','cityhall','stadium','tower'] },
  { id:'terrain', label:'Terrain', items:['raise','lower','level','soften','wsource'] },
  { id:'disaster', label:'Catastrophes', items:['dMeteor','dQuake','dTornado','dTsunami'] },
  { id:'bull', label:'Démolir', items:['bull'] },
];
const CAT_ICON = {
  roads:'<path d="M7 21L10 3M17 21L14 3M12 5v2M12 11v2M12 17v2"/>', zones:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  districts:'<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>', power:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>', water:'<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
  garbage:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', health:'<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="4"/>', fire:'<path d="M12 3c4 4 6 7 6 11a6 6 0 01-12 0c0-2 1-4 3-6 0 2 1 3 2 3 0-3 0-5 1-8z"/>',
  police:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', edu:'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>', transit:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/>',
  parks:'<path d="M12 3a5 5 0 015 5 4 4 0 01-2 7H9a4 4 0 01-2-7 5 5 0 015-5zM12 15v6"/>', terrain:'<path d="M2 20l6-10 4 6 3-4 7 8z"/>', disaster:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', bull:'<path d="M4 7h16M6 7l1 13h10l1-13M10 11v6M14 11v6"/>' };
const TDEF = {};
for(const k in RT) TDEF[k] = { kind:'road', type:k, label:RT[k].name, cost:`${RT[k].cost} $/m` };
for(const z in ZONES) TDEF['z'+z] = { kind:'zone', zone:+z, label:ZONES[z].name, cost:'Gratuit' };
TDEF.z0 = { kind:'zone', zone:0, label:'Dézoner', cost:'' };
TDEF.distNew = { kind:'dist', mode:'new', label:'Nouveau quartier' }; TDEF.distPaint = { kind:'dist', mode:'paint', label:'Étendre un quartier' }; TDEF.distErase = { kind:'dist', mode:'erase', label:'Effacer' };
for(const k in SVC) TDEF[k] = { kind:k === 'dam' ? 'dam' : 'svc', svc:k, label:SVC[k].name, cost:money(SVC[k].cost), upkeep:SVC[k].upkeep };
TDEF.busline = { kind:'line', line:'bus', label:'Ligne de bus', cost:'Arrêts gratuits' }; TDEF.metroline = { kind:'line', line:'metro', label:'Ligne de métro', cost:'Relie des stations' };
TDEF.tramline = { kind:'line', line:'tram', label:'Ligne de tramway', cost:'Arrêts sur voies de tram' }; TDEF.monoline = { kind:'line', line:'mono', label:'Ligne de monorail', cost:'Voie aérienne 60 $/m' };
TDEF.ferryline = { kind:'line', line:'ferry', label:'Ligne de ferry', cost:'Relie des embarcadères' };
for(const [k,t,l] of [['dMeteor','meteor','Météorite'],['dQuake','quake','Séisme'],['dTornado','tornado','Tornade'],['dTsunami','tsunami','Tsunami']]) TDEF[k] = { kind:'disaster', t, label:l, cost:'Déclencher' };
for(const [k,l] of [['raise','Élever'],['lower','Abaisser'],['level','Niveler'],['soften','Adoucir']]) TDEF[k] = { kind:'terrain', t:k, label:l, cost:'selon volume' };
TDEF.wsource = { kind:'wsource', label:'Source d\'eau', cost:'Gratuit' }; TDEF.bull = { kind:'bull', label:'Démolir', cost:'' }; TDEF.select = { kind:'select', label:'Sélection' };
const CAT_COLOR = { power:'#e0b43a', water:'#3b8fe0', garbage:'#8a6a3a', health:'#d63a4a', fire:'#e5532d', police:'#2a4f9a', edu:'#b06be0', transit:'#1fb3b3', parks:'#4f9a3a', districts:'#f2b33d', terrain:'#8a7a5a', disaster:'#c0392b', bull:'#ea5a4f' };
function drawThumb(cv, key){ const g = cv.getContext('2d'), w = cv.width = 128, h = cv.height = 96; const d = TDEF[key]; g.fillStyle = '#1c252e'; g.fillRect(0,0,w,h);
  if(d.kind === 'road'){ const t = RT[d.type], s = 3.2, cw = t.cw*s, hw = t.hw*s; g.fillStyle = '#6c7a3e'; g.fillRect(0,0,w,h);
    if(t.net === 'rail'){ g.fillStyle = '#7a756c'; g.fillRect(w/2-hw, 0, hw*2, h); g.fillStyle = '#5a4a3a'; for(let y=0;y<h;y+=7) g.fillRect(w/2-hw+2, y, hw*2-4, 3); g.fillStyle = '#b9bec3'; for(const o of [-9,-4,4,9]) g.fillRect(w/2+o*s*.7-1, 0, 2, h); }
    else { g.fillStyle = '#a7a39a'; g.fillRect(w/2-hw, 0, hw*2, h); g.fillStyle = t.net === 'ped' ? '#b8ab8e' : '#45474b'; g.fillRect(w/2-cw, 0, cw*2, h);
      if(d.type === 'boulevard'){ g.fillStyle = '#56703a'; g.fillRect(w/2-5, 0, 10, h); } if(d.type === 'highway'){ g.fillStyle = '#aaa7a1'; g.fillRect(w/2-3, 0, 6, h); }
      if(t.tram){ g.fillStyle = '#9aa0a6'; for(const o of [-2.7,-1.3,1.3,2.7]) g.fillRect(w/2+o*s-1, 0, 2, h); }
      if(d.type === 'busave'){ g.fillStyle = '#7d3a30'; g.fillRect(w/2-cw, 0, cw*.5, h); g.fillRect(w/2+cw*.5, 0, cw*.5, h); }
      g.strokeStyle = '#e8e6de'; g.setLineDash([8,10]); g.lineWidth = 2; for(const l of t.lanes){ if(Math.abs(l.off) < 2.5) continue; } g.beginPath(); g.moveTo(w/2, 0); g.lineTo(w/2, h); if(d.type !== 'boulevard' && d.type !== 'highway' && t.net !== 'ped') g.stroke(); g.setLineDash([]);
      if(t.oneway){ g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w/2-8, 60); g.lineTo(w/2+8, 60); g.lineTo(w/2, 44); g.fill(); } } return; }
  if(d.kind === 'zone'){ g.fillStyle = d.zone ? ZONES[d.zone].color : '#44505a'; g.globalAlpha = .9; g.fillRect(16, 12, 96, 72); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(16, 12, 96, 72);
    g.fillStyle = 'rgba(0,0,0,.35)'; if(d.zone === 1) { g.fillRect(44,44,40,28); g.beginPath(); g.moveTo(40,46); g.lineTo(64,28); g.lineTo(88,46); g.fill(); } else if(d.zone) for(let k=0;k<3;k++) g.fillRect(30+k*24, 76-(20+k*12+(d.zone===6?16:0)), 18, 20+k*12+(d.zone===6?16:0)); if(!d.zone){ g.strokeStyle = '#ea5a4f'; g.beginPath(); g.moveTo(30,24); g.lineTo(98,72); g.stroke(); } return; }
  const cat = d.kind === 'svc' || d.kind === 'dam' ? SVC[d.svc].cat : d.kind === 'line' ? 'transit' : d.kind === 'dist' ? 'districts' : d.kind === 'terrain' || d.kind === 'wsource' ? 'terrain' : d.kind === 'disaster' ? 'disaster' : 'bull';
  const cc = CAT_COLOR[cat] || '#888'; g.fillStyle = cc; g.globalAlpha = .9; g.beginPath(); g.roundRect(20, 10, 88, 76, 12); g.fill(); g.globalAlpha = 1;
  const p = new Path2D(); const tmp = document.createElementNS('http://www.w3.org/2000/svg','svg'); g.save(); g.translate(40, 24); g.scale(2, 2); g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
  const src = CAT_ICON[cat] || ''; for(const m of src.matchAll(/<path d="([^"]+)"/g)) g.stroke(new Path2D(m[1])); for(const m of src.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) g.strokeRect(+m[1], +m[2], +m[3], +m[4]); g.restore();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 13px sans-serif'; g.textAlign = 'center'; if(d.kind === 'line') g.fillText(LINE_T[d.line].n.toUpperCase(), 64, 82); if(d.kind === 'terrain' || d.kind === 'disaster') g.fillText(d.label, 64, 82); }

let tool = TDEF.select; tool.id = 'select'; let cat = null;
const roadOpt = { mode:'straight', elev:0, snap:true, radius:32 }, zoneOpt = { brush:'small' }, distOpt = { current:0, R:40 };
function setTool(id){ const d = TDEF[id]; if(!d) return; cancelTool(); tool = d; tool.id = id; cat = id === 'select' ? null : CATS.find(c => c.items.includes(id))?.id || null;
  const sel = id === 'select'; controls.mouseButtons.LEFT = sel ? THREE.MOUSE.PAN : -1; controls.touches.ONE = sel ? THREE.TOUCH.PAN : -1; controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  zoneShowAll = d.kind === 'zone'; zoneDirty = true; U.uDistOn.value = d.kind === 'dist' || overlay === 'districts' ? 1 : 0;
  $$('#cats button').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === cat)); renderPanel(); if(!sel) select(null); blip(880, .04, .05); }
function renderPanel(){ const panel = $('#panel'); if(!cat){ panel.hidden = true; return; } panel.hidden = false; const C = CATS.find(c => c.id === cat); $('#panelTitle').textContent = C.label;
  const cards = $('#cards'); cards.innerHTML = ''; for(const k of C.items){ const d = TDEF[k]; const b = document.createElement('button'); b.className = 'card'; b.setAttribute('aria-pressed', tool.id === k); b.title = SVC[d.svc]?.desc || d.label;
    const cv = document.createElement('canvas'); drawThumb(cv, k); b.appendChild(cv); const n = document.createElement('span'); n.className = 'n'; n.textContent = d.label; b.appendChild(n);
    const c = document.createElement('span'); c.className = 'c'; c.textContent = d.cost + (d.upkeep ? ` · ${money(d.upkeep)}/j` : ''); b.appendChild(c); b.onclick = () => setTool(k); cards.appendChild(b); }
  const o = $('#opts'); o.innerHTML = '';
  const btn = (label, on, f, title) => { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = label; b.setAttribute('aria-pressed', on); if(title) b.title = title; b.onclick = () => { f(); renderPanel(); }; o.appendChild(b); };
  if(tool.kind === 'road'){ for(const [m,l] of [['straight','Droit'],['curve','Courbe'],['round','Rond-point'],['upgrade','Améliorer'],['lights','Feux']]) btn(l, roadOpt.mode === m, () => { roadOpt.mode = m; cancelTool(); }, m === 'lights' ? 'Cliquez un carrefour pour ajouter ou retirer des feux' : '');
    o.appendChild(Object.assign(document.createElement('span'), { className:'sep' }));
    btn('▼', false, () => { roadOpt.elev = clamp(roadOpt.elev-3, -24, 36); }, 'Abaisser (Page bas)'); const e = document.createElement('span'); e.className = 'num'; e.style.minWidth = '72px'; e.style.textAlign = 'center'; e.textContent = roadOpt.elev === 0 ? 'Sol' : roadOpt.elev > 0 ? `+${roadOpt.elev} m` : `Tunnel ${roadOpt.elev} m`; o.appendChild(e);
    btn('▲', false, () => { roadOpt.elev = clamp(roadOpt.elev+3, -24, 36); }, 'Surélever (Page haut)'); btn('Aimantation', roadOpt.snap, () => { roadOpt.snap = !roadOpt.snap; });
    if(roadOpt.mode === 'round') for(const [r,l] of [[24,'Petit'],[32,'Moyen'],[48,'Grand']]) btn(l, roadOpt.radius === r, () => { roadOpt.radius = r; }); }
  if(tool.kind === 'zone') for(const [m,l] of [['fill','Remplir'],['small','Petit pinceau'],['large','Grand pinceau']]) btn(l, zoneOpt.brush === m, () => { zoneOpt.brush = m; });
  if(tool.kind === 'terrain'){ for(const [s,l] of [[16,'Petit'],[32,'Moyen'],[64,'Grand']]) btn(l, TERRA.size === s, () => { TERRA.size = s; }); for(const [s,l] of [[.25,'Doux'],[.6,'Normal'],[1.4,'Fort']]) btn(l, TERRA.strength === s, () => { TERRA.strength = s; }); }
  if(tool.kind === 'dist'){ for(const [s,l] of [[24,'Petit'],[40,'Moyen'],[80,'Grand']]) btn(l, distOpt.R === s, () => { distOpt.R = s; }); }
  if(tool.kind === 'line'){ const n = document.createElement('span'); n.style.color = 'var(--mute)'; n.style.fontSize = '13px'; n.textContent = tool.line === 'bus' ? 'Cliquez le long des routes pour poser les arrêts, puis cliquez sur le premier arrêt pour fermer la ligne.' : 'Cliquez les stations de métro dans l\'ordre, puis la première pour fermer la ligne.'; o.appendChild(n); }
}
$('#cats').innerHTML = CATS.map(c => `<button data-cat="${c.id}" aria-pressed="false" title="${c.label}"><svg viewBox="0 0 24 24">${CAT_ICON[c.id]}</svg><span>${c.label}</span></button>`).join('');
$('#cats').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; const c = CATS.find(c => c.id === b.dataset.cat); if(cat === c.id){ setTool('select'); return; } setTool(c.items[0]); });

/* ---------- saisie ---------- */
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(); let mouse = { x:0, y:0 }, hoverPt = null, shiftKey = false;
function pickGround(cx, cy){ const r = canvas.getBoundingClientRect(); _ndc.set((cx-r.left)/r.width*2-1, -(cy-r.top)/r.height*2+1); _ray.setFromCamera(_ndc, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction; let t = 0, prev = 0; const surf = (x,z) => Math.max(heightAt(x,z), waterSurfAt(x,z)-.05, SEA);
  for(let s=0;s<3000;s++){ const st = Math.max(1, t*.008); prev = t; t += st; const x = o.x+d.x*t, y = o.y+d.y*t, z = o.z+d.z*t;
    if(y <= surf(x,z)){ let lo = prev, hi = t; for(let k=0;k<12;k++){ const m = (lo+hi)/2; if(o.y+d.y*m <= surf(o.x+d.x*m, o.z+d.z*m)) hi = m; else lo = m; } return { x:o.x+d.x*hi, y:o.y+d.y*hi, z:o.z+d.z*hi }; }
    if(t > 16000) break; } return null; }
function pickAgent(cx, cy){ let best = null, bd = 26*26; const v = new THREE.Vector3(), r = canvas.getBoundingClientRect();
  for(const a of agents){ v.set(a.x, a.y+1, a.z).project(camera); if(v.z > 1) continue; const sx = (v.x+1)/2*r.width + r.left, sy = (1-v.y)/2*r.height + r.top; const d = (sx-cx)**2 + (sy-cy)**2; if(d < bd){ bd = d; best = a; } } return best; }
function showTip(h){ const el = $('#tip'); if(!h){ el.hidden = true; return; } el.innerHTML = h; el.hidden = false; el.style.left = Math.min(innerWidth-240, mouse.x+16)+'px'; el.style.top = (mouse.y+18)+'px'; }
/* ---------- aperçu (fantôme) ---------- */
const ghostMat = new THREE.MeshBasicMaterial({ color:0x5cc46f, transparent:true, opacity:.45, depthWrite:false, side:THREE.DoubleSide }); const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat); ghost.renderOrder = 8; ghost.frustumCulled = false; scene.add(ghost);
const prevPool = new Pool(BOX, new THREE.MeshBasicMaterial({ transparent:true, opacity:.4, depthWrite:false }), 64, { cast:false, receive:false, order:9 });
function setGhost(pts, hw, ok){ const P = [], lift = .6; for(let i=0;i<pts.length-1;i++){ const a = pts[i], b = pts[i+1]; const dx = b.x-a.x, dz = b.z-a.z, l = Math.hypot(dx,dz)||1, nx = -dz/l*hw, nz = dx/l*hw;
    P.push(a.x-nx, a.y+lift, a.z-nz, a.x+nx, a.y+lift, a.z+nz, b.x+nx, b.y+lift, b.z+nz, a.x-nx, a.y+lift, a.z-nz, b.x+nx, b.y+lift, b.z+nz, b.x-nx, b.y+lift, b.z-nz); }
  ghost.geometry.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P,3)); ghost.geometry = g; ghostMat.color.set(ok ? 0x5cc46f : 0xea5a4f); ghost.visible = pts.length > 1; }
function clearGhost(){ ghost.visible = false; prevPool.clear(); U.uBrush.value.w = 0; }

/* ---------- routes ---------- */
let draft = []; // points posés du tracé en cours
const netOf = type => RT[type].net === 'rail' ? 'rail' : 'road';
function snapRoad(x, z, type){
  const net = netOf(type), compat = s => netOf(s.type) === net || (net === 'road' && RT[s.type].net === 'ped') || (type === 'path' && RT[s.type].net === 'road');
  if(roadOpt.snap && !shiftKey){
    const n = nearestNode(x, z, 10, nd => nd.segs.some(id => { const s = segs.get(id); return s && compat(s); })); if(n) return { x:n.x, z:n.z, node:n };
    const r = nearestSeg(x, z, 8, compat); if(r && r.s > 6 && r.s < r.sg.len-6) return { x:r.x, z:r.z, seg:r.sg, s:r.s };
    const from = draft[draft.length-1]; if(from && roadOpt.mode === 'straight'){ const dx = x-from.x, dz = z-from.z; let a = Math.atan2(dz, dx), l = Math.hypot(dx, dz);
      let base = 0; const fn = from.node || null; if(fn && fn.segs.length){ const d = segDir(segs.get(fn.segs[0]), fn.id); base = Math.atan2(d[1], d[0]); }
      const st = Math.PI/12; a = base + Math.round((a-base)/st)*st; l = Math.max(8, Math.round(l/4)*4); return { x:from.x + Math.cos(a)*l, z:from.z + Math.sin(a)*l }; } }
  return { x, z };
}
function snapY(p, elev){ if(p.node) return p.node.y; if(p.seg) return segPoint(p.seg, p.s, _sp).y; const g = heightAt(p.x, p.z); const w = isWet(p.x, p.z, .4) ? waterSurfAt(p.x, p.z) + 6.5 : -1e9; return Math.max(g + elev, elev >= 0 ? w : -1e9); }
function evalRoad(A, C, B, type){ // profil, coût et validité d'un tracé proposé
  const t = RT[type], a = [A.x, A.z], b = [B.x, B.z], c = [C.x, C.z]; const ya = snapY(A, roadOpt.elev), yb = snapY(B, roadOpt.elev);
  const n = Math.max(4, Math.ceil(Math.hypot(b[0]-a[0], b[1]-a[1])/4)); const pts = []; let len = 0, bridge = 0, tun = 0, why = '';
  for(let i=0;i<=n;i++){ const p = bez(a, c, b, i/n); const g = heightAt(p[0], p[1]); if(i) len += Math.hypot(p[0]-pts[i-1].x, p[1]-pts[i-1].z); pts.push({ x:p[0], z:p[1], g, y:0, wet:isWet(p[0], p[1], .4) }); }
  const ground = Math.abs(ya - heightAt(A.x,A.z)) < 1.2 && Math.abs(yb - heightAt(B.x,B.z)) < 1.2;
  let acc = 0; for(let i=0;i<=n;i++){ const f = i/n; const p = pts[i]; p.y = ground ? (p.wet ? Math.max(p.g, waterSurfAt(p.x,p.z)+6.5) : p.g) : lerp(ya, yb, f); if(i){ const dl = Math.hypot(p.x-pts[i-1].x, p.z-pts[i-1].z); if(p.wet || p.y - p.g > 3) bridge += dl; if(p.y < p.g - 3) tun += dl; } }
  if(len < 8) why = 'Trop court'; else if(len > 1400) why = 'Trop long';
  for(const p of pts) if(!inPlay(p.x, p.z, 1)) why = 'Hors de la carte';
  if(!why && !ground){ for(let i=1;i<=n;i++){ const gr = Math.abs(pts[i].y - pts[i-1].y)/Math.max(.1, Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z)); if(gr > .14){ why = 'Pente trop forte'; break; } } }
  if(!why && roadOpt.elev >= 0 && !ground) for(const p of pts) if(p.y < p.g - 1.5){ why = 'Traverse une colline : baissez en tunnel (Page bas)'; break; }
  if(!why) for(const p of pts){ for(const o of buildingsNear(p.x, p.z, t.hw+2)) if(o.kind === 'svc' && inOBB(p.x, p.z, o.x, o.z, o.ang, o.hw+t.hw*.7, o.hd+t.hw*.7) && p.y - o.y < o.top){ why = 'Un bâtiment public bloque le passage'; break; } if(why) break; }
  // angles aux jonctions
  if(!why) for(const [P, end] of [[A, 0], [B, 1]]){ const nd = P.node; if(!nd) continue; const q = end ? pts[n-1] : pts[1], dirN = [q.x-nd.x, q.z-nd.z], l = Math.hypot(...dirN); for(const id of nd.segs){ const s = segs.get(id); if(!s) continue; const d = segDir(s, nd.id); if((d[0]*dirN[0]+d[1]*dirN[1])/l > .94) why = 'Angle trop aigu'; } }
  const cost = len*t.cost*(1 + (bridge/len||0)*1.5 + (tun/len||0)*3);
  if(!why && cost > state.money) why = 'Fonds insuffisants';
  return { pts, len, cost, why, bridge:bridge > 1, tun:tun > 1, ground }; }
function commitRoad(A, C, B, type){
  const ev = evalRoad(A, C, B, type); if(ev.why) { toast(ev.why + '.'); return null; }
  const t = RT[type], net = netOf(type), elev = roadOpt.elev;
  const resolve = P => { if(P.node && nodes.has(P.node.id)) return P.node; if(P.seg && segs.has(P.seg.id)) return splitSeg(P.seg, P.s); const r = nearestSeg(P.x, P.z, 1.5); if(r && r.s > 3 && r.s < r.sg.len-3 && P.seg) return splitSeg(r.sg, r.s); return newNode(P.x, P.z, snapY(P, elev)); };
  // intersections avec les segments existants
  const a = [A.x,A.z], b = [B.x,B.z], c = [C.x,C.z], pts = ev.pts, n = pts.length-1; const hits = [];
  for(const sg of segs.values()){ if(Math.abs(sg.midX - (A.x+B.x)/2) > sg.len/2 + ev.len/2 + 20 || Math.abs(sg.midZ - (A.z+B.z)/2) > sg.len/2 + ev.len/2 + 20) continue;
    if(A.node && (sg.a === A.node.id || sg.b === A.node.id)) continue; if(B.node && (sg.a === B.node.id || sg.b === B.node.id)) continue; if((A.seg && A.seg.id === sg.id) || (B.seg && B.seg.id === sg.id)) continue;
    const P = sg.P; for(let i=0;i<n;i++) for(let j=0;j<sg.n;j++){ const h = segIntersect(pts[i].x, pts[i].z, pts[i+1].x, pts[i+1].z, P[j*3], P[j*3+2], P[j*3+3], P[j*3+5]); if(!h) continue;
      const tt = (i + h.t)/n, ss = sg.cum[j] + h.u*(sg.cum[j+1]-sg.cum[j]), yN = lerp(pts[i].y, pts[i+1].y, h.t), yE = lerp(P[j*3+1], P[j*3+4], h.u);
      if(Math.abs(yN - yE) > 3.5) continue; const other = netOf(sg.type); if(other !== net && !(RT[sg.type].net === 'ped' || type === 'path')){ toast('Une voie ferrée ne peut croiser une route qu\'en hauteur (Page haut) ou en tunnel.'); return null; }
      hits.push({ tt, x:h.x, z:h.z, sg, ss }); } }
  hits.sort((p,q) => p.tt - q.tt); const cuts = []; for(const h of hits){ if(h.tt*ev.len < 7 || (1-h.tt)*ev.len < 7) continue; if(cuts.length && (h.tt - cuts[cuts.length-1].tt)*ev.len < 8) continue; cuts.push(h); }
  const nA = resolve(A); const cutNodes = [];
  for(const h of cuts){ let nd = nearestNode(h.x, h.z, 5); if(!nd){ const r = nearestSeg(h.x, h.z, 3, s => s.id === h.sg.id || !segs.has(h.sg.id)); if(!r) continue; nd = splitSeg(r.sg, r.s); } cutNodes.push({ nd, tt:h.tt }); }
  const nB = resolve(B); if(nA === nB) return null;
  // découpe de la courbe proposée aux intersections
  const pieces = []; let curA = a, curC = c, t0 = 0, startNode = nA;
  for(const cn of cutNodes){ const u = (cn.tt - t0)/(1 - t0); const p = bez(curA, curC, b, u), c1 = [lerp(curA[0],curC[0],u), lerp(curA[1],curC[1],u)], c2 = [lerp(curC[0],b[0],u), lerp(curC[1],b[1],u)];
    pieces.push({ na:startNode, nb:cn.nd, c:c1 }); curA = [cn.nd.x, cn.nd.z]; curC = c2; t0 = cn.tt; startNode = cn.nd; }
  pieces.push({ na:startNode, nb:nB, c:curC });
  const made = [];
  for(const pc of pieces){ const na = pc.na, nb = pc.nb; if(na === nb) continue; const L = Math.hypot(nb.x-na.x, nb.z-na.z) + Math.hypot(pc.c[0]-(na.x+nb.x)/2, pc.c[1]-(na.z+nb.z)/2)*.6; const k = Math.max(1, Math.ceil(L/96));
    let pa = na, ca = pc.c, aa = [na.x, na.z];
    for(let q=1;q<=k;q++){ let pb, cc; if(q === k){ pb = nb; cc = ca; } else { const u = 1/(k-q+1); const p = bez(aa, ca, [nb.x, nb.z], u); const c1 = [lerp(aa[0],ca[0],u), lerp(aa[1],ca[1],u)], c2 = [lerp(ca[0],nb.x,u), lerp(ca[1],nb.z,u)];
        const g = heightAt(p[0], p[1]), wet = isWet(p[0], p[1], .4); const y = ev.ground ? (wet ? waterSurfAt(p[0], p[1]) + 6.5 : g) : lerp(na.y, nb.y, q/k);
        pb = newNode(p[0], p[1], y); cc = c1; ca = c2; aa = [p[0], p[1]]; }
      const sg = newSeg(pa.id, pb.id, cc[0], cc[1], type, { tunnel:roadOpt.elev < 0 }); made.push(sg); pa = pb; } }
  for(const sg of made){ conformTerrain(sg); segAdded(sg); const P = sg.P; const hw = RT[sg.type].hw + 1.5;
    removeTrees((x,z) => distToSeg(sg, x, z) < hw, sg.midX - sg.len/2 - hw, sg.midZ - sg.len/2 - hw, sg.midX + sg.len/2 + hw, sg.midZ + sg.len/2 + hw);
    for(let i=0;i<=sg.n;i+=2) for(const o of buildingsNear(P[i*3], P[i*3+2], hw)) if(o.kind === 'zone' && inOBB(P[i*3], P[i*3+2], o.x, o.z, o.ang, o.hw+hw-1.5, o.hd+hw-1.5) && Math.abs(P[i*3+1]-o.y) < 5) removeBuilding(o, true); }
  for(const sg of made) for(const nid of [sg.a, sg.b]) autoLights(nodes.get(nid));
  state.money -= ev.cost; blip(520, .08, .06, 'triangle'); return nB; }
function autoLights(nd){ if(!nd) return; const list = nd.segs.map(id => segs.get(id)).filter(s => s && RT[s.type].car); const rank = Math.max(0, ...list.map(s => RT[s.type].rank));
  const want = list.length >= 3 && rank >= 2 && rank < 4 && !list.some(s => RT[s.type].oneway && s.type === 'ramp'); if(want !== nd.lights){ nd.lights = want; nd.tl = null; markNode(nd); } }
function bulldozeSeg(sg){ const refund = sg.len*RT[sg.type].cost*.4; const ends = [sg.a, sg.b]; removeSeg(sg); state.money += refund; for(const id of ends){ const nd = nodes.get(id); if(nd) autoLights(nd); } blip(200, .12, .07, 'sawtooth'); }
function buildRoundabout(x, z){
  const R = roadOpt.radius, type = 'oneway', cost = 2*Math.PI*R*RT[type].cost*1.3; if(cost > state.money){ toast('Fonds insuffisants.'); return; }
  if(!inPlay(x, z, R+10)){ toast('Trop près du bord de la carte.'); return; }
  // découpe des routes qui traversent le cercle
  const ring = [];
  for(const sg of [...segs.values()]){ if(!segs.has(sg.id) || netOf(sg.type) !== 'road') continue; if(Math.hypot(sg.midX-x, sg.midZ-z) > sg.len/2 + R + 10) continue;
    const P = sg.P, cr = []; for(let i=0;i<sg.n;i++){ const d0 = Math.hypot(P[i*3]-x, P[i*3+2]-z), d1 = Math.hypot(P[i*3+3]-x, P[i*3+5]-z); if((d0-R)*(d1-R) < 0){ const f = (R-d0)/(d1-d0); cr.push(sg.cum[i] + f*(sg.cum[i+1]-sg.cum[i])); } }
    if(!cr.length) continue; cr.sort((a,b) => b-a); let cur = sg; const cutNodes = [];
    for(const s of cr){ if(s < 3 || s > cur.len - 3) continue; const nd = splitSeg(cur, s); cutNodes.push(nd); const cand = nd.segs.map(id => segs.get(id)).find(q => q && (q.a === nd.id ? q.b : q.a) === cur.a); cur = cand || cur; }
    for(const nd of cutNodes) ring.push(nd); }
  for(const sg of [...segs.values()]){ const pm = segPoint(sg, sg.len/2, _sp); if(Math.hypot(pm.x-x, pm.z-z) < R - 2 && netOf(sg.type) === 'road') removeSeg(sg); }
  for(const nd of [...nodes.values()]) if(Math.hypot(nd.x-x, nd.z-z) < R - 2 && !nd.segs.length) nodes.delete(nd.id);
  // nœuds restés près du cercle : projetés sur l'anneau
  for(const nd of [...nodes.values()]){ const dd = Math.hypot(nd.x-x, nd.z-z); if(!nd.segs.length || ring.includes(nd) || dd > R + 7) continue;
    const ux = (nd.x-x)/(dd||1), uz = (nd.z-z)/(dd||1); nd.x = x + ux*R; nd.z = z + uz*R; nd.y = heightAt(nd.x, nd.z);
    for(const id of nd.segs){ const sg = segs.get(id); if(!sg) continue; indexSeg(sg, false); dropCells(sg, false); sampleSeg(sg); computeHeights(sg); markSeg(sg); indexSeg(sg, true); genCells(sg); conformTerrain(sg); } markNode(nd); ring.push(nd); }
  const ang = nd => Math.atan2(nd.z-z, nd.x-x); let list = ring.filter(nd => nodes.has(nd.id)).sort((a,b) => ang(a) - ang(b));
  // nœuds supplémentaires pour garder des arcs courts
  const all = []; const addAt = a => { const nd = newNode(x + Math.cos(a)*R, z + Math.sin(a)*R, heightAt(x + Math.cos(a)*R, z + Math.sin(a)*R)); all.push(nd); };
  if(!list.length){ for(let k=0;k<6;k++) addAt(k*Math.PI/3); }
  else { for(let k=0;k<list.length;k++){ all.push(list[k]); const a0 = ang(list[k]), a1 = k === list.length-1 ? ang(list[0]) + Math.PI*2 : ang(list[k+1]); const gap = a1 - a0, m = Math.floor(gap/(Math.PI/3)); for(let q=1;q<=m;q++) addAt(a0 + gap*q/(m+1)); } }
  all.sort((a,b) => ang(a) - ang(b)); const made = [];
  for(let k=0;k<all.length;k++){ const na = all[(k+1)%all.length], nb = all[k]; let a0 = ang(na), a1 = ang(nb); if(a0 < a1) a0 += Math.PI*2; const d = a0 - a1, mid = (a0+a1)/2, cr = R/Math.cos(d/2);
    made.push(newSeg(na.id, nb.id, x + Math.cos(mid)*cr, z + Math.sin(mid)*cr, type)); }
  for(const sg of made){ conformTerrain(sg); segAdded(sg); removeTrees((tx,tz) => distToSeg(sg, tx, tz) < 8, x-R-10, z-R-10, x+R+10, z+R+10); }
  for(const nd of all){ nd.lights = false; markNode(nd); }
  // îlot central végétalisé
  removeTrees((tx,tz) => Math.hypot(tx-x, tz-z) < R, x-R, z-R, x+R, z+R); for(let k=0;k<Math.max(2, R/10);k++){ const a = rnd()*6.28, r = rnd()*(R-10); const tr = addTree(x+Math.cos(a)*r, z+Math.sin(a)*r, 7+rnd()*4, 'D'); }
  state.money -= cost; blip(520, .08, .06, 'triangle'); }
function upgradeSeg(sg, type){ if(sg.type === type) return; const t = RT[type]; if(netOf(sg.type) !== netOf(type)){ toast('Type de voie incompatible.'); return; }
  const cost = Math.max(0, sg.len*(t.cost - RT[sg.type].cost*.5)); if(cost > state.money){ toast('Fonds insuffisants.'); return; }
  const a = sg.a, b = sg.b, cx = sg.cx, cz = sg.cz, name = sg.name.replace(/^\S+/, pick(STREET_T[type], rnd)), tun = sg.tunnel; removeSeg(sg, true); const s2 = newSeg(a, b, cx, cz, type, { name, tunnel:tun }); conformTerrain(s2); segAdded(s2);
  autoLights(nodes.get(a)); autoLights(nodes.get(b)); state.money -= cost; blip(620, .08, .06); }

/* ---------- barrage ---------- */
function evalDam(A, B){ const len = Math.hypot(B.x-A.x, B.z-A.z); if(len < 30) return { why:'Trop court' }; if(len > 420) return { why:'Trop long (420 m max.)' };
  if(isWet(A.x, A.z, .3) || isWet(B.x, B.z, .3)) return { why:'Les deux extrémités doivent être sur la terre ferme' };
  let wet = 0, surf = -1e9; for(let k=0;k<=20;k++){ const x = lerp(A.x,B.x,k/20), z = lerp(A.z,B.z,k/20); if(isWet(x, z, .8)){ wet++; surf = Math.max(surf, waterSurfAt(x,z)); } }
  if(wet < 2) return { why:'Doit traverser une rivière' }; if(state.money < SVC.dam.cost) return { why:'Fonds insuffisants' };
  return { why:'', crest:Math.min(heightAt(A.x,A.z), heightAt(B.x,B.z)) - .5, len }; }
function placeDam(A, B, forced){ const ev = forced ? { why:'', crest:forced.crest, len:Math.hypot(B.x-A.x, B.z-A.z) } : evalDam(A, B); if(ev.why){ toast(ev.why+'.'); return; }
  const mx = (A.x+B.x)/2, mz = (A.z+B.z)/2, ang = Math.atan2(B.z-A.z, -(B.x-A.x)) + Math.PI/2*0; let mnY = 1e9; for(let k=0;k<=20;k++) mnY = Math.min(mnY, wb[wIdx(lerp(A.x,B.x,k/20), lerp(A.z,B.z,k/20))] ?? heightAt(mx,mz));
  const b = newBuilding({ kind:'svc', type:'dam', x:mx, z:mz, ang:Math.atan2(-(B.z-A.z), B.x-A.x) + Math.PI/2 - Math.PI/2, hw:ev.len/2, hd:5, front:[0,1], built:1, y:mnY - 1, crest:ev.crest });
  b.ang = Math.atan2(B.x-A.x, B.z-A.z) - Math.PI/2; b.jobsCap = [4,8,6,2]; b.dam = { x0:A.x, z0:A.z, x1:B.x, z1:B.z, crest:ev.crest, maxQ:220, cap:180, q:0, head:0, power:0 };
  applyDam(b.dam, 1); WATER.dams.push(b.dam); bldIndex(b, true); buildModel(b); if(!forced){ state.money -= SVC.dam.cost; toast('Barrage construit : l\'eau va monter en amont.', true); } covDirty = true; return b; }

/* ---------- gestion des clics ---------- */
let stroke = null, lineDraft = null;
function cancelTool(){ draft = []; stroke = null; clearGhost(); showTip(null); if(lineDraft){ for(const st of lineDraft.stops) if(st.h) shelterPool.remove(st.h); lineDraft = null; } }
function onClick(x, z, e){
  const d = tool; const p = { x, z };
  if(d.kind === 'select'){ const ag = pickAgent(e.clientX, e.clientY); if(ag){ select(ag, 'agent'); return; } const b = buildingAt(x, z); if(b){ select(b, 'bld'); return; }
    const r = nearestSeg(x, z, 12); if(r && r.d < RT[r.sg.type].hw){ select(r.sg, 'seg'); return; } const di = districtAt(x, z); if(di && (U.uDistOn.value || overlay === 'districts')){ select({ id:di }, 'district'); return; } select(null); return; }
  if(d.kind === 'road'){
    if(roadOpt.mode === 'round'){ buildRoundabout(x, z); return; }
    if(roadOpt.mode === 'upgrade'){ const r = nearestSeg(x, z, 12); if(r) upgradeSeg(r.sg, d.type); return; }
    if(roadOpt.mode === 'lights'){ const nd = nearestNode(x, z, 16, n => n.segs.length >= 3); if(nd){ nd.lights = !nd.lights; nd.tl = null; markNode(nd); toast(nd.lights ? 'Feux tricolores installés.' : 'Feux retirés : priorité à droite.', true); } return; }
    const sp = snapRoad(x, z, d.type); const need = roadOpt.mode === 'curve' ? 2 : 1;
    if(draft.length < need){ draft.push(sp); return; }
    const A = draft[0], C = roadOpt.mode === 'curve' ? draft[1] : { x:(A.x+sp.x)/2, z:(A.z+sp.z)/2 };
    const nb = commitRoad(A, C, sp, d.type); if(nb){ const cont = { x:nb.x, z:nb.z, node:nb }; draft = [cont]; if(roadOpt.mode === 'curve'){ const tn = [nb.x - C.x, nb.z - C.z], l = Math.hypot(...tn)||1; draft.push({ x:nb.x + tn[0]/l*20, z:nb.z + tn[1]/l*20, auto:true }); draft.length = 1; } } return; }
  if(d.kind === 'svc'){ const pl = svcPlacement(d.svc, x, z, svcRot); const why = svcValid(pl); if(why){ toast(why+'.'); return; } placeService(pl); blip(440, .1, .07, 'triangle'); toast(`${SVC[d.svc].name} construit.`, true); return; }
  if(d.kind === 'dam'){ if(!draft.length){ draft.push(p); return; } placeDam(draft[0], p); draft = []; clearGhost(); return; }
  if(d.kind === 'wsource'){ const ex = WATER.sources.find(s => !s.natural && Math.hypot(s.x-x, s.z-z) < 30); if(ex){ WATER.sources.splice(WATER.sources.indexOf(ex), 1); rebuildSources(); toast('Source retirée.', true); } else { addWaterSource(x, z, 35); toast('Source d\'eau ajoutée (35 m³/s).', true); } return; }
  if(d.kind === 'bull'){ const b = buildingAt(x, z); if(b){ removeBuilding(b); blip(200, .12, .07, 'sawtooth'); return; } const r = nearestSeg(x, z, 12); if(r && r.d < RT[r.sg.type].hw + 1){ bulldozeSeg(r.sg); return; }
    for(const L of lines) for(const st of L.stops) if(Math.hypot(st.x-x, st.z-z) < 6){ removeLine(L); toast('Ligne supprimée.', true); return; } return; }
  if(d.kind === 'disaster'){ startDisaster(d.t, x, z); return; }
  if(d.kind === 'line'){ const LT = LINE_T[d.line];
    if(LT.road){ if(!lineDraft) lineDraft = newLine(d.line); const first = lineDraft.stops[0];
      if(first && lineDraft.stops.length >= 2 && Math.hypot(first.x-x, first.z-z) < 14){ finishLine(lineDraft); toast(`${lineDraft.name} créée avec ${lineDraft.stops.length} arrêts.`, true); lineDraft = null; return; }
      const st = stopFromPoint(x, z, d.line); if(!st){ toast(d.line === 'tram' ? 'Placez les arrêts le long d\'une rue ou avenue avec tramway.' : 'Placez les arrêts le long d\'une route.'); return; } addStopVisual(st); lineDraft.stops.push(st); return; }
    const stn = [...buildings.values()].filter(b => b.type === LT.st).find(b => Math.hypot(b.x-x, b.z-z) < Math.max(b.hw, b.hd) + 12); if(!lineDraft) lineDraft = newLine(d.line);
    if(!stn){ toast({ metro:'Cliquez sur une station de métro.', mono:'Cliquez sur une station de monorail.', ferry:'Cliquez sur un embarcadère de ferry.' }[d.line]); return; } const first = lineDraft.stops[0];
    const st = stationStop(d.line, stn), prev = lineDraft.stops[lineDraft.stops.length-1];
    const target = first && first.b === stn && lineDraft.stops.length >= 2 ? first : st;
    if(prev && d.line === 'ferry'){ let dry = 0; for(let k=1;k<20;k++) if(!isWet(lerp(prev.x, target.x, k/20), lerp(prev.z, target.z, k/20), .8)) dry++; if(dry > 2){ toast('Le trajet du ferry doit rester sur l\'eau.'); return; } }
    if(prev && d.line === 'mono'){ const cost = Math.hypot(target.x-prev.x, target.z-prev.z)*60; if(state.money < cost){ toast('Fonds insuffisants.'); return; } state.money -= cost; }
    if(target === first){ finishLine(lineDraft); toast(`${lineDraft.name} créée.`, true); lineDraft = null; return; }
    if(lineDraft.stops.some(s => s.b === stn)) return; lineDraft.stops.push(st); return; }
}
let svcRot = 0;
function onHover(x, z){
  const d = tool; prevPool.clear(); U.uBrush.value.w = 0; ghost.visible = false;
  if(d.kind === 'road'){
    if(roadOpt.mode === 'round'){ U.uBrush.value.set(x, z, roadOpt.radius, 1); U.uBrushCol.value.set(0xf2b33d); showTip(`Rond-point · rayon ${roadOpt.radius} m · ${money(2*Math.PI*roadOpt.radius*RT.oneway.cost*1.3)}`); return; }
    if(roadOpt.mode === 'upgrade' || roadOpt.mode === 'lights'){ const r = roadOpt.mode === 'upgrade' ? nearestSeg(x, z, 12) : null; if(r){ const pts = []; for(let i=0;i<=r.sg.n;i+=2) pts.push({ x:r.sg.P[i*3], y:r.sg.P[i*3+1], z:r.sg.P[i*3+2] }); setGhost(pts, RT[d.type].hw, true); showTip(`Remplacer par : ${d.label}`); }
      else if(roadOpt.mode === 'lights'){ const nd = nearestNode(x, z, 16, n => n.segs.length >= 3); showTip(nd ? (nd.lights ? 'Retirer les feux' : 'Installer des feux') : 'Survolez un carrefour'); } return; }
    const sp = snapRoad(x, z, d.type); _c.setRGB(1,.8,.3); place(prevPool, sp.x, snapY(sp, roadOpt.elev), sp.z, 2.5, .6, 2.5, 0, sp.node || sp.seg ? _c.setRGB(.3,.9,.5) : _c);
    const need = roadOpt.mode === 'curve' ? 2 : 1;
    if(draft.length >= need){ const A = draft[0], C = roadOpt.mode === 'curve' ? draft[1] : { x:(A.x+sp.x)/2, z:(A.z+sp.z)/2 }; const ev = evalRoad(A, C, sp, d.type); setGhost(ev.pts, RT[d.type].hw, !ev.why);
      showTip(`${d.label} · ${Math.round(ev.len)} m · ${money(ev.cost)}${ev.bridge ? ' · pont' : ''}${ev.tun ? ' · tunnel' : ''}${roadOpt.elev ? ` · hauteur ${roadOpt.elev} m` : ''}${ev.why ? `<br><span class="bad">${ev.why}</span>` : ''}`); }
    else if(draft.length === 1 && need === 2){ const A = draft[0]; setGhost([{ x:A.x, y:snapY(A, roadOpt.elev), z:A.z }, { x:sp.x, y:snapY(sp, roadOpt.elev), z:sp.z }], .6, true); showTip('Cliquez le point de contrôle de la courbe'); }
    else showTip(`${d.label} · cliquez le point de départ${roadOpt.elev ? ` · hauteur ${roadOpt.elev} m` : ''}`); return; }
  if(d.kind === 'zone'){ const R = zoneOpt.brush === 'large' ? 26 : zoneOpt.brush === 'small' ? 7 : 0; if(R){ U.uBrush.value.set(x, z, R, 1); U.uBrushCol.value.set(d.zone ? ZONES[d.zone].color : '#ea5a4f'); } const c = cellAt(x, z); showTip(c ? d.label : `${d.label} · survolez les cases le long des routes`); return; }
  if(d.kind === 'dist'){ U.uBrush.value.set(x, z, distOpt.R, 1); U.uBrushCol.value.set('#f2b33d'); const di = districtAt(x, z); showTip(d.mode === 'new' ? 'Peignez un nouveau quartier' : d.mode === 'erase' ? 'Effacer' : di ? `Étendre ${districts.get(di)?.name}` : 'Commencez dans un quartier existant'); return; }
  if(d.kind === 'terrain'){ U.uBrush.value.set(x, z, TERRA.size, 1); U.uBrushCol.value.set(d.t === 'lower' ? '#ea5a4f' : '#f2b33d'); showTip(d.label); return; }
  if(d.kind === 'svc'){ const pl = svcPlacement(d.svc, x, z, svcRot); const why = svcValid(pl); _c.set(why ? '#ea5a4f' : '#5cc46f'); place(prevPool, pl.x, heightAt(pl.x, pl.z), pl.z, pl.hw*2, 6, pl.hd*2, pl.ang, _c);
    if(SVC[d.svc].radius){ U.uBrush.value.set(pl.x, pl.z, SVC[d.svc].radius, 1); U.uBrushCol.value.set('#4ea3f0'); }
    showTip(`${SVC[d.svc].name} · ${money(SVC[d.svc].cost)} · entretien ${money(SVC[d.svc].upkeep)}/jour${why ? `<br><span class="bad">${why}</span>` : ''}`); return; }
  if(d.kind === 'dam'){ if(draft.length){ const A = draft[0], ev = evalDam(A, { x, z }); setGhost([{ x:A.x, y:heightAt(A.x,A.z), z:A.z }, { x, y:heightAt(x,z), z }], 5, !ev.why); showTip(`Barrage · ${money(SVC.dam.cost)}${ev.why ? `<br><span class="bad">${ev.why}</span>` : ''}`); } else showTip('Barrage : cliquez une rive, puis l\'autre'); return; }
  if(d.kind === 'line'){ if(lineDraft && lineDraft.stops.length){ const pts = lineDraft.stops.map(s => ({ x:s.x, y:heightAt(s.x,s.z), z:s.z })); pts.push({ x, y:heightAt(x,z), z }); setGhost(pts, 1.2, true); ghostMat.color.set(lineDraft.color); }
    showTip(lineDraft ? `${lineDraft.name} · ${lineDraft.stops.length} ${LINE_T[d.line].stop}` : d.label); return; }
  if(d.kind === 'disaster'){ U.uBrush.value.set(x, z, DIS_R[d.t], 1); U.uBrushCol.value.set('#ea5a4f'); showTip(`${d.label} · cliquez pour déclencher ici`); return; }
  if(d.kind === 'bull'){ const b = buildingAt(x, z); if(b){ _c.set('#ea5a4f'); place(prevPool, b.x, b.y, b.z, b.hw*2+.6, b.top+1, b.hd*2+.6, b.ang, _c); showTip(`Démolir : ${b.kind === 'svc' ? SVC[b.type].name : ZONES[b.zone].short}`); return; }
    const r = nearestSeg(x, z, 12); if(r && r.d < RT[r.sg.type].hw + 1){ const pts = []; for(let i=0;i<=r.sg.n;i+=2) pts.push({ x:r.sg.P[i*3], y:r.sg.P[i*3+1], z:r.sg.P[i*3+2] }); setGhost(pts, RT[r.sg.type].hw, false); showTip(`Démolir : ${r.sg.name} (remboursement ${money(r.sg.len*RT[r.sg.type].cost*.4)})`); return; } showTip(null); return; }
  if(d.kind === 'wsource') showTip('Ajouter ou retirer une source d\'eau');
}
function strokeAt(x, z, erase){ const d = tool;
  if(d.kind === 'zone'){ const z0 = erase ? 0 : d.zone; if(zoneOpt.brush === 'fill'){ const c = cellAt(x, z); if(c) fillZone(c, z0); return; } const R = zoneOpt.brush === 'large' ? 26 : 7; for(const c of cellsInRadius(x, z, R)) setZone(c, z0); return; }
  if(d.kind === 'dist'){ if(d.mode === 'erase' || erase){ paintDistrict(x, z, distOpt.R, 0); return; }
    if(!stroke.dist){ if(d.mode === 'new'){ stroke.dist = newDistrict().id; toast(`Nouveau quartier : ${districts.get(stroke.dist).name}.`, true); } else { stroke.dist = districtAt(x, z) || distOpt.current; if(!stroke.dist) return; } distOpt.current = stroke.dist; }
    paintDistrict(x, z, distOpt.R, stroke.dist); }
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
const touches = new Set(); let downAt = null;
canvas.addEventListener('pointerdown', e => { canvas.focus({ preventScroll:true }); if(e.pointerType === 'touch'){ touches.add(e.pointerId); if(touches.size > 1){ stroke = null; return; } }
  downAt = { x:e.clientX, y:e.clientY, b:e.button }; if(tool.kind === 'select') return;
  if(e.button === 0 || (e.button === 2 && (tool.kind === 'zone' || tool.kind === 'dist'))){ const h = pickGround(e.clientX, e.clientY); if(!h) return;
    if(tool.kind === 'zone' || tool.kind === 'dist'){ stroke = { erase:e.button === 2 }; strokeAt(h.x, h.z, stroke.erase); }
    if(tool.kind === 'terrain'){ stroke = { terra:true }; TERRA.tool = tool.t; TERRA.target = heightAt(h.x, h.z); } } });
canvas.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; if(touches.size > 1) return; const h = pickGround(e.clientX, e.clientY); hoverPt = h;
  if(tool.kind === 'select'){ showTip(null); return; } if(!h){ showTip(null); return; } onHover(h.x, h.z); if(stroke && !stroke.terra) strokeAt(h.x, h.z, stroke.erase); });
function endPointer(e){ if(e.pointerType === 'touch'){ const multi = touches.size > 1; touches.delete(e.pointerId); if(multi) return; }
  const moved = downAt ? Math.hypot(e.clientX-downAt.x, e.clientY-downAt.y) : 99, btn = downAt ? downAt.b : -1; downAt = null;
  if(stroke){ stroke = null; return; }
  if(btn === 2 && moved < 6){ if(draft.length || lineDraft){ cancelTool(); return; } if(tool.kind !== 'select') setTool('select'); return; }
  if(btn !== 0 || moved > 8) return; const h = pickGround(e.clientX, e.clientY); if(!h) return; onClick(h.x, h.z, e); if(tool.kind !== 'select') onHover(h.x, h.z); }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { touches.delete(e.pointerId); stroke = null; });
canvas.addEventListener('pointerleave', () => { if(!stroke){ showTip(null); } });
const keys = new Set();
addEventListener('keydown', e => { if(e.target.closest && e.target.closest('input,select,textarea')) return; const k = e.key.toLowerCase(); shiftKey = e.shiftKey;
  if(document.querySelector('.modal:not([hidden])')){ if(k === 'escape') $$('.modal').forEach(m => m.hidden = true); return; }
  if(k === ' '){ e.preventDefault(); setSpeed(state.speed ? 0 : state.lastSpeed); return; }
  if(k === 'escape'){ if(draft.length || lineDraft) cancelTool(); else setTool('select'); return; }
  if(k === 'pageup'){ e.preventDefault(); roadOpt.elev = clamp(roadOpt.elev+3, -24, 36); renderPanel(); if(hoverPt) onHover(hoverPt.x, hoverPt.z); return; }
  if(k === 'pagedown'){ e.preventDefault(); roadOpt.elev = clamp(roadOpt.elev-3, -24, 36); renderPanel(); if(hoverPt) onHover(hoverPt.x, hoverPt.z); return; }
  if(k === 'r' && tool.kind === 'svc'){ svcRot += Math.PI/2; if(hoverPt) onHover(hoverPt.x, hoverPt.z); return; }
  if(/^[1-9]$/.test(k)){ const c = CATS[+k-1]; if(c) setTool(c.items[0]); return; } if(k === '0' || k === 'delete'){ setTool('bull'); return; }
  keys.add(k); });
addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); shiftKey = e.shiftKey; });
addEventListener('blur', () => keys.clear());
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _mv = new THREE.Vector3(), _off = new THREE.Vector3();
function updateKeys(dt){ if(!keys.size) return; const dist = camera.position.distanceTo(controls.target), sp = dist*1.1*dt;
  camera.getWorldDirection(_f); _f.y = 0; _f.normalize(); _r.crossVectors(_f, UP);
  let mx = 0, mz = 0; if(keys.has('z')||keys.has('w')||keys.has('arrowup')) mz += 1; if(keys.has('s')||keys.has('arrowdown')) mz -= 1; if(keys.has('d')||keys.has('arrowright')) mx += 1; if(keys.has('q')||keys.has('arrowleft')) mx -= 1;
  _mv.set(0,0,0).addScaledVector(_f, mz*sp).addScaledVector(_r, mx*sp); camera.position.add(_mv); controls.target.add(_mv); if(mx || mz) followAgent = null;
  let rot = 0; if(keys.has('a')) rot += 1; if(keys.has('e')) rot -= 1; if(rot){ _off.copy(camera.position).sub(controls.target).applyAxisAngle(UP, rot*dt*1.4); camera.position.copy(controls.target).add(_off); } }
function clampCamera(dt){ const t = controls.target, lim = HALF+300;
  if(followAgent){ const dx = followAgent.x - t.x, dz = followAgent.z - t.z; t.x += dx*Math.min(1, dt*4); t.z += dz*Math.min(1, dt*4); camera.position.x += dx*Math.min(1, dt*4); camera.position.z += dz*Math.min(1, dt*4); }
  const cx = clamp(t.x,-lim,lim), cz = clamp(t.z,-lim,lim); if(cx !== t.x || cz !== t.z){ camera.position.x += cx-t.x; camera.position.z += cz-t.z; t.x = cx; t.z = cz; }
  const gy = Math.max(heightAt(t.x,t.z), SEA), dy = (gy-t.y)*Math.min(1, dt*4); t.y += dy; camera.position.y += dy;
  const ch = Math.max(heightAt(camera.position.x, camera.position.z), waterSurfAt(camera.position.x, camera.position.z), SEA)+4; if(camera.position.y < ch) camera.position.y = ch; }
function applyTerraform(dt){ if(!stroke || !stroke.terra || !hoverPt) return; const vol = terraform(hoverPt.x, hoverPt.z, dt); if(vol > 0){ state.money -= vol*.05; } }
