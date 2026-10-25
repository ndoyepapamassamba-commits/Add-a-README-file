// Point d'entrée : moteur de rendu, assemblage des modules, boucle de jeu, nouvelle partie / chargement.
import * as THREE from 'three';
import { G } from './state.js';
import { QUALITY } from './config.js';
import { initMaterials, cityUniforms } from './materials.js';
import { Terrain } from './terrain.js';
import { Environment } from './environment.js';
import { Trees, makeTreeGeometries } from './trees.js';
import { CameraController } from './camera.js';
import { RoadNetwork } from './roads.js';
import { Zones } from './zones.js';
import { Buildings } from './buildings.js';
import { Sim } from './sim.js';
import { Traffic } from './traffic.js';
import { FX } from './fx.js';
import { Icons } from './icons.js';
import { buildDemoCity } from './demo.js';
import { Tools } from './tools.js';
import { UI } from './ui.js';
import { InfoViews } from './info.js';
import { Transit } from './transit.js';
import { Chirper } from './chirper.js';
import { Audio } from './audio.js';
import { Pedestrians } from './peds.js';
import { loadSlot, saveSlot, snapshot, restore, exportCode, importCode } from './save.js';

function loadQuality() {
  try {
    const q = localStorage.getItem('hc-quality');
    if (q && QUALITY[q]) return q;
  } catch (e) {
    /* stockage indisponible */
  }
  const mobile = /Mobi|Android/i.test(navigator.userAgent);
  return mobile ? 'low' : 'medium';
}

function boot() {
  G.quality = loadQuality();
  const canvas = document.getElementById('scene');
  const q = QUALITY[G.quality];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 20000);
  G.camera = camera;

  initMaterials();
  G.terrain = new Terrain(scene);
  G.env = new Environment(scene, renderer, G.terrain);
  G.env.setShadowSize(q.shadows);
  G.trees = new Trees(scene, q);
  G.cam = new CameraController(camera, canvas);
  G.roads = new RoadNetwork(scene, renderer);
  G.roads.treeGeo = makeTreeGeometries()[1];
  G.zones = new Zones(scene);
  G.buildings = new Buildings(scene);
  G.sim = new Sim();
  G.traffic = new Traffic(scene);
  G.fx = new FX(scene);
  G.icons = new Icons(scene);
  G.transit = new Transit(scene);
  G.peds = new Pedestrians(scene);
  G.info = new InfoViews();
  G.audio = new Audio();
  G.chirper = new Chirper();
  G.tools = new Tools(scene, canvas);
  G.ui = new UI();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // reprise après un changement de qualité, sinon écran titre sur la ville de démonstration
  let resume = false;
  try {
    resume = localStorage.getItem('hc-resume-auto') === '1';
    localStorage.removeItem('hc-resume-auto');
  } catch (e) {
    /* stockage indisponible */
  }
  G.newGame('demo', { name: 'Horizon Cité' });
  if (resume) {
    loadSlot('auto').then((r) => {
      if (!r.ok) G.ui.showTitle();
      else G.ui.hideTitle();
    });
  } else G.ui.showTitle();
  const loading = document.getElementById('loading');
  if (loading) loading.remove();

  let last = performance.now();
  let t = 0;
  const step = (realDt) => {
    t += realDt;
    G.frame++;
    const sim = G.sim;
    const onTitle = document.body.classList.contains('on-title');
    const simDt = onTitle ? realDt : sim.paused || !G.running ? 0 : realDt * sim.speed;
    G.cam.update(realDt);
    sim.update(simDt);
    G.roads.flush();
    G.buildings.update(realDt, simDt);
    G.traffic.update(realDt, simDt);
    G.transit.update(simDt);
    G.peds.update(realDt, simDt);
    G.info.update(realDt);
    G.zones.update();
    G.trees.update();
    const camInfo = G.cam.info();
    const uScale = renderer.domElement.height * 0.9;
    G.fx.update(realDt, simDt, camInfo.camPos, uScale);
    G.icons.update(t, camInfo.camPos);
    G.env.update(simDt, camInfo, realDt);
    const night = G.env.night;
    cityUniforms.uNight.value = night;
    const hour = G.env.cycle * 24;
    cityUniforms.uLit.value = hour > 17 || hour < 1 ? 0.5 : hour < 5 ? 0.2 : hour < 8 ? 0.38 : 0.3;
    G.zones.mat.color.setScalar(1 - night * 0.72);
    G.zones.mat.opacity = G.zones.showAll ? 0.95 : 0.6;
    G.roads.meshes.furniture.setNight(night);
    renderer.toneMappingExposure = 1.0 + night * 0.25;
    if (G.tools) G.tools.update(realDt);
    if (G.ui) G.ui.update(realDt);
    if (G.audio) G.audio.update(realDt);
  };
  const loop = (now) => {
    const realDt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    step(realDt);
    if (!G.manualRender) renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Rendu à la demande (tests automatisés sur machine sans GPU)
  G.renderNow = () => {
    step(0.016);
    renderer.render(scene, camera);
  };
  // Avance la simulation d'un bloc (tests)
  G.advance = (seconds, dt = 0.1) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) step(dt);
  };
  G.saveApi = { loadSlot, saveSlot, snapshot, restore, exportCode, importCode };
  window.HC = G;
}

// ---------------------------------------------------------------------------
G.clearCity = () => {
  G.traffic.clear();
  if (G.peds) G.peds.clear();
  G.icons.clear();
  G.fx.clear();
  G.buildings.clear();
  G.zones.clear();
  G.roads.clear();
  if (G.transit) G.transit.clear();
  G.sim.reset();
};

G.newGame = (mode = 'empty', opts = {}) => {
  G.clearCity();
  G.cityName = opts.name || G.cityName || 'Horizon Cité';
  G.roads.buildInitialHighway();
  for (const seg of G.roads.segs.values()) G.sim.freeSegs.add(seg.id);
  if (mode === 'sandbox') {
    G.sim.sandbox = true;
    G.sim.money = 999999;
  }
  if (mode === 'demo') buildDemoCity();
  G.sim.rebuildLists();
  G.sim.computeUtilities();
  G.sim.computeStats();
  if (mode !== 'demo') G.cam.flyTo(-560, 20, 420);
  G.running = true;
  G.emit('game:new', mode);
};

boot();
