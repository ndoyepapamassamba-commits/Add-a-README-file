// Ville de démonstration : construite avec les mêmes outils que le joueur (routes, zonage, services).
import { G } from './state.js';
import { heightAt } from './terrain.js';
import { WATER_LEVEL, HIGHWAY_END, ZONES } from './config.js';
import { serviceSpot } from './placement.js';

function road(ax, az, bx, bz, type = 'small', ctrl = null) {
  const net = G.roads;
  const a = net.findSnap(ax, az, type);
  const b = net.findSnap(bx, bz, type);
  const plan = net.planRoad(a, b, ctrl, type, { free: true });
  if (!plan.valid) {
    console.warn('route démo refusée', ax, az, bx, bz, plan.reason);
    return [];
  }
  return net.buildPlan(plan);
}

function coastZ(x) {
  for (let z = -200; z < 900; z += 2) if (heightAt(x, z) < WATER_LEVEL + 0.6) return z;
  return 600;
}

// zone tout ce qui est dans un rectangle (centre des cases)
function zoneRect(x0, z0, x1, z1, zone) {
  for (const c of G.zones.cells.values()) {
    if (c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1) c.zone = zone;
  }
  G.zones.touch();
}

function zoneAlong(segs, zone, rows = 4) {
  const ids = new Set(segs.map((s) => s.id));
  for (const c of G.zones.cells.values()) if (ids.has(c.seg) && c.row < rows) c.zone = zone;
  G.zones.touch();
}

// place un service le long d'un segment, côté donné, à une abscisse donnée
function service(defId, seg, s, side) {
  if (!seg || seg.dead) return null;
  const svc = serviceSpot(defId, seg, s, side);
  if (!svc || !svc.valid) return null;
  return G.buildings.placeService(defId, svc.x, svc.z, svc.vx, svc.vz, seg.id, s, side, { instant: true });
}

function segNear(x, z) {
  const hit = G.roads.nearestSeg(x, z, 90, (s) => s.type !== "highway");
  return hit ? { seg: hit.seg, s: hit.s, side: hit.side } : null;
}

function serviceAt(defId, x, z) {
  const h = segNear(x, z);
  if (!h) {
    console.warn('pas de route près de', defId, x, z);
    return null;
  }
  let reason = '';
  for (const side of [h.side, -h.side]) {
    for (const ds of [0, 12, -12, 24, -24, 40, -40]) {
      const s = Math.min(h.seg.len - 6, Math.max(6, h.s + ds));
      const spot = serviceSpot(defId, h.seg, s, side);
      if (spot.valid) return G.buildings.placeService(defId, spot.x, spot.z, spot.vx, spot.vz, h.seg.id, s, side, { instant: true });
      reason = spot.reason;
    }
  }
  console.warn('service démo refusé', defId, reason);
  return null;
}

export function buildDemoCity() {
  const sim = G.sim;
  sim.sandbox = false;
  sim.milestone = 5;
  const X0 = HIGHWAY_END.x;
  const Z0 = HIGHWAY_END.z;
  // avenue principale depuis la sortie d'autoroute
  const avenue = road(X0, Z0, -60, Z0, 'medium');
  const xs = [-560, -456, -352, -248, -144];
  const north = -300;
  const southEdge = Math.min(...xs.map((x) => coastZ(x))) - 46;
  const south = Math.min(150, southEdge);
  const cross = [];
  for (const x of xs) cross.push(...road(x, north, x, south));
  const rows = [-196, -92, 124];
  for (const z of rows) cross.push(...road(xs[0], z, xs[xs.length - 1], z));
  road(xs[0], north, xs[xs.length - 1], north);
  // boulevard courbe vers l'est
  road(-144, -92, 40, -170, 'small', { x: -40, z: -40 });
  road(-60, Z0, 60, -40, 'small');
  // route côtière pour l'eau : parallèle au rivage, puis liaison avec la ville
  const coastPts = [-480, -410, -340, -270, -200, -130, -70].map((x) => ({ x, z: coastZ(x) - 27 }));
  for (let i = 0; i < coastPts.length - 1; i++) road(coastPts[i].x, coastPts[i].z, coastPts[i + 1].x, coastPts[i + 1].z);
  const hitC = G.roads.nearestSeg(-352, coastZ(-352) - 27, 30, (s) => s.pts[0].z > south + 20);
  if (hitC) road(-352, south, hitC.x, hitC.z);
  // zonage
  for (const c of G.zones.cells.values()) {
    if (c.x < -540) c.zone = 5;
    else c.zone = 1;
  }
  zoneAlong(avenue, 3, 2);
  zoneRect(-300, -310, -150, -200, 2);
  zoneRect(-230, -80, -150, 0, 6);
  zoneRect(-420, -110, -360, -20, 4);
  G.zones.touch();
  // services
  serviceAt('coal', -620, -110);
  serviceAt('wind', -600, -280);
  serviceAt('wind', -575, -240);
  // pompe à l'ouest, rejet à l'est (le courant ne ramène pas les eaux usées vers la pompe)
  const shoreSpot = (x, defId) => {
    const p = coastPts.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    const h = segNear(x, p.z);
    if (!h) return null;
    for (const side of [1, -1]) {
      for (const ds of [0, 10, -10, 20, -20, 30]) {
        const r = service(defId, h.seg, Math.min(h.seg.len - 8, Math.max(8, h.s + ds)), side);
        if (r) return r;
      }
    }
    return null;
  };
  shoreSpot(-455, 'pump');
  shoreSpot(-420, 'pump');
  shoreSpot(-95, 'outlet');
  serviceAt('landfill', -600, -260);
  serviceAt('clinic', -404, -150);
  serviceAt('school', -300, -150);
  serviceAt('fire', -500, -40);
  serviceAt('police', -200, -150);
  serviceAt('park_large', -404, -250);
  serviceAt('plaza', -300, 60);
  serviceAt('park_small', -196, 70);
  serviceAt('cemetery', -500, -250);
  serviceAt('highschool', -196, -250);
  serviceAt('townhall', -300, -60);
  // bâtiments déjà construits
  sim.computeUtilities();
  let n = 0;
  for (let pass = 0; pass < 4; pass++) {
    for (let z = 1; z <= 6; z++) {
      for (let k = 0; k < 220; k++) {
        const lvlMax = ZONES[z].maxLevel;
        const level = Math.min(lvlMax, 1 + Math.floor(Math.random() * Math.random() * (lvlMax + 0.5)));
        const b = sim.trySpawn(z, { instant: true, level, anywhere: true });
        if (!b) break;
        n++;
      }
    }
  }
  sim.rebuildLists();
  for (const b of sim.lists.res) b.occ = sim.capacity(b) * (0.75 + Math.random() * 0.25);
  sim.computeUtilities();
  sim.computeStats();
  for (const b of sim.lists.work) b.occ = sim.capacity(b) * sim.stats.jobFill;
  sim.computeStats();
  sim.money = 185000;
  G.cam.flyTo(-360, -60, 620);
  return n;
}
