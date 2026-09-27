/* ================= rendu, qualité, boucle principale ================= */
let composer = null, gtao = null, quality = 'auto', resScale = 1;
const QUAL = { low:{ pr:.8, shadow:1024, msaa:0, ao:false, veh:350, ped:200 }, mid:{ pr:1, shadow:2048, msaa:4, ao:false, veh:800, ped:450 }, ultra:{ pr:2, shadow:4096, msaa:4, ao:true, veh:1500, ped:900 }, auto:{ pr:1.5, shadow:2048, msaa:4, ao:false, veh:900, ped:500 } };
const baseRatio = () => Math.min(devicePixelRatio||1, QUAL[quality].pr);
async function setupComposer(){
  const q = QUAL[quality], w = innerWidth, h = innerHeight;
  if(composer){ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const rt = new THREE.WebGLRenderTarget(w, h, { type:THREE.HalfFloatType, samples:q.msaa });
  composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
  gtao = null;
  if(q.ao){ try { const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js'); gtao = new GTAOPass(scene, camera, w, h); gtao.blendIntensity = .8; gtao.updateGtaoMaterial({ radius:6, distanceFallOff:1, thickness:4, scale:1 }); composer.addPass(gtao); } catch(e){ gtao = null; } }
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .2, .55, 2.5); composer.addPass(bloom); composer.addPass(new OutputPass());
  sun.shadow.mapSize.set(q.shadow, q.shadow); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
  CAPS.veh = q.veh; CAPS.ped = q.ped; resScale = 1; resize(); }
function resize(){ const w = innerWidth, h = innerHeight, pr = baseRatio()*resScale; renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix(); if(composer){ composer.setPixelRatio(pr); composer.setSize(w, h); }
  const sc = h*pr/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))); smMat.uniforms.uScale.value = sc; iconMat.uniforms.uScale.value = sc/pr; }
addEventListener('resize', resize);

let last = performance.now(), simAcc = 0, fpsN = 0, fpsT = 0, fpsAvg = 60, hudT = 0, autoT = 0, trafT = 0, lastDay = -1;
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now-last)/1000); last = now; U.uTime.value += dt;
  const sp = state.speed, gdt = dt*4*sp; state.time += gdt;
  simAcc += dt*sp; let n = 0; while(simAcc >= .5 && n++ < 4){ simAcc -= .5; simTick(); } if(simAcc > 2) simAcc = 0;
  const sdt = dt*sp;
  if(sp) waterTick(Math.min(1, sdt*18));
  updateLights(sdt); updateAgents(dt, sp); updateFires(sdt); tickTimers(sdt); tickGrowth(sdt); updateMetro(sdt); drawMetro(); updatePortAir(sdt); trainService(sdt);
  updateDisasters(sdt); updateWeather(dt, gdt); updateSun(); updateSmoke(dt);
  for(const b of buildings.values()) if(b.rotor) b.rotor.rotation.z -= dt*1.4*windF;
  rebuildChunks(2); if(zoneDirty) rebuildZoneMesh(); if(glowDirty) rebuildGlow(); if(districtsDirty) refreshDistricts(); if(transitDirty) rebuildTransitMesh();
  trafT += dt; if(trafT > 3){ trafT = 0; decayTraffic(); if(overlay === 'traffic') rebuildTrafficMesh(); }
  updateKeys(dt); controls.update(); clampCamera(dt); applyTerraform(dt); updateLabels(); updateAudio(dt);
  agentCount = { v:0, p:0 }; for(const a of agents){ if(a.kind === 'ped') agentCount.p++; else agentCount.v++; }
  for(const p of POOLS) p.sync();
  updateShadow(); const shk = shakeOffset(); camera.position.add(shk); composer.render(); camera.position.sub(shk);
  const day = dayOf(); if(day !== lastDay){ if(lastDay >= 0) save(); lastDay = day; }
  fpsN++; fpsT += dt; if(fpsT >= 1){ fpsAvg = fpsN/fpsT; fpsN = 0; fpsT = 0;
    if(quality === 'auto' && now > autoT){ let ns = resScale; if(fpsAvg < 40) ns = Math.max(.5, resScale-.1); else if(fpsAvg > 57) ns = Math.min(1, resScale+.05);
      if(fpsAvg < 28 && CAPS.veh > 250){ CAPS.veh -= 100; CAPS.ped -= 60; } else if(fpsAvg > 55 && CAPS.veh < QUAL.auto.veh){ CAPS.veh += 50; CAPS.ped += 30; }
      if(ns !== resScale){ resScale = ns; resize(); autoT = now + 2500; } } }
  hudT += dt; if(hudT > .25){ hudT = 0; hud(); }
}
(async function boot(){
  try { const q = localStorage.getItem('urbania-q'); if(q && QUAL[q]) quality = q; } catch(_){}
  $('#quality').value = quality;
  progress('Préparation du rendu…', .05); await nextFrame();
  await setupComposer(); updateSun(); updateEnv();
  let loaded = false; try { loaded = !!localStorage.getItem(SAVE_KEY) && await load(); } catch(e){ console.warn(e); loaded = false; }
  if(!loaded) await newGame('demo', 1337);
  setSpeed(1); lastDay = dayOf(); $('#disSel').value = state.disAuto === false ? '0' : '1';
  let seen = false; try { seen = !!localStorage.getItem('urbania-help2'); localStorage.setItem('urbania-help2', '1'); } catch(_){}
  if(!seen) $('#mHelp').hidden = false;
  addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if(document.hidden) save(); });
  if(location.hash === '#debug') window.__dbg = { renderer, scene, state, agents, buildings, segs, nodes, cells, POOLS, camera, controls, lines, CZ, get cimTop(){ return cimTop; }, setOverlay, setTool, newGame,
    commitRoad, buildRoundabout, snapRoad, svcPlacement, svcValid, placeService, cellsInRadius, setZone, terraform, TERRA, addWaterSource, placeDam, evalDam, newLine, stopFromPoint, addStopVisual, finishLine,
    save, load, roadOpt, DIS, startDisaster, U, SW, upgradeSeg, bulldozeSeg, removeBuilding, districts, newDistrict, paintDistrict, weather, WATER, fires, REQ, renderBudget, renderStats, renderLines, select, showInfo,
    fast(n){ for(let k=0;k<n;k++){ state.time += 2; simTick(); updateAgents(.5, 1); tickTimers(.5); updateFires(.5); updateLights(.5); tickGrowth(.5); updateMetro(.5); trainService(.5); updatePortAir(.5); updateDisasters(.5); if(k%4===0) stepWater(.25); } } };
  requestAnimationFrame(t => { last = t; frame(t); });
})().catch(err => { console.error(err); progress('Erreur au démarrage : '+err.message, 1); });
