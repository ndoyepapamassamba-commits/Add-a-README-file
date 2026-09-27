/* ================= économie, quartiers et politiques ================= */
const POLICIES = {
  recycling:{ name:'Recyclage obligatoire', desc:'25 % de déchets en moins', cost:.12 },
  smoke:{ name:'Détecteurs de fumée', desc:'Risque d\'incendie divisé par deux', cost:.06 },
  powerSave:{ name:'Économies d\'énergie', desc:'15 % d\'électricité en moins', cost:.08 },
  waterSave:{ name:'Économies d\'eau', desc:'15 % d\'eau et d\'eaux usées en moins', cost:.06 },
  lights:{ name:'Éclairage public renforcé', desc:'Moins de criminalité, un peu plus d\'électricité', cost:.05 },
  noSmoke:{ name:'Interdiction de fumer', desc:'Meilleure santé des habitants', cost:.03 },
  heavyBan:{ name:'Interdiction des poids lourds', desc:'Les camions contournent le quartier', cost:0 },
  noHigh:{ name:'Limite de hauteur', desc:'Immeubles et bureaux plafonnés au niveau 2', cost:0 },
  freeTransit:{ name:'Transports publics gratuits', desc:'Plus d\'usagers, pas de recettes de billets', cost:0 },
};
const SPECS = { '':'Aucune', farm:'Industrie agricole', forest:'Industrie forestière', ore:'Industrie minière', oil:'Industrie pétrolière', tourism:'Commerce touristique', leisure:'Commerce de loisirs', tech:'Pôle technologique' };
const DIST_NAMES = ['Le Plateau','Les Almadies','Bel-Air','La Médina','Les Jardins','Port-Neuf','Haut-Val','Rive Gauche','Les Collines','Sainte-Anne','Le Faubourg','Les Dunes','Grand-Pré','Belvédère','La Corniche','Les Tanneries','Mont-Clair','Le Vieux-Port','Les Rizières','Champ-Fleuri'];
const DIST_COLORS = ['#f2b33d','#4ea3f0','#e8604c','#63c35f','#b06be0','#1fb3b3','#e05c9a','#9c7a4a','#7a8cf0','#c7c73a'];
const distGrid = new Uint8Array(DIST_N*DIST_N); const districts = new Map(); let distSeq = 1;
function districtAt(x, z){ const i = Math.floor((x+HALF)/(2*HALF)*DIST_N), j = Math.floor((z+HALF)/(2*HALF)*DIST_N); return (i<0||j<0||i>=DIST_N||j>=DIST_N) ? 0 : distGrid[j*DIST_N+i]; }
function newDistrict(){ const id = distSeq++; const d = { id, name:DIST_NAMES[(id-1) % DIST_NAMES.length] + (id > DIST_NAMES.length ? ' '+Math.ceil(id/DIST_NAMES.length) : ''), color:DIST_COLORS[(id-1) % DIST_COLORS.length], policies:{}, spec:'', cx:0, cz:0, n:0 }; districts.set(id, d); return d; }
function paintDistrict(x, z, R, id){ const s = 2*HALF/DIST_N; let n = 0;
  for(let j=Math.max(0,Math.floor((z-R+HALF)/s)); j<=Math.min(DIST_N-1,Math.floor((z+R+HALF)/s)); j++) for(let i=Math.max(0,Math.floor((x-R+HALF)/s)); i<=Math.min(DIST_N-1,Math.floor((x+R+HALF)/s)); i++){
    const cx = -HALF+(i+.5)*s, cz = -HALF+(j+.5)*s; if(dist2(cx,cz,x,z) > R*R) continue; if(distGrid[j*DIST_N+i] !== id){ distGrid[j*DIST_N+i] = id; n++; } }
  if(n) districtsDirty = true; return n; }
let districtsDirty = true, policyVer = 1;
function refreshDistricts(){ districtsDirty = false; policyVer++;
  for(const d of districts.values()){ d.n = 0; d.cx = 0; d.cz = 0; }
  const s = 2*HALF/DIST_N;
  for(let j=0;j<DIST_N;j++) for(let i=0;i<DIST_N;i++){ const id = distGrid[j*DIST_N+i], k = (j*DIST_N+i)*4; if(!id){ distData[k+3] = 0; continue; } const d = districts.get(id); if(!d){ distGrid[j*DIST_N+i] = 0; distData[k+3] = 0; continue; }
    d.n++; d.cx += -HALF+(i+.5)*s; d.cz += -HALF+(j+.5)*s;
    const border = (i>0 && distGrid[k/4-1] !== id) || (i<DIST_N-1 && distGrid[k/4+1] !== id) || (j>0 && distGrid[k/4-DIST_N] !== id) || (j<DIST_N-1 && distGrid[k/4+DIST_N] !== id);
    const h = d.color; distData[k] = parseInt(h.slice(1,3),16); distData[k+1] = parseInt(h.slice(3,5),16); distData[k+2] = parseInt(h.slice(5,7),16); distData[k+3] = border ? 230 : 70; }
  for(const d of [...districts.values()]){ if(!d.n){ districts.delete(d.id); continue; } d.cx /= d.n; d.cz /= d.n; }
  distTex.needsUpdate = true;
  for(const b of buildings.values()) b.district = districtAt(b.x, b.z);
  for(const sg of segs.values()){ const d = districts.get(districtAt(sg.midX, sg.midZ)); sg.heavyBan = !!(d && d.policies.heavyBan); }
  NET_VERSION++; rebuildLabels(); }
const polCache = new Map(); let polCacheVer = -1;
function policyAtXZ(x, z){ return policyFor(districtAt(x, z)); }
function policyAt(b){ return policyFor(b.district || 0); }
function policyFor(id){ if(polCacheVer !== policyVer){ polCache.clear(); polCacheVer = policyVer; }
  let p = polCache.get(id); if(p) return p; const d = districts.get(id); p = Object.assign({}, state.policies, d ? d.policies : {}); p.spec = d ? d.spec : ''; polCache.set(id, p); return p; }
/* étiquettes des quartiers */
const labelEls = new Map();
function rebuildLabels(){ const box = $('#labels'); for(const [id, el] of labelEls){ if(!districts.has(id)){ el.remove(); labelEls.delete(id); } }
  for(const d of districts.values()){ let el = labelEls.get(d.id); if(!el){ el = document.createElement('div'); box.appendChild(el); labelEls.set(d.id, el); } el.textContent = d.name; } }
const _lv = new THREE.Vector3();
function updateLabels(){ const show = U.uDistOn.value > .5 || camera.position.y > 350; for(const d of districts.values()){ const el = labelEls.get(d.id); if(!el) continue;
    _lv.set(d.cx, heightAt(d.cx, d.cz)+20, d.cz).project(camera); const vis = show && _lv.z < 1 && Math.abs(_lv.x) < 1.1 && Math.abs(_lv.y) < 1.1;
    el.style.display = vis ? 'block' : 'none'; if(vis){ el.style.left = ((_lv.x+1)/2*innerWidth)+'px'; el.style.top = ((1-_lv.y)/2*innerHeight)+'px'; } } }

/* ================= budget ================= */
const LOANS = [{ amount:30000, rate:.04, days:30, bank:'Banque du Plateau' }, { amount:80000, rate:.06, days:45, bank:'Crédit Urbain' }, { amount:200000, rate:.08, days:60, bank:'Fonds des Métropoles' }];
const BUDGET_NAMES = { power:'Électricité', water:'Eau et égouts', garbage:'Déchets', health:'Santé et mort', fire:'Pompiers', police:'Police', edu:'Éducation', transit:'Transports publics', parks:'Parcs et monuments', roads:'Entretien des routes' };
const CAT_BUDGET = { power:'power', water:'water', garbage:'garbage', health:'health', fire:'fire', police:'police', edu:'edu', transit:'transit', parks:'parks' };
let econT = 0;
function computeDaily(){
  const T = state.taxes, inc = { Rl:0, Rh:0, Cl:0, Ch:0, I:0, O:0, tourism:0, fares:0, export:0 }, exp = { roads:0, policies:0, loans:0 };
  for(const k in BUDGET_NAMES) if(k !== 'roads') exp[k] = 0;
  for(const b of buildings.values()){ if(b.abandoned || b.burned) continue;
    if(b.kind === 'zone'){ const tk = ZONES[b.zone].tax, rate = T[tk]/10;
      if(b.res.length){ let s = 0; for(const i of b.res){ if(CZ.flags[i] & F_DEAD) continue; s += [2.8,3.8,5.2,7.2][CZ.edu[i]]; } inc[tk] += s*rate*(1 + .08*(b.level-1)); }
      if(b.work.length){ const w = b.work.length; if(b.zone === 3 || b.zone === 4) inc[tk] += w*3.4*rate*(b.spec === 'tourism' ? 1.4 : 1); else if(b.zone === 5) inc[tk] += w*3*rate*(b.spec ? 1.25 : 1); else inc[tk] += w*5*rate; } }
    else { const d = SVC[b.type], cat = CAT_BUDGET[d.cat]; exp[cat] = (exp[cat]||0) + d.upkeep*.8*(cat ? state.budgets[cat]/100 : 1); } }
  let roadLen = 0; for(const sg of segs.values()) roadLen += sg.len*RT[sg.type].cost; exp.roads = roadLen*.0022*state.budgets.roads/100;
  for(const L of lines) exp.transit = (exp.transit||0) + L.len*.12*state.budgets.transit/100;
  let polCost = 0; for(const k in state.policies) if(state.policies[k]) polCost += (POLICIES[k]?.cost||0)*state.pop;
  for(const d of districts.values()) for(const k in d.policies) if(d.policies[k]) polCost += (POLICIES[k]?.cost||0)*state.pop*d.n/(DIST_N*DIST_N)*4; exp.policies = polCost;
  for(const L of state.loans) exp.loans += L.pay;
  return { inc, exp }; }
function economyTick(){
  if(simTickN % 15 === 0){ const { inc, exp } = computeDaily(); const tick = econT; inc.tourism = (state.touristSpend||0)*14*(1/Math.max(1, (simTickN - (state.tsT||0))/720)); inc.fares = (state.policies.freeTransit ? 0 : (state.fares||0)*2.2);
    inc.export = state.goods.exp*.35; state.income = inc; state.expense = exp;
    let I = 0, E = 0; for(const k in inc) I += inc[k]; for(const k in exp) E += exp[k]; state.net = I - E; }
  state.money += (state.net||0)/720;
  if(simTickN % 720 === 0){ // nouveau jour
    for(const L of state.loans) L.left--; state.loans = state.loans.filter(L => L.left > 0);
    state.touristSpend = 0; state.fares = 0; state.goods.exp = 0; state.goods.imp = 0; state.goods.local = 0; state.tsT = simTickN;
    for(const L of lines){ L.passDay = L.pass; L.pass = 0; } DAYSTAT.births = DAYSTAT.deaths = DAYSTAT.imm = DAYSTAT.emi = 0; }
  if(simTickN % 30 === 0){ state.history.push({ t:state.time, pop:state.pop, money:state.money, net:state.net, happy:state.happy, unemp:state.workers+state.unemployed ? state.unemployed/(state.workers+state.unemployed) : 0 }); if(state.history.length > 720) state.history.shift(); }
  if(state.money < -20000 && simTickN % 360 === 0) toast('La ville est endettée : augmentez les impôts, réduisez les budgets ou empruntez.', false);
}
function takeLoan(k){ const L = LOANS[k]; if(state.loans.some(x => x.k === k)) return false; state.money += L.amount; state.loans.push({ k, amount:L.amount, pay:L.amount*(1+L.rate)/L.days, left:L.days, bank:L.bank }); return true; }
function repayLoan(k){ const L = state.loans.find(x => x.k === k); if(!L) return false; const rest = L.pay*L.left; if(state.money < rest) return false; state.money -= rest; state.loans = state.loans.filter(x => x !== L); return true; }
