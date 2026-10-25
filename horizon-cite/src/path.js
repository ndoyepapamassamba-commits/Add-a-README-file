// Recherche d'itinéraire A* sur le graphe routier, avec sens uniques, demi-tours en impasse
// et coût de congestion.
import { ROAD_TYPES } from './config.js';
import { MinHeap } from './util.js';

const canFwd = (seg) => ROAD_TYPES[seg.type].lanes[0] > 0;
const canBwd = (seg) => ROAD_TYPES[seg.type].lanes[1] > 0;
const cost = (seg, len) => (len / ROAD_TYPES[seg.type].speed) * (1 + Math.min(4, seg.density * 3.5));

// from/to : { seg, s }. Renvoie [{ seg, dir, s0, s1 }] ou null.
export function findPath(net, from, to) {
  const fs = from.seg;
  const ts = to.seg;
  if (!fs || !ts || fs.dead || ts.dead) return null;
  if (fs.comp !== ts.comp) return null;
  let best = null;
  let bestCost = Infinity;
  // même segment
  if (fs === ts) {
    if (canFwd(fs) && from.dir !== -1 && to.s >= from.s) {
      bestCost = cost(fs, to.s - from.s);
      best = [{ seg: fs, dir: 1, s0: from.s, s1: to.s }];
    } else if (canBwd(fs) && from.dir !== 1 && to.s <= from.s) {
      bestCost = cost(fs, from.s - to.s);
      best = [{ seg: fs, dir: -1, s0: from.s, s1: to.s }];
    }
  }
  const g = new Map();
  const prev = new Map();
  const heap = new MinHeap();
  // heuristique admissible : distance au point d'arrivée à une vitesse supérieure à celle de l'autoroute
  const goal = net.pointAt(ts, to.s);
  const tx = goal.x;
  const tz = goal.z;
  const h = (n) => Math.hypot(n.x - tx, n.z - tz) / 30;
  const push = (nodeId, c, info) => {
    if (c < (g.get(nodeId) ?? Infinity)) {
      g.set(nodeId, c);
      prev.set(nodeId, info);
      const n = net.nodes.get(nodeId);
      heap.push(c + h(n), nodeId);
    }
  };
  const okF = canFwd(fs) && from.dir !== -1;
  const okB = canBwd(fs) && from.dir !== 1;
  if (okF) push(fs.b, cost(fs, fs.len - from.s), { seg: fs, dir: 1, from: null, start: true });
  if (okB) push(fs.a, cost(fs, from.s), { seg: fs, dir: -1, from: null, start: true });
  let goalInfo = null;
  let iter = 0;
  const closed = new Set();
  while (heap.size && iter++ < 20000) {
    const nid = heap.pop();
    if (closed.has(nid)) continue;
    closed.add(nid);
    const gc = g.get(nid);
    if (gc + h(net.nodes.get(nid)) >= bestCost) break;
    // sortie vers la destination
    if (nid === ts.a && canFwd(ts)) {
      const c = gc + cost(ts, to.s);
      if (c < bestCost) {
        bestCost = c;
        goalInfo = { node: nid, dir: 1 };
        best = null;
      }
    }
    if (nid === ts.b && canBwd(ts)) {
      const c = gc + cost(ts, ts.len - to.s);
      if (c < bestCost) {
        bestCost = c;
        goalInfo = { node: nid, dir: -1 };
        best = null;
      }
    }
    const node = net.nodes.get(nid);
    const arrived = prev.get(nid).seg;
    const deadEnd = node.segs.length === 1;
    const junction = node.segs.length >= 3 ? 1.5 : 0;
    for (const sid of node.segs) {
      const seg = net.segs.get(sid);
      if (!seg) continue;
      if (seg === arrived && !deadEnd) continue;
      if (seg.a === nid && canFwd(seg)) push(seg.b, gc + junction + cost(seg, seg.len), { seg, dir: 1, from: nid });
      if (seg.b === nid && canBwd(seg)) push(seg.a, gc + junction + cost(seg, seg.len), { seg, dir: -1, from: nid });
    }
  }
  if (best) return best;
  if (!goalInfo) return null;
  // reconstruction
  const steps = [{ seg: ts, dir: goalInfo.dir, s0: goalInfo.dir === 1 ? 0 : ts.len, s1: to.s }];
  let nid = goalInfo.node;
  let guard = 0;
  while (guard++ < 5000) {
    const info = prev.get(nid);
    if (!info) return null;
    if (info.start) {
      steps.push({ seg: info.seg, dir: info.dir, s0: from.s, s1: info.dir === 1 ? info.seg.len : 0 });
      break;
    }
    steps.push({ seg: info.seg, dir: info.dir, s0: info.dir === 1 ? 0 : info.seg.len, s1: info.dir === 1 ? info.seg.len : 0 });
    nid = info.from;
  }
  steps.reverse();
  return steps;
}
