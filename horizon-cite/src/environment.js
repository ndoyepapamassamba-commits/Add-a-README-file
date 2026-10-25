// Ciel, soleil/lune, cycle jour-nuit, brouillard et mer animée.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util.js';
import { WATER_LEVEL, TERRAIN_HALF } from './config.js';

// Images clés en fonction de l'élévation du soleil (sinus de l'angle)
const KEYS = [
  { e: -1.0, zen: 0x030712, hor: 0x0e1628, sun: 0x7d93d8, sunI: 0.62, sky: 0x2c3c66, gnd: 0x1a1d28, hemiI: 0.95 },
  { e: -0.18, zen: 0x060c1c, hor: 0x182034, sun: 0x8095d0, sunI: 0.58, sky: 0x2e3e68, gnd: 0x1b1e28, hemiI: 0.92 },
  { e: -0.05, zen: 0x182440, hor: 0x5e4a60, sun: 0xffa070, sunI: 0.35, sky: 0x464a6a, gnd: 0x22202a, hemiI: 0.8 },
  { e: 0.04, zen: 0x31477a, hor: 0xf09a62, sun: 0xff9f5e, sunI: 1.3, sky: 0x8d8aa0, gnd: 0x3a322a, hemiI: 0.8 },
  { e: 0.16, zen: 0x3d6fb8, hor: 0xe6c7a2, sun: 0xffd2a0, sunI: 2.3, sky: 0xa4b8d6, gnd: 0x4a4136, hemiI: 0.95 },
  { e: 0.4, zen: 0x3e78cc, hor: 0xbcd6ee, sun: 0xfff1dd, sunI: 2.9, sky: 0xb7cdea, gnd: 0x5a5040, hemiI: 1.05 },
  { e: 1.0, zen: 0x356fc4, hor: 0xb4d2ef, sun: 0xfff6ea, sunI: 3.1, sky: 0xbcd3ee, gnd: 0x5d5342, hemiI: 1.1 },
];
const KC = KEYS.map((k) => ({
  ...k,
  zenC: new THREE.Color(k.zen),
  horC: new THREE.Color(k.hor),
  sunC: new THREE.Color(k.sun),
  skyC: new THREE.Color(k.sky),
  gndC: new THREE.Color(k.gnd),
}));

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uNight;
varying vec3 vDir;
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h > 0.0) col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  else col = mix(uHorizon, uGround, clamp(pow(-h * 6.0, 0.7), 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  float above = smoothstep(-0.12, 0.02, uSunDir.y);
  col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 10.0) * 0.22 + pow(sd, 3.0) * 0.06) * above;
  if (uNight > 0.01 && h > 0.0) {
    vec3 p = d * 220.0;
    vec3 c = floor(p);
    float s = hash3(c);
    if (s > 0.992) {
      vec3 f = fract(p) - 0.5;
      float r = length(f);
      float tw = 0.6 + 0.4 * sin(s * 1000.0);
      col += vec3(0.9, 0.95, 1.0) * smoothstep(0.32, 0.0, r) * uNight * tw * smoothstep(0.0, 0.25, h);
    }
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(md, 60.0) * 0.12) * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const waterVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const waterFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform sampler2D uDepth;
uniform vec4 uDepthRect;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;
uniform vec4 uPollute[8];
uniform float uInfo;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// Vagues : bruit multi-échelle (pas de bandes), chaque octave s'efface avec la distance
vec2 ngrad(vec2 p) {
  float c = vnoise(p);
  return vec2(vnoise(p + vec2(0.3, 0.0)) - c, vnoise(p + vec2(0.0, 0.3)) - c) / 0.3;
}
vec2 waveGrad(vec2 p, float t, float d) {
  float w1 = 1.0 - smoothstep(700.0, 2600.0, d);
  float w2 = 1.0 - smoothstep(260.0, 1000.0, d);
  float w3 = 1.0 - smoothstep(90.0, 360.0, d);
  vec2 g = vec2(0.0);
  g += ngrad(p * 0.02 + vec2(t * 0.03, t * 0.021)) * (0.9 * 0.02) * w1;
  g += ngrad(p * 0.021 * vec2(1.0, 1.3) - vec2(t * 0.02, -t * 0.03)) * (0.7 * 0.021) * w1;
  g += ngrad(p * 0.075 + vec2(-t * 0.09, t * 0.06)) * (0.28 * 0.075) * w2;
  g += ngrad(p * 0.27 + vec2(t * 0.35, t * 0.22)) * (0.07 * 0.27) * w3;
  g += vec2(0.6, 0.8) * cos(dot(p, vec2(0.6, 0.8)) * 0.22 + t * 1.3) * 0.012 * w2;
  return g * 2.2;
}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float camDist = length(cameraPosition - vWorld);
  vec2 duv = (vWorld.xz - uDepthRect.xy) / uDepthRect.zw;
  float depth = 24.0;
  if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) depth = texture2D(uDepth, duv).r * 24.0;
  vec2 g = waveGrad(vWorld.xz, uTime, camDist);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
  vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 10.0, depth));
  vec3 col = mix(base, sky, clamp(fres * 0.85, 0.0, 1.0));
  float sd = max(dot(R, uSunDir), 0.0);
  float spec = (pow(sd, 420.0) * 2.2 + pow(sd, 48.0) * 0.06) * (0.35 + fres);
  col += uSunColor * spec * smoothstep(-0.05, 0.1, uSunDir.y);
  // pollution (rejets d'eaux usées)
  for (int i = 0; i < 8; i++) {
    vec4 pp = uPollute[i];
    if (pp.z > 0.0) {
      float d = distance(vWorld.xz, pp.xy);
      float n = vnoise(vWorld.xz * 0.04 + uTime * 0.05);
      float k = (1.0 - smoothstep(pp.z * 0.2, pp.z, d + n * 40.0)) * pp.w;
      col = mix(col, vec3(0.30, 0.22, 0.12), k * 0.75);
    }
  }
  // écume du rivage
  float fn = vnoise(vWorld.xz * 0.18 + vec2(uTime * 0.15, -uTime * 0.1));
  float wave = sin(depth * 2.6 - uTime * 1.6 + fn * 3.0) * 0.5 + 0.5;
  float foam = (1.0 - smoothstep(0.0, 1.8, depth)) * smoothstep(0.45, 0.9, wave * 0.6 + fn * 0.6);
  foam += (1.0 - smoothstep(0.0, 0.45, depth)) * 0.6;
  col = mix(col, vec3(0.92, 0.95, 0.96) * (1.0 - uNight * 0.75), clamp(foam, 0.0, 1.0) * 0.75);
  float alpha = clamp(0.45 + depth * 0.16, 0.45, 0.97);
  if (uInfo > 0.5) { col = mix(col, vec3(0.45, 0.55, 0.62), 0.6); }
  float f = smoothstep(uFogNear, uFogFar, camDist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Environment {
  constructor(scene, renderer, terrain) {
    this.scene = scene;
    this.renderer = renderer;
    this.cycle = 0.36; // 0 = minuit, 0.5 = midi
    this.night = 0;
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    this.time = 0;

    this.hemi = new THREE.HemisphereLight(0xbcd3ee, 0x5d5342, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 3000;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fog = new THREE.Fog(0xbcd6ee, 800, 6000);
    scene.fog = this.fog;

    // ciel
    this.skyU = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(-0.5, 0.6, -0.4).normalize() },
      uNight: { value: 0 },
    };
    const skyGeo = new THREE.SphereGeometry(9000, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // mer
    this.waterU = {
      uTime: { value: 0 },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color() },
      uZenith: this.skyU.uZenith,
      uHorizon: this.skyU.uHorizon,
      uDeep: { value: new THREE.Color(0x0f4a68) },
      uShallow: { value: new THREE.Color(0x2fa3a8) },
      uDepth: { value: terrain.depthTexture },
      uDepthRect: { value: new THREE.Vector4(-TERRAIN_HALF, -TERRAIN_HALF, TERRAIN_HALF * 2, TERRAIN_HALF * 2) },
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 800 },
      uFogFar: { value: 6000 },
      uNight: this.skyU.uNight,
      uPollute: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uInfo: { value: 0 },
    };
    const wGeo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
    wGeo.rotateX(-Math.PI / 2);
    const wMat = new THREE.ShaderMaterial({
      uniforms: this.waterU,
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
    });
    this.water = new THREE.Mesh(wGeo, wMat);
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 2;
    this.water.frustumCulled = false;
    scene.add(this.water);
    this.tmpA = new THREE.Color();
    this.tmpB = new THREE.Color();
    this.update(0, null);
  }

  setShadowSize(n) {
    this.sun.shadow.mapSize.set(n, n);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  sample(e, field, out) {
    let i = 0;
    while (i < KC.length - 2 && e > KC[i + 1].e) i++;
    const a = KC[i];
    const b = KC[i + 1];
    const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
    if (out) return out.copy(a[field]).lerp(b[field], t);
    return lerp(a[field], b[field], t);
  }

  // dt en secondes de simulation (accélérées), camInfo = { target, dist }
  update(dtSim, camInfo, realDt = 0.016) {
    this.time += realDt;
    this.waterU.uTime.value = this.time;
    const ang = (this.cycle - 0.25) * Math.PI * 2; // lever à 6h
    const elev = Math.sin(ang);
    const az = this.cycle * Math.PI * 2 + 0.6;
    this.sunDir.set(Math.cos(az) * Math.cos(Math.asin(elev * 0.92)), elev * 0.92, Math.sin(az) * Math.cos(Math.asin(elev * 0.92))).normalize();
    const e = this.sunDir.y;
    this.night = smoothstep(0.06, -0.1, e);
    this.skyU.uNight.value = this.night;

    this.sample(e, 'zenC', this.skyU.uZenith.value);
    this.sample(e, 'horC', this.skyU.uHorizon.value);
    this.skyU.uGround.value.copy(this.skyU.uHorizon.value).multiplyScalar(0.8);
    this.sample(e, 'sunC', this.skyU.uSunColor.value);
    this.waterU.uSunColor.value.copy(this.skyU.uSunColor.value);

    // lumière : soleil le jour, lune la nuit
    const moonDir = this.skyU.uMoonDir.value;
    const useMoon = e < -0.04;
    const ldir = useMoon ? moonDir : this.sunDir;
    this.sample(e, 'sunC', this.sun.color);
    this.sun.intensity = this.sample(e, 'sunI');
    this.sample(e, 'skyC', this.hemi.color);
    this.sample(e, 'gndC', this.hemi.groundColor);
    this.hemi.intensity = this.sample(e, 'hemiI');

    this.fog.color.copy(this.skyU.uHorizon.value);
    this.waterU.uFogColor.value.copy(this.fog.color);

    if (camInfo) {
      const t = camInfo.target;
      const d = camInfo.dist;
      const half = clamp(d * 1.05, 140, 1100);
      const sc = this.sun.shadow.camera;
      // aligner sur la grille de texels pour éviter le scintillement
      const texel = (half * 2) / this.sun.shadow.mapSize.x;
      const tx = Math.round(t.x / texel) * texel;
      const tz = Math.round(t.z / texel) * texel;
      this.sun.target.position.set(tx, t.y, tz);
      this.sun.position.set(tx + ldir.x * 1500, t.y + Math.max(0.15, ldir.y) * 1500, tz + ldir.z * 1500);
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.far = 3500;
      sc.updateProjectionMatrix();
      this.fog.near = d * 1.6 + 300;
      this.fog.far = d * 6 + 3200;
      this.waterU.uFogNear.value = this.fog.near;
      this.waterU.uFogFar.value = this.fog.far;
      this.sky.position.copy(camInfo.camPos);
    }
  }

  setPollution(list) {
    const arr = this.waterU.uPollute.value;
    for (let i = 0; i < 8; i++) {
      const p = list[i];
      if (p) arr[i].set(p.x, p.z, p.r, p.k);
      else arr[i].set(0, 0, 0, 0);
    }
  }

  hourString() {
    const h = (this.cycle * 24) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
}
