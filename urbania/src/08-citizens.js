/* ================= citoyens (agents individuels) ================= */
let CCAP = 32768;
const CZ = { home:null, work:null, school:null, age:null, edu:null, health:null, flags:null, name:null, loc:null, arrive:null, jl:null, happy:null };
function allocCims(cap){ const old = CZ.home ? { ...CZ } : null;
  const mk = (T, k) => { const a = new T(cap); if(old) a.set(old[k]); return a; };
  CZ.home = mk(Int32Array,'home'); CZ.work = mk(Int32Array,'work'); CZ.school = mk(Int32Array,'school'); CZ.age = mk(Float32Array,'age'); CZ.edu = mk(Uint8Array,'edu');
  CZ.health = mk(Uint8Array,'health'); CZ.flags = mk(Uint8Array,'flags'); CZ.name = mk(Uint32Array,'name'); CZ.loc = mk(Uint8Array,'loc'); CZ.arrive = mk(Float32Array,'arrive'); CZ.jl = mk(Uint8Array,'jl'); CZ.happy = mk(Uint8Array,'happy');
  CCAP = cap; }
allocCims(CCAP);
const F_ALIVE = 1, F_SICK = 2, F_DEAD = 4, F_CAR = 8, F_TRAVEL = 16, F_HOSP = 32;
const LOC_HOME = 0, LOC_WORK = 1, LOC_SCHOOL = 2, LOC_SHOP = 3;
let cimTop = 0; const cimFree = [];
function cimName(i){ const h = CZ.name[i]; return FIRST[h % FIRST.length] + ' ' + LAST[(h >>> 8) % LAST.length]; }
function newCim(home, age, edu){
  let i; if(cimFree.length) i = cimFree.pop(); else { if(cimTop >= CCAP) allocCims(CCAP*2); i = cimTop++; }
  CZ.home[i] = home.id; CZ.work[i] = 0; CZ.school[i] = 0; CZ.age[i] = age; CZ.edu[i] = edu; CZ.health[i] = 70 + rnd()*30; CZ.flags[i] = F_ALIVE | (rnd() < .7 ? F_CAR : 0);
  CZ.name[i] = (rnd()*4294967295)>>>0; CZ.loc[i] = LOC_HOME; CZ.arrive[i] = 0; CZ.happy[i] = 70; home.res.push(i); return i; }
function releaseJob(i){ const w = CZ.work[i]; if(w){ const b = buildings.get(w); if(b){ const q = b.work.indexOf(i); if(q >= 0){ b.work.splice(q,1); if(b.jl && b.jl[CZ.jl[i]] > 0) b.jl[CZ.jl[i]]--; } } CZ.work[i] = 0; } }
function releaseSchool(i){ const s = CZ.school[i]; if(s){ const b = buildings.get(s); if(b){ const q = b.stud.indexOf(i); if(q >= 0) b.stud.splice(q,1); } CZ.school[i] = 0; } }
function removeCim(i){ releaseJob(i); releaseSchool(i); const h = buildings.get(CZ.home[i]); if(h){ const q = h.res.indexOf(i); if(q >= 0) h.res.splice(q,1); }
  CZ.flags[i] = 0; CZ.home[i] = 0; cimFree.push(i); }
const alive = i => CZ.flags[i] & F_ALIVE;
function cimActivity(i){ const f = CZ.flags[i]; if(f & F_DEAD) return 'Décédé, en attente du corbillard'; if(f & F_HOSP) return 'À l\'hôpital'; if(f & F_SICK) return 'Malade';
  if(f & F_TRAVEL) return 'En déplacement'; return ['À la maison','Au travail','À l\'école','En courses'][CZ.loc[i]] || 'À la maison'; }
const EDU_NAMES = ['Sans diplôme','Primaire','Secondaire','Universitaire'];

/* ================= champs (couverture, pollution, valeur foncière…) ================= */
const FNN = FN*FN;
const fld = { police:new Float32Array(FNN), fire:new Float32Array(FNN), health:new Float32Array(FNN), edu:new Float32Array(FNN), ent:new Float32Array(FNN),
  poll:new Float32Array(FNN), noise:new Float32Array(FNN), lval:new Float32Array(FNN).fill(25), crime:new Float32Array(FNN), traffic:new Float32Array(FNN), transit:new Float32Array(FNN), water:new Float32Array(FNN) };
const fTmp = new Float32Array(FNN), fSrc = new Float32Array(FNN), fNoise = new Float32Array(FNN);
let covDirty = true;
const fget = (f, x, z) => { const k = fIdx(x, z); return k < 0 ? 0 : f[k]; };
function stamp(arr, x, z, R, v){ const i0 = Math.max(0, Math.floor((x-R+HALF)/FC)), i1 = Math.min(FN-1, Math.floor((x+R+HALF)/FC)), j0 = Math.max(0, Math.floor((z-R+HALF)/FC)), j1 = Math.min(FN-1, Math.floor((z+R+HALF)/FC));
  for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){ const cx = -HALF+(i+.5)*FC, cz = -HALF+(j+.5)*FC, d = Math.hypot(cx-x, cz-z)/R; if(d > 1) continue; const val = v*(1 - d*d*.55), k = j*FN+i; if(val > arr[k]) arr[k] = val; } }
function recomputeCoverage(){ for(const k of ['police','fire','health','edu','ent','transit']) fld[k].fill(0);
  for(const b of buildings.values()){ if(b.kind !== 'svc' || b.abandoned) continue; const d = SVC[b.type], eff = budgetEff(d.cat);
    if(d.cat === 'police') stamp(fld.police, b.x, b.z, d.radius*eff, 1); if(d.cat === 'fire') stamp(fld.fire, b.x, b.z, d.radius*eff, 1);
    if(d.beds) stamp(fld.health, b.x, b.z, d.radius*eff, 1); if(d.students) stamp(fld.edu, b.x, b.z, d.radius*eff, d.eduLv/3*.4+.6);
    if(d.ent) stamp(fld.ent, b.x, b.z, d.radius*Math.min(1.2, eff), Math.min(1, .5 + d.ent*.15));
    if(b.type === 'metro' || b.type === 'station') stamp(fld.transit, b.x, b.z, 380, 1); }
  for(const ln of lines) for(const st of ln.stops) stamp(fld.transit, st.x, st.z, 260, .8);
  covDirty = false; }
function updateFields(){
  if(covDirty) recomputeCoverage();
  fSrc.fill(0); fNoise.fill(0);
  for(const b of buildings.values()){ if(b.abandoned || b.burned) continue; const k = fIdx(b.x, b.z); if(k < 0) continue;
    if(b.kind === 'zone'){ if(b.zone === 5 && b.spec !== 'farm' && b.spec !== 'forest') fSrc[k] += (b.spec === 'oil' ? 1.4 : b.spec === 'ore' ? 1.1 : .6)*b.level*(b.hw*b.hd/64);
      if(b.zone >= 3) fNoise[k] += .25*(b.zone === 5 ? 2 : 1); if(b.zone === 3 || b.zone === 4) fNoise[k] += b.spec === 'leisure' && hourOf() > 20 ? 1 : 0; }
    else { const d = SVC[b.type]; if(d.pollution) fSrc[k] += d.pollution*1.5; if(d.noise) fNoise[k] += d.noise; } }
  for(const sg of segs.values()){ const t = RT[sg.type]; if(!t.noise) continue; const v = t.noise*.12*(1 + Math.min(3, sg.traffic*.15)); for(let i=0;i<=sg.n;i+=4){ const k = fIdx(sg.P[i*3], sg.P[i*3+2]); if(k >= 0) fNoise[k] = Math.max(fNoise[k], v); } }
  const blur = (a, keep, spread) => { for(let j=0;j<FN;j++) for(let i=0;i<FN;i++){ const k = j*FN+i; let s = a[k]*keep, w = keep;
      if(i>0){ s += a[k-1]*spread; w += spread; } if(i<FN-1){ s += a[k+1]*spread; w += spread; } if(j>0){ s += a[k-FN]*spread; w += spread; } if(j<FN-1){ s += a[k+FN]*spread; w += spread; } fTmp[k] = s/w; } a.set(fTmp); };
  for(let k=0;k<FNN;k++) fld.poll[k] = fld.poll[k]*.85 + fSrc[k]*.3; blur(fld.poll, .4, .15); blur(fld.poll, .4, .15);
  for(let k=0;k<FNN;k++) fld.noise[k] = fNoise[k]; blur(fld.noise, .5, .125);
  for(let j=0;j<FN;j++) for(let i=0;i<FN;i++){ const k = j*FN+i, x = -HALF+(i+.5)*FC, z = -HALF+(j+.5)*FC;
    fld.water[k] = 0; const wn = nearestWater(x, z, 48); if(wn) fld.water[k] = 1 - waterPollAt(wn.x, wn.z)*2;
    const p = Math.min(1, fld.poll[k]/2), nz = Math.min(1, fld.noise[k]/2);
    fld.lval[k] = clamp(18 + 20*fld.ent[k] + 8*fld.police[k] + 8*fld.fire[k] + 10*fld.health[k] + 9*fld.edu[k] + 6*fld.transit[k] + 9*Math.max(0, fld.water[k]) - 34*p - 12*nz - 14*Math.min(1, fld.crime[k]/60), 0, 100); }
  if(overlay !== 'none') refreshOverlay();
}

/* ================= distribution de l'électricité, de l'eau et des égouts ================= */
function budgetEff(cat){ const k = { power:'power', water:'water', garbage:'garbage', health:'health', fire:'fire', police:'police', edu:'edu', transit:'transit', parks:'parks' }[cat]; return k ? state.budgets[k]/100 : 1; }
function compOf(b){ if(b.access && segs.has(b.access.sg.id)) return segComp.get(b.access.sg.id) || 0;
  const r = nearestSeg(b.x, b.z, 80, s => RT[s.type].net !== 'rail'); if(r){ return segComp.get(r.sg.id) || 0; } return 0; }
let windF = 1;
function distributeUtilities(){
  computeComponents(); const sup = new Map(), get = c => { let s = sup.get(c); if(!s) sup.set(c, s = { p:0, w:0, s:0, pu:0, wu:0, su:0, poll:0 }); return s; };
  const h = hourOf(), sunF = clamp(Math.sin((h-6)/12*Math.PI), 0, 1)*(1 - weather.cloud*.6);
  windF = .55 + .45*Math.sin(state.time/300) + (weather.kind === 'storm' ? .5 : 0);
  let totP = 0, totW = 0, totS = 0;
  for(const b of buildings.values()){ if(b.kind !== 'svc' || b.abandoned) continue; const d = SVC[b.type]; const c = compOf(b), s = get(c), e = Math.min(1.2, budgetEff(d.cat));
    let p = d.power ? d.power*e : 0; if(b.type === 'wind') p *= windF; if(b.type === 'solar') p *= sunF; if(b.type === 'inciner') p *= Math.min(1, (b.store||0)/200 + .2);
    if(b.dam) p = b.dam.power||0; b.output = p; s.p += p; totP += p;
    if(d.water){ let w = d.water*e; if(d.shore){ const wn = nearestWater(b.x - b.front[0]*(b.hd+12), b.z - b.front[1]*(b.hd+12), 30); if(!wn) w = 0; else { b.pollIn = waterPollAt(wn.x, wn.z); s.poll = Math.max(s.poll, b.pollIn); } } b.output = w; s.w += w; totW += w; }
    if(d.sewage){ s.s += d.sewage*e; totS += d.sewage*e; b.output = d.sewage*e; } }
  let useP = 0, useW = 0, useS = 0;
  const order = [...buildings.values()].sort((a,b) => a.id - b.id);
  for(const b of order){ if(b.abandoned || b.burned) continue; const nres = b.res.length, nj = b.work.length + (b.kind === 'svc' ? 4 : 0);
    const pol = policyAt(b); const pn = (nres*.006 + nj*.008 + (b.kind === 'svc' ? .3 : .02))*(pol.powerSave ? .85 : 1)*(pol.lights ? 1.05 : 1), wn = (nres*.009 + nj*.006 + .02)*(pol.waterSave ? .85 : 1);
    const s = get(compOf(b)); useP += pn; useW += wn; useS += wn;
    if(b.kind === 'svc' && SVC[b.type].power){ b.powered = true; } else { b.powered = s.pu + pn <= s.p + 1e-6; if(b.powered) s.pu += pn; }
    b.watered = s.wu + wn <= s.w + 1e-6; if(b.watered) s.wu += wn; b.sewered = s.su + wn <= s.s + 1e-6; if(b.sewered) s.su += wn; b.waterPoll = s.poll; }
  // rejets : pollution de l'eau à l'exutoire
  wSrcP.fill(0);
  for(const b of buildings.values()){ if(b.kind !== 'svc' || !SVC[b.type].sewage) continue; const s = get(compOf(b)); const load = s.s > 0 ? s.su * (SVC[b.type].sewage/s.s) : 0;
    const bx = b.x - b.front[0]*(b.hd+12), bz = b.z - b.front[1]*(b.hd+12), c = wIdx(bx, bz); if(c >= 0){ wSrc[c] = Math.max(wSrc[c], 0); wSrcP[c] += load*(SVC[b.type].clean ? .02 : .35)*6; } }
  state.power = { prod:totP, use:useP }; state.water = { prod:totW, use:useW }; state.sewage = { prod:totS, use:useS };
}

/* ================= boucle de simulation ================= */
let simTickN = 0; const DAYSTAT = { births:0, deaths:0, imm:0, emi:0 };
const MILESTONES = [[250,'Hameau',5000],[800,'Village',10000],[2000,'Bourg',20000],[4500,'Petite ville',35000],[9000,'Ville',50000],[18000,'Grande ville',80000],[35000,'Métropole',120000],[70000,'Mégapole',200000]];
function simTick(){ // un pas = 2 minutes de jeu
  simTickN++;
  if(simTickN % 10 === 1) distributeUtilities();
  if(simTickN % 6 === 0) updateFields();
  processCims(); processBuildings(); growZones(); immigration(); dispatchRequests(); spawnTrips(); economyTick();
  if(simTickN % 15 === 0){ refreshIcons(); updateStats(); }
  if(simTickN % 30 === 0) randomChirp();
}
/* ----- citoyens ----- */
let cimCursor = 0;
function processCims(){
  const n = Math.max(1, Math.ceil(cimTop/30)), dtY = 30/720*.35; // traité ~1 fois par heure de jeu ; 1 jour de jeu = 0,35 an
  for(let q=0;q<n;q++){ if(cimCursor >= cimTop) cimCursor = 0; const i = cimCursor++; const f = CZ.flags[i]; if(!(f & F_ALIVE) || (f & F_DEAD)) continue;
    const home = buildings.get(CZ.home[i]); if(!home){ removeCim(i); continue; }
    const age = CZ.age[i] += dtY, e = CZ.edu[i];
    // école et études
    if(age >= 6 && age < 22){ const lvNeed = age < 14 ? 1 : age < 18 ? 2 : 3;
      const sc = CZ.school[i] && buildings.get(CZ.school[i]);
      if(sc && SVC[sc.type].eduLv !== lvNeed){ CZ.edu[i] = Math.max(e, SVC[sc.type].eduLv); releaseSchool(i); }
      if(!CZ.school[i] && !CZ.work[i] && e < lvNeed && (lvNeed < 3 || rnd() < .7)) enrollSchool(i, home, lvNeed); }
    else if(CZ.school[i]){ const sc = buildings.get(CZ.school[i]); if(sc) CZ.edu[i] = Math.max(e, SVC[sc.type].eduLv); releaseSchool(i); }
    // emploi
    if(age >= 18 && age < 65 && !CZ.work[i] && !CZ.school[i]) findJob(i, home);
    if(age >= 65 && CZ.work[i]) releaseJob(i);
    // santé
    const k = fIdx(home.x, home.z), pol = k >= 0 ? fld.poll[k] : 0, hc = k >= 0 ? fld.health[k] : 0, ent = k >= 0 ? fld.ent[k] : 0;
    let hp = CZ.health[i] + (hc*3 + ent*1.5 - pol*3 - (home.waterPoll||0)*12 - (home.watered ? 0 : 3) - (home.garbage > 120 ? 2 : 0) + (policyAt(home).noSmoke ? 1 : 0))*.5 + 0.4;
    CZ.health[i] = clamp(hp, 0, 100);
    if(!(f & F_SICK) && rnd() < ((1 - CZ.health[i]/100)*.9 + (age > 70 ? .25 : 0))*dtY){ CZ.flags[i] |= F_SICK; home.sick++; }
    // décès
    const pDie = age < 55 ? .002 : age < 75 ? .01 + (age-55)*.004 : .09 + (age-75)*.025; const sickM = (f & F_SICK) && !(f & F_HOSP) ? 5 : 1;
    if(rnd() < pDie*sickM*dtY){ killCim(i, home); continue; }
    // naissances
    if(age > 21 && age < 40 && rnd() < .35*dtY && home.res.length < home.homes*3.4 && !home.abandoned){ const c = newCim(home, 0, 0); CZ.flags[c] &= ~F_CAR; DAYSTAT.births++; if(rnd() < .03) chirp(i, 'vient d\'avoir un bébé ! Bienvenue à '+cimName(c).split(' ')[0]+'.'); }
    // bonheur et départ
    const hap = clamp(home.happy*100 + (CZ.work[i] || age < 18 || age >= 65 || CZ.school[i] ? 5 : -15) + (CZ.health[i]-60)*.15, 0, 100); CZ.happy[i] = hap;
    if(hap < 22 && rnd() < .02){ removeCim(i); DAYSTAT.emi++; }
  }
}
function killCim(i, home){ releaseJob(i); releaseSchool(i); if(CZ.flags[i] & F_SICK){ CZ.flags[i] &= ~F_SICK; home.sick = Math.max(0, home.sick-1); }
  CZ.flags[i] = (CZ.flags[i] & ~F_HOSP) | F_DEAD; home.dead++; DAYSTAT.deaths++; }
function enrollSchool(i, home, lv){ let best = null, bd = 1e18;
  for(const b of schoolList){ const d = SVC[b.type]; if(d.eduLv !== lv || b.stud.length >= d.students*budgetEff('edu')) continue; const dd = dist2(b.x,b.z,home.x,home.z); if(dd > d.radius*d.radius*1.6) continue; if(dd < bd){ bd = dd; best = b; } }
  if(best){ best.stud.push(i); CZ.school[i] = best.id; } }
let schoolList = [], workList = [];
function findJob(i, home){ const e = CZ.edu[i]; if(!workList.length) return;
  for(let t=0;t<14;t++){ const b = workList[Math.floor(rnd()*workList.length)]; if(!b || b.abandoned || b.burned || !buildings.has(b.id)) continue; const cap = b.jobsCap;
    // un emploi du niveau le plus élevé accessible
    for(let lv=Math.min(3,e); lv>=0; lv--){ const used = b.jl ? b.jl[lv] : 0; if(used < cap[lv]){ b.work.push(i); b.jl ||= [0,0,0,0]; b.jl[lv]++; CZ.work[i] = b.id; CZ.jl[i] = lv; return; } } } }
bus.on('buildingRemoved', b => {
  for(const i of b.res.slice()){ if(CZ.flags[i] & F_DEAD){ removeCim(i); continue; } // relogement : quitte la ville
    removeCim(i); }
  for(const i of b.work.slice()){ CZ.work[i] = 0; } b.work.length = 0;
  for(const i of b.stud.slice()){ CZ.school[i] = 0; } b.stud.length = 0;
});
function fixJobCounts(b){ b.jl = [0,0,0,0]; for(const i of b.work) b.jl[CZ.jl[i]]++; }

/* ----- bâtiments : besoins, problèmes, évolution ----- */
let bldCursor = 0; const bldArr = [];
function processBuildings(){
  if(simTickN % 20 === 1){ bldArr.length = 0; for(const b of buildings.values()) bldArr.push(b); schoolList = bldArr.filter(b => b.kind === 'svc' && SVC[b.type].students); workList = bldArr.filter(b => !b.abandoned && (b.jobsCap[0]+b.jobsCap[1]+b.jobsCap[2]+b.jobsCap[3]) > b.work.length); }
  const n = Math.max(1, Math.ceil(bldArr.length/15)), dtH = 15*2/60; // chaque bâtiment ~ toutes les 30 min de jeu
  for(let q=0;q<n && bldArr.length;q++){ if(bldCursor >= bldArr.length) bldCursor = 0; const b = bldArr[bldCursor++]; if(!buildings.has(b.id)) continue;
    const k = fIdx(b.x, b.z), pol = policyAt(b); let prob = 0;
    if(b.burned){ b.problems = 0; b.ruinT = (b.ruinT||0) + dtH; if(b.ruinT > 60){ const zone = b.zone; removeBuilding(b, true); } continue; }
    // eau et inondations
    const flood = waterDepthAt(b.x, b.z) > .6 && heightAt(b.x,b.z) < waterSurfAt(b.x,b.z) - .4; if(flood){ prob |= PROB.flood; b.bad = (b.bad||0) + 3; }
    if(!b.powered) prob |= PROB.power; if(!b.watered) prob |= PROB.water; if(!b.sewered) prob |= PROB.sewage;
    if(!b.access && !(b.kind === 'svc' && SVC[b.type].noRoad)) prob |= PROB.road;
    const occ = b.res.length + b.work.length;
    // déchets
    b.garbage += (b.res.length*.08 + b.work.length*.06 + (b.kind === 'svc' ? .2 : 0))*dtH*(pol.recycling ? .75 : 1);
    if(b.garbage > 45 && !b.reqG) queueReq('garbage', b); if(b.garbage > 140) prob |= PROB.garbage;
    // criminalité
    if(k >= 0){ const unemp = state.pop ? state.unemployed/Math.max(1, state.workers+state.unemployed) : 0; const cov = fld.police[k];
      b.crime = clamp(b.crime + (occ*.004*(1-cov*.85)*(.3 + unemp*2)*(pol.lights ? .8 : 1) - cov*.4)*dtH, 0, 100); fld.crime[k] = Math.max(fld.crime[k]*.98, b.crime);
      if(b.crime > 35 && !b.reqC) queueReq('crime', b); if(b.crime > 60) prob |= PROB.crime; }
    // incendies
    if(!b.fire && !b.abandoned && rnd() < .00004*dtH*(1 - (k >= 0 ? fld.fire[k] : 0)*.75)*(pol.smoke ? .45 : 1)*(b.kind === 'zone' && b.zone === 5 ? 1.8 : 1)){ b.fire = { t:0, hp:100 }; addFire(b); queueReq('fire', b); chirpBuilding(b, 'Un incendie s\'est déclaré'); }
    if(b.fire) prob |= PROB.fire;
    // malades et morts
    if(b.sick > 0){ if(b.sick > 1) prob |= PROB.sick; if(!b.reqS) queueReq('sick', b); } if(b.dead > 0){ prob |= PROB.dead; if(!b.reqD) queueReq('dead', b); }
    // bonheur du bâtiment
    if(k >= 0){ const svc = (fld.police[k] + fld.fire[k] + fld.health[k] + fld.edu[k])/4;
      b.happy = clamp(.3 + svc*.28 + fld.ent[k]*.18 - Math.min(1, fld.poll[k]/2)*.25 - Math.min(1, fld.noise[k]/2)*.12 - Math.min(1, b.crime/100)*.2 - taxPenalty(b)
        + (b.powered ? 0 : -.3) + (b.watered ? 0 : -.3) + (b.sewered ? 0 : -.15) + (b.garbage > 140 ? -.15 : 0) + (b.dead ? -.1 : 0) + (b.access ? 0 : -.3), 0, 1);
      b.lv = fld.lval[k]; }
    // entreprises : main-d'œuvre
    const jobs = b.jobsCap[0]+b.jobsCap[1]+b.jobsCap[2]+b.jobsCap[3]; if(b.kind === 'zone' && jobs && b.built && b.work.length < jobs*.3 && state.pop > 200) prob |= PROB.work;
    // abandon
    const bad = !b.powered || !b.watered || !b.access || flood || b.garbage > 220 || b.dead > 3;
    b.bad = bad ? (b.bad||0) + 1 : Math.max(0, (b.bad||0) - 2);
    if(b.kind === 'zone' && !b.abandoned && b.bad > 40){ b.abandoned = true; for(const i of b.res.slice()) removeCim(i); for(const i of b.work.slice()){ CZ.work[i] = 0; } b.work.length = 0; b.jl = [0,0,0,0]; buildModel(b); chirpBuilding(b, 'Un bâtiment a été abandonné'); }
    if(b.abandoned){ prob |= PROB.aband; b.abT = (b.abT||0) + dtH; if(b.abT > 72) removeBuilding(b, true); b.problems = prob; continue; }
    // évolution (niveaux)
    if(b.kind === 'zone' && b.built && b.level < ZONES[b.zone].maxLv && !bad && rnd() < .08){
      const lvT = [0, 22, 38, 54, 70][b.level], edu = avgEdu(b), cap = (pol.noHigh && (b.zone === 2 || b.zone === 6)) ? 2 : 9;
      let ok = b.lv >= lvT && b.happy > .5 && b.level < cap;
      if(b.zone === 5 || b.zone === 6) ok = b.level < cap && edu > [0, .6, 1.3][b.level] && b.work.length >= jobs*.6;
      if(b.zone === 3 || b.zone === 4) ok = ok && (b.visits||0) > 3;
      if(ok) upgradeBuilding(b); }
    b.problems = prob;
    // services : stocks
    if(b.kind === 'svc') serviceUpkeep(b, dtH);
  }
}
function avgEdu(b){ if(!b.work.length) return 0; let s = 0; for(const i of b.work) s += CZ.edu[i]; return s/b.work.length; }
function taxPenalty(b){ const t = b.kind === 'zone' ? state.taxes[ZONES[b.zone].tax] : 9; return Math.max(0, t-9)*.022 - Math.max(0, 9-t)*.01; }
function serviceUpkeep(b, dtH){ const d = SVC[b.type];
  if(d.burn && b.store) b.store = Math.max(0, b.store - d.burn*dtH*budgetEff('garbage'));
  if(d.burnDead && b.store) b.store = Math.max(0, b.store - d.burnDead*dtH*.1);
  if(b.type === 'landfill' && b.mound){ const f = clamp((b.store||0)/d.garbageCap, 0, 1); const p = b.pp[b.parts.indexOf(b.mound)]; if(p){ _q.setFromAxisAngle(UP, p[6]); _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(16, 2+f*16, 15)); b.mound.pool.setMatrix(b.mound, _m); } }
  if(d.beds && b.patients){ b.patients = b.patients.filter(pt => { if(state.time >= pt.until){ if(CZ.flags[pt.i] & F_ALIVE){ CZ.flags[pt.i] &= ~(F_SICK|F_HOSP); CZ.health[pt.i] = 80; } return false; } return true; }); }
}

/* ----- demande et croissance des zones ----- */
let candCells = [], candT = 0;
function computeDemand(){
  const pop = state.pop, work = state.workers + state.unemployed, jobs = state.jobs, D = state.demand, T = state.taxes;
  const vac = jobs - state.workers, unempR = work ? state.unemployed/work : 0;
  const taxR = (T.Rl+T.Rh)/2 - 9, taxC = (T.Cl+T.Ch)/2 - 9;
  D.R = clamp(.55 + vac/Math.max(40, work)*1.4 - unempR*2.2 + (state.happy-.55)*.9 - taxR*.07 + (pop < 100 ? .4 : 0), -1, 1);
  const comJobs = state.jobsBy.C, shop = pop*.14 + state.tourists*.3;
  D.C = clamp((shop - comJobs)/Math.max(25, shop) + .05 + unempR*.8 - taxC*.07, -1, 1);
  const indJobs = state.jobsBy.I, indNeed = pop*.13 + 20;
  D.I = clamp((indNeed - indJobs)/Math.max(30, indNeed) + unempR*1.4 - (T.I-9)*.07, -1, 1);
  const eduWork = state.eduCount[2] + state.eduCount[3], offJobs = state.jobsBy.O;
  D.O = pop < 400 ? -.25 : clamp((eduWork*.35 - offJobs)/Math.max(30, eduWork*.35) + unempR*.6 - (T.O-9)*.07, -1, 1);
}
function growZones(){
  if(simTickN - candT > 8){ candT = simTickN; candCells = []; for(const c of cells) if(c && c.valid && c.zone && !c.bld && c.r === 0) candCells.push(c); }
  if(!candCells.length) return;
  let made = 0;
  for(let t=0; t<12 && made < 3; t++){ const c = candCells[Math.floor(rnd()*candCells.length)]; if(!c || !c.alive || c.bld || !c.zone || !c.valid) continue;
    const key = ZONES[c.zone].key, d = state.demand[key]; if(d <= .02 || rnd() > d) continue;
    const sg = segs.get(c.seg); if(!sg) continue; computeComponents(); const comp = segComp.get(sg.id);
    if(!compHasUtilities(comp)){ hint('noutil'); continue; }
    const pol = policyAtXZ(c.x, c.z); let spec = null;
    if(c.zone === 5 && pol.spec){ const k = fIdx(c.x, c.z); const res = { farm:RES.fert, forest:RES.forest, ore:RES.ore, oil:RES.oil }[pol.spec]; if(res && k >= 0 && res[k] > .25) spec = pol.spec; }
    if((c.zone === 3 || c.zone === 4) && (pol.spec === 'tourism' || pol.spec === 'leisure')) spec = pol.spec;
    if(c.zone === 6 && pol.spec === 'tech') spec = 'tech';
    const lot = findLot(c, c.zone, spec); if(!lot) continue;
    createZoneBuilding(lot, c.zone, spec, 1); made++; }
}
const compUtil = new Map(); let compUtilT = -1;
function compHasUtilities(comp){ if(compUtilT !== simTickN){ compUtilT = simTickN; compUtil.clear();
    for(const b of buildings.values()){ if(b.kind !== 'svc') continue; const d = SVC[b.type]; const c = compOf(b); let u = compUtil.get(c); if(!u) compUtil.set(c, u = { p:0, w:0 }); if(d.power || b.dam) u.p = 1; if(d.water) u.w = 1; } }
  const u = compUtil.get(comp); return u && u.p && u.w; }
function immigration(){
  const D = state.demand.R; if(D <= 0 || simTickN % 2) return;
  const cand = []; for(const b of buildings.values()) if(b.kind === 'zone' && b.homes && b.built && !b.abandoned && b.powered && b.watered && b.res.length < b.homes*2.6) cand.push(b);
  if(!cand.length) return;
  const n = Math.min(cand.length, 1 + Math.floor(D*4));
  for(let t=0;t<n;t++){ const b = cand[Math.floor(rnd()*cand.length)]; const size = 1 + Math.floor(rnd()*3.2); const edBase = clamp((b.lv-20)/60, 0, 1);
    for(let q=0;q<size && b.res.length < b.homes*3.4;q++){ const adult = q < 2; const age = adult ? 19 + rnd()*40 : rnd()*14; const r = rnd() + edBase*.4;
      const edu = !adult ? (age > 14 ? 1 : 0) : r > 1.05 ? 3 : r > .75 ? 2 : r > .4 ? 1 : 0; newCim(b, age, edu); DAYSTAT.imm++; }
    if(rnd() < .15) spawnMovingVan(b); }
}

/* ----- statistiques ----- */
function updateStats(){
  let pop = 0, workers = 0, unemp = 0, students = 0, hap = 0, sick = 0, dead = 0, eduCount = [0,0,0,0], jobs = 0, jobsBy = { C:0, I:0, O:0, S:0 }, seniors = 0, children = 0;
  for(let i=0;i<cimTop;i++){ const f = CZ.flags[i]; if(!(f & F_ALIVE)) continue; if(f & F_DEAD){ dead++; continue; } pop++; hap += CZ.happy[i]; const a = CZ.age[i];
    if(a >= 18 && a < 65){ eduCount[CZ.edu[i]]++; if(CZ.work[i]) workers++; else if(!CZ.school[i]) unemp++; } if(CZ.school[i]) students++; if(f & F_SICK) sick++; if(a >= 65) seniors++; if(a < 18) children++; }
  for(const b of buildings.values()){ if(b.abandoned) continue; const j = b.jobsCap[0]+b.jobsCap[1]+b.jobsCap[2]+b.jobsCap[3]; jobs += j;
    if(b.kind === 'zone'){ if(b.zone === 3 || b.zone === 4) jobsBy.C += j; else if(b.zone === 5) jobsBy.I += j; else if(b.zone === 6) jobsBy.O += j; } else jobsBy.S += j; if(simTickN % 60 === 0) fixJobCounts(b); }
  Object.assign(state, { popPrev:state.pop || pop, pop, workers, unemployed:unemp, students, happy:pop ? hap/pop/100 : .7, sick, deadWaiting:dead, eduCount, jobs, jobsBy, seniors, children });
  computeDemand();
  for(const [n, name, reward] of MILESTONES){ if(pop >= n && state.milestones < n && !quietToasts){ state.milestones = n; state.money += reward; toast(`Nouveau palier : ${name} (${fmt.format(n)} habitants). Subvention de ${money(reward)}.`, true); feed('Mairie', `Palier atteint : ${name}. Merci à tous !`); } }
}
state.jobsBy = { C:0, I:0, O:0, S:0 }; state.eduCount = [0,0,0,0];
