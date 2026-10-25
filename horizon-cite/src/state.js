// État global partagé entre les modules + petit bus d'événements.

export const G = {
  scene: null,
  camera: null,
  renderer: null,
  cam: null, // contrôleur de caméra
  env: null, // ciel, lumière, eau
  terrain: null,
  trees: null,
  roads: null,
  zones: null,
  buildings: null,
  sim: null,
  traffic: null,
  transit: null,
  tools: null,
  ui: null,
  fx: null,
  info: null,
  audio: null,
  chirper: null,
  quality: 'medium',
  running: false,
  frame: 0,
  _handlers: new Map(),
  on(evt, fn) {
    if (!this._handlers.has(evt)) this._handlers.set(evt, []);
    this._handlers.get(evt).push(fn);
  },
  emit(evt, data) {
    const hs = this._handlers.get(evt);
    if (hs) for (const h of hs) h(data);
  },
};
