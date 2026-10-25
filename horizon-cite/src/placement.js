// Calcul d'emplacement des bâtiments de service : aimantation sur la route, contrôles de validité.
import { G } from './state.js';
import { SERVICE_BY_ID, ROAD_TYPES, WATER_LEVEL, BUILD_LIMIT } from './config.js';
import { heightAt } from './terrain.js';
import { obbCorners, distToObb } from './util.js';

export function serviceSpot(defId, seg, s, side) {
  const def = SERVICE_BY_ID[defId];
  const net = G.roads;
  const p = net.pointAt(seg, s);
  const half = ROAD_TYPES[seg.type].width / 2;
  const vx = -p.tz * side;
  const vz = p.tx * side;
  const x = p.x + vx * (half + def.d / 2 + 0.6);
  const z = p.z + vz * (half + def.d / 2 + 0.6);
  const obb = { x, z, ax: vz, az: -vx, hw: def.w / 2, hd: def.d / 2 };
  const out = { x, z, vx, vz, seg, s, side, obb, valid: false, reason: '' };
  if (seg.type === 'highway') {
    out.reason = "Impossible de raccorder un bâtiment à l'autoroute";
    return out;
  }
  const corners = obbCorners(obb);
  for (const c of corners) {
    if (Math.abs(c.x) > BUILD_LIMIT || Math.abs(c.z) > BUILD_LIMIT) {
      out.reason = 'Hors des limites de la ville';
      return out;
    }
  }
  // terrain : sur terre (sauf l'arrière des bâtiments côtiers), pente raisonnable
  const samples = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const lx = (i * def.w) / 2.4;
      const lz = (j * def.d) / 2.4;
      const wx = x + obb.ax * lx + vx * lz;
      const wz = z + obb.az * lx + vz * lz;
      samples.push({ j, h: heightAt(wx, wz) });
    }
  }
  if (def.shore) {
    const front = samples.filter((q) => q.j === -1);
    if (front.some((q) => q.h < WATER_LEVEL + 0.4)) {
      out.reason = 'La façade doit rester sur la terre ferme';
      return out;
    }
    let wet = 0;
    for (const k of [-0.4, 0, 0.4]) {
      const bx = x + obb.ax * def.w * k + vx * (def.d / 2 + 8);
      const bz = z + obb.az * def.w * k + vz * (def.d / 2 + 8);
      if (heightAt(bx, bz) < WATER_LEVEL - 0.3) wet++;
    }
    if (wet < 2) {
      out.reason = "Doit être placé au bord de l'eau";
      return out;
    }
  } else {
    if (samples.some((q) => q.h < WATER_LEVEL + 0.5)) {
      out.reason = "Impossible de construire sur l'eau";
      return out;
    }
    const hs = samples.map((q) => q.h);
    if (Math.max(...hs) - Math.min(...hs) > 6 + Math.max(def.w, def.d) * 0.08) {
      out.reason = 'Terrain trop pentu';
      return out;
    }
  }
  // routes
  const r = Math.hypot(obb.hw, obb.hd);
  for (const other of net.segHash.queryRadius(x, z, r + 20)) {
    const w = ROAD_TYPES[other.type].width / 2;
    for (const pt of other.pts) {
      if (distToObb(obb, pt.x, pt.z) < w - 0.6) {
        out.reason = 'Une route est sur le chemin';
        return out;
      }
    }
  }
  // bâtiments
  const hit = G.buildings.obbBlocked(obb);
  if (hit) {
    out.reason = hit.kind === 'service' ? 'Un bâtiment est sur le chemin' : 'Des bâtiments occupent cet emplacement';
    return out;
  }
  if (def.unique && G.buildings.uniques.has(defId)) {
    out.reason = 'Ce monument est déjà construit';
    return out;
  }
  out.valid = true;
  return out;
}
