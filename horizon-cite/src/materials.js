// Matériau « ville » partagé par les bâtiments et véhicules : fenêtres procédurales (shader),
// éclairage nocturne des fenêtres, enseignes néon, phares. Plus les matériaux des vues d'information.
import * as THREE from 'three';

export const cityUniforms = {
  uNight: { value: 0 },
  uLit: { value: 0.55 },
};

const VERT_HEAD = `
attribute float aWin;
attribute vec2 aWuv;
varying float vWin;
varying vec2 vWuv;
varying float vSeed;
`;

const VERT_BODY = `
vWin = aWin;
vWuv = aWuv;
vec4 wp0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  wp0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#endif
vSeed = fract(sin(dot(floor(wp0.xz), vec2(12.9898, 78.233))) * 43758.5453);
`;

const FRAG_HEAD = `
uniform float uNight;
uniform float uLit;
uniform float uAband;
varying float vWin;
varying vec2 vWuv;
varying float vSeed;
float hWin(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 91.7) * 43758.5453); }
float winBox(vec2 f, vec2 c, vec2 h, float w) {
  vec2 d = abs(f - c) - h;
  return 1.0 - smoothstep(-w, w, max(d.x, d.y));
}
`;

const FRAG_COLOR = `
float wLit = 0.0;
vec3 wCol = vec3(1.0, 0.8, 0.55);
float wKind = floor(vWin + 0.5);
if (wKind > 0.5 && wKind < 4.5) {
  vec2 g = vWuv;
  vec2 f = fract(g);
  vec2 cid = floor(g);
  vec2 fw = fwidth(g);
  float px = max(fw.x, fw.y);
  float w = clamp(px * 0.8, 0.002, 0.2);
  float m = 0.0;
  float cover = 0.3;
  if (wKind < 1.5) { m = winBox(f, vec2(0.5, 0.56), vec2(0.26, 0.27), w); cover = 0.29; }
  else if (wKind < 2.5) { m = winBox(f, vec2(0.5, 0.5), vec2(0.45, 0.41), w); cover = 0.74; }
  else if (wKind < 3.5) { m = winBox(f, vec2(0.5, 0.4), vec2(0.45, 0.33), w); cover = 0.6; }
  else { m = winBox(f, vec2(0.5, 0.8), vec2(0.42, 0.09), w); cover = 0.15; }
  float aa = clamp(1.6 - px * 2.2, 0.0, 1.0);
  float mask = mix(cover, m, aa);
  float r = hWin(cid);
  float on = step(r, uLit * (wKind > 2.5 && wKind < 3.5 ? 1.7 : 1.0));
  wLit = on * mask * (1.0 - uAband);
  if (hWin(cid + 7.3) > 0.72) wCol = vec3(0.86, 0.93, 1.0);
  vec3 glass = mix(vec3(0.13, 0.17, 0.23), vec3(0.32, 0.4, 0.5), clamp(hWin(cid + 1.7) * 0.5 + 0.2, 0.0, 1.0));
  if (wKind > 1.5 && wKind < 2.5) glass = vec3(0.2, 0.3, 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, mask);
}
if (uAband > 0.5) {
  float gr = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(gr), 0.75) * 0.55;
}
`;

const FRAG_EMIT = `
if (wKind > 0.5) {
  if (wKind < 4.5) totalEmissiveRadiance += wCol * wLit * uNight * 1.25;
  else if (wKind < 5.5) totalEmissiveRadiance += diffuseColor.rgb * (0.15 + uNight * 2.4) * (1.0 - uAband);
  else if (wKind < 6.5) totalEmissiveRadiance += vec3(1.0, 0.95, 0.82) * (0.25 + uNight * 3.0);
  else if (wKind < 7.5) totalEmissiveRadiance += vec3(1.0, 0.12, 0.06) * (0.2 + uNight * 1.6);
}
`;

export function makeCityMaterial({ abandoned = false, opacity = 1, color = 0xffffff } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color, transparent: opacity < 1, opacity });
  const aband = { value: abandoned ? 1 : 0 };
  mat.userData.aband = aband;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = cityUniforms.uNight;
    sh.uniforms.uLit = cityUniforms.uLit;
    sh.uniforms.uAband = aband;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
  };
  mat.customProgramCacheKey = () => 'city-v3';
  return mat;
}

// Matériaux des vues d'information (couleur unie, pas de fenêtres)
const infoCache = new Map();
export function infoMaterial(hex) {
  let m = infoCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    infoCache.set(hex, m);
  }
  return m;
}

export const MATS = {};
export function initMaterials() {
  MATS.city = makeCityMaterial();
  MATS.abandoned = makeCityMaterial({ abandoned: true });
  MATS.highlight = makeCityMaterial({ color: 0x9fd4ff });
  MATS.bad = makeCityMaterial({ color: 0xff8a8a });
  MATS.ghost = new THREE.MeshLambertMaterial({ color: 0x7cc8ff, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0x1a4060 });
  MATS.ghostBad = new THREE.MeshLambertMaterial({ color: 0xff6060, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0x501010 });
  MATS.plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  return MATS;
}
