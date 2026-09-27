/* ================= terrain ================= */
// EH (hauteurs aux sommets) est déclaré dans le module de rendu, partagé avec la texture de hauteur.
const tN1 = new Float32Array(NE1*NE1), tN2 = new Float32Array(NE1*NE1), tFor = new Float32Array(NE1*NE1);
const tLock = new Uint8Array(NE1*NE1);          // sommets verrouillés (sous routes et bâtiments)
const RES = { fert:new Float32Array(FN*FN), ore:new Float32Array(FN*FN), oil:new Float32Array(FN*FN), forest:new Float32Array(FN*FN) };
const tGeo = new THREE.BufferGeometry();
const tPos = new Float32Array(NE1*NE1*3), tCol = new Float32Array(NE1*NE1*3), tNrm = new Float32Array(NE1*NE1*3);
{ const idx = new Uint32Array(NE*NE*6); let k = 0;
  for(let j=0;j<NE;j++) for(let i=0;i<NE;i++){ const a=j*NE1+i, b=a+1, c=a+NE1, d=c+1; idx[k++]=a; idx[k++]=c; idx[k++]=b; idx[k++]=c; idx[k++]=d; idx[k++]=b; }
  for(let j=0;j<NE1;j++) for(let i=0;i<NE1;i++){ const v=(j*NE1+i)*3; tPos[v]=i*CELL-EHALF; tPos[v+2]=j*CELL-EHALF; }
  tGeo.setIndex(new THREE.BufferAttribute(idx,1));
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos,3)); tGeo.setAttribute('normal', new THREE.BufferAttribute(tNrm,3)); tGeo.setAttribute('color', new THREE.BufferAttribute(tCol,3));
  tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), EHALF*1.5); }

/* texture des halos lumineux nocturnes (lampadaires) et des quartiers, sur la zone jouable */
const GLOW_N = 480, glowData = new Uint8Array(GLOW_N*GLOW_N*4), glowTex = new THREE.DataTexture(glowData, GLOW_N, GLOW_N);
glowTex.magFilter = glowTex.minFilter = THREE.LinearFilter; glowTex.needsUpdate = true;
const DIST_N = 240, distData = new Uint8Array(DIST_N*DIST_N*4), distTex = new THREE.DataTexture(distData, DIST_N, DIST_N);
distTex.colorSpace = THREE.SRGBColorSpace; distTex.magFilter = distTex.minFilter = THREE.LinearFilter; distTex.needsUpdate = true; U.uDist.value = distTex;
const overData = new Uint8Array(FN*FN*4), overTex = new THREE.DataTexture(overData, FN, FN);
overTex.colorSpace = THREE.SRGBColorSpace; overTex.magFilter = overTex.minFilter = THREE.LinearFilter; overTex.needsUpdate = true; U.uOver.value = overTex;
U.uGlow = { value:glowTex };

const terrainMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.96, envMapIntensity:.35 });
terrainMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying float vUp;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix*vec4(transformed,1.0)).xyz; vUp = normal.y;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vWPos; varying float vUp; uniform float uHalf, uOverOn, uDistOn, uNight, uWet, uSnow; uniform vec4 uBrush, uSeasonW; uniform vec3 uBrushCol;
    uniform sampler2D uOver, uGlow, uDetail, uDist;`)
  .replace('#include <color_fragment>', `#include <color_fragment>
    vec2 cuv = (vWPos.xz + uHalf) / (2.0*uHalf);
    float inside = step(0.0,cuv.x)*step(cuv.x,1.0)*step(0.0,cuv.y)*step(cuv.y,1.0);
    float d1 = texture2D(uDetail, vWPos.xz/6.0).r, d2 = texture2D(uDetail, vWPos.xz/37.0+0.37).r, d3 = texture2D(uDetail, vWPos.xz/211.0+0.71).r;
    diffuseColor.rgb *= 0.7 + 0.2*d1 + 0.22*d2 + 0.18*d3;
    diffuseColor.rgb *= 1.0 - uWet*0.22;
    { vec3 c = diffuseColor.rgb; float gr = clamp((c.g - c.r)*9.0, 0.0, 1.0)*smoothstep(0.55,0.9,vUp); float l = dot(c, vec3(0.3,0.55,0.15));
      c = mix(c, vec3(l*1.35, l*1.02, l*0.42), gr*uSeasonW.w*0.75); c = mix(c, vec3(l*1.12, l*0.98, l*0.78), gr*uSeasonW.x*0.8);
      c = mix(c, c*vec3(0.9,1.12,0.88), gr*uSeasonW.y); c = mix(c, c*vec3(1.1,1.02,0.78), gr*uSeasonW.z*0.45); diffuseColor.rgb = c; }
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9,0.92,0.95)*(0.9+0.1*d1), uSnow*smoothstep(0.55,0.85,vUp));
    vec4 ov = texture2D(uOver, cuv);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.52,0.54,0.52), ov.rgb, ov.a), uOverOn*inside);
    vec4 dc = texture2D(uDist, cuv);
    diffuseColor.rgb = mix(diffuseColor.rgb, dc.rgb, dc.a*uDistOn*inside);
    float bd = length(vWPos.xz - uBrush.xy); float ring = smoothstep(uBrush.z-1.2, uBrush.z-0.2, bd) * (1.0 - smoothstep(uBrush.z+0.2, uBrush.z+1.2, bd));
    diffuseColor.rgb = mix(diffuseColor.rgb, uBrushCol, uBrush.w * (ring*0.9 + (1.0-step(uBrush.z, bd))*0.12));
    diffuseColor.rgb *= mix(0.84, 1.0, inside);`)
  .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= 1.0 - uWet*0.35;')
  .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    totalEmissiveRadiance += vec3(1.0,0.62,0.3) * texture2D(uGlow, cuv).r * uNight * 0.3 * inside;`);
};
terrainMat.customProgramCacheKey = () => 'terrain2';
const terrain = new THREE.Mesh(tGeo, terrainMat); terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

/* ---------- accès aux hauteurs ---------- */
const eIdx = (ei,ej) => ej*NE1+ei;
function heightAt(x,z){
  let gx = (x+EHALF)/CELL, gz = (z+EHALF)/CELL; gx = clamp(gx,0,NE-.001); gz = clamp(gz,0,NE-.001);
  const i = gx|0, j = gz|0, fx = gx-i, fz = gz-j, a = j*NE1+i;
  const h00=EH[a], h10=EH[a+1], h01=EH[a+NE1], h11=EH[a+NE1+1];
  return fx+fz <= 1 ? h00+(h10-h00)*fx+(h01-h00)*fz : h11+(h01-h11)*(1-fx)+(h10-h11)*(1-fz);
}
function slopeAt(x,z){ const hx = heightAt(x+4,z)-heightAt(x-4,z), hz = heightAt(x,z+4)-heightAt(x,z-4); return Math.hypot(hx,hz)/8; }
const inPlay = (x,z,m=0) => x > -HALF+m && x < HALF-m && z > -HALF+m && z < HALF-m;
const fIdx = (x,z) => { const i = Math.floor((x+HALF)/FC), j = Math.floor((z+HALF)/FC); return (i<0||j<0||i>=FN||j>=FN) ? -1 : j*FN+i; };

/* ---------- génération ---------- */
const TC = { mud:col('#3f3f30'), sand:col('#c2b48c'), g1:col('#4c6329'), g2:col('#6b7540'), forest:col('#3b5324'), rock:col('#7a746b'), rock2:col('#58544e'), snow:col('#e8ecef'), dry:col('#8d8a5a'), field:col('#7d7a45') };
const MAP = { coast:null, river:null, hwZ:-150, railZ:230 };
function coastZ(x){ return 610 + 55*Math.sin(x/310 + state.seed%7) + 25*Math.sin(x/97 + state.seed%3); }
function riverX(z){ const ph = (state.seed%997)/997*6.28; return -260 + 170*Math.sin((z+1280)/430 + ph) + 55*Math.sin((z+1280)/150 + ph*2) + (z+1280)*.1; }
function genTerrain(seed){
  const nz = makeNoise(seed);
  for(let ej=0;ej<NE1;ej++) for(let ei=0;ei<NE1;ei++){
    const x = ei*CELL-EHALF, z = ej*CELL-EHALF, u = (x+HALF)/(2*HALF), v = (z+HALF)/(2*HALF);
    const n = nz.fbm(u*3.1+11, v*3.1+7, 5), cz = coastZ(x);
    let h = 5 + n*5 + Math.max(0, nz.fbm(u*1.6+3, v*1.6+9, 4))*16*smooth(.2,.9,Math.abs(u-.5)*2);
    h += smooth(200, -700, z)*9;                                  // le nord est plus haut
    h += smooth(350, 900, x)*Math.max(0, nz.fbm(u*3+40, v*3+40, 4))*38; // collines à l'est
    // montagnes dans la marge (sauf vers la mer)
    const d = Math.max(Math.abs(x), Math.abs(z))/HALF, mnt = smooth(.92, 1.25, d) * smooth(cz-60, cz-260, z);
    h += mnt*(70 + 120*Math.abs(nz.fbm(u*4.5+20, v*4.5+20, 5)));
    // corridors des connexions extérieures (autoroute à l'est, voie ferrée à l'ouest)
    const hw = smooth(60, 22, Math.abs(z-MAP.hwZ)) * smooth(760, 940, x), rw = smooth(50, 20, Math.abs(z-MAP.railZ)) * smooth(-760, -940, x);
    h = lerp(h, 9 + (x-900)*.004, hw); h = lerp(h, 7, rw);
    // littoral
    if(z > cz - 80){ const t = (z - cz); h = lerp(h, Math.min(h, 2.2 - t*.09), smooth(-80, 10, t)); if(t > 0) h = Math.min(h, 1.2 - t*.11); h = Math.max(h, -26); }
    // rivière
    const dr = Math.abs(x - riverX(z)), w = 22 + 8*nz.n2(v*5, 1.3) + smooth(-600, 600, z)*10;
    const carve = 1 - smooth(w*.55, w*1.6, dr), valley = 1 - smooth(w*1.5, w*6, dr);
    h = lerp(h, Math.min(h, 3 + (z+1280)*-.002), valley*.35); h = h*(1-carve) - 4.2*carve;
    // lac
    const ld = Math.hypot(x+600, z+260) + nz.n2(u*9,v*9)*50, lake = 1 - smooth(70, 150, ld); h = h*(1-lake) - 4.5*lake;
    const k = ej*NE1+ei; EH[k] = h;
    tN1[k] = nz.fbm(u*9+40, v*9+40, 3); tN2[k] = nz.fbm(u*25, v*25, 2);
    tFor[k] = smooth(.02, .3, nz.fbm(u*5.5+70, v*5.5+70, 4)) * smooth(1.5, 3, h);
  }
  // ressources naturelles
  for(let j=0;j<FN;j++) for(let i=0;i<FN;i++){ const x = -HALF+(i+.5)*FC, z = -HALF+(j+.5)*FC, u = (x+HALF)/(2*HALF), v = (z+HALF)/(2*HALF), c = j*FN+i, h = heightAt(x,z);
    RES.fert[c] = h > 1.2 ? clamp(smooth(.25,.05,slopeAt(x,z)) * (.4 + .6*smooth(.1,.5,nz.fbm(u*4+90, v*4+90, 3)+.3)) * smooth(40, 8, h), 0, 1) : 0;
    RES.ore[c] = h > 1.5 ? smooth(.12, .35, nz.fbm(u*6+130, v*6+130, 3)) * (.3 + .7*smooth(200, 700, x)) : 0;
    RES.oil[c] = h > 1.2 ? smooth(.18, .4, nz.fbm(u*5+170, v*5+170, 3)) * smooth(300, -300, x) : 0;
    const ei = Math.round((x+EHALF)/CELL), ej = Math.round((z+EHALF)/CELL); RES.forest[c] = tFor[eIdx(ei,ej)]; }
  tLock.fill(0);
}
function vertexColor(k, out){
  const h = EH[k], ei = k%NE1, ej = (k/NE1)|0;
  const hx = EH[ej*NE1+Math.min(ei+1,NE)] - EH[ej*NE1+Math.max(ei-1,0)], hz = EH[Math.min(ej+1,NE)*NE1+ei] - EH[Math.max(ej-1,0)*NE1+ei];
  const slope = Math.hypot(hx,hz)/(2*CELL);
  out.copy(TC.g1).lerp(TC.g2, clamp(tN1[k]*.9+.5,0,1)).lerp(TC.dry, clamp(tN2[k]*.8,0,1)*.4).lerp(TC.forest, tFor[k]*.6);
  if(h < 2.2) out.lerp(TC.sand, smooth(2.2,.8,h));
  if(h < -.3) out.lerp(TC.mud, smooth(-.3,-3,h));
  const rk = smooth(.45,.8,slope); if(rk > 0){ _c2.copy(TC.rock).lerp(TC.rock2, clamp(tN2[k]+.5,0,1)); out.lerp(_c2, rk); }
  if(h > 110) out.lerp(TC.snow, smooth(110,150,h)*smooth(1.1,.55,slope));
  return out;
}
function updateTerrainRegion(ei0=0, ej0=0, ei1=NE, ej1=NE){
  ei0 = clamp(ei0-1,0,NE); ej0 = clamp(ej0-1,0,NE); ei1 = clamp(ei1+1,0,NE); ej1 = clamp(ej1+1,0,NE);
  for(let ej=ej0;ej<=ej1;ej++) for(let ei=ei0;ei<=ei1;ei++){
    const k = ej*NE1+ei; tPos[k*3+1] = EH[k];
    const hx = (EH[ej*NE1+Math.min(ei+1,NE)] - EH[ej*NE1+Math.max(ei-1,0)])/(2*CELL), hz = (EH[Math.min(ej+1,NE)*NE1+ei] - EH[Math.max(ej-1,0)*NE1+ei])/(2*CELL);
    const l = Math.hypot(hx,1,hz); tNrm[k*3] = -hx/l; tNrm[k*3+1] = 1/l; tNrm[k*3+2] = -hz/l;
    vertexColor(k, _c); tCol[k*3] = _c.r; tCol[k*3+1] = _c.g; tCol[k*3+2] = _c.b; }
  for(const name of ['position','normal','color']){ const a = tGeo.getAttribute(name); a.clearUpdateRanges(); a.addUpdateRange(ej0*NE1*3, (ej1-ej0+1)*NE1*3); a.needsUpdate = true; }
  hTex.needsUpdate = true;
  bus.emit('terrain', ei0, ej0, ei1, ej1);
}

/* ---------- terraformation ---------- */
const TERRA = { tool:'raise', size:32, strength:.5, target:null };
function terraform(x, z, dt){
  const R = TERRA.size, S = TERRA.strength*dt*6, ei0 = Math.floor((x-R+EHALF)/CELL), ej0 = Math.floor((z-R+EHALF)/CELL), ei1 = Math.ceil((x+R+EHALF)/CELL), ej1 = Math.ceil((z+R+EHALF)/CELL);
  let vol = 0; const lim = (HALF+CELL)/CELL;
  for(let ej=Math.max(0,ej0);ej<=Math.min(NE,ej1);ej++) for(let ei=Math.max(0,ei0);ei<=Math.min(NE,ei1);ei++){
    const vx = ei*CELL-EHALF, vz = ej*CELL-EHALF; if(!inPlay(vx,vz,-CELL)) continue; const k = ej*NE1+ei; if(tLock[k]) continue;
    const d = Math.hypot(vx-x, vz-z); if(d > R) continue; const f = smooth(R, R*.35, d); let nh = EH[k];
    if(TERRA.tool === 'raise') nh += S*f; else if(TERRA.tool === 'lower') nh -= S*f;
    else if(TERRA.tool === 'level' && TERRA.target !== null) nh = lerp(nh, TERRA.target, Math.min(1, S*f*.25));
    else if(TERRA.tool === 'soften'){ let s = 0, n = 0; for(let b=-1;b<=1;b++) for(let a=-1;a<=1;a++){ const kk = (clamp(ej+b,0,NE))*NE1+clamp(ei+a,0,NE); s += EH[kk]; n++; } nh = lerp(nh, s/n, Math.min(1, f*dt*4)); }
    nh = clamp(nh, -30, 220); vol += Math.abs(nh-EH[k])*CELL*CELL; EH[k] = nh; }
  if(vol > 0){ updateTerrainRegion(ei0, ej0, ei1, ej1); }
  return vol;
}

/* ---------- arbres ---------- */
const TREES = { D:new Pool(TREE_D, MAT.tree, 16384), C:new Pool(TREE_C, MAT.treeEver, 16384), P:new Pool(TREE_P, MAT.tree, 4096) };
const treeGrid = new Map(); // cellule de 32 m -> liste d'arbres
const tKey = (x,z) => (Math.floor((x+EHALF)/32))*200 + Math.floor((z+EHALF)/32);
function addTree(x, z, h, type, r=rnd, reg=true){
  const y = heightAt(x,z) - .2, s = h*(.8+r()*.4), sx = s*(type==='C'?.85:type==='P'?.55:1.05), rot = r()*6.28;
  _c.setRGB(.8+r()*.35, .82+r()*.3, .75+r()*.3);
  const hd = place(TREES[type], x, y, z, sx, s, sx, rot, _c); if(!hd) return null;
  const t = { h:hd, x, z, s, sx, rot, type };
  if(reg){ const k = tKey(x,z); let l = treeGrid.get(k); if(!l) treeGrid.set(k, l = []); l.push(t); }
  return t;
}
function removeTrees(test, x0, z0, x1, z1){ // retire les arbres satisfaisant test(x,z) dans la boîte
  let n = 0;
  for(let gx=Math.floor((x0+EHALF)/32); gx<=Math.floor((x1+EHALF)/32); gx++) for(let gz=Math.floor((z0+EHALF)/32); gz<=Math.floor((z1+EHALF)/32); gz++){
    const k = gx*200+gz, l = treeGrid.get(k); if(!l) continue;
    for(let q=l.length-1;q>=0;q--){ const t = l[q]; if(test(t.x, t.z)){ t.h.pool.remove(t.h); l[q] = l[l.length-1]; l.pop(); n++; } }
    if(!l.length) treeGrid.delete(k); }
  return n; }
function reheightTrees(x0, z0, x1, z1){
  for(let gx=Math.floor((x0+EHALF)/32); gx<=Math.floor((x1+EHALF)/32); gx++) for(let gz=Math.floor((z0+EHALF)/32); gz<=Math.floor((z1+EHALF)/32); gz++){
    const l = treeGrid.get(gx*200+gz); if(!l) continue;
    for(const t of l){ _q.setFromAxisAngle(UP, t.rot); _m.compose(_p.set(t.x, heightAt(t.x,t.z)-.2, t.z), _q, _s.set(t.sx, t.s, t.sx)); t.h.pool.setMatrix(t.h, _m); } } }
bus.on('terrain', (ei0, ej0, ei1, ej1) => reheightTrees(ei0*CELL-EHALF, ej0*CELL-EHALF, ei1*CELL-EHALF, ej1*CELL-EHALF));
function genTrees(dens){
  const r = mulberry32(state.seed*3+1);
  for(let ej=0;ej<NE;ej++) for(let ei=0;ei<NE;ei++){
    const k = ej*NE1+ei, x0 = ei*CELL-EHALF, z0 = ej*CELL-EHALF; const dd = Math.max(Math.abs(x0), Math.abs(z0))/HALF; if(dd > 1.3) continue;
    const f = tFor[k]; let cnt = f*(dd > 1 ? .9 : 1.4)*dens; if(r() < .02*dens) cnt += 1; const n = Math.floor(cnt + r()); if(!n) continue;
    for(let t=0;t<n;t++){ const x = x0+r()*CELL, z = z0+r()*CELL, h = heightAt(x,z); if(h < 1.4 || h > 135) continue; if(slopeAt(x,z) > .9) continue;
      const type = h > 40 ? (r() < .85 ? 'C' : 'D') : (r() < .22 + tN2[k]*.4 ? 'C' : r() < .06 ? 'P' : 'D');
      addTree(x, z, type === 'C' ? 10+r()*9 : type === 'P' ? 12+r()*6 : 8+r()*7, type, r); } }
}
