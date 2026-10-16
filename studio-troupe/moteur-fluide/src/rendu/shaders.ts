/**
 * Shaders GLSL (WebGL 2, `#version 300 es` ajouté par PixiJS) du rendu. Toutes les géométries sont données en px de
 * sortie ; les matrices de PixiJS (projection, monde, local) restent l'identité à l'échelle du conteneur.
 * Les textures sont en alpha prémultiplié (chargement PixiJS) et les sorties aussi.
 */

/** Sommet commun : position (px) + coordonnées de texture + alpha par sommet. */
export const SOMMET_TEXTURE = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
in float aAlpha;
out vec2 vUV;
out float vAlpha;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vAlpha = aAlpha;
}
`;

/** Couche de décor texturée (plaque, peinture, figurants). */
export const FRAGMENT_DECOR = /* glsl */ `
in vec2 vUV;
in float vAlpha;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uAlpha;
void main() {
  finalColor = texture(uTexture, vUV) * (uAlpha * vAlpha);
}
`;

/**
 * Ciel qui dérive : boucle à deux phases (fondu enchaîné de deux copies décalées, sans saut au bouclage), alpha
 * donné par un masque fixe (le ciel bouge, sa découpe non).
 */
export const FRAGMENT_CIEL = /* glsl */ `
in vec2 vUV;
in float vAlpha;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMasque;
uniform float uPhase;
uniform float uDerive;
uniform float uAlpha;
void main() {
  float m = texture(uMasque, vUV).r;
  vec2 o1 = vec2(uDerive * uPhase, 0.0);
  vec2 o2 = vec2(uDerive * (uPhase - 1.0), 0.0);
  vec3 c = mix(texture(uTexture, vUV - o1).rgb, texture(uTexture, vUV - o2).rgb, uPhase);
  finalColor = vec4(c, 1.0) * (m * uAlpha * vAlpha);
}
`;

/**
 * Personnage (corps et bandes du visage) : étalonnage par canal `c·gain + décalage` (accord au décor), liseré de
 * lumière du côté de la lumière (le bord dont le voisin vers la lumière sort de la silhouette), opacité.
 */
export const FRAGMENT_PERSONNAGE = /* glsl */ `
in vec2 vUV;
in float vAlpha;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec3 uGain;
uniform vec3 uDecalage;
uniform float uAlpha;
uniform vec2 uLisereDir;
uniform vec3 uLisereCouleur;
uniform float uLisere;
void main() {
  vec4 c = texture(uTexture, vUV);
  float a = c.a * vAlpha * uAlpha;
  if (a <= 0.0005) {
    finalColor = vec4(0.0);
    return;
  }
  vec3 rgb = c.rgb / max(c.a, 0.0001);
  rgb = rgb * uGain + uDecalage;
  if (uLisere > 0.0) {
    float a1 = texture(uTexture, vUV + uLisereDir).a;
    float a2 = texture(uTexture, vUV + 2.0 * uLisereDir).a;
    float bord = clamp(c.a - 0.5 * (a1 + a2), 0.0, 1.0);
    rgb += uLisereCouleur * (bord * uLisere) * (1.0 - 0.5 * rgb);
  }
  finalColor = vec4(clamp(rgb, 0.0, 1.0) * a, a);
}
`;

/** Sommet coloré : position (px) + couleur RVBA non prémultipliée. */
export const SOMMET_COULEUR = /* glsl */ `
in vec2 aPosition;
in vec4 aColor;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vColor = aColor;
}
`;

/** Zones colorées (intérieur de la bouche, dents, langue, ombres, halos). */
export const FRAGMENT_COULEUR = /* glsl */ `
in vec4 vColor;
out vec4 finalColor;
uniform float uAlpha;
void main() {
  float a = vColor.a * uAlpha;
  finalColor = vec4(vColor.rgb * a, a);
}
`;

/** Sommet plein écran (px) avec coordonnées de texture. */
export const SOMMET_ECRAN = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

/**
 * Accumulation d'une sous-image (flou de bougé exact) : moyenne de `uTaps` lectures le long du vecteur de filé de
 * la sous-image (flou directionnel de la caméra), multipliée par le poids `1/N`, ajoutée au tampon (mélange additif).
 */
export const FRAGMENT_ACCUMULATION = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uFlou;
uniform float uTaps;
uniform float uPoids;
uniform float uRetourne;
void main() {
  vec2 uv = vec2(vUV.x, uRetourne > 0.5 ? 1.0 - vUV.y : vUV.y);
  if (uTaps < 1.5) {
    finalColor = texture(uTexture, uv) * uPoids;
    return;
  }
  vec2 flou = vec2(uFlou.x, uRetourne > 0.5 ? -uFlou.y : uFlou.y);
  int n = int(uTaps);
  vec4 s = vec4(0.0);
  for (int i = 0; i < 48; i++) {
    if (i >= n) break;
    float f = (float(i) + 0.5) / float(n) - 0.5;
    s += texture(uTexture, uv + flou * f);
  }
  finalColor = s / float(n) * uPoids;
}
`;

/**
 * Passe finale : flou directionnel éventuel, puis effets plein cadre (désaturation du gel, vignette, flash, fondu
 * au noir) et tramage d'un demi-niveau (pas de bandes dans les dégradés en 8 bits).
 */
export const FRAGMENT_FINAL = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uFlou;
uniform float uTaps;
uniform float uRetourne;
uniform float uDesaturation;
uniform float uVignette;
uniform float uFondu;
uniform float uFlash;
uniform float uRapport;
uniform vec3 uFond;
uniform float uExposition;
void main() {
  vec2 uv = vec2(vUV.x, uRetourne > 0.5 ? 1.0 - vUV.y : vUV.y);
  vec4 s;
  if (uTaps < 1.5) {
    s = texture(uTexture, uv);
  } else {
    vec2 flou = vec2(uFlou.x, uRetourne > 0.5 ? -uFlou.y : uFlou.y);
    int n = int(uTaps);
    s = vec4(0.0);
    for (int i = 0; i < 48; i++) {
      if (i >= n) break;
      float f = (float(i) + 0.5) / float(n) - 0.5;
      s += texture(uTexture, uv + flou * f);
    }
    s /= float(n);
  }
  vec3 c = (s.rgb + uFond * (1.0 - s.a)) * uExposition;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), uDesaturation);
  vec2 q = (vUV - 0.5) * vec2(uRapport, 1.0) * 1.7;
  if (uVignette > 0.0) c *= 1.0 - uVignette * smoothstep(0.3, 1.05, length(q));
  c = mix(c, vec3(1.0), uFlash);
  c *= 1.0 - uFondu;
  // Bruit à gradient entrelacé (Jimenez 2014) : tramage bon marché, déterministe.
  float tr = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  c += (tr - 0.5) / 255.0;
  finalColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

/**
 * Occultation d'un personnage par le décor : la peinture est redessinée par-dessus le personnage là où la carte de
 * profondeur de la plaque est plus proche que le sol sous ses pieds (`uSeuil`, transition douce), et seulement
 * au-dessus de la ligne de ses pieds (le sol devant lui ne le recouvre pas).
 */
export const FRAGMENT_OCCULTATION = /* glsl */ `
in vec2 vUV;
in float vAlpha;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uProfondeur;
uniform float uSeuil;
uniform float uDouceur;
uniform float uVPieds;
void main() {
  float d = texture(uProfondeur, vUV).r;
  float a = smoothstep(uSeuil, uSeuil + uDouceur, d) * (1.0 - smoothstep(uVPieds - 0.006, uVPieds + 0.002, vUV.y));
  if (a <= 0.001) {
    finalColor = vec4(0.0);
    return;
  }
  finalColor = texture(uTexture, vUV) * (a * vAlpha);
}
`;
