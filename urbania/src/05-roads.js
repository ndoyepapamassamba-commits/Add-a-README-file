/* ================= réseau routier (graphe de nœuds et de segments de Bézier) ================= */
const L = (off, dir, kind='car') => ({ off, dir, kind });
const RT = {
  street:{ name:'Rue', hw:6, cw:3.5, lanes:[L(-1.75,-1),L(1.75,1)], ped:[-4.75,4.75], speed:13.9, zoning:true, cost:12, rank:1, lamps:1,
    prof:[[-6,'SK','side'],[-6,.18,'side'],[-3.5,.18,'walk'],[-3.5,0,'curb'],[3.5,0,'asph'],[3.5,.18,'curb'],[6,.18,'walk'],[6,'SK','side']],
    marks:[{off:0,w:.14,dash:[3,9],k:'mark'}], noise:1 },
  oneway:{ name:'Rue à sens unique', hw:6, cw:3.5, oneway:true, lanes:[L(-1.75,1),L(1.75,1)], ped:[-4.75,4.75], speed:13.9, zoning:true, cost:12, rank:1, lamps:1,
    prof:[[-6,'SK','side'],[-6,.18,'side'],[-3.5,.18,'walk'],[-3.5,0,'curb'],[3.5,0,'asph'],[3.5,.18,'curb'],[6,.18,'walk'],[6,'SK','side']],
    marks:[{off:0,w:.14,dash:[3,9],k:'mark'},{off:-3.1,w:.14,k:'mark'},{off:3.1,w:.14,k:'mark'}], arrows:true, noise:1 },
  avenue:{ name:'Avenue', hw:10, cw:7, lanes:[L(-5.25,-1),L(-1.75,-1),L(1.75,1),L(5.25,1)], ped:[-8.5,8.5], speed:16.7, zoning:true, cost:26, rank:2, lamps:1,
    prof:[[-10,'SK','side'],[-10,.18,'side'],[-7,.18,'walk'],[-7,0,'curb'],[7,0,'asph'],[7,.18,'curb'],[10,.18,'walk'],[10,'SK','side']],
    marks:[{off:-.16,w:.12,k:'yel'},{off:.16,w:.12,k:'yel'},{off:-3.5,w:.14,dash:[3,9],k:'mark'},{off:3.5,w:.14,dash:[3,9],k:'mark'}], noise:2 },
  busave:{ name:'Avenue avec voies de bus', hw:10, cw:7, lanes:[L(-5.25,-1,'bus'),L(-1.75,-1),L(1.75,1),L(5.25,1,'bus')], ped:[-8.5,8.5], speed:16.7, zoning:true, cost:30, rank:2, lamps:1,
    prof:[[-10,'SK','side'],[-10,.18,'side'],[-7,.18,'walk'],[-7,0,'curb'],[7,0,'asph'],[7,.18,'curb'],[10,.18,'walk'],[10,'SK','side']],
    marks:[{off:-5.25,w:3.3,k:'bus',fill:1},{off:5.25,w:3.3,k:'bus',fill:1},{off:-.16,w:.12,k:'yel'},{off:.16,w:.12,k:'yel'},{off:-3.5,w:.25,k:'mark'},{off:3.5,w:.25,k:'mark'}], noise:2 },
  tramst:{ name:'Rue avec tramway', hw:7, cw:4, tram:true, lanes:[L(-2,-1,'tram'),L(2,1,'tram')], ped:[-5.6,5.6], speed:12.5, zoning:true, cost:28, rank:1, lamps:1,
    prof:[[-7,'SK','side'],[-7,.18,'side'],[-4,.18,'walk'],[-4,0,'curb'],[4,0,'asph'],[4,.18,'curb'],[7,.18,'walk'],[7,'SK','side']],
    marks:[{off:-.12,w:.1,k:'yel'},{off:.12,w:.1,k:'yel'},{off:-2.72,w:.1,k:'railc',dy:.03},{off:-1.28,w:.1,k:'railc',dy:.03},{off:1.28,w:.1,k:'railc',dy:.03},{off:2.72,w:.1,k:'railc',dy:.03},{off:-2,w:.04,k:'wire',dy:6.2},{off:2,w:.04,k:'wire',dy:6.2}], noise:1, catenary:true },
  tramave:{ name:'Avenue avec tramway', hw:12, cw:9, tram:true, lanes:[L(-6.3,-1),L(-1.75,-1,'tramonly'),L(1.75,1,'tramonly'),L(6.3,1)], ped:[-10.5,10.5], speed:16.7, zoning:true, cost:48, rank:2, lamps:1,
    prof:[[-12,'SK','side'],[-12,.18,'side'],[-9,.18,'walk'],[-9,0,'curb'],[-3.6,0,'asph'],[-3.6,.12,'curb'],[3.6,.12,'grassT'],[3.6,0,'curb'],[9,0,'asph'],[9,.18,'curb'],[12,.18,'walk'],[12,'SK','side']],
    marks:[{off:-2.47,w:.1,k:'railc',dy:.16},{off:-1.03,w:.1,k:'railc',dy:.16},{off:1.03,w:.1,k:'railc',dy:.16},{off:2.47,w:.1,k:'railc',dy:.16},{off:-1.75,w:.04,k:'wire',dy:6.3},{off:1.75,w:.04,k:'wire',dy:6.3}], noise:2, catenary:true },
  boulevard:{ name:'Boulevard', hw:15, cw:12, lanes:[L(-10.25,-1),L(-6.75,-1),L(-3.25,-1),L(3.25,1),L(6.75,1),L(10.25,1)], ped:[-13.5,13.5], speed:16.7, zoning:true, cost:45, rank:3, lamps:1, trees:true,
    prof:[[-15,'SK','side'],[-15,.18,'side'],[-12,.18,'walk'],[-12,0,'curb'],[-1.5,0,'asph'],[-1.5,.18,'curb'],[1.5,.18,'med'],[1.5,0,'curb'],[12,0,'asph'],[12,.18,'curb'],[15,.18,'walk'],[15,'SK','side']],
    marks:[{off:-5,w:.14,dash:[3,9],k:'mark'},{off:-8.5,w:.14,dash:[3,9],k:'mark'},{off:5,w:.14,dash:[3,9],k:'mark'},{off:8.5,w:.14,dash:[3,9],k:'mark'}], noise:3 },
  highway:{ name:'Autoroute', hw:11, cw:11, lanes:[L(-6.625,-1),L(-2.875,-1),L(2.875,1),L(6.625,1)], speed:27.8, cost:70, rank:4, lamps:2, noise:4,
    prof:[[-11,'SK','side'],[-11,.9,'guard'],[-10.7,.9,'guard'],[-10.7,0,'guard'],[-1,0,'asph'],[-1,.8,'conc'],[-.3,.95,'conc'],[.3,.95,'conc'],[1,.8,'conc'],[1,0,'conc'],[10.7,0,'asph'],[10.7,.9,'guard'],[11,.9,'guard'],[11,'SK','side']],
    marks:[{off:-4.75,w:.15,dash:[4,12],k:'mark'},{off:4.75,w:.15,dash:[4,12],k:'mark'},{off:-1.3,w:.15,k:'mark'},{off:1.3,w:.15,k:'mark'},{off:-8.5,w:.15,k:'mark'},{off:8.5,w:.15,k:'mark'}] },
  ramp:{ name:'Bretelle', hw:4.5, cw:4.5, oneway:true, lanes:[L(-1.75,1),L(1.75,1)], speed:19.4, cost:30, rank:3, lamps:1, noise:3,
    prof:[[-4.5,'SK','side'],[-4.5,.9,'guard'],[-4.2,.9,'guard'],[-4.2,0,'guard'],[4.2,0,'asph'],[4.2,.9,'guard'],[4.5,.9,'guard'],[4.5,'SK','side']],
    marks:[{off:0,w:.14,dash:[3,9],k:'mark'},{off:-3.7,w:.15,k:'mark'},{off:3.7,w:.15,k:'mark'}] },
  path:{ name:'Chemin piéton', hw:2, cw:0, lanes:[], ped:[-.8,.8], speed:0, cost:4, rank:0, lamps:0, net:'ped',
    prof:[[-2,'SK','side'],[-2,.08,'side'],[2,.08,'path'],[2,'SK','side']], marks:[] },
  rail:{ name:'Voie ferrée', hw:4, cw:4, lanes:[L(-2,-1,'rail'),L(2,1,'rail')], speed:25, cost:40, rank:5, lamps:0, net:'rail', noise:2,
    prof:[[-4,'SK','side'],[-4,0,'ballast'],[-3.1,.4,'ballast'],[3.1,.4,'ballast'],[4,0,'ballast'],[4,'SK','side']], marks:[] },
};
for(const k in RT){ RT[k].key = k; RT[k].net ||= 'road'; RT[k].car = RT[k].lanes.some(l => l.kind === 'car' || l.kind === 'tram'); RT[k].pedOK = !!RT[k].ped; }
const ROADC = { asph:col('#45474b'), walk:col('#a7a39a'), curb:col('#8e8a82'), side:col('#6c685f'), med:col('#56703a'), conc:col('#aaa7a1'), guard:col('#b9bcbf'),
  ballast:col('#726d64'), sleeper:col('#5a4a3a'), railc:col('#9aa0a6'), mark:col('#e8e6de'), yel:col('#e3b53c'), wire:col('#2a2c2f'), grassT:col('#5b7a3c'), bus:col('#7d3a30'), path:col('#b8ab8e'), deck:col('#8f8c86') };

const nodes = new Map(), segs = new Map(); let nodeSeq = 1, segSeq = 1, NET_VERSION = 0;
/* ---------- géométrie des courbes ---------- */
function bez(a, c, b, t){ const u = 1-t; return [u*u*a[0]+2*u*t*c[0]+t*t*b[0], u*u*a[1]+2*u*t*c[1]+t*t*b[1]]; }
function sampleSeg(sg){
  const A = nodes.get(sg.a), B = nodes.get(sg.b), a = [A.x,A.z], b = [B.x,B.z], c = [sg.cx, sg.cz];
  const approx = Math.hypot(b[0]-a[0], b[1]-a[1]) + Math.hypot(c[0]-(a[0]+b[0])/2, c[1]-(a[1]+b[1])/2)*.6;
  const n = Math.max(6, Math.ceil(approx/2)); const P = new Float32Array((n+1)*3), cum = new Float32Array(n+1);
  for(let i=0;i<=n;i++){ const p = bez(a, c, b, i/n); P[i*3] = p[0]; P[i*3+2] = p[1]; if(i) cum[i] = cum[i-1] + Math.hypot(P[i*3]-P[i*3-3], P[i*3+2]-P[i*3-1]); }
  sg.P = P; sg.cum = cum; sg.n = n; sg.len = cum[n];
}
function segPoint(sg, s, out = {}){
  s = clamp(s, 0, sg.len); const cum = sg.cum; let lo = 0, hi = sg.n;
  while(hi - lo > 1){ const m = (lo+hi)>>1; if(cum[m] <= s) lo = m; else hi = m; }
  const f = (s - cum[lo]) / Math.max(1e-6, cum[hi]-cum[lo]), P = sg.P, i = lo*3, j = hi*3;
  out.x = P[i]+(P[j]-P[i])*f; out.y = P[i+1]+(P[j+1]-P[i+1])*f; out.z = P[i+2]+(P[j+2]-P[i+2])*f;
  const dx = P[j]-P[i], dz = P[j+2]-P[i+2], l = Math.hypot(dx,dz)||1; out.dx = dx/l; out.dz = dz/l; out.gy = (P[j+1]-P[i+1])/Math.max(1e-6, cum[hi]-cum[lo]);
  return out;
}
const _sp = {}, _sp2 = {};
function laneXYZ(sg, off, s, out){ segPoint(sg, s, out); out.x += -out.dz*off; out.z += out.dx*off; return out; }

/* ---------- hauteurs le long d'un segment ---------- */
function computeHeights(sg){
  const A = nodes.get(sg.a), B = nodes.get(sg.b), P = sg.P, n = sg.n, len = sg.len, t = RT[sg.type];
  const ground = new Float32Array(n+1), wet = new Uint8Array(n+1);
  for(let i=0;i<=n;i++){ ground[i] = heightAt(P[i*3], P[i*3+2]); wet[i] = isWet(P[i*3], P[i*3+2], .4) ? 1 : 0; }
  const gA = heightAt(A.x,A.z), gB = heightAt(B.x,B.z), groundMode = Math.abs(A.y-gA) < 1.2 && Math.abs(B.y-gB) < 1.2 && !sg.tunnel;
  const y = new Float32Array(n+1), maxG = t.net === 'rail' ? .05 : .09;
  if(groundMode){
    for(let i=0;i<=n;i++){ let s = 0, w = 0; for(let k=-4;k<=4;k++){ const q = clamp(i+k,0,n); s += ground[q]; w++; } y[i] = s/w;
      if(wet[i]) y[i] = Math.max(y[i], waterSurfAt(P[i*3], P[i*3+2]) + 6.5); }
    for(let i=1;i<=n;i++){ const ds = sg.cum[i]-sg.cum[i-1]; y[i] = Math.max(y[i], y[i-1] - maxG*ds); }
    for(let i=n-1;i>=0;i--){ const ds = sg.cum[i+1]-sg.cum[i]; y[i] = Math.max(y[i], y[i+1] - maxG*ds); }
    const Lb = Math.min(len/2, 40), dA = A.y - y[0], dB = B.y - y[n];
    for(let i=0;i<=n;i++){ const s = sg.cum[i]; y[i] += dA*Math.max(0, 1-s/Lb) + dB*Math.max(0, 1-(len-s)/Lb); }
  } else {
    for(let i=0;i<=n;i++){ const f = sg.cum[i]/len; y[i] = lerp(A.y, B.y, f); if(!sg.tunnel && wet[i]) y[i] = Math.max(y[i], waterSurfAt(P[i*3], P[i*3+2]) + 4); }
  }
  let bad = 0;
  for(let i=0;i<=n;i++){ P[i*3+1] = y[i]; if(i){ const g = Math.abs(y[i]-y[i-1])/Math.max(.01, sg.cum[i]-sg.cum[i-1]); if(g > (groundMode ? .3 : .16)) bad = 1; }
    if(!sg.tunnel && y[i] < ground[i] - 1.5 && !groundMode) bad = 2; }
  sg.ground = ground; sg.groundMode = groundMode; sg.bad = bad;
}

/* ---------- conformation du terrain sous la route ---------- */
function conformTerrain(sg){
  const t = RT[sg.type], P = sg.P, n = sg.n, hw = t.hw, R = hw + 12; if(sg.tunnel) return;
  let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9; for(let i=0;i<=n;i++){ x0 = Math.min(x0,P[i*3]); x1 = Math.max(x1,P[i*3]); z0 = Math.min(z0,P[i*3+2]); z1 = Math.max(z1,P[i*3+2]); }
  const ei0 = Math.max(0, Math.floor((x0-R+EHALF)/CELL)), ei1 = Math.min(NE, Math.ceil((x1+R+EHALF)/CELL)), ej0 = Math.max(0, Math.floor((z0-R+EHALF)/CELL)), ej1 = Math.min(NE, Math.ceil((z1+R+EHALF)/CELL));
  const locked = [];
  for(let ej=ej0;ej<=ej1;ej++) for(let ei=ei0;ei<=ei1;ei++){
    const vx = ei*CELL-EHALF, vz = ej*CELL-EHALF; let best = 1e9, by = 0, bsup = 0;
    for(let i=0;i<n;i++){ const c = closestOnSeg(vx,vz,P[i*3],P[i*3+2],P[i*3+3],P[i*3+5]); if(c.d < best){ best = c.d; by = lerp(P[i*3+1], P[i*3+4], c.t); bsup = by - lerp(sg.ground[i], sg.ground[i+1], c.t); } }
    if(best > R || Math.abs(bsup) > 3.5) continue; const k = ej*NE1+ei; if(EH[k] < SEA+.2 && bsup > 2) continue;
    if(best < hw + 1.5){ EH[k] = by - .12; locked.push(k); tLock[k]++; }
    else if(!tLock[k]){ const w = smooth(R, hw+1.5, best); EH[k] = lerp(EH[k], by-.12, w*.85); } }
  sg.locked = locked;
  updateTerrainRegion(ei0, ej0, ei1, ej1);
}

/* ---------- création, suppression, découpe ---------- */
function newNode(x, z, y, o={}){ const n = Object.assign({ id:nodeSeq++, x, z, y, segs:[], lights:false, deco:[], outside:false, geo:null }, o); nodes.set(n.id, n); return n; }
function newSeg(a, b, cx, cz, type, o={}){
  const sg = Object.assign({ id:segSeq++, a, b, cx, cz, type, deco:[], cells:[], name:null, traffic:0, load:0, geo:null, tunnel:false, locked:[] }, o);
  segs.set(sg.id, sg); nodes.get(a).segs.push(sg.id); nodes.get(b).segs.push(sg.id);
  sampleSeg(sg); computeHeights(sg);
  if(!sg.name) sg.name = inheritName(sg) || randomStreetName(type);
  markSeg(sg); markNode(nodes.get(a)); markNode(nodes.get(b));
  NET_VERSION++; return sg;
}
function randomStreetName(type){ const r = rnd; return pick(STREET_T[type], r) + ' ' + pick(STREET_N, r); }
function inheritName(sg){ for(const nid of [sg.a, sg.b]){ const nd = nodes.get(nid); for(const id of nd.segs){ if(id === sg.id) continue; const o = segs.get(id); if(o && o.type === sg.type && nd.segs.length <= 3) return o.name; } } return null; }
function otherNode(sg, nid){ return sg.a === nid ? sg.b : sg.a; }
function removeSeg(sg, keepNodes=false, splitting=false){
  if(!segs.has(sg.id)) return; segs.delete(sg.id);
  for(const nid of [sg.a, sg.b]){ const nd = nodes.get(nid); if(!nd) continue; nd.segs = nd.segs.filter(i => i !== sg.id); markNode(nd);
    if(!nd.segs.length && !keepNodes && !nd.outside){ clearDeco(nd); nodes.delete(nid); chunkOf(nd.x, nd.z).dirty = true; } }
  for(const k of sg.locked) if(tLock[k]) tLock[k]--;
  clearDeco(sg); chunkOf(sg.midX, sg.midZ).dirty = true; NET_VERSION++;
  bus.emit('segRemoved', sg, splitting);
}
function splitSeg(sg, s){ // coupe un segment à l'abscisse s, renvoie le nouveau nœud
  const A = nodes.get(sg.a), B = nodes.get(sg.b);
  let t = 0; { const cum = sg.cum; let i = 0; while(i < sg.n && cum[i+1] < s) i++; t = (i + (s-cum[i])/Math.max(1e-6,cum[i+1]-cum[i]))/sg.n; }
  const a = [A.x,A.z], b = [B.x,B.z], c = [sg.cx,sg.cz], p = bez(a,c,b,t), c1 = [lerp(a[0],c[0],t), lerp(a[1],c[1],t)], c2 = [lerp(c[0],b[0],t), lerp(c[1],b[1],t)];
  const pt = segPoint(sg, s, {}); const nd = newNode(p[0], p[1], pt.y);
  const o = { name:sg.name, tunnel:sg.tunnel }, type = sg.type; removeSeg(sg, true, true);
  const s1 = newSeg(A.id, nd.id, c1[0], c1[1], type, o), s2 = newSeg(nd.id, B.id, c2[0], c2[1], type, o);
  conformTerrain(s1); conformTerrain(s2); bus.emit('segSplit', sg, s1, s2); return nd;
}
function segDir(sg, nid){ // direction sortante du nœud nid le long du segment
  const p = segPoint(sg, sg.a === nid ? 0 : sg.len, _sp); return sg.a === nid ? [p.dx, p.dz] : [-p.dx, -p.dz]; }
function nearestNode(x, z, maxD, filter){ let best = null, bd = maxD; for(const n of nodes.values()){ if(filter && !filter(n)) continue; const d = Math.hypot(n.x-x, n.z-z); if(d < bd){ bd = d; best = n; } } return best; }
function nearestSeg(x, z, maxD, filter){ let best = null;
  for(const sg of segs.values()){ if(filter && !filter(sg)) continue; if(Math.abs(sg.midX-x) > sg.len/2+maxD+20 || Math.abs(sg.midZ-z) > sg.len/2+maxD+20) continue;
    const P = sg.P; for(let i=0;i<sg.n;i++){ const c = closestOnSeg(x,z,P[i*3],P[i*3+2],P[i*3+3],P[i*3+5]); if(c.d < maxD){ maxD = c.d; best = { sg, s:sg.cum[i]+c.t*(sg.cum[i+1]-sg.cum[i]), d:c.d, x:c.x, z:c.z, i }; } } }
  return best; }

/* ---------- blocs (chunks) de géométrie ---------- */
const CH = 10, CHS = 2*EHALF/CH; const chunks = [];
const roadMat = new THREE.MeshStandardMaterial({ vertexColors:true, map:asphaltTex, roughness:.9, envMapIntensity:.4 });
roadMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix*vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uNight, uHalf, uWet, uSnow, uOverOn; uniform sampler2D uGlow, uDetail;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float dd = texture2D(uDetail, vWPos.xz/23.0).r; diffuseColor.rgb *= 0.9 + 0.2*dd;
      diffuseColor.rgb *= 1.0 - uWet*0.3;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88,0.9,0.93), uSnow*0.55*(0.6+0.4*dd));
      if(uOverOn > 0.5) diffuseColor.rgb = diffuseColor.rgb*0.55 + 0.25;`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, uWet);')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 guv = (vWPos.xz + uHalf)/(2.0*uHalf); totalEmissiveRadiance += vec3(1.0,0.66,0.34) * texture2D(uGlow, guv).r * uNight * 0.55 * diffuseColor.rgb * 2.2;`); };
roadMat.customProgramCacheKey = () => 'road2';
for(let j=0;j<CH;j++) for(let i=0;i<CH;i++){ const m = new THREE.Mesh(new THREE.BufferGeometry(), roadMat); m.receiveShadow = true; m.castShadow = true; m.frustumCulled = false; scene.add(m); chunks.push({ mesh:m, dirty:false, i, j }); }
function chunkOf(x, z){ const i = clamp(Math.floor((x+EHALF)/CHS),0,CH-1), j = clamp(Math.floor((z+EHALF)/CHS),0,CH-1); return chunks[j*CH+i]; }
function markSeg(sg){ sg.geo = null; sg.midX = (nodes.get(sg.a).x + nodes.get(sg.b).x + 2*sg.cx)/4; sg.midZ = (nodes.get(sg.a).z + nodes.get(sg.b).z + 2*sg.cz)/4; chunkOf(sg.midX, sg.midZ).dirty = true; }
function markNode(nd){ nd.geo = null; nd.ends = null; chunkOf(nd.x, nd.z).dirty = true; for(const id of nd.segs){ const sg = segs.get(id); if(sg) markSeg(sg); } }
function rebuildChunks(maxN = 3){
  let n = 0; for(const ch of chunks){ if(!ch.dirty) continue; if(n++ >= maxN) break; ch.dirty = false;
    const parts = [];
    for(const nd of nodes.values()){ if(chunkOf(nd.x, nd.z) !== ch) continue; if(!nd.geo) buildNodeGeo(nd); parts.push(nd.geo); }
    for(const sg of segs.values()){ if(chunkOf(sg.midX, sg.midZ) !== ch) continue; if(!sg.geo) buildSegGeo(sg); parts.push(sg.geo); }
    let nv = 0; for(const p of parts) nv += p.p.length/3;
    const P = new Float32Array(nv*3), Nn = new Float32Array(nv*3), C = new Float32Array(nv*3), UV = new Float32Array(nv*2); let o = 0;
    for(const p of parts){ P.set(p.p, o*3); Nn.set(p.n, o*3); C.set(p.c, o*3); for(let i=0;i<p.p.length/3;i++){ UV[(o+i)*2] = p.p[i*3]/7; UV[(o+i)*2+1] = p.p[i*3+2]/7; } o += p.p.length/3; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P,3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn,3));
    g.setAttribute('color', new THREE.BufferAttribute(C,3)); g.setAttribute('uv', new THREE.BufferAttribute(UV,2));
    ch.mesh.geometry.dispose(); ch.mesh.geometry = g; }
  if(n) glowDirty = true;
}
/* ---------- émetteur de triangles ---------- */
function GB(){ return { p:[], n:[], c:[] }; }
function tri(g, a, b, c, cc, ex){ // ex : normale attendue (optionnelle) pour orienter le triangle
  let ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const l=Math.hypot(nx,ny,nz); if(l < 1e-9) return; nx/=l; ny/=l; nz/=l;
  if(ex && nx*ex[0]+ny*ex[1]+nz*ex[2] < 0){ const t = b; b = c; c = t; nx=-nx; ny=-ny; nz=-nz; }
  g.p.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]); g.n.push(nx,ny,nz,nx,ny,nz,nx,ny,nz); g.c.push(cc.r,cc.g,cc.b,cc.r,cc.g,cc.b,cc.r,cc.g,cc.b); }
function quad(g, a, b, c, d, cc, ex){ tri(g, a, b, c, cc, ex); tri(g, a, c, d, cc, ex); }

/* ---------- découpes aux nœuds ---------- */
function nodeInfo(nd){ // calcule les découpes, onglets et le style du nœud
  const list = nd.segs.map(id => segs.get(id)).filter(Boolean);
  nd.kind = list.length <= 1 ? 'end' : 'x';
  if(list.length === 2){ const [s1, s2] = list, d1 = segDir(s1, nd.id), d2 = segDir(s2, nd.id), dot = -(d1[0]*d2[0]+d1[1]*d2[1]);
    if((s1.type === s2.type && dot > .82) || (RT[s1.type].net === 'rail' && RT[s2.type].net === 'rail')) nd.kind = 'cont'; }
  if(list.some(s => RT[s.type].net === 'rail') && list.every(s => RT[s.type].net === 'rail')) nd.kind = list.length <= 1 ? 'end' : 'cont';
  const ends = [];
  for(const sg of list){ const d = segDir(sg, nd.id); ends.push({ sg, d, ang:Math.atan2(d[1], d[0]), t:RT[sg.type] }); }
  ends.sort((a,b) => a.ang - b.ang);
  for(const e of ends){ let trim = 0;
    if(nd.kind === 'x'){ for(const o of ends){ if(o === e) continue; const sn = Math.abs(e.d[0]*o.d[1]-e.d[1]*o.d[0]), cs = e.d[0]*o.d[0]+e.d[1]*o.d[1];
        if(cs < -.85) continue; // branche opposée : pas besoin de reculer
        const need = (o.t.hw + 1.2)/Math.max(.45, sn) + (cs > 0 ? e.t.hw*cs*.8 : 0); trim = Math.max(trim, need); }
      trim = clamp(trim, e.t.hw*.5 + 2, Math.min(32, e.sg.len*.42)); }
    e.trim = trim; if(e.sg.a === nd.id) e.sg.trimA = trim; else e.sg.trimB = trim; }
  // onglet pour les continuations
  for(const e of ends){ if(e.sg.a === nd.id) e.sg.miterA = null; else e.sg.miterB = null; }
  if(nd.kind === 'cont' && ends.length === 2){ const [e1, e2] = ends; const r1 = [-e1.d[1], e1.d[0]], r2 = [e2.d[1], -e2.d[0]]; // latéral cohérent
    let mx = r1[0]+r2[0], mz = r1[1]+r2[1]; const l = Math.hypot(mx,mz)||1; mx/=l; mz/=l; const sc = 1/Math.max(.5, mx*r1[0]+mz*r1[1]);
    for(const e of ends){ const tan = e.sg.a === nd.id ? e.d : [-e.d[0], -e.d[1]], rr = [-tan[1], tan[0]]; const sgn = (rr[0]*mx+rr[1]*mz) >= 0 ? 1 : -1;
      const mv = [mx*sgn*sc, mz*sgn*sc]; if(e.sg.a === nd.id) e.sg.miterA = mv; else e.sg.miterB = mv; } }
  nd.ends = ends;
}

/* ---------- géométrie d'un segment ---------- */
function buildSegGeo(sg){
  const t = RT[sg.type], g = GB(), A = nodes.get(sg.a), B = nodes.get(sg.b);
  if(!A.ends) nodeInfo(A); if(!B.ends) nodeInfo(B);
  const s0 = sg.trimA||0, s1 = sg.len - (sg.trimB||0); clearDeco(sg);
  if(s1 - s0 < .5){ sg.geo = g; return; }
  const step = 6, stations = [s0]; for(let s = Math.ceil(s0/step)*step; s < s1-1; s += step) if(s > s0+1) stations.push(s); stations.push(s1);
  const pts = t.prof, rows = [];
  for(let q=0;q<stations.length;q++){ const s = stations[q], p = segPoint(sg, s, {}); let rx = -p.dz, rz = p.dx, sc = 1;
    if(q === 0 && sg.miterA){ rx = sg.miterA[0]; rz = sg.miterA[1]; } if(q === stations.length-1 && sg.miterB){ rx = sg.miterB[0]; rz = sg.miterB[1]; }
    const gC = heightAt(p.x,p.z), gL = heightAt(p.x - rx*t.hw, p.z - rz*t.hw), gR = heightAt(p.x + rx*t.hw, p.z + rz*t.hw);
    const elev = (p.y - gC > 3.2 || isWet(p.x,p.z,.4)) && !sg.tunnel, under = sg.tunnel && p.y < gC - 2;
    const sk = elev ? -1.4 : -clamp(Math.max(p.y-gL, p.y-gR)+.7, .7, 4.5);
    rows.push({ s, p, rx, rz, elev, under, sk, pts: pts.map(([o,dy]) => [p.x + rx*o, p.y + (dy === 'SK' ? sk : dy), p.z + rz*o]) }); }
  for(let q=0;q<rows.length-1;q++){ const R0 = rows[q], R1 = rows[q+1];
    for(let k=0;k<pts.length-1;k++){ const o0 = pts[k][0], o1 = pts[k+1][0], d0 = pts[k][1] === 'SK' ? -1 : pts[k][1], d1 = pts[k+1][1] === 'SK' ? -1 : pts[k+1][1];
      const lat = -(d1-d0), up = o1-o0, ex = [R0.rx*lat, up, R0.rz*lat];
      quad(g, R0.pts[k], R0.pts[k+1], R1.pts[k+1], R1.pts[k], ROADC[pts[k+1][2]], ex); }
    if(R0.elev || R1.elev){ const a = R0.pts[0], b = R0.pts[pts.length-1], c = R1.pts[pts.length-1], d = R1.pts[0]; quad(g, a, b, c, d, ROADC.deck, [0,-1,0]); } }
  // marquages
  const strip = (off, w, sa, sb, dy, cc) => { let prev = null; const ss = [sa]; for(const r of rows) if(r.s > sa && r.s < sb) ss.push(r.s); ss.push(sb);
    for(const s of ss){ const p = segPoint(sg, s, _sp2), rx = -p.dz, rz = p.dx; const cur = [[p.x+rx*(off-w/2), p.y+dy, p.z+rz*(off-w/2)], [p.x+rx*(off+w/2), p.y+dy, p.z+rz*(off+w/2)]];
      if(prev) quad(g, prev[0], prev[1], cur[1], cur[0], cc, [0,1,0]); prev = cur; } };
  for(const mk of t.marks){ const cc = ROADC[mk.k], dy = mk.dy ?? (mk.fill ? .01 : .02);
    if(mk.dash){ const [on, per] = mk.dash; for(let s = Math.ceil(s0/per)*per; s < s1; s += per){ const a = Math.max(s, s0+.5), b = Math.min(s+on, s1-.5); if(b > a) strip(mk.off, mk.w, a, b, dy, cc); } }
    else strip(mk.off, mk.w, s0+.3, s1-.3, dy, cc); }
  // passages piétons et lignes d'arrêt aux carrefours
  const xing = (nd, atA) => { if(nd.kind !== 'x' || !t.ped || t.cw < 3) return; const sE = atA ? s0 : s1, sgn = atA ? 1 : -1;
    for(let o=-t.cw+.6;o<t.cw-.4;o+=1.1) strip(o, .55, Math.min(sE, sE+sgn*3.2), Math.max(sE, sE+sgn*3.2), .025, ROADC.mark);
    const inc = atA ? -1 : 1; strip(inc*t.cw/2*(t.oneway ? 0 : 1), t.oneway ? t.cw*2-.4 : t.cw-.4, Math.min(sE+sgn*3.6, sE+sgn*4), Math.max(sE+sgn*3.6, sE+sgn*4), .025, ROADC.mark); };
  xing(A, true); xing(B, false);
  // rails et traverses
  if(t.net === 'rail'){ for(const tc of [-2, 2]){ for(let s = s0; s < s1; s += .7){ const p = segPoint(sg, s, _sp2), rx = -p.dz, rz = p.dx, fx = p.dx*.13, fz = p.dz*.13;
        const a = [p.x+rx*(tc-1.3)-fx, p.y+.46, p.z+rz*(tc-1.3)-fz], b = [p.x+rx*(tc+1.3)-fx, p.y+.46, p.z+rz*(tc+1.3)-fz], c = [p.x+rx*(tc+1.3)+fx, p.y+.46, p.z+rz*(tc+1.3)+fz], d = [p.x+rx*(tc-1.3)+fx, p.y+.46, p.z+rz*(tc-1.3)+fz];
        quad(g, a, b, c, d, ROADC.sleeper, [0,1,0]); }
      for(const ro of [-.72, .72]) strip(tc+ro, .12, s0, s1, .6, ROADC.railc); } }
  sg.geo = { p:new Float32Array(g.p), n:new Float32Array(g.n), c:new Float32Array(g.c) };
  buildSegDeco(sg, rows, s0, s1);
}
/* ---------- géométrie d'un nœud (carrefour) ---------- */
function buildNodeGeo(nd){
  nodeInfo(nd); const g = GB(); clearDeco(nd);
  if(nd.kind === 'x' && nd.ends.length >= 2){
    const E = nd.ends.map(e => { const p = segPoint(e.sg, e.sg.a === nd.id ? e.trim : e.sg.len - e.trim, {}); const r = [-e.d[1], e.d[0]];
      const hasWalk = e.t.ped && e.t.cw > 0 && e.t.cw < e.t.hw, cw = e.t.net === 'ped' ? .01 : e.t.cw;
      return { e, x:p.x, z:p.z, r, hw:e.t.hw, cw, walk:hasWalk }; });
    const y = nd.y, C = [nd.x, y, nd.z], asph = [];
    const lineX = (px, pz, dx, dz, qx, qz, ex, ez) => { const den = dx*ez - dz*ex; if(Math.abs(den) < 1e-4) return null; const t = ((qx-px)*ez - (qz-pz)*ex)/den; return [px+dx*t, pz+dz*t, t]; };
    const curve = (ax, az, bx, bz, da, db) => { const ip = lineX(ax, az, da[0], da[1], bx, bz, db[0], db[1]); const pts = [];
      const useC = ip && ip[2] < 0 && Math.hypot(ip[0]-ax, ip[1]-az) < 60; const cx = useC ? ip[0] : (ax+bx)/2, cz = useC ? ip[1] : (az+bz)/2;
      for(let k=0;k<=6;k++){ const p = bez([ax,az],[cx,cz],[bx,bz],k/6); pts.push(p); } return pts; };
    for(let k=0;k<E.length;k++){ const a = E[k], b = E[(k+1)%E.length];
      const Rc = [a.x + a.r[0]*a.cw, a.z + a.r[1]*a.cw], Lc = [b.x - b.r[0]*b.cw, b.z - b.r[1]*b.cw];
      const Ro = [a.x + a.r[0]*a.hw, a.z + a.r[1]*a.hw], Lo = [b.x - b.r[0]*b.hw, b.z - b.r[1]*b.hw];
      const inner = curve(Rc[0], Rc[1], Lc[0], Lc[1], a.e.d, b.e.d), outer = curve(Ro[0], Ro[1], Lo[0], Lo[1], a.e.d, b.e.d);
      asph.push([a.x - a.r[0]*a.cw, a.z - a.r[1]*a.cw]); for(const p of inner) asph.push(p);
      const walkH = (a.walk || b.walk) ? .18 : .02;
      for(let q=0;q<6;q++){ const i0 = inner[q], i1 = inner[q+1], o0 = outer[q], o1 = outer[q+1];
        quad(g, [i0[0],y+walkH,i0[1]], [o0[0],y+walkH,o0[1]], [o1[0],y+walkH,o1[1]], [i1[0],y+walkH,i1[1]], (a.walk||b.walk) ? ROADC.walk : ROADC.asph, [0,1,0]);
        if(walkH > .1) quad(g, [i0[0],y+walkH,i0[1]], [i1[0],y+walkH,i1[1]], [i1[0],y,i1[1]], [i0[0],y,i0[1]], ROADC.curb, [nd.x-(i0[0]+i1[0])/2, 0, nd.z-(i0[1]+i1[1])/2]);
        const gy0 = Math.min(y-.6, heightAt(o0[0],o0[1])-.3), gy1 = Math.min(y-.6, heightAt(o1[0],o1[1])-.3);
        quad(g, [o0[0],y+walkH,o0[1]], [o1[0],y+walkH,o1[1]], [o1[0],gy1,o1[1]], [o0[0],gy0,o0[1]], ROADC.side, [(o0[0]+o1[0])/2-nd.x, 0, (o0[1]+o1[1])/2-nd.z]); } }
    for(let k=0;k<asph.length;k++){ const p = asph[k], q = asph[(k+1)%asph.length]; tri(g, C, [p[0],y,p[1]], [q[0],y,q[1]], ROADC.asph, [0,1,0]); }
    // skirt sous le carrefour
    if(nd.lights) buildLights(nd, E);
  }
  nd.geo = { p:new Float32Array(g.p), n:new Float32Array(g.n), c:new Float32Array(g.c) };
}

/* ---------- décor : lampadaires, arbres, piles, portails, feux ---------- */
const lampPool = new Pool(LAMP, MAT.equip, 2048); const lampHeadMesh = lampPool.link(LAMP_H, MAT.lampHead);
const pillarPool = new Pool(PILLAR, MAT.concrete, 512);
const tlPool = new Pool(TL_POLE, MAT.equip, 256), tlHeadPool = new Pool(TL_HEAD, MAT.tlHead, 256, { cast:false });
let glowDirty = true; const lampSpots = new Map();
function clearDeco(o){ for(const h of o.deco) if(h.pool) h.pool.remove(h); else if(h.t) { h.t.h.pool.remove(h.t.h); } o.deco.length = 0; if(lampSpots.has(o)){ lampSpots.delete(o); glowDirty = true; } }
function buildSegDeco(sg, rows, s0, s1){
  const t = RT[sg.type], spots = [];
  if(t.lamps && !sg.tunnel){ const sp = 30, off = t.lamps === 2 ? 0 : t.cw + (t.hw - t.cw)*.35;
    for(let s = s0 + 8, k = 0; s < s1 - 6; s += sp, k++){ const p = segPoint(sg, s, _sp2), rx = -p.dz, rz = p.dx;
      const sides = t.lamps === 2 ? [1, -1] : [(k%2 ? 1 : -1)];
      for(const sd of sides){ const x = p.x + rx*off*sd, z = p.z + rz*off*sd, rot = Math.atan2(-rx*sd, -rz*sd); _c.setRGB(1,1,1);
        const h = place(lampPool, x, p.y + (t.lamps === 2 ? .9 : .18), z, 1, 1, 1, t.lamps === 2 ? Math.atan2(rx*sd, rz*sd) : rot, _c); if(h) sg.deco.push(h);
        spots.push([x + (t.lamps === 2 ? rx*sd*2.2 : -rx*sd*2.2), z + (t.lamps === 2 ? rz*sd*2.2 : -rz*sd*2.2)]); } } }
  if(spots.length){ lampSpots.set(sg, spots); glowDirty = true; }
  if(t.trees){ for(let s = s0 + 6; s < s1 - 4; s += 13){ const p = segPoint(sg, s, _sp2); const tr = addTree(p.x, p.z, 8+rnd()*3, 'D', rnd, false); if(tr){ tr.h.pool.setMatrix(tr.h, _m.compose(_p.set(p.x, p.y+.1, p.z), _q.setFromAxisAngle(UP, tr.rot), _s.set(tr.sx, tr.s, tr.sx))); sg.deco.push({ t:tr }); } } }
  // piles de pont et de viaduc
  let lastPil = -99;
  for(const r of rows){ if(!r.elev || r.s - lastPil < 28) continue; const gy = Math.min(heightAt(r.p.x, r.p.z), isWet(r.p.x, r.p.z) ? wb[wIdx(r.p.x,r.p.z)]||-4 : 1e9); const h = r.p.y - 1.4 - gy; if(h < 1) continue;
    lastPil = r.s; const ang = Math.atan2(r.rx, r.rz); _c.setRGB(1,1,1);
    const a = place(pillarPool, r.p.x, gy, r.p.z, 1.7, h, Math.min(t.hw*1.2, 9), ang, _c); const b = place(pillarPool, r.p.x, r.p.y - 2.2, r.p.z, 2.2, .8, t.hw*2-.5, ang, _c); if(a) sg.deco.push(a); if(b) sg.deco.push(b); }
  // portails de tunnel
  for(let q=1;q<rows.length;q++){ if(rows[q].under === rows[q-1].under) continue; const r = rows[q].under ? rows[q] : rows[q-1], ang = Math.atan2(r.rx, r.rz); _c.set('#8d8a84');
    for(const sd of [-1,1]){ const h = place(pillarPool, r.p.x + r.rx*(t.hw+.6)*sd, r.p.y - .5, r.p.z + r.rz*(t.hw+.6)*sd, 1.4, 7.5, 1.6, ang, _c); if(h) sg.deco.push(h); }
    const top = place(pillarPool, r.p.x, r.p.y + 6.2, r.p.z, 1.6, 2.2, t.hw*2+2.6, ang, _c); if(top) sg.deco.push(top); }
}
function buildLights(nd, E){
  if(!nd.tl) initLights(nd);
  for(const a of E){ if(!a.e.t.car) continue; const pos = [a.x - a.r[0]*(a.cw+.9), a.z - a.r[1]*(a.cw+.9)], rot = Math.atan2(a.r[0], a.r[1]); _c.setRGB(1,1,1);
    const h = place(tlPool, pos[0], nd.y + .18, pos[1], 1, 1, 1, rot, _c); const ls = lightState(nd, a.e.sg.id); const hh = place(tlHeadPool, pos[0], nd.y + .18, pos[1], 1, 1, 1, rot, _c.setRGB(...(ls === 0 ? [.1,1.6,.4] : ls === 1 ? [1.8,1,.1] : [1.9,.12,.05])));
    if(h){ nd.deco.push(h); } if(hh){ nd.deco.push(hh); hh.segId = a.e.sg.id; } }
}
function rebuildGlow(){
  glowData.fill(0); const px = GLOW_N/(2*HALF), R = 12*px;
  for(const spots of lampSpots.values()) for(const [x,z] of spots){ const cx = (x+HALF)*px, cz = (z+HALF)*px;
    for(let j=Math.max(0,Math.floor(cz-R));j<=Math.min(GLOW_N-1,Math.ceil(cz+R));j++) for(let i=Math.max(0,Math.floor(cx-R));i<=Math.min(GLOW_N-1,Math.ceil(cx+R));i++){
      const d2 = ((i-cx)**2 + (j-cz)**2)/(R*R); if(d2 > 1) continue; const k = (j*GLOW_N+i)*4; glowData[k] = Math.min(255, glowData[k] + 190*Math.exp(-d2*3)); } }
  glowTex.needsUpdate = true; glowDirty = false;
}

/* ---------- feux tricolores ---------- */
function initLights(nd){ const E = nd.ends || []; const groups = new Map(); if(!E.length) return;
  let axis = E.reduce((a,b) => (b.t.hw > a.t.hw ? b : a)).d;
  for(const e of E){ const c = Math.abs(e.d[0]*axis[0]+e.d[1]*axis[1]); groups.set(e.sg.id, c > .7 ? 0 : 1); }
  nd.tl = { groups, phase:0, t:rnd()*20 }; }
function lightState(nd, segId){ // 0 vert, 1 orange, 2 rouge
  if(!nd.lights || !nd.tl) return 0; const g = nd.tl.groups.get(segId); if(g === undefined) return 0;
  const ph = nd.tl.phase; const green = ph === 0 ? 0 : ph === 2 ? 1 : -1, amber = ph === 1 ? 0 : ph === 3 ? 1 : -1;
  return g === green ? 0 : g === amber ? 1 : 2; }
const TL_DUR = [20, 3, 20, 3];
function updateLights(dt){
  for(const nd of nodes.values()){ if(!nd.lights || !nd.tl) continue; const tl = nd.tl; tl.t += dt; if(tl.t < TL_DUR[tl.phase]) continue; tl.t = 0; tl.phase = (tl.phase+1)%4;
    for(const h of nd.deco) if(h.segId !== undefined){ const s = lightState(nd, h.segId); h.pool.setColor(h, _c.setRGB(...(s === 0 ? [.1,1.6,.4] : s === 1 ? [1.8,1,.1] : [1.9,.12,.05]))); } }
}

/* ---------- recherche d'itinéraire ---------- */
const netOK = (t, mode) => mode === 'tram' ? !!t.tram : mode === 'ped' ? (t.pedOK && t.net !== 'rail') : mode === 'rail' ? t.net === 'rail' : (t.car || (mode === 'bus' && t.lanes.some(l => l.kind === 'bus')));
function canTraverse(sg, fromNode, mode){ const t = RT[sg.type]; if(!netOK(t, mode)) return false; if(mode === 'ped') return true; return !t.oneway || sg.a === fromNode; }
function segCost(sg, mode, truck){ const t = RT[sg.type]; if(mode === 'ped') return sg.len/1.4;
  let c = sg.len / t.speed * (1 + Math.min(4, sg.load*.25)); if(truck && sg.heavyBan) c *= 8; return c; }
const pathCache = new Map(); let pathCacheVer = -1;
class MinHeap{ constructor(){ this.a = []; } push(k, v){ const a = this.a; a.push([k,v]); let i = a.length-1; while(i>0){ const p = (i-1)>>1; if(a[p][0] <= a[i][0]) break; [a[p],a[i]] = [a[i],a[p]]; i = p; } }
  pop(){ const a = this.a, top = a[0], last = a.pop(); if(a.length){ a[0] = last; let i = 0; for(;;){ const l = 2*i+1, r = l+1; let m = i; if(l < a.length && a[l][0] < a[m][0]) m = l; if(r < a.length && a[r][0] < a[m][0]) m = r; if(m === i) break; [a[m],a[i]] = [a[i],a[m]]; i = m; } } return top; }
  get size(){ return this.a.length; } }
// route entre deux points d'accès {sg, s} ; renvoie une liste d'étapes {sg, from, to} (abscisses)
function findRoute(A, B, mode='car', truck=false){
  if(!A || !B || !segs.has(A.sg.id) || !segs.has(B.sg.id)) return null;
  if(pathCacheVer !== NET_VERSION){ pathCache.clear(); pathCacheVer = NET_VERSION; }
  const key = A.sg.id+':'+Math.round(A.s/20)+'>'+B.sg.id+':'+Math.round(B.s/20)+mode+(truck?1:0);
  if(pathCache.has(key)) return pathCache.get(key);
  const res = routeAstar(A, B, mode, truck); if(pathCache.size > 6000) pathCache.clear(); pathCache.set(key, res); return res;
}
function routeAstar(A, B, mode, truck){
  const sp = mode === 'ped' ? 1.4 : 25, tA = RT[A.sg.type], tB = RT[B.sg.type];
  const ped = mode === 'ped';
  // même segment, dans le bon sens
  if(A.sg === B.sg){ const fwd = B.s >= A.s; if(ped || !tA.oneway || fwd) return [{ sg:A.sg, from:A.s, to:B.s }]; }
  const g = new Map(), came = new Map(), heap = new MinHeap(), tgt = nodes.get(B.sg.a), tgt2 = nodes.get(B.sg.b);
  const h = n => Math.min(Math.hypot(n.x-tgt.x, n.z-tgt.z), Math.hypot(n.x-tgt2.x, n.z-tgt2.z))/sp;
  const startTo = (nid, cost) => { if(!g.has(nid) || cost < g.get(nid)){ g.set(nid, cost); came.set(nid, { start:true }); heap.push(cost + h(nodes.get(nid)), nid); } };
  const spd = ped ? 1.4 : tA.speed || 10;
  if(ped || !tA.oneway) startTo(A.sg.a, A.s/spd); startTo(A.sg.b, (A.sg.len-A.s)/spd);
  const endCost = nid => { const s = B.sg.a === nid ? B.s : B.sg.len - B.s, ok = ped || !tB.oneway || B.sg.a === nid; return ok ? s/(ped ? 1.4 : tB.speed||10) : Infinity; };
  let best = Infinity, bestN = null, it = 0; const closed = new Set();
  while(heap.size && it++ < 20000){ const [f, nid] = heap.pop(); if(closed.has(nid)) continue; closed.add(nid); if(f >= best) break;
    const gc = g.get(nid);
    if(nid === B.sg.a || nid === B.sg.b){ const tot = gc + endCost(nid); if(tot < best){ best = tot; bestN = nid; } }
    const nd = nodes.get(nid); if(!nd) continue;
    for(const sid of nd.segs){ const sg = segs.get(sid); if(!sg || !canTraverse(sg, nid, mode)) continue; const o = otherNode(sg, nid); if(closed.has(o)) continue;
      const c = gc + segCost(sg, mode, truck) + (nd.lights ? 4 : nd.segs.length > 2 ? 1.5 : 0);
      if(!g.has(o) || c < g.get(o)){ g.set(o, c); came.set(o, { from:nid, sg }); heap.push(c + h(nodes.get(o)), o); } } }
  if(bestN === null) return null;
  const legs = []; legs.push({ sg:B.sg, from:B.sg.a === bestN ? 0 : B.sg.len, to:B.s });
  let cur = bestN; while(true){ const c = came.get(cur); if(!c || c.start) break; legs.push({ sg:c.sg, from:c.sg.a === c.from ? 0 : c.sg.len, to:c.sg.a === c.from ? c.sg.len : 0 }); cur = c.from; }
  legs.push({ sg:A.sg, from:A.s, to:A.sg.a === cur ? 0 : A.sg.len }); legs.reverse();
  return legs.filter((l, i) => i === 0 || i === legs.length-1 || Math.abs(l.to-l.from) > .01);
}
/* composantes connexes (distribution de l'électricité et de l'eau par le réseau) */
let compVer = -1; const segComp = new Map();
function computeComponents(){ if(compVer === NET_VERSION) return; compVer = NET_VERSION; segComp.clear(); let cid = 0;
  for(const sg of segs.values()){ if(segComp.has(sg.id) || RT[sg.type].net === 'rail') continue; cid++; const stack = [sg];
    while(stack.length){ const s = stack.pop(); if(segComp.has(s.id)) continue; segComp.set(s.id, cid);
      for(const nid of [s.a, s.b]){ const nd = nodes.get(nid); for(const o of nd.segs){ const os = segs.get(o); if(os && !segComp.has(o) && RT[os.type].net !== 'rail') stack.push(os); } } } } }
