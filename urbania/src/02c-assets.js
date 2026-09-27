/* ================= modèles 3D importés de SketchUp ================= */
// Paquet ASSET_PACK (gzip + base64) produit par tools/convert-assets.mjs à partir des exports SketchUp.
// Rôles de matière : 0 fixe, 1 mur teinté (couleur d'instance), 2 toit teinté (aTintR), 3 accent teinté (aTintA), 4 vitrage, 5 enseigne lumineuse ; +8 = détail (masqué au loin)
// aWin (vitrages) : numéro de fenêtre, pour allumer chaque fenêtre séparément ; les grandes baies s'allument par travées
const ASSETS = {};
const U_ASSET = { uAssetLod:{ value:420 }, uEye:{ value:new THREE.Vector3() } }; // uEye : caméra principale (aussi pour la passe d'ombre)
MAT.asset = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.84, metalness:0, envMapIntensity:.6 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, U_ASSET);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aRole; attribute float aWin; attribute vec4 aTintR; attribute vec4 aTintA; uniform float uAssetLod; uniform vec3 uEye;
      varying float vRole; varying float vADet; varying vec3 vAW; varying vec3 vAN; varying vec3 vAL; varying float vASeed; varying float vALit; varying float vWin;`)
    .replace('#include <color_vertex>', `
      vColor = color; float role = mod(aRole, 8.0); vRole = role; vADet = step(7.5, aRole);
      #ifdef USE_INSTANCING_COLOR
      if(role > 0.5 && role < 1.5) vColor *= instanceColor;
      #endif
      if(role > 1.5 && role < 2.5) vColor *= aTintR.rgb;
      if(role > 2.5 && role < 3.5) vColor *= aTintA.rgb;
      vASeed = aTintR.w; vALit = aTintA.w; vWin = aWin;`)
    .replace('#include <project_vertex>', `#include <project_vertex>
      { mat4 imx = mat4(1.0);
        #ifdef USE_INSTANCING
        imx = instanceMatrix;
        #endif
        vec4 wp = modelMatrix * imx * vec4(transformed, 1.0); vAW = wp.xyz; vAL = transformed; vAN = normalize(mat3(modelMatrix) * mat3(imx) * objectNormal);
        vec3 org = (modelMatrix * imx * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        if(aRole > 7.5 && distance(uEye, org) > uAssetLod) gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vRole; varying float vADet; varying vec3 vAW; varying vec3 vAN; varying vec3 vAL; varying float vASeed; varying float vALit; varying float vWin;
      uniform float uNight, uLitMul, uOverOn, uHalf, uWet, uSnow; uniform sampler2D uOver; ${GLSL_HASH}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 aN = normalize(vAN);
      float glass = step(3.5, vRole) * (1.0 - step(4.5, vRole)), emis = step(4.5, vRole);
      // entrées entières : le hachage reste identique sur toute la vitre malgré l'interpolation
      float big = mod(floor(vWin + 0.5), 2.0), wid = floor(vWin*0.5 + 0.25), sd = floor(vASeed*4096.0 + 0.5);
      vec3 cell = big > 0.5 ? floor(vAL / vec3(2.6, 4.0, 2.6) + 0.013) : vec3(0.0);
      vec3 key = cell + vec3(wid*1.618, sd*0.0173, wid*0.731);
      float wr = fhash(key), wr2 = fhash(key*1.37 + 11.0);
      diffuseColor.rgb *= mix(1.0, mix(0.72 + 0.56*wr2, 0.86 + 0.28*wr2, big), glass);
      float upF = smoothstep(0.55, 0.85, aN.y) * (1.0 - glass);
      diffuseColor.rgb *= 1.0 - uWet*0.2*(1.0 - glass);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.96), uSnow*upF*0.92);
      float lit = step(wr, vALit*uLitMul) * glass * step(vADet, 0.5); // vitrages de détail (garde-corps, lucarnes) jamais allumés
      if(uOverOn > 0.5){ vec4 ovc = texture2D(uOver, (vAW.xz + uHalf)/(2.0*uHalf)); diffuseColor.rgb = mix(vec3(0.8), ovc.rgb, step(0.02, ovc.a)*0.92); lit = 0.0; emis = 0.0; }
      vec3 litCol = mix(vec3(1.0,0.62,0.32), vec3(1.0,0.9,0.75), wr2); if(wr2 > 0.86) litCol = vec3(0.65,0.8,1.0);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.06 + 0.1*wr2, glass); roughnessFactor *= 1.0 - uWet*0.45*upF;`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.55, glass);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += litCol * lit * uNight * (0.45 + 0.8*wr2) + diffuseColor.rgb * emis * (0.25 + uNight*2.2);`);
  };
  m.customProgramCacheKey = () => 'asset2'; return m;
})();
// passe d'ombre : mêmes détails masqués au loin
MAT.assetDepth = (() => {
  const m = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U_ASSET);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aRole; uniform float uAssetLod; uniform vec3 uEye;`)
    .replace('#include <project_vertex>', `#include <project_vertex>
      { mat4 imx = mat4(1.0);
        #ifdef USE_INSTANCING
        imx = instanceMatrix;
        #endif
        vec3 org = (modelMatrix * imx * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        if(aRole > 7.5 && distance(uEye, org) > uAssetLod) gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }`);
  };
  m.customProgramCacheKey = () => 'assetDepth1'; return m;
})();

async function loadAssets(){
  if(typeof ASSET_PACK === 'undefined' || !ASSET_PACK) return 0;
  const bin = Uint8Array.from(atob(ASSET_PACK), ch => ch.charCodeAt(0));
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf), jl = dv.getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl))), base = 4 + jl;
  const lumLin = (r, g, b) => { const c = new THREE.Color().setRGB(r/255, g/255, b/255, THREE.SRGBColorSpace); return .2126*c.r + .7152*c.g + .0722*c.b; };
  const refL = { 1:lumLin(...meta.ref.W), 2:lumLin(...meta.ref.R), 3:lumLin(...meta.ref.A) };
  const MC = meta.mats.map(([name, r, g, b, role]) => { const c = new THREE.Color().setRGB(r/255, g/255, b/255, THREE.SRGBColorSpace);
    if(role >= 1 && role <= 3){ const k = clamp(lumLin(r, g, b)/refL[role], 0, 1.6); c.setRGB(k, k, k); } return { c, role }; });
  for(const a of meta.assets){
    const nv = a.nv, pos = new Float32Array(nv*3), colr = new Float32Array(nv*3), role = new Float32Array(nv), win = new Float32Array(nv);
    for(let i=0;i<nv;i++){ const o = base + a.vo + i*8; pos[i*3] = dv.getInt16(o, true)/100; pos[i*3+1] = dv.getInt16(o+2, true)/100; pos[i*3+2] = dv.getInt16(o+4, true)/100;
      const m = MC[dv.getUint8(o+6)], tag = dv.getUint8(o+7); colr[i*3] = m.c.r; colr[i*3+1] = m.c.g; colr[i*3+2] = m.c.b; role[i] = m.role + (tag & 1)*8; win[i] = tag >> 1; }
    const idx = a.big ? new Uint32Array(buf.slice(base + a.io, base + a.io + a.ni*4)) : new Uint16Array(buf.slice(base + a.io, base + a.io + a.ni*2));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setAttribute('aRole', new THREE.BufferAttribute(role, 1)); geo.setAttribute('aWin', new THREE.BufferAttribute(win, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    ASSETS[a.name] = { name:a.name, geo, w:a.w, d:a.d, h:a.h, off:a.off, pool:null, tris:a.ni/3 };
  }
  return meta.assets.length;
}
function assetPool(A){ if(!A.pool) A.pool = new Pool(A.geo, MAT.asset, 32, { extras:{ aTintR:4, aTintA:4 }, depth:MAT.assetDepth }); return A.pool; }
const _tr = new THREE.Color(), _ta = new THREE.Color();
function assetExtras(roof, accent, seed, lit){ _tr.set(roof || '#80403a'); _ta.set(accent || '#3a5c48'); return { aTintR:[_tr.r, _tr.g, _tr.b, seed], aTintA:[_ta.r, _ta.g, _ta.b, lit] }; }
