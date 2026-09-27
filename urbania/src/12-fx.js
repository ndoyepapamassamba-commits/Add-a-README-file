/* ================= météo ================= */
const WEATHER = { clear:{ n:'Ensoleillé', cloud:.12, rain:0, snow:0, fog:0 }, cloudy:{ n:'Nuageux', cloud:.62, rain:0, snow:0, fog:.1 }, rain:{ n:'Pluie', cloud:.86, rain:1, snow:0, fog:.25 },
  storm:{ n:'Orage', cloud:1, rain:1.5, snow:0, fog:.3 }, fog:{ n:'Brouillard', cloud:.4, rain:0, snow:0, fog:1 }, snow:{ n:'Neige', cloud:.8, rain:0, snow:1, fog:.35 } };
const weather = { kind:'clear', cloud:.12, rain:0, snow:0, fog:0, next:600, flashT:0 };
const SEASON_W = [ { clear:.28, cloudy:.27, snow:.3, fog:.15 }, { clear:.4, cloudy:.25, rain:.25, storm:.05, fog:.05 }, { clear:.6, cloudy:.13, rain:.1, storm:.17 }, { clear:.25, cloudy:.3, rain:.3, storm:.05, fog:.1 } ];
const SW = [0,0,1,0];
function pickWeather(){ const t = SEASON_W[seasonIdx()]; let r = rnd(); for(const k in t){ r -= t[k]; if(r <= 0) return k; } return 'clear'; }
function temperature(){ const h = hourOf(); return SW[0]*1 + SW[1]*13 + SW[2]*26 + SW[3]*12 + 4*Math.sin((h-9)/24*Math.PI*2) - weather.rain*2 - weather.snow*2; }
function updateWeather(dt, gdt){
  seasonWeights(SW); U.uSeasonW.value.set(SW[0], SW[1], SW[2], SW[3]);
  if(state.weatherMode === 'auto'){ weather.next -= gdt; if(weather.next <= 0){ weather.kind = pickWeather(); weather.next = 240 + rnd()*600; } } else weather.kind = state.weatherMode;
  const T = WEATHER[weather.kind], k = Math.min(1, dt*.08);
  weather.cloud = lerp(weather.cloud, T.cloud, k); weather.rain = lerp(weather.rain, T.rain, k); weather.snow = lerp(weather.snow, T.snow, k); weather.fog = lerp(weather.fog, T.fog, k);
  U.uWet.value = weather.rain > .15 ? Math.min(1, U.uWet.value + dt*.05) : Math.max(0, U.uWet.value - dt*.012);
  U.uSnow.value = weather.snow > .2 ? Math.min(1, U.uSnow.value + dt*.02*(gdt ? 1 : 0)+dt*.004) : Math.max(0, U.uSnow.value - dt*(SW[0] > .5 && weather.kind !== 'rain' ? .0008 : .006)*(gdt ? 1 : .3));
  WATER.rain = weather.rain;
  cloudMat.uniforms.uCover.value = weather.cloud*.75 + .12;
  if(weather.kind === 'storm'){ weather.flashT -= dt; if(weather.flashT <= 0){ weather.flashT = 4 + rnd()*12; flash.intensity = 6; setTimeout(() => audioThunder(), 400 + rnd()*2500); } }
  flash.intensity = Math.max(0, flash.intensity - dt*25);
  updatePrecip(dt);
}
/* pluie et neige autour de la caméra */
const RN = 7000, rainPos = new Float32Array(RN*6), rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos,3).setUsage(THREE.DynamicDrawUsage));
const rainMat = new THREE.LineBasicMaterial({ color:0xaebccb, transparent:true, opacity:0, depthWrite:false }); const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);
const SN = 6000, snowPos = new Float32Array(SN*3), snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos,3).setUsage(THREE.DynamicDrawUsage));
const snowMat = new THREE.PointsMaterial({ color:0xffffff, size:.45, transparent:true, opacity:0, depthWrite:false }); const snow = new THREE.Points(snowGeo, snowMat); snow.frustumCulled = false; scene.add(snow);
for(let i=0;i<RN;i++){ rainPos[i*6] = (rnd()-.5)*400; rainPos[i*6+1] = rnd()*260; rainPos[i*6+2] = (rnd()-.5)*400; }
for(let i=0;i<SN;i++){ snowPos[i*3] = (rnd()-.5)*300; snowPos[i*3+1] = rnd()*200; snowPos[i*3+2] = (rnd()-.5)*300; }
const precipC = new THREE.Vector3();
function updatePrecip(dt){
  const t = controls.target, h = Math.min(camera.position.distanceTo(t), 700); precipC.set(t.x, t.y, t.z).lerp(camera.position, .45);
  rain.visible = weather.rain > .02; snow.visible = weather.snow > .02;
  if(rain.visible){ rainMat.opacity = Math.min(.55, weather.rain*.45); const n = Math.floor(RN*Math.min(1, weather.rain)); rainGeo.setDrawRange(0, n*2); const W = 3 + (weather.kind === 'storm' ? 6 : 0);
    for(let i=0;i<n;i++){ let x = rainPos[i*6], y = rainPos[i*6+1] - dt*30, z = rainPos[i*6+2]; if(y < -20){ y += 280; x = (rnd()-.5)*400; z = (rnd()-.5)*400; }
      rainPos[i*6] = x; rainPos[i*6+1] = y; rainPos[i*6+2] = z; rainPos[i*6+3] = x - W*.08; rainPos[i*6+4] = y + 1.6; rainPos[i*6+5] = z; }
    rain.position.set(precipC.x, precipC.y - 60, precipC.z); rainGeo.attributes.position.needsUpdate = true; }
  if(snow.visible){ snowMat.opacity = Math.min(.9, weather.snow); const tt = U.uTime.value;
    for(let i=0;i<SN;i++){ let y = snowPos[i*3+1] - dt*(1.5 + (i%7)*.15); if(y < -20) y += 220; snowPos[i*3+1] = y; snowPos[i*3] += Math.sin(tt*.8 + i)*dt*.6; snowPos[i*3+2] += Math.cos(tt*.7 + i*1.3)*dt*.6; }
    snow.position.set(precipC.x, precipC.y - 50, precipC.z); snowGeo.attributes.position.needsUpdate = true; }
}

/* ================= particules : fumées et flammes ================= */
const SM = 3000, smPos = new Float32Array(SM*3), smInfo = new Float32Array(SM*4), smV = new Float32Array(SM*3), smAge = new Float32Array(SM), smLife = new Float32Array(SM), smSize = new Float32Array(SM); let smN = 0;
const smGeo = new THREE.BufferGeometry(); smGeo.setAttribute('position', new THREE.BufferAttribute(smPos,3).setUsage(THREE.DynamicDrawUsage)); smGeo.setAttribute('aInfo', new THREE.BufferAttribute(smInfo,4).setUsage(THREE.DynamicDrawUsage));
const smMat = new THREE.ShaderMaterial({ uniforms:{ uScale:{value:500}, uLight:{value:1} }, transparent:true, depthWrite:false,
  vertexShader:`attribute vec4 aInfo; uniform float uScale; varying vec3 vI; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aInfo.y*uScale/-mv.z; vI = aInfo.xzw; }`,
  fragmentShader:`uniform float uLight; varying vec3 vI; void main(){ vec2 p = gl_PointCoord-0.5; float d = length(p); if(d > 0.5) discard; float a = smoothstep(0.5, 0.05, d)*vI.x;
    vec3 c = vI.z > 0.5 ? mix(vec3(1.0,0.85,0.35), vec3(1.0,0.3,0.05), vI.y)*2.5 : vec3(vI.y)*uLight; gl_FragColor = vec4(c, a); }` });
const smoke = new THREE.Points(smGeo, smMat); smoke.frustumCulled = false; smoke.renderOrder = 3; scene.add(smoke);
let emitters = [], emitDirty = true;
function spawnParticle(x, y, z, vx, vy, vz, life, size, shade, fire=0){ if(smN >= SM) return; const i = smN++; smPos[i*3]=x; smPos[i*3+1]=y; smPos[i*3+2]=z; smV[i*3]=vx; smV[i*3+1]=vy; smV[i*3+2]=vz; smAge[i]=0; smLife[i]=life; smSize[i]=size; smInfo[i*4+2]=shade; smInfo[i*4+3]=fire; }
function emitFire(b){ const r = Math.max(b.hw, b.hd)*.6; for(let k=0;k<3;k++) spawnParticle(b.x+(rnd()-.5)*r, b.y + rnd()*(b.top*.6), b.z+(rnd()-.5)*r, (rnd()-.5), 3+rnd()*3, (rnd()-.5), 1.2+rnd(), 5+rnd()*4, rnd()*.6, 1);
  spawnParticle(b.x, b.y + b.top*.7, b.z, 1, 4, 0, 10, 10, .18); }
function updateSmoke(dt){
  if(emitDirty){ emitters = []; for(const b of buildings.values()) if(!b.abandoned) for(const e of b.emit) emitters.push(e); emitDirty = false; }
  const wind = 1.2 + (weather.kind === 'storm' ? 3 : 0);
  for(const e of emitters){ e.acc += dt*e.rate; while(e.acc >= 1 && smN < SM){ e.acc -= 1; spawnParticle(e.x+(rnd()-.5), e.y, e.z+(rnd()-.5), wind+rnd()*.8, (e.big ? 3.5 : 2.2)+rnd(), .4*(rnd()-.5), (e.big ? 9 : 7)+rnd()*3, e.big ? 9 : 3.5, e.shade); } if(e.acc > 1) e.acc = 1; }
  for(let i=smN-1;i>=0;i--){ smAge[i] += dt; if(smAge[i] >= smLife[i]){ const l = --smN; smPos.copyWithin(i*3,l*3,l*3+3); smV.copyWithin(i*3,l*3,l*3+3); smInfo.copyWithin(i*4,l*4,l*4+4); smAge[i]=smAge[l]; smLife[i]=smLife[l]; smSize[i]=smSize[l]; continue; }
    const f = smAge[i]/smLife[i], fire = smInfo[i*4+3] > .5; smV[i*3+1] *= (1-dt*.25); smPos[i*3] += smV[i*3]*dt; smPos[i*3+1] += smV[i*3+1]*dt; smPos[i*3+2] += smV[i*3+2]*dt;
    smInfo[i*4] = Math.min(1, smAge[i]*(fire ? 6 : 2))*(1-f)*(fire ? .9 : .42); smInfo[i*4+1] = fire ? smSize[i]*(1-f*.5) : smSize[i]*(1+f*3.2); if(fire) smInfo[i*4+2] = f; }
  smGeo.setDrawRange(0, smN); smGeo.attributes.position.needsUpdate = true; smGeo.attributes.aInfo.needsUpdate = true;
}

/* ================= soleil, ciel, cycle jour/nuit ================= */
const sunDir = new THREE.Vector3(), lightDir = new THREE.Vector3(), fogDay = col('#b9c7d3'), fogGold = col('#d6a57c'), fogNight = col('#0a1018'), fogGrey = col('#8f99a3'), hemiDay = col('#c3d6f0'), hemiNight = col('#26324a');
let bloom = null;
function updateSun(){
  const rise = 6 + 1.4*SW[0] - 1.2*SW[2], span = 24 - 2*rise, maxE = 50 - 20*SW[0] + 18*SW[2] + 4*(SW[1]+SW[3]);
  const hr = state.dayCycle ? hourOf() : 13.5, elev = maxE*Math.sin((hr-rise)/span*Math.PI), theta = Math.PI*.5 - (hr-rise)/span*Math.PI + .35;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90-elev), theta); su.sunPosition.value.copy(sunDir);
  su.turbidity.value = 4.5 + weather.cloud*6; su.rayleigh.value = 1.25 + weather.cloud*1.2;
  const day = smooth(-3,10,elev), night = smooth(5,-5,elev), gold = smooth(-2,4,elev)*smooth(24,6,elev), cl = 1 - weather.cloud*.62;
  U.uNight.value = Math.max(night, weather.cloud > .8 ? .25*(1-night) : 0);
  if(elev > -1.5){ lightDir.copy(sunDir); sun.color.setRGB(1, lerp(.58,.97,smooth(0,28,elev)), lerp(.34,.92,smooth(0,34,elev))); sun.intensity = 3.3*smooth(-1.5,9,elev)*cl; }
  else { lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), theta+Math.PI); sun.color.setRGB(.55,.66,1); sun.intensity = .4*smooth(-1.5,-9,elev)*cl; }
  hemi.color.copy(hemiNight).lerp(hemiDay, day); hemi.intensity = lerp(.55, .3 + weather.cloud*.35, day);
  scene.fog.color.copy(fogNight).lerp(fogDay, day).lerp(fogGold, gold*.55*cl).lerp(fogGrey, weather.cloud*.6*day);
  scene.fog.density = .00017 + weather.fog*.0011 + weather.rain*.00022 + weather.snow*.0003;
  cloudMat.uniforms.uLight.value.copy(sun.color).multiplyScalar(lerp(.12, 1, day)); cloudMat.uniforms.uDark.value.copy(scene.fog.color).multiplyScalar(.75);
  starMat.opacity = night*.9*(1-weather.cloud);
  renderer.toneMappingExposure = lerp(.95, .72, day);
  if(bloom){ bloom.strength = .08 + .32*night; bloom.threshold = lerp(3.2, 1.15, night); bloom.radius = .35; }
  U.uLitMul.value = hr >= 17 && hr < 23.5 ? .72 : hr >= 23.5 || hr < 5 ? .32 : hr < 8 ? .5 : .45;
  const L = lerp(.65, 4.5, night); MAT.lampHead.color.setRGB(L, L*.78, L*.52);
  const cl2 = lerp(1.2, 4, night); MAT.vlight.color.setRGB(cl2, cl2, cl2);
  smMat.uniforms.uLight.value = lerp(.08, .95, day);
  const key = Math.round(elev/2.5)+':'+Math.round(weather.cloud*8); if(key !== lastEnvKey){ lastEnvKey = key; updateEnv(); }
}
const _sr = new THREE.Vector3(), _su2 = new THREE.Vector3();
function updateShadow(){
  const tgt = controls.target, dist = camera.position.distanceTo(tgt);
  const S = Math.pow(1.25, Math.round(Math.log(clamp(dist*.8, 60, 700))/Math.log(1.25))); const cam = sun.shadow.camera;
  if(cam.right !== S){ cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S; cam.updateProjectionMatrix(); }
  const texel = 2*S/sun.shadow.mapSize.x, right = _sr.crossVectors(UP, lightDir).normalize(), up2 = _su2.crossVectors(lightDir, right);
  const tx = tgt.dot(right), ty = tgt.dot(up2), stx = Math.round(tx/texel)*texel, sty = Math.round(ty/texel)*texel;
  sun.target.position.copy(tgt).addScaledVector(right, stx-tx).addScaledVector(up2, sty-ty); sun.position.copy(sun.target.position).addScaledVector(lightDir, 1400);
}

/* ================= audio procédural ================= */
const AUDIO = { ctx:null, on:false, master:null, amb:null, radio:null, vol:{ master:.7, amb:.7, radio:.45 } };
function noiseBuffer(ctx, type){ const len = ctx.sampleRate*3, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); let last = 0;
  for(let i=0;i<len;i++){ const w = Math.random()*2-1; if(type === 'brown'){ last = (last + .02*w)/1.02; d[i] = last*3.5; } else d[i] = w; } return b; }
function audioInit(){
  if(AUDIO.ctx) return; const ctx = new (window.AudioContext || window.webkitAudioContext)(); AUDIO.ctx = ctx;
  AUDIO.master = ctx.createGain(); AUDIO.master.gain.value = AUDIO.vol.master; AUDIO.master.connect(ctx.destination);
  AUDIO.amb = ctx.createGain(); AUDIO.amb.gain.value = AUDIO.vol.amb; AUDIO.amb.connect(AUDIO.master);
  AUDIO.radio = ctx.createGain(); AUDIO.radio.gain.value = AUDIO.vol.radio; AUDIO.radio.connect(AUDIO.master);
  const loop = (buf, filt, f, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = filt; fl.frequency.value = f; fl.Q.value = q||.7; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(AUDIO.amb); s.start(); return { g, fl }; };
  const white = noiseBuffer(ctx, 'white'), brown = noiseBuffer(ctx, 'brown');
  AUDIO.city = loop(brown, 'lowpass', 520); AUDIO.wind = loop(white, 'bandpass', 380, .5); AUDIO.rain = loop(white, 'highpass', 1400); AUDIO.surf = loop(brown, 'lowpass', 300);
  AUDIO.siren = ctx.createOscillator(); AUDIO.siren.type = 'triangle'; AUDIO.sirenG = ctx.createGain(); AUDIO.sirenG.gain.value = 0; AUDIO.siren.connect(AUDIO.sirenG); AUDIO.sirenG.connect(AUDIO.amb); AUDIO.siren.start();
  AUDIO.white = white; AUDIO.nextBird = 0; AUDIO.nextCricket = 0; radioStart();
}
function setVolumes(){ if(!AUDIO.ctx) return; AUDIO.master.gain.value = AUDIO.on ? AUDIO.vol.master : 0; AUDIO.amb.gain.value = AUDIO.vol.amb; AUDIO.radio.gain.value = AUDIO.vol.radio; }
function blip(f=660, d=.06, v=.08, type='sine'){ if(!AUDIO.on || !AUDIO.ctx) return; const c = AUDIO.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime+d); o.connect(g); g.connect(AUDIO.master); o.start(); o.stop(c.currentTime+d+.02); }
function audioThunder(){ if(!AUDIO.on || !AUDIO.ctx) return; const c = AUDIO.ctx, s = c.createBufferSource(); s.buffer = AUDIO.white; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(.9, c.currentTime+.08); g.gain.exponentialRampToValueAtTime(.001, c.currentTime+3.5); s.connect(f); f.connect(g); g.connect(AUDIO.amb); s.start(); s.stop(c.currentTime+3.6); }
function chirpSound(){ const c = AUDIO.ctx, t0 = c.currentTime, o = c.createOscillator(), g = c.createGain(), base = 2600 + Math.random()*2200; o.type = 'sine';
  for(let k=0;k<3+Math.floor(Math.random()*4);k++){ const t = t0 + k*.11; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base*1.5, t+.05); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.025, t+.01); g.gain.linearRampToValueAtTime(0, t+.07); }
  o.connect(g); g.connect(AUDIO.amb); o.start(t0); o.stop(t0+1); }
function cricket(){ const c = AUDIO.ctx, t0 = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 4400 + Math.random()*300; g.gain.value = 0;
  for(let k=0;k<8;k++){ const t = t0 + k*.045; g.gain.setValueAtTime(.012, t); g.gain.setValueAtTime(0, t+.025); } o.connect(g); g.connect(AUDIO.amb); o.start(t0); o.stop(t0+.5); }
function updateAudio(dt){
  if(!AUDIO.on || !AUDIO.ctx) return; const c = AUDIO.ctx, now = c.currentTime, camH = camera.position.y - controls.target.y, dist = camera.position.distanceTo(controls.target);
  let near = 0, sirenD = 1e9; const tx = controls.target.x, tz = controls.target.z; const R = Math.max(120, dist*.8);
  for(const a of agents){ const d = Math.hypot(a.x-tx, a.z-tz); if(d < R && a.kind !== 'ped') near += 1 - d/R; if(a.siren && d < sirenD) sirenD = d; }
  const closeF = smooth(1400, 60, dist);
  AUDIO.city.g.gain.setTargetAtTime(Math.min(.5, near*.03)*closeF + .04*closeF, now, .3);
  AUDIO.wind.g.gain.setTargetAtTime(clamp(camH/900, .02, .35) + (weather.kind === 'storm' ? .25 : 0), now, .5); AUDIO.wind.fl.frequency.setTargetAtTime(300 + Math.sin(now*.3)*120, now, .5);
  AUDIO.rain.g.gain.setTargetAtTime(weather.rain*.22, now, .6);
  const wn = nearestWater(tx, tz, 120); AUDIO.surf.g.gain.setTargetAtTime(wn ? .12*closeF : 0, now, .8);
  const sg = sirenD < 300 ? (1 - sirenD/300)*.08*closeF : 0; AUDIO.sirenG.gain.setTargetAtTime(sg, now, .1); AUDIO.siren.frequency.setValueAtTime(Math.sin(now*6) > 0 ? 780 : 580, now);
  const h = hourOf(), isDay = h > 6 && h < 20;
  if(isDay && weather.rain < .1 && closeF > .3 && now > AUDIO.nextBird){ AUDIO.nextBird = now + 1 + Math.random()*4; chirpSound(); }
  if(!isDay && weather.rain < .1 && closeF > .4 && now > AUDIO.nextCricket){ AUDIO.nextCricket = now + .8 + Math.random()*1.5; cricket(); }
}
/* Radio Urbania : musique générative lo-fi */
const RADIO = { step:0, next:0, bpm:78, chords:[[60,64,67,71],[57,60,64,67],[62,65,69,72],[55,59,62,65],[53,57,60,64],[52,55,59,62],[50,53,57,60],[55,59,62,65]], timer:null };
const mtof = m => 440*Math.pow(2, (m-69)/12);
function radioStart(){ if(RADIO.timer) return; RADIO.next = AUDIO.ctx.currentTime + .2; RADIO.timer = setInterval(radioSchedule, 60); }
function radioNote(t, f, d, type, v, cutoff){ const c = AUDIO.ctx, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter(); o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cutoff;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t+Math.min(.08, d*.3)); g.gain.exponentialRampToValueAtTime(.0001, t+d); o.connect(fl); fl.connect(g); g.connect(AUDIO.radio); o.start(t); o.stop(t+d+.05); }
function radioSchedule(){ if(!AUDIO.ctx || AUDIO.vol.radio <= 0 || !AUDIO.on) { if(AUDIO.ctx) RADIO.next = Math.max(RADIO.next, AUDIO.ctx.currentTime); return; }
  const c = AUDIO.ctx, beat = 60/RADIO.bpm/2;
  while(RADIO.next < c.currentTime + .25){ const t = RADIO.next, st = RADIO.step, bar = Math.floor(st/8) % RADIO.chords.length, ch = RADIO.chords[bar], pos = st % 8;
    if(pos === 0){ for(const m of ch) radioNote(t, mtof(m), beat*8.2, 'triangle', .035, 1400); radioNote(t, mtof(ch[0]-24), beat*3.5, 'sine', .14, 400); }
    if(pos === 4) radioNote(t, mtof(ch[0]-24+7), beat*3, 'sine', .1, 400);
    if(Math.random() < .55){ const pent = [0,2,4,7,9], m = ch[0] + 12 + pent[Math.floor(Math.random()*5)] + (Math.random() < .3 ? 12 : 0); radioNote(t + (Math.random() < .3 ? beat*.5 : 0), mtof(m), beat*1.6, 'sine', .045, 3000); }
    if(pos % 2 === 1){ const s = c.createBufferSource(); s.buffer = AUDIO.white; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(.025, t); g.gain.exponentialRampToValueAtTime(.0001, t+.05); s.connect(f); f.connect(g); g.connect(AUDIO.radio); s.start(t, Math.random()); s.stop(t+.06); }
    if(pos === 0 || pos === 5){ const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t+.15); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t+.2); o.connect(g); g.connect(AUDIO.radio); o.start(t); o.stop(t+.22); }
    RADIO.step++; RADIO.next += beat; } }
