// Simulation de la ville : temps, population, emplois, demande RCI, réseaux (électricité, eau, égouts),
// déchets, défunts, malades, criminalité, incendies, éducation, valeur foncière, bonheur, abandon,
// croissance et montée en niveau, budget, impôts, emprunts, paliers.
import { G } from './state.js';
import { ZONES, SERVICES, MILESTONES, DAY_SECONDS, DAYCYCLE_SECONDS, START_MONEY, ROAD_TYPES, FOOTPRINTS, ROAD_TYPES as RT } from './config.js';
import { Fields } from './fields.js';
import { clamp, lerp, smoothstep } from './util.js';
import { seaness, heightAt } from './terrain.js';
import { WATER_LEVEL } from './config.js';

const COV_FIELDS = ['health', 'fire', 'police', 'edu1', 'edu2', 'edu3', 'park', 'bus'];

// Seuils de déblocage des mécanismes (comme dans l'original, les problèmes arrivent avec les services)
const GATE = { garbage: 1, sick: 1, crime: 2, fire: 2, dead: 4 };

function shuffled(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export class Sim {
  constructor() {
    this.fields = new Fields([...COV_FIELDS, 'pollution', 'noise', 'coast']);
    this.computeCoast();
    this.reset();
    G.on('bld:added', (b) => {
      this.listsDirty = true;
      if (b.kind === 'service') this.covDirty = true;
      b.lastUpd = this.time;
    });
    G.on('bld:removed', (b) => {
      this.listsDirty = true;
      if (b.kind === 'service') this.covDirty = true;
      for (const s of Object.values(this.needs)) s.delete(b.id);
    });
    G.on('bld:completed', (b) => {
      this.listsDirty = true;
      b.bornAt = this.time;
    });
    G.on('bld:level', () => (this.listsDirty = true));
    G.on('roads:changed', () => {
      this.pollDirty = true;
      this.utilDirty = true;
    });
  }

  reset() {
    this.money = START_MONEY;
    this.time = 0;
    this.day = 0;
    this.dayT = 0;
    this.speed = 1;
    this.sandbox = false;
    this.taxes = { res: 9, com: 9, ind: 9, office: 9 };
    this.budget = { services: 100 };
    this.demand = { R: 70, C: 12, I: 45, O: 0 };
    this.stats = {
      pop: 0,
      workforce: 0,
      jobs: 0,
      employed: 0,
      unemployment: 0,
      happy: 60,
      buildings: 0,
      eduAvg: 0,
      comJobs: 0,
      indJobs: 0,
      officeJobs: 0,
      households: 0,
      lv: 0,
    };
    this.util = { powerProd: 0, powerUse: 0, waterProd: 0, waterUse: 0, sewageCap: 0, sewageUse: 0, garbageCap: 0, garbageStock: 0, polluted: false };
    this.milestone = 0;
    this.history = [];
    this.week = this.emptyWeek();
    this.lastWeek = this.emptyWeek();
    this.loans = [];
    this.spawnAcc = [0, 0, 0, 0, 0, 0, 0];
    this.needs = { garbage: new Set(), dead: new Set(), sick: new Set(), fire: new Set(), crime: new Set() };
    this.sliceIdx = 0;
    this.tickT = 0;
    this.dispatchT = 0;
    this.covDirty = true;
    this.pollDirty = true;
    this.utilDirty = true;
    this.listsDirty = true;
    this.wind = 1;
    this.lists = { all: [], res: [], work: [], com: [], ind: [], office: [], services: [] };
    this.freeSegs = new Set();
    this.uniqueHappy = 0;
    this.prevPop = 0;
  }

  emptyWeek() {
    return { income: { res: 0, com: 0, ind: 0, office: 0, transport: 0 }, expense: { services: 0, roads: 0, transport: 0, loans: 0 } };
  }

  // ---------------------------------------------------------------- déblocages
  unlocked(level) {
    return this.sandbox || this.milestone >= level;
  }
  zoneUnlocked(z) {
    return this.unlocked(ZONES[z].unlock);
  }

  // ---------------------------------------------------------------- boucle
  update(simDt) {
    if (simDt <= 0) return;
    this.time += simDt;
    this.dayT += simDt;
    if (this.listsDirty) this.rebuildLists();
    if (this.covDirty) this.recomputeCoverage();
    if (this.pollDirty) this.recomputePollution();
    while (this.dayT >= DAY_SECONDS) {
      this.dayT -= DAY_SECONDS;
      this.newDay();
    }
    this.tickT += simDt;
    while (this.tickT >= 0.25) {
      this.tickT -= 0.25;
      this.tick();
    }
    this.dispatchT += simDt;
    if (this.dispatchT >= 0.5) {
      this.dispatchT = 0;
      this.dispatch();
    }
    if (G.env) {
      if (G.env.lockDay) G.env.cycle += (0.43 - G.env.cycle) * Math.min(1, simDt * 0.5);
      else G.env.cycle = (G.env.cycle + simDt / DAYCYCLE_SECONDS) % 1;
    }
  }

  rebuildLists() {
    const L = { all: [], res: [], work: [], com: [], ind: [], office: [], services: [] };
    for (const b of G.buildings.list.values()) {
      L.all.push(b);
      if (b.state !== 'active') continue;
      if (b.kind === 'service') {
        L.services.push(b);
        if (b.def.jobs) L.work.push(b);
      } else if (b.zone <= 2) L.res.push(b);
      else {
        L.work.push(b);
        if (b.zone <= 4) L.com.push(b);
        else if (b.zone === 5) L.ind.push(b);
        else L.office.push(b);
      }
    }
    this.lists = L;
    this.listsDirty = false;
  }

  // Capacité (habitants pour le résidentiel, emplois sinon)
  capacity(b) {
    if (b.kind === 'service') return b.def.jobs || 0;
    const cells = b.w * b.d;
    const l = b.level;
    switch (b.zone) {
      case 1:
        return Math.max(2, Math.round(cells * 1.15 * (0.75 + 0.3 * l)));
      case 2:
        return Math.round(cells * 4.2 * (0.7 + 0.3 * l));
      case 3:
        return Math.max(2, Math.round(cells * 1.0 * (0.7 + 0.3 * l)));
      case 4:
        return Math.round(cells * 2.6 * (0.7 + 0.3 * l));
      case 5:
        return Math.round(cells * 1.4 * (0.7 + 0.3 * l));
      default:
        return Math.round(cells * 3.0 * (0.7 + 0.3 * l));
    }
  }

  usage(b) {
    if (b.kind === 'service') {
      const d = b.def;
      return { p: d.power ? 0 : 0.3 + (d.jobs || 0) * 0.004, w: d.water || d.sewage ? 0 : 0.8 + (d.jobs || 0) * 0.02 };
    }
    const o = Math.max(b.occ, b.state === 'active' ? 1 : 0);
    if (b.zone <= 2) return { p: 0.02 + o * 0.0045, w: 0.3 + o * 0.06 };
    if (b.zone === 5) return { p: 0.05 + o * 0.011, w: 0.4 + o * 0.05 };
    if (b.zone === 6) return { p: 0.04 + o * 0.006, w: 0.3 + o * 0.03 };
    return { p: 0.03 + o * 0.007, w: 0.3 + o * 0.035 };
  }

  // ---------------------------------------------------------------- réseaux
  computeUtilities() {
    const comps = new Map();
    const get = (c) => {
      let C = comps.get(c);
      if (!C) {
        C = { pp: 0, pu: 0, wp: 0, wu: 0, sp: 0, su: 0, list: [], pumps: [], polluted: false };
        comps.set(c, C);
      }
      return C;
    };
    const U = { powerProd: 0, powerUse: 0, waterProd: 0, waterUse: 0, sewageCap: 0, sewageUse: 0, garbageCap: 0, garbageStock: 0, polluted: false };
    const outlets = [];
    for (const b of this.lists.services) if (b.def.waterPollution && b.state === 'active') outlets.push(b);
    for (const b of G.buildings.list.values()) {
      if (b.state !== 'active') {
        b.power = b.water = b.sewage = false;
        continue;
      }
      const seg = b.seg ? G.roads.segs.get(b.seg) : null;
      if (!seg) {
        b.power = b.water = b.sewage = false;
        continue;
      }
      const C = get(seg.comp);
      if (b.kind === 'service') {
        const d = b.def;
        if (d.power) {
          const p = d.power * (d.id === 'wind' ? this.wind : d.id === 'solar' ? lerp(0.35, 1, 1 - (G.env ? G.env.night : 0)) : 1);
          C.pp += p;
          U.powerProd += p;
        }
        if (d.water) {
          C.wp += d.water;
          U.waterProd += d.water;
          C.pumps.push(b);
          b.polluted = false;
          if (d.id === 'pump') {
            for (const o of outlets) {
              if ((o.x - b.x) ** 2 + (o.z - b.z) ** 2 < o.def.waterPollution ** 2) b.polluted = true;
            }
          }
          if (b.polluted) C.polluted = true;
        }
        if (d.sewage) {
          C.sp += d.sewage;
          U.sewageCap += d.sewage;
        }
        if (d.capacity) {
          U.garbageCap += d.id === 'landfill' ? d.capacity : 0;
          U.garbageStock += d.id === 'landfill' ? b.stock : 0;
        }
      }
      const u = this.usage(b);
      C.list.push(b);
      b._u = u;
      C.pu += u.p;
      C.wu += u.w;
      C.su += u.w * 0.9;
      U.powerUse += u.p;
      U.waterUse += u.w;
      U.sewageUse += u.w * 0.9;
    }
    for (const C of comps.values()) {
      C.list.sort((a, b) => a.id - b.id);
      let p = C.pp;
      let w = C.wp;
      let s = C.sp;
      for (const b of C.list) {
        const u = b._u;
        const isP = b.def && b.def.power;
        const isW = b.def && (b.def.water || b.def.sewage);
        if (isP || p >= u.p) {
          if (!isP) p -= u.p;
          b.power = true;
        } else b.power = false;
        if (isW || w >= u.w) {
          if (!isW) w -= u.w;
          b.water = true;
        } else b.water = false;
        if (isW || s >= u.w * 0.9) {
          if (!isW) s -= u.w * 0.9;
          b.sewage = true;
        } else b.sewage = false;
        b.pollutedWater = C.polluted;
      }
      if (C.polluted) U.polluted = true;
    }
    this.util = U;
    // panache brun sur la mer près des rejets
    if (G.env) G.env.setPollution(outlets.slice(0, 8).map((o) => ({ x: o.x + o.vx * 30, z: o.z + o.vz * 30, r: o.def.waterPollution * 0.7, k: 1 })));
    this.utilDirty = false;
  }

  // ---------------------------------------------------------------- statistiques
  computeStats() {
    let pop = 0;
    let jobs = 0;
    let com = 0;
    let ind = 0;
    let off = 0;
    let happy = 0;
    let hn = 0;
    let edu = 0;
    let lvs = 0;
    for (const b of this.lists.res) {
      pop += b.occ;
      happy += b.happy * b.occ;
      hn += b.occ;
      edu += b.edu * b.occ;
      lvs += b.lv * b.occ;
    }
    for (const b of this.lists.work) {
      const c = this.capacity(b);
      jobs += c;
      if (b.kind === 'zone') {
        if (b.zone <= 4) com += c;
        else if (b.zone === 5) ind += c;
        else off += c;
      }
    }
    const S = this.stats;
    S.pop = Math.round(pop);
    S.workforce = pop * 0.62;
    S.jobs = jobs;
    S.comJobs = com;
    S.indJobs = ind;
    S.officeJobs = off;
    S.employed = Math.min(S.workforce, jobs);
    S.unemployment = S.workforce > 0 ? Math.max(0, S.workforce - jobs) / S.workforce : 0;
    S.happy = hn ? happy / hn : 60;
    S.eduAvg = hn ? edu / hn : 0;
    S.lv = hn ? lvs / hn : 0;
    S.buildings = G.buildings.list.size;
    const connected = G.roads.outsideComps.size > 0;
    const outsideWorkers = connected ? Math.max(0, jobs - S.workforce) * 0.4 : 0;
    S.jobFill = jobs > 0 ? Math.min(1, (S.workforce + outsideWorkers) / jobs) : 1;
    S.outsideWorkers = outsideWorkers;
  }

  computeDemand() {
    const S = this.stats;
    const T = this.taxes;
    const taxR = (T.res - 9) * 3.2;
    const taxC = (T.com - 9) * 3.2;
    const taxI = (T.ind - 9) * 3.2;
    const taxO = (T.office - 9) * 3.2;
    let R = 42 + (110 * (S.jobs * 1.05 - S.workforce)) / Math.max(250, S.workforce) + (S.pop < 400 ? 30 : 0);
    if (S.unemployment > 0.1) R -= (S.unemployment - 0.1) * 260;
    R += (S.happy - 60) * 0.5 - taxR + this.uniqueHappy * 0.6;
    if (!G.roads.outsideComps.size) R = Math.min(R, 30);
    const comNeed = S.pop * 0.12;
    let C = 28 + (120 * (comNeed - S.comJobs)) / Math.max(60, comNeed) - taxC;
    if (S.pop < 60) C = Math.min(C, 12);
    const indNeed = S.workforce * 0.3 + S.comJobs * 0.22;
    let I = 38 + (110 * (indNeed - S.indJobs - S.officeJobs * 0.6)) / Math.max(80, indNeed) + S.unemployment * 140 - taxI;
    const officeNeed = S.workforce * 0.16 * clamp(S.eduAvg / 1.5, 0.15, 1);
    let O = 22 + (120 * (officeNeed - S.officeJobs)) / Math.max(60, officeNeed) + S.unemployment * 60 - taxO;
    if (!this.zoneUnlocked(6)) O = 0;
    const k = 0.25;
    const D = this.demand;
    D.R = lerp(D.R, clamp(R, 0, 100), k);
    D.C = lerp(D.C, clamp(C, 0, 100), k);
    D.I = lerp(D.I, clamp(I, 0, 100), k);
    D.O = lerp(D.O, clamp(O, 0, 100), k);
  }

  // ---------------------------------------------------------------- croissance
  grow() {
    if (!G.roads.outsideComps.size) return;
    const pop = this.stats.pop;
    for (let z = 1; z <= 6; z++) {
      if (!this.zoneUnlocked(z)) continue;
      const dem = z <= 2 ? this.demand.R : z <= 4 ? this.demand.C : z === 5 ? this.demand.I : this.demand.O;
      if (dem < 4) {
        this.spawnAcc[z] = 0;
        continue;
      }
      const rate = (dem / 100) * (1.4 + pop / 650) * (z === 2 || z === 4 ? 0.6 : 1);
      this.spawnAcc[z] = Math.min(this.spawnAcc[z] + rate, 8);
      let tries = 0;
      while (this.spawnAcc[z] >= 1 && tries < 10) {
        tries++;
        if (this.trySpawn(z)) this.spawnAcc[z] -= 1;
        else {
          this.spawnAcc[z] = Math.min(this.spawnAcc[z], 1.5);
          break;
        }
      }
    }
  }

  trySpawn(zone, opts = {}) {
    const free = G.zones.freeFront(zone);
    if (!free.length) return null;
    for (let k = 0; k < 8; k++) {
      const c = free[Math.floor(Math.random() * free.length)];
      if (c.bld || c.zone !== zone) continue;
      const seg = G.roads.segs.get(c.seg);
      if (!seg || (!opts.anywhere && !G.roads.outsideComps.has(seg.comp))) continue;
      const fps = shuffled(FOOTPRINTS[zone]);
      for (const [w, d] of fps) {
        const cells = G.zones.tryFootprint(c, w, d);
        if (cells) return G.buildings.spawnZone(cells, zone, opts);
      }
    }
    return null;
  }

  occupancy() {
    const S = this.stats;
    const D = this.demand;
    for (const b of this.lists.res) {
      const cap = this.capacity(b);
      b.cap = cap;
      const young = this.time - (b.bornAt || 0) < 90;
      if (b.occ < cap && (b.happy > 24 || young) && (D.R > 5 || b.occ < cap * 0.4) && G.roads.outsideComps.size) {
        const before = Math.floor(b.occ);
        const inc = Math.max(1, cap * 0.22) * (0.4 + D.R / 110) * (0.6 + Math.random() * 0.6);
        b.occ = Math.min(cap, b.occ + inc);
        if (Math.floor(b.occ) > before && G.traffic && Math.random() < (b.zone === 1 ? 0.3 : 0.12)) G.traffic.spawnMoving(b);
        b.age = b.age * (before / Math.max(1, b.occ));
      } else if (b.happy < 22 && b.occ > 0) {
        b.occ = Math.max(0, b.occ - Math.max(1, cap * 0.1));
      }
      if (b.occ > cap) b.occ = cap;
    }
    for (const b of this.lists.work) {
      const cap = this.capacity(b);
      b.cap = cap;
      const target = cap * S.jobFill * (b.kind === 'zone' && !b.power ? 0.5 : 1);
      b.occ = lerp(b.occ, target, 0.35);
    }
  }

  levelUps() {
    for (const b of this.lists.res.concat(this.lists.com, this.lists.ind, this.lists.office)) {
      if (b.kind !== 'zone' || b.state !== 'active') continue;
      const max = ZONES[b.zone].maxLevel;
      if (b.level >= max) continue;
      b.upT = (b.upT || 0) + 1;
      if (b.upT < 5) continue;
      if (b.problem || b.happy < 45) continue;
      const n = b.level;
      let ok = false;
      if (b.zone <= 2) ok = b.lv >= [0, 22, 36, 50, 64][n] && b.edu >= [0, 0, 0.45, 0.9, 1.4][n];
      else if (b.zone <= 4) ok = b.lv >= [0, 30, 52][n];
      else if (b.zone === 5) ok = this.stats.eduAvg >= [0, 0.6, 1.25][n];
      else ok = this.stats.eduAvg >= [0, 1.0, 1.7][n] && b.lv >= [0, 25, 45][n];
      if (ok && Math.random() < 0.5) {
        b.upT = 0;
        G.buildings.setLevel(b, n + 1);
        b.cap = this.capacity(b);
      }
    }
  }

  // ---------------------------------------------------------------- budget
  roadUpkeepWeek() {
    let r = 0;
    for (const seg of G.roads.segs.values()) {
      if (this.freeSegs.has(seg.id)) continue;
      r += seg.len * RT[seg.type].upkeep;
    }
    return r;
  }

  budgetDay() {
    const T = this.taxes;
    const W = this.week;
    let res = 0;
    for (const b of this.lists.res) res += b.occ * 2.4 * (1 + 0.12 * (b.level - 1));
    let com = 0;
    let ind = 0;
    let off = 0;
    for (const b of this.lists.work) {
      if (b.kind !== 'zone') continue;
      const lf = 1 + 0.15 * (b.level - 1);
      if (b.zone <= 4) com += b.occ * 3.0 * lf;
      else if (b.zone === 5) ind += b.occ * 2.6 * lf;
      else off += b.occ * 3.6 * lf;
    }
    const inc = {
      res: (res * (T.res / 9)) / 7,
      com: (com * (T.com / 9)) / 7,
      ind: (ind * (T.ind / 9)) / 7,
      office: (off * (T.office / 9)) / 7,
      transport: G.transit ? G.transit.fareIncomeDay() : 0,
    };
    let svc = 0;
    for (const b of G.buildings.list.values()) if (b.kind === 'service') svc += b.def.upkeep;
    const exp = {
      services: svc / 7,
      roads: this.roadUpkeepWeek() / 7,
      transport: G.transit ? G.transit.costDay() : 0,
      loans: 0,
    };
    for (const l of this.loans) {
      if (l.left <= 0) continue;
      const pay = l.weekly / 7;
      exp.loans += pay;
      l.left -= pay;
    }
    this.loans = this.loans.filter((l) => l.left > 0.5);
    let total = 0;
    for (const k in inc) {
      W.income[k] += inc[k];
      total += inc[k];
    }
    for (const k in exp) {
      W.expense[k] += exp[k];
      total -= exp[k];
    }
    if (!this.sandbox) this.money += total;
    else this.money = Math.max(this.money, 999999);
    this.dayNet = total;
    this.estWeek = { income: inc, expense: exp };
  }

  weekly() {
    this.lastWeek = this.week;
    this.week = this.emptyWeek();
    const inc = Object.values(this.lastWeek.income).reduce((a, b) => a + b, 0);
    const exp = Object.values(this.lastWeek.expense).reduce((a, b) => a + b, 0);
    this.history.push({ d: this.day, pop: this.stats.pop, money: Math.round(this.money), inc: Math.round(inc), exp: Math.round(exp), happy: Math.round(this.stats.happy) });
    if (this.history.length > 520) this.history.shift();
  }

  weeklyNet() {
    if (!this.estWeek) return 0;
    const i = Object.values(this.estWeek.income).reduce((a, b) => a + b, 0);
    const e = Object.values(this.estWeek.expense).reduce((a, b) => a + b, 0);
    return (i - e) * 7;
  }

  takeLoan(amount, weeks, rate) {
    const total = amount * (1 + rate);
    this.loans.push({ amount, weekly: total / weeks, left: total, rate, weeks });
    this.money += amount;
  }

  checkMilestone() {
    while (this.milestone < MILESTONES.length - 1 && this.stats.pop >= MILESTONES[this.milestone + 1].pop) {
      this.milestone++;
      const m = MILESTONES[this.milestone];
      if (!this.sandbox) this.money += m.reward;
      G.emit('milestone', { index: this.milestone, m });
    }
  }

  newDay() {
    this.day++;
    this.wind = 0.75 + 0.25 * Math.sin(this.day * 0.21) + 0.08 * Math.sin(this.day * 1.7);
    this.rebuildLists();
    this.computeUtilities();
    this.computeStats();
    this.computeDemand();
    this.grow();
    this.occupancy();
    this.levelUps();
    this.budgetDay();
    this.checkMilestone();
    let uh = 0;
    for (const id of G.buildings.uniques) {
      for (const b of this.lists.services) if (b.defId === id) uh += b.def.happy || 0;
    }
    this.uniqueHappy = uh;
    if (this.day % 7 === 0) this.weekly();
    if (this.day % 2 === 0) this.pollDirty = true;
    if (this.stats.pop !== this.prevPop) G.emit('sim:pop', { pop: this.stats.pop, prev: this.prevPop });
    this.prevPop = this.stats.pop;
    G.emit('sim:day', this.day);
  }

  // ---------------------------------------------------------------- champs
  computeCoast() {
    const F = this.fields;
    const g = F.g.coast;
    for (let iz = 0; iz < 128; iz++) {
      for (let ix = 0; ix < 128; ix++) {
        const p = F.cellCenter(ix, iz);
        const s = seaness(p.x, p.z);
        g[iz * 128 + ix] = heightAt(p.x, p.z) > WATER_LEVEL + 0.5 ? smoothstep(-200, -40, s) : 0;
      }
    }
  }

  recomputeCoverage() {
    const F = this.fields;
    for (const f of COV_FIELDS) F.clear(f);
    for (const b of G.buildings.list.values()) {
      if (b.kind !== 'service' || b.state !== 'active' || !b.def.cov) continue;
      const c = b.def.cov;
      const eff = b.power === false && !b.def.power ? 0.35 : 1;
      F.addRadial(c.f, b.x, b.z, c.r, c.s * eff);
    }
    if (G.transit) for (const st of G.transit.allStops()) F.addRadial('bus', st.x, st.z, 170, 0.9);
    this.covDirty = false;
    G.emit('fields:changed');
  }

  recomputePollution() {
    const F = this.fields;
    F.clear('pollution');
    F.clear('noise');
    for (const b of G.buildings.list.values()) {
      if (b.state !== 'active') continue;
      if (b.kind === 'zone') {
        if (b.zone === 5) F.addRadial('pollution', b.x, b.z, 60 + b.level * 22, 0.3 + b.level * 0.1);
        if (b.zone === 3 || b.zone === 4) F.addRadial('noise', b.x, b.z, 36 + b.level * 6, 0.16);
        if (b.zone === 5) F.addRadial('noise', b.x, b.z, 50, 0.22);
      } else {
        if (b.def.pollution) F.addRadial('pollution', b.x, b.z, b.def.pollution.r, b.def.pollution.s);
        if (b.def.noise) F.addRadial('noise', b.x, b.z, b.def.noise.r, b.def.noise.s);
      }
    }
    for (const seg of G.roads.segs.values()) {
      const t = seg.type;
      if (t === 'small' || t === 'oneway') continue;
      const r = t === 'highway' ? 110 : t === 'large' ? 70 : 45;
      const s = (t === 'highway' ? 0.32 : t === 'large' ? 0.22 : 0.14) * (0.5 + Math.min(1, seg.density * 2));
      for (let i = 0; i < seg.pts.length; i += 5) F.addRadial('noise', seg.pts[i].x, seg.pts[i].z, r, s * 0.35);
    }
    this.pollDirty = false;
    G.emit('fields:changed');
  }

  coverageAt(x, z) {
    const F = this.fields;
    return {
      health: F.sample01('health', x, z),
      fire: F.sample01('fire', x, z),
      police: F.sample01('police', x, z),
      edu1: F.sample01('edu1', x, z),
      edu2: F.sample01('edu2', x, z),
      edu3: F.sample01('edu3', x, z),
      park: F.sample01('park', x, z),
      bus: F.sample01('bus', x, z),
      pollution: F.sample01('pollution', x, z),
      noise: F.sample01('noise', x, z),
      coast: F.sample('coast', x, z),
    };
  }

  landValueFrom(c) {
    return clamp(
      10 + c.park * 26 + c.health * 7 + c.police * 7 + c.fire * 6 + (c.edu1 + c.edu2 + c.edu3) * 4 + c.bus * 7 + c.coast * 14 - c.pollution * 42 - c.noise * 14,
      0,
      100
    );
  }

  landValueAt(x, z) {
    return this.landValueFrom(this.coverageAt(x, z));
  }

  // ---------------------------------------------------------------- bâtiments (par tranches)
  tick() {
    const arr = this.lists.all;
    if (!arr.length) return;
    const n = Math.ceil(arr.length / 12);
    for (let i = 0; i < n; i++) {
      if (this.sliceIdx >= arr.length) this.sliceIdx = 0;
      const b = arr[this.sliceIdx++];
      if (G.buildings.list.get(b.id) !== b) continue;
      this.updateBuilding(b);
    }
  }

  setProblem(b) {
    let p = null;
    const t = b.t;
    if (b.fireT > 0) p = 'fire';
    else if (!b.seg) p = 'road';
    else if ((t.power || 0) > 6) p = 'power';
    else if ((t.water || 0) > 6) p = 'water';
    else if ((t.sewage || 0) > 8) p = 'sewage';
    else if ((t.dead || 0) > 40) p = 'dead';
    else if ((t.sick || 0) > 60) p = 'sick';
    else if ((t.garbage || 0) > 0) p = 'garbage';
    else if (b.crime > 70) p = 'crime';
    else if (b.kind === 'service' && b.full) p = 'full';
    else if (b.kind === 'service' && b.polluted) p = 'pollutedWater';
    else if (b.kind === 'zone' && b.zone > 2 && (t.workers || 0) > 60) p = 'workers';
    if (b.problem !== p) {
      b.problem = p;
      G.emit('bld:problem', b);
    }
  }

  updateBuilding(b) {
    const now = this.time;
    const dt = Math.min(12, now - (b.lastUpd === undefined ? now : b.lastUpd));
    b.lastUpd = now;
    const t = b.t;
    if (b.state === 'burned') {
      t.aband = (t.aband || 0) + dt;
      if (t.aband > 45) G.buildings.demolish(b.id);
      return;
    }
    if (b.state === 'abandoned') {
      t.aband = (t.aband || 0) + dt;
      if (b.problem !== 'abandoned') {
        b.problem = 'abandoned';
        G.emit('bld:problem', b);
      }
      if (t.aband > 100) G.buildings.demolish(b.id);
      return;
    }
    if (b.state !== 'active' || dt <= 0) return;
    const c = this.coverageAt(b.x, b.z);
    b.cov = c;
    const M = this.milestone;
    const isRes = b.kind === 'zone' && b.zone <= 2;
    const occ = Math.max(0, b.occ);
    // incendie
    if (b.fireT > 0) {
      b.fireT += dt;
      if (b.fireT > 70) {
        this.needs.fire.delete(b.id);
        G.buildings.burnDown(b);
        G.emit('fire:destroyed', b);
        return;
      }
    } else if (this.unlocked(GATE.fire) && b.kind === 'zone' && Math.random() < (dt / 52000) * (1 - c.fire * 0.85) * (b.zone === 5 ? 2 : 1)) {
      b.fireT = 0.01;
      this.needs.fire.add(b.id);
      G.emit('fire:start', b);
    }
    // réseaux
    t.power = b.power ? 0 : (t.power || 0) + dt;
    t.water = b.water ? 0 : (t.water || 0) + dt;
    t.sewage = b.sewage ? 0 : (t.sewage || 0) + dt;
    t.road = b.seg ? 0 : (t.road || 0) + dt;
    if (b.kind === 'zone') {
      // déchets
      if (this.unlocked(GATE.garbage)) {
        b.garbage += occ * 0.03 * dt * (b.zone === 5 ? 1.3 : 1);
        if (b.garbage > 3 + occ * 2.4) this.needs.garbage.add(b.id);
        const lim = occ * 9 + 25;
        t.garbage = b.garbage > lim ? (t.garbage || 0) + dt : 0;
      }
      // malades
      if (this.unlocked(GATE.sick) && occ > 0) {
        const rate = occ * 0.00005 * (1 + c.pollution * 4 + (b.pollutedWater ? 3 : 0)) * (1 - c.health * 0.75);
        if (Math.random() < rate * dt) b.sick++;
        if (b.sick > 0) this.needs.sick.add(b.id);
        t.sick = b.sick > 0 ? (t.sick || 0) + dt : 0;
      }
      // défunts (avec « vague de morts » : les immeubles vieillissent ensemble)
      if (isRes && this.unlocked(GATE.dead) && occ > 0) {
        b.age = (b.age || 0) + dt;
        const wave = 1 + smoothstep(500, 1400, b.age) * 5;
        const rate = occ * 0.000022 * wave * (1.3 - c.health * 0.5);
        if (Math.random() < rate * dt) {
          b.dead++;
          b.occ = Math.max(0, b.occ - 1);
          b.age *= 0.9;
        }
        if (b.dead > 0) this.needs.dead.add(b.id);
        t.dead = b.dead > 0 ? (t.dead || 0) + dt : 0;
      }
      // criminalité
      if (this.unlocked(GATE.crime)) {
        b.crime = clamp(b.crime + (occ * 0.0016 * (1 - c.police * 0.9) - c.police * 0.05) * dt * (1 + this.stats.unemployment * 3), 0, 100);
        if (b.crime > 45) this.needs.crime.add(b.id);
      }
      // éducation
      const eduT = c.edu1 + (c.edu1 > 0.25 ? c.edu2 : c.edu2 * 0.3) + (c.edu2 > 0.25 ? c.edu3 : c.edu3 * 0.2);
      b.edu = lerp(b.edu, Math.min(3, eduT), Math.min(1, dt * 0.01));
      // main-d'œuvre
      if (!isRes) t.workers = b.occ < b.cap * 0.25 && this.stats.pop > 0 ? (t.workers || 0) + dt : 0;
      // valeur foncière et bonheur
      b.lv = lerp(b.lv, this.landValueFrom(c) + (b.power && b.water ? 6 : 0), Math.min(1, dt * 0.08));
      let h = 54;
      if (!b.power) h -= 16;
      if (!b.water) h -= 16;
      if (!b.sewage) h -= 9;
      if (b.pollutedWater) h -= 8;
      h += c.park * 10 + c.health * 7 + c.police * 5 + c.fire * 5 + Math.min(1, b.edu / 2) * 5 + b.lv * 0.12;
      h -= c.pollution * (isRes ? 26 : 8) + c.noise * (isRes ? 12 : 3) + (b.crime / 100) * 18;
      if ((t.garbage || 0) > 0) h -= 14;
      if ((t.dead || 0) > 40) h -= 18;
      if ((t.sick || 0) > 60) h -= 8;
      if (!b.seg) h -= 30;
      if (b.fireT > 0) h -= 20;
      const tax = isRes ? this.taxes.res : b.zone <= 4 ? this.taxes.com : b.zone === 5 ? this.taxes.ind : this.taxes.office;
      h -= (tax - 9) * 1.6;
      h += this.uniqueHappy;
      if (isRes) h -= this.stats.unemployment * 25;
      b.happy = lerp(b.happy, clamp(h, 0, 100), Math.min(1, dt * 0.06));
      // abandon
      const bad =
        (t.power || 0) > 150 ||
        (t.water || 0) > 150 ||
        (t.sewage || 0) > 200 ||
        (t.garbage || 0) > 220 ||
        (t.dead || 0) > 260 ||
        (t.road || 0) > 80 ||
        ((t.workers || 0) > 400 && !isRes);
      if (b.happy < 15) t.unhappy = (t.unhappy || 0) + dt;
      else t.unhappy = 0;
      if (bad || (t.unhappy || 0) > 180) {
        G.buildings.abandon(b);
        for (const s of Object.values(this.needs)) s.delete(b.id);
      }
    } else {
      // bâtiments de service
      const d = b.def;
      if (d.capacity) b.full = b.stock >= d.capacity;
    }
    this.setProblem(b);
  }

  // ---------------------------------------------------------------- véhicules de service
  dispatch() {
    if (!G.traffic) return;
    for (const b of this.lists.services) {
      const v = b.def.veh;
      if (!v || b.state !== 'active') continue;
      if ((b.busy || 0) >= v.count) continue;
      if (b.def.capacity && b.stock >= b.def.capacity) continue;
      if (!b.seg) continue;
      const seg = G.roads.segs.get(b.seg);
      if (!seg) continue;
      const kind = v.type === 'garbage' ? 'garbage' : v.type === 'hearse' ? 'dead' : v.type === 'ambulance' ? 'sick' : v.type === 'firetruck' ? 'fire' : 'crime';
      const set = this.needs[kind];
      if (!set.size) continue;
      const r2 = v.radius * v.radius;
      let best = null;
      let bestScore = -Infinity;
      let scanned = 0;
      for (const id of set) {
        if (++scanned > 400) break;
        const t = G.buildings.list.get(id);
        if (!t || t.state !== 'active') {
          set.delete(id);
          continue;
        }
        if (t.served && t.served[kind] > this.time) continue;
        const d2 = (t.x - b.x) ** 2 + (t.z - b.z) ** 2;
        if (d2 > r2) continue;
        const tseg = t.seg ? G.roads.segs.get(t.seg) : null;
        if (!tseg || tseg.comp !== seg.comp) continue;
        const need = kind === 'garbage' ? t.garbage : kind === 'dead' ? t.dead * 50 : kind === 'sick' ? t.sick * 40 : kind === 'fire' ? 1000 : t.crime;
        const score = need - Math.sqrt(d2) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best) continue;
      const ok = G.traffic.spawnService(b, best, v.type, kind);
      if (ok) {
        b.busy = (b.busy || 0) + 1;
        best.served = best.served || {};
        best.served[kind] = this.time + 90;
      } else {
        best.served = best.served || {};
        best.served[kind] = this.time + 20;
      }
    }
  }

  // Appelé par le trafic quand un véhicule de service atteint sa cible
  serviceArrive(home, target, kind) {
    const near = G.buildings.hash.queryRadius(target.x, target.z, 70);
    if (kind === 'garbage') {
      let cap = 2200;
      for (const t of [target, ...near]) {
        if (t.kind !== 'zone' || cap <= 0) continue;
        const take = Math.min(cap, t.garbage);
        t.garbage -= take;
        cap -= take;
        if (home.def.id === 'landfill') home.stock += take;
        if (t.garbage < 3 + t.occ * 2.4) this.needs.garbage.delete(t.id);
        if (t.served) t.served.garbage = 0;
      }
    } else if (kind === 'dead') {
      let cap = 12;
      for (const t of [target, ...near]) {
        if (!t.dead || cap <= 0) continue;
        const take = Math.min(cap, t.dead);
        t.dead -= take;
        cap -= take;
        if (home.def.capacity) home.stock += take;
        if (!t.dead) this.needs.dead.delete(t.id);
      }
    } else if (kind === 'sick') {
      let cap = 8;
      for (const t of [target, ...near]) {
        if (!t.sick || cap <= 0) continue;
        const take = Math.min(cap, t.sick);
        t.sick -= take;
        cap -= take;
        if (!t.sick) this.needs.sick.delete(t.id);
      }
    } else if (kind === 'fire') {
      for (const t of [target, ...near]) {
        if (t.fireT > 0 && (t === target || (t.x - target.x) ** 2 + (t.z - target.z) ** 2 < 1600)) {
          t.fireT = 0;
          this.needs.fire.delete(t.id);
          G.emit('fire:out', t);
        }
      }
    } else if (kind === 'crime') {
      for (const t of [target, ...near]) {
        if (t.kind !== 'zone') continue;
        t.crime *= t === target ? 0.1 : 0.5;
        if (t.crime < 45) this.needs.crime.delete(t.id);
      }
    }
    if (target.served) target.served[kind] = 0;
  }

  serviceReturn(home) {
    home.busy = Math.max(0, (home.busy || 0) - 1);
  }

  // ---------------------------------------------------------------- sauvegarde
  serialize() {
    return {
      money: Math.round(this.money),
      time: this.time,
      day: this.day,
      dayT: this.dayT,
      taxes: this.taxes,
      demand: this.demand,
      milestone: this.milestone,
      history: this.history,
      loans: this.loans,
      sandbox: this.sandbox,
      freeSegs: [...this.freeSegs],
      cycle: G.env ? G.env.cycle : 0.35,
    };
  }

  load(d) {
    this.money = d.money;
    this.time = d.time || 0;
    this.day = d.day || 0;
    this.dayT = d.dayT || 0;
    this.taxes = d.taxes || this.taxes;
    this.demand = d.demand || this.demand;
    this.milestone = d.milestone || 0;
    this.history = d.history || [];
    this.loans = d.loans || [];
    this.sandbox = !!d.sandbox;
    this.freeSegs = new Set(d.freeSegs || []);
    if (G.env && d.cycle !== undefined) G.env.cycle = d.cycle;
    for (const b of G.buildings.list.values()) {
      b.lastUpd = this.time;
      if (b.dead) this.needs.dead.add(b.id);
      if (b.sick) this.needs.sick.add(b.id);
      if (b.crime > 45) this.needs.crime.add(b.id);
    }
    this.listsDirty = true;
    this.covDirty = true;
    this.pollDirty = true;
    this.rebuildLists();
    this.computeUtilities();
    this.computeStats();
  }
}
