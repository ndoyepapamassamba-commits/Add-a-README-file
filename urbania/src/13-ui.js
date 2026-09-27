/* ================= interface ================= */
let quietToasts = false;
function toast(msg, good){ if(quietToasts) return; const t = document.createElement('div'); t.className = 'toast panel'+(good ? ' good' : ''); t.textContent = msg; const box = $('#toasts'); box.appendChild(t); while(box.children.length > 3) box.firstChild.remove(); setTimeout(() => t.remove(), 5500); }
const hintT = {};
const HINTS = { noutil:'Les zones ne se développent pas : raccordez une centrale et une source d\'eau au même réseau routier.', depot:'Construisez un dépôt de bus pour faire circuler les lignes.', money:'Fonds insuffisants.' };
function hint(k){ const now = performance.now(); if((hintT[k]||0) > now) return; hintT[k] = now + 60000; toast(HINTS[k] || k); }
function feed(author, text){ const box = $('#feed'); const it = document.createElement('div'); it.className = 'it'; it.innerHTML = `<b></b> <span></span>`; it.querySelector('b').textContent = author; it.querySelector('span').textContent = text; box.prepend(it); while(box.children.length > 30) box.lastChild.remove(); }
function chirp(i, text){ feed(cimName(i), text); }
function addressOf(b){ const a = b.access; if(!a || !segs.has(a.sg.id)) return 'sans adresse'; return `${Math.max(1, Math.round(a.s/6)*2 + (a.side > 0 ? 1 : 0))} ${a.sg.name}`; }
function chirpBuilding(b, text){ feed('Urbania Info', `${text}, ${addressOf(b)}.`); }
const CHIRPS = { happy:['adore vivre ici, le quartier est calme.','vient de trouver un super boulot en ville !','a passé une belle journée au parc.','trouve que la ville s\'embellit chaque jour.'],
  unemp:['cherche toujours du travail…','aimerait que la ville attire plus d\'entreprises.'], traffic:['est encore coincé dans les embouteillages.','trouve que les carrefours sont saturés aux heures de pointe.'],
  poll:['tousse à cause de la pollution de l\'usine d\'à côté.'], garbage:['voit les poubelles déborder dans sa rue.'], nopower:['est dans le noir : il n\'y a plus d\'électricité !'], sick:['est malade et attend une ambulance.'], transit:['prend le bus tous les matins, pratique !'] };
function randomChirp(){ if(!cimTop || rnd() < .4) return; const i = Math.floor(rnd()*cimTop); if(!(CZ.flags[i] & F_ALIVE) || (CZ.flags[i] & F_DEAD)) return; const b = buildings.get(CZ.home[i]); if(!b) return;
  let k = 'happy'; if(!b.powered) k = 'nopower'; else if(b.garbage > 140) k = 'garbage'; else if(CZ.flags[i] & F_SICK) k = 'sick'; else if(fget(fld.poll, b.x, b.z) > 1.2) k = 'poll'; else if(!CZ.work[i] && CZ.age[i] >= 18 && CZ.age[i] < 65 && !CZ.school[i]) k = 'unemp'; else if(rnd() < .15) k = 'traffic'; else if(transitNear(b) && rnd() < .3) k = 'transit';
  chirp(i, pick(CHIRPS[k], rnd)); }

/* ---------- barre du haut ---------- */
function hud(){
  $('#dDate').textContent = dateStr(state.time); const h = Math.floor(hourOf()), m = Math.floor(state.time%60); $('#dTime').textContent = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  $('#wIcon').textContent = WEATHER[weather.kind].n;
  $('#sPop').textContent = fmt.format(state.pop); const dp = state.pop - (state.histPop||state.pop); $('#sPopD').textContent = state.pop ? `${state.students ? fmt.format(state.students)+' élèves' : ''}` : ''; $('#sPopD').className = 'd num';
  const mEl = $('#sMoney'); mEl.textContent = money(state.money); mEl.className = 'v num'+(state.money < 0 ? ' neg' : '');
  const dEl = $('#sDelta'); dEl.textContent = (state.net >= 0 ? '+' : '−')+fmt.format(Math.abs(Math.round(state.net||0)))+' $/jour'; dEl.className = 'd num '+(state.net >= 0 ? 'pos' : 'neg');
  $('#sHappy').textContent = state.pop ? Math.round(state.happy*100)+' %' : '–';
  const wf = state.workers + state.unemployed; $('#sUnemp').textContent = wf ? Math.round(state.unemployed/wf*100)+' %' : '–';
  for(const k of ['R','C','I','O']) $('#d'+k).style.height = Math.max(0, state.demand[k])*100+'%';
  if(!$('#mBudget').hidden && budgetTab === 'taxes') renderBudget(true);
  if(selected && simTickN % 2 === 0) showInfo();
}
document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
function setSpeed(s){ if(s) state.lastSpeed = s; state.speed = s; document.querySelectorAll('.speed button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.speed === s)); }

/* ---------- vues d'information ---------- */
let overlay = 'none';
const VIEWS = [['none','Aucune'],['power','Électricité'],['water','Eau et égouts'],['waterPoll','Pollution de l\'eau'],['pollution','Pollution du sol'],['noise','Pollution sonore'],['traffic','Trafic'],['land','Valeur foncière'],
  ['health','Santé'],['edu','Éducation'],['crime','Criminalité'],['fire','Incendies'],['garbage','Déchets'],['happy','Bonheur'],['density','Population'],['transit','Transports'],['ent','Loisirs et parcs'],['resources','Ressources naturelles'],['districts','Quartiers']];
const G = [70,190,90], Y = [240,200,60], R = [225,70,55], B = [60,150,245];
function ramp(t, a, b, c){ t = clamp(t,0,1); const [x,y] = t < .5 ? [a,b] : [b,c]; const k = t < .5 ? t*2 : (t-.5)*2; return [lerp(x[0],y[0],k), lerp(x[1],y[1],k), lerp(x[2],y[2],k)]; }
const LEGEND = { power:['Rouge : sans courant','Vert : alimenté','#e14637,#46be5a'], water:['Manque d\'eau ou d\'égouts','Raccordé','#e14637,#f0c83c,#46be5a'], waterPoll:['Propre','Polluée','#3c96f5,#8a6a3a'], pollution:['Faible','Forte','#e6d778,#be7832,#6e3c28'],
  noise:['Calme','Bruyant','#46be5a,#f0c83c,#e14637'], traffic:['Fluide','Saturé','#46be5a,#f0c83c,#e14637'], land:['Basse','Haute','#e14637,#f0c83c,#46be5a'], health:['Hors couverture','Couvert','rgba(60,150,245,.15),#3c96f5'], edu:['Hors couverture','Couvert','rgba(60,150,245,.15),#3c96f5'],
  crime:['Faible','Élevée','#46be5a,#f0c83c,#e14637'], fire:['Hors couverture','Couvert','rgba(240,120,40,.15),#f07828'], garbage:['Propre','Débordant','#46be5a,#f0c83c,#e14637'], happy:['Malheureux','Heureux','#e14637,#f0c83c,#46be5a'],
  density:['Peu peuplé','Dense','#e6f0ff,#3c96f5,#1a3f8a'], transit:['','Couverture des arrêts','rgba(60,150,245,.1),#3c96f5'], ent:['Peu de loisirs','Beaucoup','rgba(90,200,90,.15),#46be5a'], resources:['Fertile · Minerai · Pétrole · Forêt','','#7ec850,#b08a5a,#222,#2f5a2a'], districts:['','','#f2b33d,#4ea3f0'] };
const NOTES = { transit:'Les lignes de bus et de métro apparaissent en couleur. Les rames de métro circulent sous terre.', traffic:'Les segments sont colorés selon leur charge de trafic.', districts:'Peignez des quartiers avec l\'outil Quartiers pour y appliquer des politiques.', waterPoll:'Les rejets d\'eaux usées polluent la rivière en aval. Placez les pompes en amont.', resources:'Les quartiers spécialisés en industrie exploitent ces ressources.', power:'L\'électricité et l\'eau circulent par le réseau routier.' };
$('#views').innerHTML = VIEWS.map(([k,l]) => `<button data-v="${k}" aria-pressed="${k==='none'}">${l}</button>`).join('');
$('#views').addEventListener('click', e => { const b = e.target.closest('button'); if(b) setOverlay(b.dataset.v); });
$('#bViews').addEventListener('click', () => { const p = $('#viewsPanel'); p.hidden = !p.hidden; $('#bViews').setAttribute('aria-pressed', !p.hidden); if(p.hidden) setOverlay('none'); });
function setOverlay(v){ overlay = v; U.uOverOn.value = (v === 'none' || v === 'districts') ? 0 : 1; U.uDistOn.value = v === 'districts' || /^dist/.test(tool.id) ? 1 : 0;
  $$('#views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
  const lg = $('#legend'), L = LEGEND[v]; lg.hidden = !L || v === 'districts'; if(L){ $('#lgA').textContent = L[0]; $('#lgB').textContent = L[1]; $('#lgBar').style.background = `linear-gradient(90deg,${L[2]})`; }
  $('#viewNote').textContent = NOTES[v] || ''; if(v !== 'none') refreshOverlay(); transitDirty = true; trafficDirty = true; }
function refreshOverlay(){
  overData.fill(0); const set = (k, rgb, a) => { overData[k*4] = rgb[0]; overData[k*4+1] = rgb[1]; overData[k*4+2] = rgb[2]; overData[k*4+3] = a; };
  const field = (f, fn) => { for(let k=0;k<FNN;k++){ const r = fn(f[k], k); if(r) set(k, r[0], r[1]); } };
  const bld = fn => { for(const b of buildings.values()){ const k = fIdx(b.x, b.z); if(k < 0) continue; const r = fn(b); if(!r) continue; const n = Math.ceil(Math.max(b.hw, b.hd)/FC);
      for(let dj=-n;dj<=n;dj++) for(let di=-n;di<=n;di++){ const x = b.x+di*FC, z = b.z+dj*FC; if(!inOBB(x, z, b.x, b.z, b.ang, b.hw+FC/2, b.hd+FC/2)) continue; const kk = fIdx(x,z); if(kk >= 0) set(kk, r[0], r[1]); } } };
  switch(overlay){
    case 'power': bld(b => [b.powered ? G : R, 255]); break;
    case 'water': bld(b => [b.watered && b.sewered ? G : !b.watered ? R : Y, 255]); break;
    case 'waterPoll': for(let j=0;j<FN;j++) for(let i=0;i<FN;i++){ const x = -HALF+(i+.5)*FC, z = -HALF+(j+.5)*FC, c = wIdx(x,z); if(c >= 0 && wd[c] > .3) set(j*FN+i, ramp(wp[c]*3, [60,150,245], [120,110,70], [110,80,40]), 220); } break;
    case 'pollution': field(fld.poll, v => v > .05 ? [ramp(v/2, [230,215,120], [190,120,50], [110,60,40]), Math.min(255, 50+v*110)] : null); break;
    case 'noise': field(fld.noise, v => v > .05 ? [ramp(v/2, G, Y, R), Math.min(230, 40+v*120)] : null); break;
    case 'land': field(fld.lval, v => [ramp(v/80, R, Y, G), 200]); break;
    case 'health': field(fld.health, v => v > 0 ? [B, 40+v*180] : null); bld(b => b.sick ? [R, 255] : null); break;
    case 'edu': field(fld.edu, v => v > 0 ? [B, 40+v*180] : null); break;
    case 'crime': bld(b => [ramp(b.crime/70, G, Y, R), 255]); break;
    case 'fire': field(fld.fire, v => v > 0 ? [[240,120,40], 40+v*170] : null); bld(b => b.fire || b.burned ? [R, 255] : null); break;
    case 'garbage': bld(b => [ramp(b.garbage/150, G, Y, R), 255]); break;
    case 'happy': bld(b => b.kind === 'zone' ? [ramp(b.happy, R, Y, G), 255] : null); break;
    case 'density': bld(b => b.res.length ? [ramp(b.res.length/(b.hw*b.hd*4/25), [230,240,255], [60,150,245], [26,63,138]), 255] : null); break;
    case 'transit': field(fld.transit, v => v > 0 ? [B, 30+v*160] : null); break;
    case 'ent': field(fld.ent, v => v > 0 ? [G, 40+v*180] : null); break;
    case 'resources': for(let k=0;k<FNN;k++){ const f = RES.fert[k], o = RES.ore[k], p = RES.oil[k], w = RES.forest[k]; const m = Math.max(f, o, p, w); if(m < .25) continue;
      set(k, m === o ? [176,138,90] : m === p ? [30,30,30] : m === w ? [47,90,42] : [126,200,80], 80 + m*150); } break;
  }
  overTex.needsUpdate = true; }
/* rubans de trafic */
let trafficMesh = null, trafficDirty = true, trafficT = 0;
function rebuildTrafficMesh(){ trafficDirty = false; if(trafficMesh){ scene.remove(trafficMesh); trafficMesh.geometry.dispose(); trafficMesh = null; } if(overlay !== 'traffic') return;
  const g = GB(); for(const sg of segs.values()){ const t = RT[sg.type]; if(!t.car && t.net !== 'rail') continue; const cap = Math.max(1, t.lanes.length)*sg.len/40; const v = clamp(sg.load/cap, 0, 1); const cc = col('#000').setRGB(...ramp(v, G, Y, R).map(x => x/255)).convertSRGBToLinear();
    const s0 = sg.trimA||0, s1 = sg.len - (sg.trimB||0); let prev = null; for(let s = s0; s <= s1 + .01; s += Math.max(3, (s1-s0)/Math.ceil((s1-s0)/6))){ const p = segPoint(sg, Math.min(s, s1), _sp), rx = -p.dz, rz = p.dx, w = t.cw*.8;
      const cur = [[p.x-rx*w, p.y+.35, p.z-rz*w], [p.x+rx*w, p.y+.35, p.z+rz*w]]; if(prev) quad(g, prev[0], prev[1], cur[1], cur[0], cc, [0,1,0]); prev = cur; } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p,3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n,3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c,3));
  trafficMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, opacity:.85 })); trafficMesh.renderOrder = 6; scene.add(trafficMesh); }
function decayTraffic(){ for(const sg of segs.values()){ sg.load = sg.load*.8 + sg.traffic; sg.traffic = 0; } for(let k=0;k<FNN;k++) fld.traffic[k] *= .8; }

/* ---------- panneau d'information ---------- */
let selected = null, followAgent = null;
function select(obj, kind){ selected = obj ? { obj, kind } : null; if(!obj){ $('#info').hidden = true; selBox.visible = false; followAgent = null; return; } showInfo(); }
const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1).translate(0,.5,0)), new THREE.LineBasicMaterial({ color:0xf2b33d, depthTest:false, transparent:true }));
selBox.visible = false; selBox.renderOrder = 30; scene.add(selBox);
const yes = v => `<span class="pill ${v?'ok':'bad'}">${v?'Oui':'Non'}</span>`;
const meter = (v, c) => `<div class="meter"><i style="width:${Math.round(clamp(v,0,1)*100)}%;background:${c}"></i></div>`;
function rowsHtml(rows){ return `<div class="rows">${rows.map(([k,v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>`; }
function showInfo(){
  if(!selected) return; const { obj:o, kind } = selected; let html = '';
  if(kind === 'bld'){ if(!buildings.has(o.id)){ select(null); return; }
    selBox.position.set(o.x, o.y, o.z); selBox.rotation.y = o.ang; selBox.scale.set(o.hw*2+.4, o.top+.5, o.hd*2+.4); selBox.visible = true;
    const probs = ICON_ORDER.filter(k => o.problems & PROB[k]).map(k => ({ fire:'Incendie', flood:'Inondé', dead:'Décès non pris en charge', power:'Pas d\'électricité', water:'Pas d\'eau', sewage:'Égouts saturés', garbage:'Déchets non ramassés', sick:'Habitants malades', crime:'Criminalité', road:'Pas d\'accès routier', aband:'Abandonné', work:'Manque de main-d\'œuvre' })[k]);
    if(o.kind === 'zone'){ const z = ZONES[o.zone]; const title = o.burned ? 'Ruines' : o.abandoned ? 'Bâtiment abandonné' : (o.spec ? SPECS[o.spec] : z.short);
      const jobs = o.jobsCap.reduce((a,b)=>a+b,0);
      html = `<h3>${title}</h3><div class="sub">${addressOf(o)} · niveau ${o.level} / ${z.maxLv}</div>` + rowsHtml([
        ...(o.homes ? [['Habitants', `${o.res.length} (${o.homes} logements)`]] : []), ...(jobs ? [['Emplois occupés', `${o.work.length} / ${jobs}`]] : []),
        ['Électricité', yes(o.powered)], ['Eau', yes(o.watered)], ['Égouts', yes(o.sewered)], ['Bonheur', Math.round(o.happy*100)+' %'], ['Valeur foncière', Math.round(o.lv)], ['Déchets', Math.round(o.garbage)], ['Criminalité', Math.round(o.crime)], ['Quartier', districts.get(o.district)?.name || '—']]) +
        (probs.length ? `<div>${probs.map(p => `<span class="pill bad">${p}</span>`).join(' ')}</div>` : '') +
        (o.res.length ? `<div class="lbl">Quelques habitants</div><div style="font-size:13px;line-height:1.5">${o.res.slice(0,4).map(i => `<a href="#" data-cim="${i}" style="color:var(--ink)">${cimName(i)}</a>, ${Math.floor(CZ.age[i])} ans`).join('<br>')}</div>` : '') +
        `<div class="act"><button class="btn danger" id="iDel">Démolir</button><button class="btn" id="iClose">Fermer</button></div>`; }
    else { const d = SVC[o.type]; const rows = [['Entretien', money(d.upkeep*(state.budgets[CAT_BUDGET[d.cat]]||100)/100)+' / jour']];
      if(o.output !== undefined && (d.power || o.dam)) rows.push(['Production', fmt1.format(o.output)+' MW']); if(d.water) rows.push(['Eau pompée', fmt1.format(o.output||0)+' m³/s'+(o.pollIn > .05 ? ' (polluée)' : '')]); if(d.sewage) rows.push(['Eaux usées', fmt1.format(d.sewage)+' m³/s']);
      if(d.students) rows.push(['Élèves', `${o.stud.length} / ${Math.round(d.students*budgetEff('edu'))}`]); if(d.beds) rows.push(['Patients', `${(o.patients||[]).length} / ${d.beds}`]);
      if(d.graves) rows.push(['Tombes occupées', `${o.store||0} / ${d.graves}`]); if(d.garbageCap) rows.push(['Remplissage', Math.round((o.store||0)/d.garbageCap*100)+' %']); if(d.burn) rows.push(['Déchets en stock', Math.round(o.store||0)]);
      if(d.veh) rows.push(['Véhicules en service', `${o.vehOut||0} / ${Math.round(d.vehN*budgetEff(d.cat))}`]); if(d.radius) rows.push(['Rayon d\'action', d.radius+' m']);
      rows.push(['Employés', `${o.work.length} / ${o.jobsCap.reduce((a,b)=>a+b,0)}`]);
      if(o.dam) rows.push(['Chute d\'eau', fmt1.format(o.dam.head||0)+' m'], ['Débit turbiné', fmt1.format(o.dam.q||0)+' m³/s']);
      html = `<h3>${d.name}</h3><div class="sub">${o.access ? addressOf(o) : ''}</div>${rowsHtml(rows)}${d.desc ? `<div class="sub">${d.desc}</div>` : ''}<div class="act"><button class="btn danger" id="iDel">Démolir</button><button class="btn" id="iClose">Fermer</button></div>`; } }
  else if(kind === 'agent'){ if(!agents.includes(o)){ select(null); return; } selBox.visible = false;
    const i = o.cim; const title = i >= 0 && i !== undefined ? cimName(i) : { truck:'Camion de marchandises', bus:'Bus '+(o.line?.name||''), fire:'Camion de pompiers', police:'Voiture de police', ambulance:'Ambulance', garbage:'Camion poubelle', hearse:'Corbillard', train:'Train de voyageurs', car:'Véhicule', ped:'Piéton' }[o.kind] || 'Véhicule';
    const rows = []; if(i >= 0 && i !== undefined){ const home = buildings.get(CZ.home[i]), work = buildings.get(CZ.work[i]), sc = buildings.get(CZ.school[i]);
      rows.push(['Âge', Math.floor(CZ.age[i])+' ans'], ['Éducation', EDU_NAMES[CZ.edu[i]]], ['Santé', Math.round(CZ.health[i])+' %'], ['Bonheur', CZ.happy[i]+' %'], ['Domicile', home ? addressOf(home) : '—'], ['Travail', work ? addressOf(work) : sc ? 'Étudiant' : CZ.age[i] >= 65 ? 'Retraité' : 'Sans emploi'], ['Activité', cimActivity(i)]); }
    if(o.kind === 'bus') rows.push(['Passagers', o.onboard||0]); if(o.mission) rows.push(['Mission', { garbage:'Ramassage des déchets', crime:'Intervention', fire:'Incendie', sick:'Transport d\'un malade', dead:'Prise en charge d\'un défunt' }[o.mission.kind]]);
    const L = o.legs[o.li]; rows.push(['Rue', L ? L.sg.name : '—'], ['Vitesse', Math.round(o.v*3.6)+' km/h']);
    html = `<h3>${title}</h3>${rowsHtml(rows)}<div class="act"><button class="btn" id="iFollow">${followAgent === o ? 'Arrêter de suivre' : 'Suivre'}</button><button class="btn" id="iClose">Fermer</button></div>`; }
  else if(kind === 'seg'){ if(!segs.has(o.id)){ select(null); return; } selBox.visible = false; const t = RT[o.type];
    html = `<h3>${o.name}</h3><div class="sub">${t.name}${o.tunnel ? ' · tunnel' : ''}</div>` + rowsHtml([['Longueur', Math.round(o.len)+' m'], ['Vitesse limite', Math.round(t.speed*3.6)+' km/h'], ['Trafic', Math.round(o.load*10)], ['Voies', t.lanes.length]]) +
      `<div class="act"><button class="btn danger" id="iDelSeg">Démolir</button><button class="btn" id="iClose">Fermer</button></div>`; }
  else if(kind === 'district'){ const d = districts.get(o.id); if(!d){ select(null); return; } selBox.visible = false;
    let pop = 0, n = 0; for(const b of buildings.values()) if(b.district === d.id){ pop += b.res.length; n++; }
    html = `<h3>Quartier</h3><input type="text" id="dName" value="${d.name.replace(/"/g,'&quot;')}" aria-label="Nom du quartier">` + rowsHtml([['Habitants', fmt.format(pop)], ['Bâtiments', n]]) +
      `<div class="lbl">Spécialisation</div><select id="dSpec" style="background:var(--glass2);border:1px solid var(--edge);border-radius:6px;padding:5px">${Object.entries(SPECS).map(([k,v]) => `<option value="${k}" ${d.spec===k?'selected':''}>${v}</option>`).join('')}</select>
      <div class="lbl">Politiques du quartier</div><div class="pols">${Object.entries(POLICIES).map(([k,p]) => `<label><input type="checkbox" data-pol="${k}" ${d.policies[k]?'checked':''}> <span>${p.name}<br><span style="color:var(--mute);font-size:12px">${p.desc}</span></span></label>`).join('')}</div>
      <div class="act"><button class="btn danger" id="iDelDist">Supprimer le quartier</button><button class="btn" id="iClose">Fermer</button></div>`; }
  const box = $('#info'); const focusId = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id : null; if(focusId === 'dName') return;
  box.innerHTML = html; box.hidden = false;
  $('#iClose').onclick = () => select(null);
  const del = $('#iDel'); if(del) del.onclick = () => { removeBuilding(o); select(null); };
  const ds = $('#iDelSeg'); if(ds) ds.onclick = () => { bulldozeSeg(o); select(null); };
  const fl = $('#iFollow'); if(fl) fl.onclick = () => { followAgent = followAgent === o ? null : o; showInfo(); };
  box.querySelectorAll('[data-cim]').forEach(a => a.onclick = e => { e.preventDefault(); const i = +a.dataset.cim; const ag = agents.find(x => x.cim === i); if(ag) select(ag, 'agent'); else toast(`${cimName(i)} : ${cimActivity(i)}.`, true); });
  if(kind === 'district'){ const d = districts.get(o.id); $('#dName').onchange = e => { d.name = e.target.value.slice(0,40) || d.name; rebuildLabels(); };
    $('#dSpec').onchange = e => { d.spec = e.target.value; policyVer++; toast(d.spec ? `${d.name} : ${SPECS[d.spec]}. Les nouveaux bâtiments se spécialisent.` : `${d.name} : spécialisation retirée.`, true); };
    box.querySelectorAll('[data-pol]').forEach(c => c.onchange = () => { d.policies[c.dataset.pol] = c.checked; districtsDirty = true; });
    $('#iDelDist').onclick = () => { for(let k=0;k<distGrid.length;k++) if(distGrid[k] === d.id) distGrid[k] = 0; districts.delete(d.id); districtsDirty = true; select(null); }; }
}

/* ---------- fenêtre Économie ---------- */
let budgetTab = 'taxes';
$('#bBudget').addEventListener('click', () => { $('#mBudget').hidden = false; renderBudget(); });
$('#budgetTabs').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; budgetTab = b.dataset.tab; $$('#budgetTabs button').forEach(x => x.setAttribute('aria-selected', x === b)); renderBudget(); });
const INC_NAMES = { Rl:'Résidentiel faible densité', Rh:'Résidentiel haute densité', Cl:'Commerces', Ch:'Grands commerces', I:'Industrie', O:'Bureaux', tourism:'Tourisme', fares:'Billets de transport', export:'Exportations' };
function renderBudget(light){
  const body = $('#budgetBody'); const inc = state.income||{}, exp = state.expense||{}; let I = 0, E = 0; for(const k in inc) I += inc[k]; for(const k in exp) E += exp[k];
  const g2 = rows => `<div class="g2">${rows.map(([a,b,c]) => `<span>${a}</span><span class="${c||''}">${b}</span>`).join('')}</div>`;
  if(budgetTab === 'taxes'){ if(light && body.querySelector('#taxRl')){ body.querySelector('#bilan').innerHTML = bilan(); return; }
    body.innerHTML = `<p>Des impôts élevés rapportent plus mais réduisent la demande et le bonheur. Au-delà de 12 %, les habitants se plaignent.</p>` +
      Object.entries({ Rl:'Résidentiel faible', Rh:'Résidentiel dense', Cl:'Commerces', Ch:'Grands commerces', I:'Industrie', O:'Bureaux' }).map(([k,l]) => `<div class="slider"><label for="tax${k}">${l}</label><input type="range" id="tax${k}" data-k="${k}" min="1" max="29" value="${state.taxes[k]}"><span id="tv${k}">${state.taxes[k]} %</span></div>`).join('') + `<hr><div id="bilan">${bilan()}</div>`;
    body.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { state.taxes[r.dataset.k] = +r.value; $('#tv'+r.dataset.k).textContent = r.value+' %'; }); }
  else if(budgetTab === 'services'){ body.innerHTML = `<p>Un budget plus élevé augmente la portée, la capacité et le nombre de véhicules du service, et son coût.</p>` +
      Object.entries(BUDGET_NAMES).map(([k,l]) => `<div class="slider"><label for="bud${k}">${l}</label><input type="range" id="bud${k}" data-k="${k}" min="50" max="150" step="5" value="${state.budgets[k]}"><span id="bv${k}">${state.budgets[k]} %</span></div>`).join('') +
      `<hr>${g2(Object.entries(exp).filter(([k]) => BUDGET_NAMES[k]).map(([k,v]) => [BUDGET_NAMES[k], money(v)+' / jour']))}`;
    body.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { state.budgets[r.dataset.k] = +r.value; $('#bv'+r.dataset.k).textContent = r.value+' %'; covDirty = true; }); }
  else if(budgetTab === 'loans'){ body.innerHTML = `<p>Empruntez pour financer de grands projets. Les remboursements sont prélevés chaque jour.</p>` + LOANS.map((L, k) => { const cur = state.loans.find(x => x.k === k);
      return `<div class="loan"><b>${L.bank}</b><span></span><span>Montant</span><span class="num">${money(L.amount)}</span><span>Taux</span><span class="num">${Math.round(L.rate*100)} %</span><span>Durée</span><span class="num">${L.days} jours</span>
        ${cur ? `<span>Reste à payer</span><span class="num">${money(cur.pay*cur.left)} (${cur.left} j)</span><span></span><span><button class="btn" data-repay="${k}">Rembourser</button></span>` : `<span></span><span><button class="btn primary" data-loan="${k}">Emprunter</button></span>`}</div>`; }).join('');
    body.querySelectorAll('[data-loan]').forEach(b => b.onclick = () => { if(takeLoan(+b.dataset.loan)) toast('Prêt accordé.', true); renderBudget(); });
    body.querySelectorAll('[data-repay]').forEach(b => b.onclick = () => { if(repayLoan(+b.dataset.repay)) toast('Prêt remboursé.', true); else toast('Fonds insuffisants.'); renderBudget(); }); }
  else if(budgetTab === 'policies'){ body.innerHTML = `<p>Ces politiques s'appliquent à toute la ville. Pour un quartier seulement, sélectionnez-le avec l'outil Sélection.</p><div class="pols" style="display:flex;flex-direction:column;gap:6px">` +
      Object.entries(POLICIES).map(([k,p]) => `<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-pol="${k}" ${state.policies[k]?'checked':''} style="accent-color:var(--amber);margin-top:3px"> <span>${p.name}<br><span style="color:var(--mute);font-size:12.5px">${p.desc}${p.cost ? ` · ${money(p.cost*Math.max(1000,state.pop))} / jour` : ''}</span></span></label>`).join('') + '</div>';
    body.querySelectorAll('[data-pol]').forEach(c => c.onchange = () => { state.policies[c.dataset.pol] = c.checked; policyVer++; districtsDirty = true; }); }
  else if(budgetTab === 'trade'){ const g = state.goods; body.innerHTML = `<p>L'industrie approvisionne les commerces. Le surplus est exporté par la route, le train ou le port ; les manques sont importés.</p>` +
      g2([['Livraisons locales (aujourd\'hui)', fmt.format(g.local||0)+' t'], ['Importations (aujourd\'hui)', fmt.format(g.imp||0)+' t'], ['Exportations (aujourd\'hui)', fmt.format(g.exp||0)+' t'], ['Recettes d\'exportation', money(inc.export||0)+' / jour'], ['Touristes', fmt.format(state.tourists)], ['Recettes du tourisme', money(inc.tourism||0)+' / jour']]); }
  function bilan(){ return g2([...Object.entries(inc).map(([k,v]) => [INC_NAMES[k]||k, '+'+money(v), 'pos']), ...Object.entries(exp).filter(([,v]) => v > 0).map(([k,v]) => [BUDGET_NAMES[k] || { policies:'Politiques', loans:'Prêts' }[k] || k, money(-v), 'neg']), ['<b>Solde par jour</b>', `<b>${money(I-E)}</b>`, I-E >= 0 ? 'pos' : 'neg']]); }
}
/* ---------- statistiques ---------- */
$('#bStats').addEventListener('click', () => { $('#mStats').hidden = false; renderStats(); });
function drawChart(cv, data, key, color, fmtv){ const dpr = devicePixelRatio||1, w = cv.clientWidth*dpr, h = cv.clientHeight*dpr; cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.clearRect(0,0,w,h);
  if(data.length < 2){ g.fillStyle = '#97a4ae'; g.font = `${12*dpr}px sans-serif`; g.fillText('Données en cours de collecte…', 10*dpr, 20*dpr); return; }
  const vs = data.map(d => d[key]); let mn = Math.min(...vs), mx = Math.max(...vs); if(mx - mn < 1e-6){ mx += 1; mn -= 1; } const pad = 8*dpr;
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; for(let k=1;k<4;k++){ const y = pad + (h-2*pad)*k/4; g.beginPath(); g.moveTo(pad, y); g.lineTo(w-pad, y); g.stroke(); }
  const X = i => pad + (w-2*pad)*i/(vs.length-1), Yv = v => h - pad - (h-2*pad)*(v-mn)/(mx-mn);
  g.beginPath(); vs.forEach((v,i) => i ? g.lineTo(X(i), Yv(v)) : g.moveTo(X(i), Yv(v))); g.lineTo(X(vs.length-1), h-pad); g.lineTo(X(0), h-pad); g.closePath(); g.fillStyle = color+'33'; g.fill();
  g.beginPath(); vs.forEach((v,i) => i ? g.lineTo(X(i), Yv(v)) : g.moveTo(X(i), Yv(v))); g.strokeStyle = color; g.lineWidth = 2*dpr; g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(X(vs.length-1), Yv(vs[vs.length-1]), 3.5*dpr, 0, 7); g.fill();
  g.fillStyle = '#97a4ae'; g.font = `${11*dpr}px sans-serif`; g.fillText(fmtv(mx), pad, pad+10*dpr); g.fillText(fmtv(mn), pad, h-pad-3*dpr); }
function renderStats(){ const H = state.history, body = $('#statsBody'); const S = state;
  const bars = (items) => `<div style="display:flex;flex-direction:column;gap:6px">${items.map(([l,v,t,c]) => `<div class="slider" style="grid-template-columns:150px 1fr 60px"><span>${l}</span>${meter(t ? v/t : 0, c)}<span class="num">${fmt.format(v)}</span></div>`).join('')}</div>`;
  const tot = S.pop || 1, ed = S.eduCount;
  body.innerHTML = `<div class="charts">
    <figure><figcaption><span>Population</span><span class="num">${fmt.format(S.pop)}</span></figcaption><canvas id="chPop"></canvas></figure>
    <figure><figcaption><span>Trésorerie</span><span class="num">${money(S.money)}</span></figcaption><canvas id="chMoney"></canvas></figure>
    <figure><figcaption><span>Bonheur</span><span class="num">${Math.round(S.happy*100)} %</span></figcaption><canvas id="chHappy"></canvas></figure>
    <figure><figcaption><span>Chômage</span><span class="num">${S.workers+S.unemployed ? Math.round(S.unemployed/(S.workers+S.unemployed)*100) : 0} %</span></figcaption><canvas id="chUnemp"></canvas></figure></div>
    <div class="charts"><div><div class="lbl" style="margin-bottom:6px">Habitants</div>${bars([['Enfants', S.children||0, tot, '#6fa9e8'], ['Actifs', (S.workers||0), tot, '#63c35f'], ['Sans emploi', S.unemployed||0, tot, '#ea5a4f'], ['Élèves et étudiants', S.students||0, tot, '#e0b43a'], ['Retraités', S.seniors||0, tot, '#b06be0'], ['Malades', S.sick||0, tot, '#e8604c']])}</div>
    <div><div class="lbl" style="margin-bottom:6px">Niveau d'éducation (actifs)</div>${bars(EDU_NAMES.map((n,k) => [n, ed[k], ed.reduce((a,b)=>a+b,0), ['#8a939a','#6fa9e8','#3fc6c6','#f2b33d'][k]]))}</div></div>
    <div class="charts"><div><div class="lbl" style="margin-bottom:6px">Services</div><div class="g2">
      <span>Électricité</span><span class="${S.power.use > S.power.prod ? 'neg' : ''}">${fmt1.format(S.power.use)} / ${fmt1.format(S.power.prod)} MW</span>
      <span>Eau</span><span class="${S.water.use > S.water.prod ? 'neg' : ''}">${fmt1.format(S.water.use)} / ${fmt1.format(S.water.prod)} m³/s</span>
      <span>Égouts</span><span class="${S.sewage.use > S.sewage.prod ? 'neg' : ''}">${fmt1.format(S.sewage.use)} / ${fmt1.format(S.sewage.prod)} m³/s</span>
      <span>Emplois</span><span>${fmt.format(S.workers)} / ${fmt.format(S.jobs)}</span><span>Touristes</span><span>${fmt.format(S.tourists)}</span>
      <span>Véhicules en circulation</span><span>${fmt.format(agentCount.v)}</span><span>Piétons</span><span>${fmt.format(agentCount.p)}</span></div></div>
    <div><div class="lbl" style="margin-bottom:6px">Aujourd'hui</div><div class="g2"><span>Naissances</span><span>${DAYSTAT.births}</span><span>Décès</span><span>${DAYSTAT.deaths}</span><span>Arrivées</span><span>${DAYSTAT.imm}</span><span>Départs</span><span>${DAYSTAT.emi}</span></div></div></div>`;
  requestAnimationFrame(() => { drawChart($('#chPop'), H, 'pop', '#63c35f', v => fmt.format(Math.round(v))); drawChart($('#chMoney'), H, 'money', '#f2b33d', v => money(v)); drawChart($('#chHappy'), H, 'happy', '#4ea3f0', v => Math.round(v*100)+' %'); drawChart($('#chUnemp'), H, 'unemp', '#ea5a4f', v => Math.round(v*100)+' %'); }); }
/* ---------- lignes ---------- */
$('#bLines').addEventListener('click', () => { $('#mLines').hidden = false; renderLines(); });
function renderLines(){ const body = $('#linesBody'); if(!lines.length){ body.innerHTML = '<p>Aucune ligne. Créez une ligne de bus ou de métro dans la catégorie Transports.</p>'; return; }
  body.innerHTML = lines.map(L => `<div class="ln"><span class="sw" style="background:${L.color}"></span><span><b>${L.name}</b><br><span style="color:var(--mute);font-size:12.5px">${L.stops.length} ${L.type === 'bus' ? 'arrêts' : 'stations'} · ${L.type === 'bus' ? agents.filter(a => a.line === L).length+' bus' : L.trains.length+' rames'} · ${fmt.format(L.passDay || L.pass)} voyageurs/jour</span></span>
    <button class="btn sm" data-view="${L.id}">Voir</button><button class="btn sm danger" data-del="${L.id}">Supprimer</button></div>`).join('');
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { removeLine(lines.find(l => l.id === +b.dataset.del)); renderLines(); });
  body.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { $('#mLines').hidden = true; $('#viewsPanel').hidden = false; $('#bViews').setAttribute('aria-pressed', true); setOverlay('transit'); }); }
/* ---------- fenêtres ---------- */
$$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal').hidden = true));
$$('.modal').forEach(m => m.addEventListener('click', e => { if(e.target === m) m.hidden = true; }));
$('#bMenu').addEventListener('click', () => { $('#confirmNew').hidden = true; pendingNew = null; $('#mMenu').hidden = false; });
$('#mHelpBtn').addEventListener('click', () => { $('#mMenu').hidden = true; $('#mHelp').hidden = false; });
$('#mSave').addEventListener('click', () => toast(save() ? 'Partie sauvegardée.' : 'Sauvegarde impossible dans ce navigateur.', true));
$('#mLoad').addEventListener('click', async () => { $('#mMenu').hidden = true; if(!(await load())) toast('Aucune sauvegarde trouvée.'); });
let pendingNew = null;
for(const [id, kind] of [['#mNewDemo','demo'],['#mNewEmpty','empty'],['#mNewSeed','random']]) $(id).addEventListener('click', async () => {
  if(pendingNew !== kind){ pendingNew = kind; $('#confirmNew').hidden = false; return; } $('#mMenu').hidden = true; pendingNew = null;
  await newGame(kind === 'demo' ? 'demo' : 'empty', kind === 'random' ? Math.floor(rnd()*1e6) : 1337); });
$('#quality').addEventListener('change', e => { quality = e.target.value; try{ localStorage.setItem('urbania-q', quality); }catch(_){} setupComposer(); });
$('#weatherSel').addEventListener('change', e => { state.weatherMode = e.target.value; });
$('#dayLen').addEventListener('change', e => { state.dayCycle = e.target.value === '1'; });
for(const k of ['Master','Amb','Radio']) $('#v'+k).addEventListener('input', e => { AUDIO.vol[k.toLowerCase()] = e.target.value/100; $('#v'+k+'V').textContent = e.target.value; setVolumes(); });
$('#bSound').addEventListener('click', () => { AUDIO.on = !AUDIO.on; $('#bSound').setAttribute('aria-pressed', AUDIO.on); if(AUDIO.on){ audioInit(); AUDIO.ctx.resume(); } setVolumes(); toast(AUDIO.on ? 'Son activé. Réglez les volumes et la radio dans le menu.' : 'Son coupé.', true); });
