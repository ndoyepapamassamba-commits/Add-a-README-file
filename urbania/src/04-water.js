/* ================= eau : modèle en eaux peu profondes (tuyaux virtuels) ================= */
const WNN = WN*WN, WN1 = WN+1;
const wb = new Float32Array(WNN), wwall = new Float32Array(WNN), wd = new Float32Array(WNN), wp = new Float32Array(WNN), wp2 = new Float32Array(WNN);
const fR = new Float32Array(WNN), fL = new Float32Array(WNN), fB = new Float32Array(WNN), fT = new Float32Array(WNN);
const wFixed = new Uint8Array(WNN), wSrc = new Float32Array(WNN), wSrcP = new Float32Array(WNN);
const WATER = { sources:[], dams:[], steps:0, flowIn:0, sea:SEA, surge:0, rain:0 };
const wIdx = (x,z) => { const a = Math.floor((x+EHALF)/WC), b = Math.floor((z+EHALF)/WC); return (a<0||b<0||a>=WN||b>=WN) ? -1 : b*WN+a; };
const wcx = a => -EHALF+(a+.5)*WC;
function sampleBed(a,b){ const x = wcx(a), z = wcx(b); return (heightAt(x,z)*2 + heightAt(x-5,z-5) + heightAt(x+5,z-5) + heightAt(x-5,z+5) + heightAt(x+5,z+5))/6; }
function updateBed(a0=0,b0=0,a1=WN-1,b1=WN-1){ for(let b=Math.max(0,b0);b<=Math.min(WN-1,b1);b++) for(let a=Math.max(0,a0);a<=Math.min(WN-1,a1);a++) wb[b*WN+a] = sampleBed(a,b); }
bus.on('terrain', (ei0, ej0, ei1, ej1) => updateBed(Math.floor(ei0*CELL/WC)-1, Math.floor(ej0*CELL/WC)-1, Math.ceil(ei1*CELL/WC)+1, Math.ceil(ej1*CELL/WC)+1));
function initWater(){
  updateBed(); wwall.fill(0); fR.fill(0); fL.fill(0); fB.fill(0); fT.fill(0); wp.fill(0); wSrc.fill(0); wSrcP.fill(0); wFixed.fill(0);
  WATER.sources.length = 0; WATER.dams.length = 0;
  for(let b=0;b<WN;b++) for(let a=0;a<WN;a++){ const c = b*WN+a; wd[c] = Math.max(0, SEA - wb[c]);
    const edge = a===0||b===0||a===WN-1||b===WN-1, z = wcx(b), cz = coastZ(wcx(a)), deepSea = z > cz + 260;
    if(((edge && z > cz - 120) || deepSea) && wb[c] < SEA - .5) wFixed[c] = 1; }
  // source de la rivière sur le bord nord
  const rx = riverX(-EHALF+WC*2); addWaterSource(rx, -EHALF+WC*1.5, 140, true);
}
function addWaterSource(x, z, q, natural=false){ const c = wIdx(x,z); if(c < 0) return null; const s = { x, z, q, c, natural }; WATER.sources.push(s); rebuildSources(); return s; }
function rebuildSources(){ wSrc.fill(0); for(const s of WATER.sources){ const a = s.c%WN, b = (s.c/WN)|0; for(let db=-1;db<=1;db++) for(let da=-1;da<=1;da++){ const aa=a+da, bb=b+db; if(aa<0||bb<0||aa>=WN||bb>=WN) continue; wSrc[bb*WN+aa] += s.q/9; } } }
function stepWater(dt){
  const g = 9.81, K = dt*g*WC*.5, area = WC*WC, damp = .995; let inflow = 0;
  // niveau de la mer : marée (deux cycles par jour) + surcote (tsunami)
  const sea = SEA + .45*Math.sin(state.time/DAY*Math.PI*4) + WATER.surge; WATER.sea = sea;
  // pluie : ruissellement ; infiltration dans le sol pour les faibles lames d'eau
  const rainR = WATER.rain*.0007*dt, infl = .0008*dt;
  for(let b=0;b<WN;b++) for(let a=0;a<WN;a++){ const c = b*WN+a, d = wd[c], h = wb[c]+wwall[c]+d;
    let r = 0, l = 0, bt = 0, t = 0;
    if(a < WN-1){ const n = c+1, dh = h - (wb[n]+wwall[n]+wd[n]); r = Math.max(0, fR[c]*damp + K*dh); }
    if(a > 0){ const n = c-1, dh = h - (wb[n]+wwall[n]+wd[n]); l = Math.max(0, fL[c]*damp + K*dh); }
    if(b < WN-1){ const n = c+WN, dh = h - (wb[n]+wwall[n]+wd[n]); bt = Math.max(0, fB[c]*damp + K*dh); }
    if(b > 0){ const n = c-WN, dh = h - (wb[n]+wwall[n]+wd[n]); t = Math.max(0, fT[c]*damp + K*dh); }
    const out = (r+l+bt+t)*dt, vol = d*area; if(out > vol){ const s = out > 0 ? vol/out : 0; r*=s; l*=s; bt*=s; t*=s; }
    fR[c]=r; fL[c]=l; fB[c]=bt; fT[c]=t; }
  for(let b=0;b<WN;b++) for(let a=0;a<WN;a++){ const c = b*WN+a;
    let inV = 0, inP = 0;
    if(a > 0){ const n = c-1, f = fR[n]; inV += f; inP += f*wp[n]; } if(a < WN-1){ const n = c+1, f = fL[n]; inV += f; inP += f*wp[n]; }
    if(b > 0){ const n = c-WN, f = fB[n]; inV += f; inP += f*wp[n]; } if(b < WN-1){ const n = c+WN, f = fT[n]; inV += f; inP += f*wp[n]; }
    const outV = fR[c]+fL[c]+fB[c]+fT[c], d0 = wd[c]; inV += wSrc[c]; inP += wSrcP[c]; inflow += wSrc[c];
    let d = d0 + (inV - outV)*dt/area; if(d < 1e-4) d = 0;
    const mass = wp[c]*d0*area + (inP - wp[c]*outV)*dt; wp2[c] = d > .01 ? clamp(mass/(d*area), 0, 1)*.9995 : 0;
    if(rainR > 0) d += rainR; if(d > 0 && d < .4) d = Math.max(0, d - infl*(1 - d/.4));
    if(wFixed[c]){ d = Math.max(0, sea - wb[c]); wp2[c] *= .9; }
    wd[c] = d; }
  wp.set(wp2); WATER.steps++; WATER.flowIn = inflow;
  // barrages : turbines entre l'amont et l'aval
  for(const dm of WATER.dams){ const up = dm.up, dn = dm.dn; if(up < 0 || dn < 0) continue;
    const head = (wb[up]+wd[up]) - (wb[dn]+wd[dn]); const q = clamp(Math.min(wd[up]*area/dt*.5, dm.maxQ), 0, dm.maxQ) * (head > .5 ? 1 : 0);
    wd[up] -= q*dt/area; wd[dn] += q*dt/area; dm.q = lerp(dm.q||0, q, .05); dm.head = Math.max(0, head); dm.power = Math.min(dm.cap, .00981*dm.q*dm.head*6); }
}
const waterSurfAt = (x,z) => { const c = wIdx(x,z); return c < 0 ? SEA : wb[c]+wwall[c]+wd[c]; };
const waterDepthAt = (x,z) => { const c = wIdx(x,z); return c < 0 ? Math.max(0, SEA-heightAt(x,z)) : wd[c]; };
const waterPollAt = (x,z) => { const c = wIdx(x,z); return c < 0 ? 0 : wp[c]; };
function isWet(x,z,th=.35){ const c = wIdx(x,z); if(c < 0) return heightAt(x,z) < SEA; return wd[c] > th && heightAt(x,z) < wb[c]+wd[c]-.1; }
function nearestWater(x, z, R=40){ let best = null, bd = 1e9; for(let dz=-R;dz<=R;dz+=8) for(let dx=-R;dx<=R;dx+=8){ const px = x+dx, pz = z+dz, c = wIdx(px,pz); if(c < 0 || wd[c] < 1.2) continue; const d = dx*dx+dz*dz; if(d < bd){ bd = d; best = { x:px, z:pz, c }; } } return best; }

/* ---------- maillage de l'eau ---------- */
const wGeo = new THREE.BufferGeometry();
const wPos = new Float32Array(WN1*WN1*3), wAttr = new Float32Array(WN1*WN1*4);
{ const idx = new Uint32Array(WN*WN*6); let k = 0;
  for(let b=0;b<WN;b++) for(let a=0;a<WN;a++){ const p=b*WN1+a, q=p+1, r=p+WN1, s=r+1; idx[k++]=p; idx[k++]=r; idx[k++]=q; idx[k++]=r; idx[k++]=s; idx[k++]=q; }
  for(let b=0;b<WN1;b++) for(let a=0;a<WN1;a++){ const v=(b*WN1+a)*3; wPos[v]=a*WC-EHALF; wPos[v+2]=b*WC-EHALF; }
  wGeo.setIndex(new THREE.BufferAttribute(idx,1)); wGeo.setAttribute('position', new THREE.BufferAttribute(wPos,3).setUsage(THREE.DynamicDrawUsage));
  wGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(WN1*WN1*3).map((_,i)=>i%3===1?1:0),3));
  wGeo.setAttribute('aW', new THREE.BufferAttribute(wAttr,4).setUsage(THREE.DynamicDrawUsage)); wGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), EHALF*1.5); }
const waterMat = new THREE.MeshStandardMaterial({ color:0x0f2f38, roughness:.08, metalness:.05, transparent:true, envMapIntensity:.55 });
waterMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, { uTime:U.uTime, uWN:{value:waterNormal}, uWet:U.uWet, uSnow:U.uSnow, uNight:U.uNight, uOverOn:U.uOverOn, uOver:U.uOver, uHalf:U.uHalf });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aW; varying vec4 vW; varying vec3 vWP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n vW = aW; vWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    uniform float uTime, uWet, uNight, uOverOn, uHalf; uniform sampler2D uWN, uOver; varying vec4 vW; varying vec3 vWP;`)
  .replace('#include <color_fragment>', `#include <color_fragment>
    float dep = vW.x; float spd = length(vW.yz);
    vec3 deep = vec3(0.012,0.07,0.1), shallow = vec3(0.07,0.24,0.25);
    diffuseColor.rgb = mix(shallow, deep, smoothstep(0.5, 8.0, dep));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28,0.22,0.12), clamp(vW.w*1.6,0.0,0.85));
    float foam = (1.0 - smoothstep(0.05, 0.7, dep))*0.55 + smoothstep(0.6, 2.2, spd)*0.35 + (1.0 - smoothstep(0.3, 3.0, dep))*smoothstep(0.55, 1.0, sin(dep*4.0 - uTime*1.7 + vWP.x*0.02))*0.6;
    float fn = texture2D(uWN, vWP.xz/9.0 + uTime*0.02).r;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85,0.9,0.9), clamp(foam*fn,0.0,0.7));
    diffuseColor.a = clamp(0.35 + dep*0.55, 0.35, 0.94);
    if(uOverOn > 0.5){ vec4 ov = texture2D(uOver, (vWP.xz+uHalf)/(2.0*uHalf)); diffuseColor.rgb = mix(diffuseColor.rgb*0.6+0.12, ov.rgb, ov.a*0.8); }`)
  .replace('#include <normal_fragment_maps>', `
    { vec2 uvw = vWP.xz/38.0; float t = uTime*0.35; float p0 = fract(t), p1 = fract(t+0.5); float wg = abs(p0-0.5)*2.0;
      vec2 fl = vW.yz*0.06;
      vec3 n0 = texture2D(uWN, uvw - fl*p0).xyz*2.0-1.0, n1 = texture2D(uWN, uvw - fl*p1 + 0.5).xyz*2.0-1.0;
      vec3 n2 = texture2D(uWN, vWP.xz/11.0 + vec2(t*0.03, -t*0.02)).xyz*2.0-1.0;
      vec2 nn = mix(n0.xy, n1.xy, wg)*0.8 + n2.xy*0.35 + n2.xy*uWet*0.6;
      vec3 wn = normalize(vec3(nn.x*0.32, 1.0, nn.y*0.32)); normal = normalize((viewMatrix*vec4(wn,0.0)).xyz); }`);
};
waterMat.customProgramCacheKey = () => 'water2';
const waterMesh = new THREE.Mesh(wGeo, waterMat); waterMesh.receiveShadow = true; waterMesh.renderOrder = 1; scene.add(waterMesh);
// océan au-delà de la zone simulée
let oceanMesh = null;
const oceanMat = new THREE.MeshStandardMaterial({ color:0x0c2833, roughness:.1, metalness:.05, normalMap:waterNormal, normalScale:new THREE.Vector2(.25,.25), envMapIntensity:.55 });
waterNormal.repeat.set(1,1);
{ const S = 40000, g = []; for(const [x,z,w,d] of [[0,-EHALF-S/2,S*2,S],[0,EHALF+S/2,S*2,S],[-EHALF-S/2,0,S,EHALF*2],[EHALF+S/2,0,S,EHALF*2]]){ const p = new THREE.PlaneGeometry(w,d).rotateX(-Math.PI/2).translate(x,SEA-.05,z); const uv = p.attributes.uv; const pos = p.attributes.position; for(let i=0;i<uv.count;i++) uv.setXY(i, pos.getX(i)/40, pos.getZ(i)/40); g.push(p); }
  oceanMesh = new THREE.Mesh(mergeGeometries(g), oceanMat); scene.add(oceanMesh); }

let wFrame = 0;
function updateWaterMesh(){
  for(let b=0;b<WN1;b++) for(let a=0;a<WN1;a++){
    let s = 0, n = 0, dep = 0, vx = 0, vz = 0, pol = 0, bed = 1e9;
    for(let db=-1;db<=0;db++) for(let da=-1;da<=0;da++){ const aa=a+da, bb=b+db; if(aa<0||bb<0||aa>=WN||bb>=WN) continue; const c = bb*WN+aa; const bw = wb[c]+wwall[c]; if(bw < bed) bed = bw;
      if(wd[c] > .03){ s += bw+wd[c]; n++; dep += wd[c]; const dd = Math.max(wd[c], .3)*WC; vx += (fR[c]-fL[c])/dd; vz += (fB[c]-fT[c])/dd; pol += wp[c]; } }
    const v = b*WN1+a;
    if(n){ wPos[v*3+1] = s/n; wAttr[v*4] = dep/n; wAttr[v*4+1] = vx/n; wAttr[v*4+2] = vz/n; wAttr[v*4+3] = pol/n; }
    else { wPos[v*3+1] = bed - 1.5; wAttr[v*4] = 0; wAttr[v*4+1] = 0; wAttr[v*4+2] = 0; wAttr[v*4+3] = 0; } }
  wGeo.attributes.position.needsUpdate = true; wGeo.attributes.aW.needsUpdate = true; if(oceanMesh) oceanMesh.position.y = WATER.sea - SEA;
}
function waterTick(dtGame){ // dtGame : secondes de simulation à avancer
  let steps = Math.min(4, Math.max(1, Math.round(dtGame/.25))); for(let k=0;k<steps;k++) stepWater(.25);
  if(++wFrame % 2 === 0) updateWaterMesh();
}

/* barrage : mur dans la grille d'eau le long d'un segment */
function applyDam(dm, sign=1){
  const len = Math.hypot(dm.x1-dm.x0, dm.z1-dm.z0), n = Math.ceil(len/4);
  for(let k=0;k<=n;k++){ const x = lerp(dm.x0, dm.x1, k/n), z = lerp(dm.z0, dm.z1, k/n);
    for(const [ox,oz] of [[0,0],[6,0],[-6,0],[0,6],[0,-6]]){ const c = wIdx(x+ox, z+oz); if(c < 0) continue; wwall[c] = sign > 0 ? Math.max(wwall[c], dm.crest - wb[c]) : 0; } }
  const mx = (dm.x0+dm.x1)/2, mz = (dm.z0+dm.z1)/2, nx = -(dm.z1-dm.z0)/len, nz = (dm.x1-dm.x0)/len;
  const A = wIdx(mx+nx*28, mz+nz*28), B = wIdx(mx-nx*28, mz-nz*28);
  if(A >= 0 && B >= 0){ const hA = wb[A]+wd[A], hB = wb[B]+wd[B]; dm.up = hA >= hB ? A : B; dm.dn = hA >= hB ? B : A; } else { dm.up = dm.dn = -1; }
}
