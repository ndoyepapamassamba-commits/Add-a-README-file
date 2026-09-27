/* ================= catastrophes naturelles ================= */
const DIS = { list:[], shake:0, dead:0, ruined:0 }; const DIS_R = { meteor:90, quake:500, tornado:30, tsunami:0 };
const DIS_N = { meteor:'Météorite', quake:'Séisme', tornado:'Tornade', tsunami:'Tsunami' };
const meteorMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(8, 1), new THREE.MeshBasicMaterial({ color:new THREE.Color(4, 2.2, .8) })); meteorMesh.visible = false; scene.add(meteorMesh);
const tornadoMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{ uTime:U.uTime, uLight:{ value:1 } },
  vertexShader:`uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; float a = uTime*3.0 + p.y*0.05; float h = p.y/260.0;
    p.x += sin(uTime*0.7 + h*4.0)*h*h*30.0; p.z += cos(uTime*0.6 + h*3.0)*h*h*24.0; float ca = cos(a), sa = sin(a); p.xz = mat2(ca, -sa, sa, ca)*p.xz;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0); }`,
  fragmentShader:`uniform float uTime, uLight; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){ float s = n(vec2(vUv.x*14.0 + vUv.y*6.0 - uTime*2.5, vUv.y*5.0 - uTime*0.8)) * 0.7 + n(vec2(vUv.x*40.0, vUv.y*16.0 - uTime*3.0))*0.3;
      float a = smoothstep(0.25, 0.8, s) * (0.35 + 0.45*(1.0-vUv.y)) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
      gl_FragColor = vec4(vec3(0.36, 0.33, 0.3)*uLight*(0.7+0.3*s), a); }` });
const tornadoMesh = new THREE.Mesh(new THREE.CylinderGeometry(55, 7, 260, 32, 16, true).translate(0, 130, 0), tornadoMat); tornadoMesh.visible = false; tornadoMesh.renderOrder = 4; scene.add(tornadoMesh);

function dust(x, y, z, R, n, shade=.55){ for(let k=0;k<n;k++){ const a = rnd()*6.28, r = rnd()*R; spawnParticle(x + Math.cos(a)*r, y + rnd()*4, z + Math.sin(a)*r, (rnd()-.5)*3, 1 + rnd()*3, (rnd()-.5)*3, 6 + rnd()*6, 8 + rnd()*10, shade); } }
function ruin(b, kill){ // un bâtiment est détruit : ruines, victimes et habitants délogés
  if(!buildings.has(b.id) || b.burned || b.dam) return; let dead = 0;
  for(const i of b.res.slice()){ if(rnd() < kill) dead++; removeCim(i); }
  for(const i of b.work.slice()) CZ.work[i] = 0; b.work.length = 0; b.jl = [0,0,0,0]; if(b.fire){ b.fire = null; fires.delete(b); }
  b.burned = true; b.ruinT = 0; buildModel(b); dust(b.x, b.y, b.z, Math.max(b.hw, b.hd), 6); DIS.dead += dead; DIS.ruined++; covDirty = true; }
function bldsNear(x, z, R){ const out = []; for(const b of buildings.values()) if(!b.burned && dist2(b.x, b.z, x, z) < (R + Math.max(b.hw, b.hd))**2) out.push(b); return out; }

function startDisaster(type, x, z){
  if(type === 'tsunami'){ x = 0; z = coastZ(0) + 200; }
  const e = { type, x, z, t:0, warn:type === 'meteor' ? 0 : 6, dur:{ meteor:9, quake:14, tornado:70, tsunami:150 }[type], done:false };
  if(type === 'tornado'){ const a = rnd()*6.28; e.vx = Math.cos(a)*9; e.vz = Math.sin(a)*9; }
  if(type === 'meteor'){ const a = rnd()*6.28; e.sx = x + Math.cos(a)*900; e.sz = z + Math.sin(a)*900; }
  e.r0 = DIS.ruined; e.d0 = DIS.dead; DIS.list.push(e); state.disLast = state.time;
  toast(`Alerte : ${DIS_N[type].toLowerCase()} ${type === 'tsunami' ? 'en approche depuis la mer' : 'imminent' + (type === 'tornado' ? 'e' : '')} !`); feed('Protection civile', `Alerte ${DIS_N[type].toLowerCase()} : mettez-vous à l'abri.`);
  audioThunder(); return e; }

function updateDisasters(dt){ // dt : secondes de simulation
  if(!dt) return;
  if(state.disAuto && state.time > (state.disNext ??= state.time + DAY*16)){ state.disNext = state.time + DAY*(18 + rnd()*22);
    const bl = bldArr.filter(b => b.kind === 'zone'); if(bl.length > 40){ const t = pick(['meteor','quake','tornado','tornado','tsunami'], rnd), b = pick(bl, rnd); startDisaster(t, b.x + (rnd()-.5)*200, b.z + (rnd()-.5)*200); } }
  meteorMesh.visible = false; tornadoMesh.visible = false;
  for(const e of DIS.list){ e.t += dt; const T = e.t - e.warn; if(T < 0) continue;
    if(e.type === 'meteor'){ const f = Math.min(1, T/6), gy = heightAt(e.x, e.z);
      if(f < 1){ const x = lerp(e.sx, e.x, f), z = lerp(e.sz, e.z, f), y = lerp(1400, gy, f); meteorMesh.visible = true; meteorMesh.position.set(x, y, z); meteorMesh.rotation.x += dt*2;
        for(let k=0;k<4;k++) spawnParticle(x + (rnd()-.5)*8, y + (rnd()-.5)*8, z + (rnd()-.5)*8, 0, 0, 0, 1.5 + rnd(), 14 + rnd()*10, .5, 1); spawnParticle(x, y, z, 0, 0, 0, 12, 22, .3); }
      else if(!e.hit){ e.hit = true; DIS.shake = 3; flash.intensity = 9; audioThunder(); audioThunder();
        const tool = TERRA.tool, size = TERRA.size, str = TERRA.strength; for(const b of bldsNear(e.x, e.z, 70)) ruin(b, .45);
        for(const sg of [...segs.values()]){ if(!segs.has(sg.id)) continue; for(let i=0;i<=sg.n;i+=2) if(dist2(sg.P[i*3], sg.P[i*3+2], e.x, e.z) < 40*40){ removeSeg(sg); break; } }
        TERRA.tool = 'lower'; TERRA.size = 60; TERRA.strength = 3; for(let k=0;k<8;k++) terraform(e.x, e.z, .5); TERRA.tool = 'raise'; TERRA.size = 90; TERRA.strength = .35; terraform(e.x, e.z, .5);
        TERRA.tool = tool; TERRA.size = size; TERRA.strength = str; removeTrees((x, z) => dist2(x, z, e.x, e.z) < 110*110, e.x-110, e.z-110, e.x+110, e.z+110);
        for(const b of bldsNear(e.x, e.z, 170)) if(!b.burned && !b.fire && rnd() < .35){ b.fire = { t:0, hp:100 }; addFire(b); queueReq('fire', b); }
        for(let k=0;k<60;k++){ const a = rnd()*6.28, s = 8 + rnd()*30; spawnParticle(e.x, gy + 4, e.z, Math.cos(a)*s, 6 + rnd()*20, Math.sin(a)*s, 2 + rnd()*2, 16 + rnd()*14, .6, 1); }
        dust(e.x, gy, e.z, 80, 80, .35); e.done = true; } }
    if(e.type === 'quake'){ const k = Math.sin(Math.min(1, T/e.dur)*Math.PI); DIS.shake = Math.max(DIS.shake, 2.4*k);
      if(!e.list) e.list = bldsNear(e.x, e.z, 500).map(b => ({ b, at:rnd()*e.dur*.8, p:clamp(.08 + (b.top||10)/180 - (b.level||1)*.015, .05, .55)*(1 - Math.hypot(b.x-e.x, b.z-e.z)/650) }));
      for(const q of e.list) if(!q.done && T > q.at){ q.done = true; if(rnd() < q.p) ruin(q.b, .15); }
      if(rnd() < dt*3) dust(e.x + (rnd()-.5)*700, heightAt(e.x, e.z), e.z + (rnd()-.5)*700, 30, 6);
      if(T > e.dur) e.done = true; }
    if(e.type === 'tornado'){ e.vx += (rnd()-.5)*dt*4; e.vz += (rnd()-.5)*dt*4; const sp = Math.hypot(e.vx, e.vz); if(sp > 12){ e.vx *= 12/sp; e.vz *= 12/sp; }
      e.x += e.vx*dt; e.z += e.vz*dt; const gy = heightAt(e.x, e.z); const f = smooth(0, 5, T)*smooth(e.dur, e.dur - 8, T);
      tornadoMesh.visible = true; tornadoMesh.position.set(e.x, Math.max(gy, SEA), e.z); tornadoMesh.scale.set(f, .3 + .7*f, f); tornadoMat.uniforms.uLight.value = lerp(.25, 1, 1 - U.uNight.value);
      if(f > .6){ for(const b of bldsNear(e.x, e.z, 22)) if(rnd() < dt*2.5) ruin(b, .1); removeTrees((x, z) => dist2(x, z, e.x, e.z) < 26*26, e.x-26, e.z-26, e.x+26, e.z+26); }
      for(let k=0;k<3;k++){ const a = rnd()*6.28, r = 12 + rnd()*30; spawnParticle(e.x + Math.cos(a)*r, gy + rnd()*6, e.z + Math.sin(a)*r, -Math.sin(a)*14, 6 + rnd()*10, Math.cos(a)*14, 3 + rnd()*3, 10 + rnd()*8, .45); }
      DIS.shake = Math.max(DIS.shake, .25*f); if(T > e.dur || Math.abs(e.x) > HALF + 200 || Math.abs(e.z) > HALF + 200) e.done = true; }
    if(e.type === 'tsunami'){ // la mer se retire, puis une vague déferle et reflue
      WATER.surge = T < 25 ? -4*smooth(0, 25, T) : T < 60 ? lerp(-4, 11, smooth(25, 45, T)) : 11*smooth(e.dur, 60, T);
      if(T > 40 && (e.chk = (e.chk||0) + dt) > 2){ e.chk = 0; for(const b of bldArr) if(!b.burned && b.kind === 'zone' && waterDepthAt(b.x, b.z) > 2.2 && heightAt(b.x, b.z) < waterSurfAt(b.x, b.z) - 2 && rnd() < .25) ruin(b, .2); }
      if(T > e.dur){ WATER.surge = 0; e.done = true; } } }
  for(let i=DIS.list.length-1;i>=0;i--) if(DIS.list[i].done){ const e = DIS.list.splice(i, 1)[0], nr = DIS.ruined - e.r0, nd = DIS.dead - e.d0;
    const msg = `${DIS_N[e.type]} terminé${e.type === 'meteor' ? 'e' : ''}${e.type === 'tornado' ? 'e' : ''} : ${nr} bâtiment${nr > 1 ? 's' : ''} détruit${nr > 1 ? 's' : ''}, ${nd} victime${nd > 1 ? 's' : ''}.`;
    toast(msg); feed('Protection civile', msg); }
  DIS.shake = Math.max(0, DIS.shake - dt*.8);
}
const shakeV = new THREE.Vector3();
function shakeOffset(){ const s = DIS.shake; if(s <= 0) return shakeV.set(0,0,0); const t = U.uTime.value*40; return shakeV.set(Math.sin(t*1.3)*s, Math.sin(t*1.7+1)*s*.6, Math.cos(t*1.1)*s); }
