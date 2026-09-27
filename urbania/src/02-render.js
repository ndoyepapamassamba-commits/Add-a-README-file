/* ================= moteur de rendu ================= */
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance', stencil:false });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .75;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb8c6d2, 0.00018);
const camera = new THREE.PerspectiveCamera(42, 1, 1.5, 30000);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .09; controls.screenSpacePanning = false;
controls.minDistance = 12; controls.maxDistance = 2800; controls.maxPolarAngle = 1.45; controls.zoomToCursor = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.panSpeed = 1.1; controls.rotateSpeed = .6;

/* ---------- uniformes partagées ---------- */
const U = {
  uTime:{value:0}, uNight:{value:0}, uLitMul:{value:1}, uWet:{value:0}, uSnow:{value:0},
  uHalf:{value:HALF}, uEHalf:{value:EHALF}, uCell:{value:CELL}, uNE1:{value:NE1},
  uOver:{value:null}, uOverOn:{value:0}, uDist:{value:null}, uDistOn:{value:0}, uDetail:{value:null}, uHTex:{value:null},
  uBrush:{value:new THREE.Vector4(0,0,0,0)}, uBrushCol:{value:new THREE.Color(0xf2b33d)}, uUnder:{value:0},
};

/* ---------- ciel, nuages, étoiles ---------- */
const sky = new Sky(); sky.scale.setScalar(14000); scene.add(sky);
const su = sky.material.uniforms; su.turbidity.value = 4.5; su.rayleigh.value = 1.25; su.mieCoefficient.value = .004; su.mieDirectionalG.value = .83;
const envScene = new THREE.Scene(); const envSky = new THREE.Mesh(sky.geometry, sky.material); envSky.scale.setScalar(100); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null, lastEnvKey = '';
function updateEnv(){ const rt = pmrem.fromScene(envScene, 0, .1, 1000); scene.environment = rt.texture; if(envRT) envRT.dispose(); envRT = rt; }

const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.0002; sun.shadow.normalBias = .45; sun.shadow.camera.near = 1; sun.shadow.camera.far = 3200;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4d4436, .35); scene.add(hemi);
const flash = new THREE.DirectionalLight(0xdfe6ff, 0); flash.position.set(200, 900, -300); scene.add(flash);

let starMat;
{ const g = new THREE.BufferGeometry(), p = new Float32Array(2600*3), r = mulberry32(7);
  for(let i=0;i<2600;i++){ const th = r()*Math.PI*2, ph = Math.acos(r()*.95); p[i*3]=Math.sin(ph)*Math.cos(th)*11000; p[i*3+1]=Math.cos(ph)*11000; p[i*3+2]=Math.sin(ph)*Math.sin(th)*11000; }
  g.setAttribute('position', new THREE.BufferAttribute(p,3));
  starMat = new THREE.PointsMaterial({ color:0xdfe8ff, size:1.6, sizeAttenuation:false, transparent:true, opacity:0, fog:false, depthWrite:false });
  const stars = new THREE.Points(g, starMat); stars.frustumCulled = false; scene.add(stars); }

/* ---------- textures procédurales ---------- */
function tileNoiseCanvas(size, octaves, seed, fn){
  const r = mulberry32(seed), cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size,size), acc = new Float32Array(size*size);
  let amp = 1, tot = 0;
  for(let o=0;o<octaves;o++){
    const per = 4<<o, g = new Float32Array(per*per); for(let i=0;i<g.length;i++) g[i]=r();
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const fx = x/size*per, fy = y/size*per, xi = Math.floor(fx), yi = Math.floor(fy), tx = fx-xi, ty = fy-yi, sx = tx*tx*(3-2*tx), sy = ty*ty*(3-2*ty);
      const a = g[(yi%per)*per+xi%per], b = g[(yi%per)*per+(xi+1)%per], c = g[((yi+1)%per)*per+xi%per], d = g[((yi+1)%per)*per+(xi+1)%per];
      acc[y*size+x] += amp*(a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy); }
    tot += amp; amp *= .55; }
  for(let i=0;i<size*size;i++){ const v = fn(acc[i]/tot, i%size, (i/size)|0); img.data[i*4]=v[0]; img.data[i*4+1]=v[1]; img.data[i*4+2]=v[2]; img.data[i*4+3]=v[3]??255; }
  ctx.putImageData(img,0,0); return cv;
}
function repTex(cv){ const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, MAX_ANISO); return t; }
const detailTex = repTex(tileNoiseCanvas(256, 5, 11, v => { const c = clamp(128+v*260,0,255); return [c,c,c]; })); U.uDetail.value = detailTex;
const asphaltTex = repTex(tileNoiseCanvas(256, 6, 23, (v,x,y) => { const g = Math.abs((Math.sin(x*12.9898+y*78.233)*43758.5453)%1); const c = clamp(212+v*75+g*28-14,0,255); return [c,c,c]; }));
const cloudTex = repTex(tileNoiseCanvas(256, 6, 57, v => { const c = clamp(128+v*300,0,255); return [c,c,c]; }));
const waterNormal = (() => { const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s; const ctx = cv.getContext('2d'), img = ctx.createImageData(s,s), h = new Float32Array(s*s), r = mulberry32(99);
  const waves = []; for(let k=0;k<30;k++) waves.push([1+Math.floor(r()*9)*(r()<.5?-1:1), 1+Math.floor(r()*9)*(r()<.5?-1:1), r()*6.28, .4+r()]);
  for(let y=0;y<s;y++) for(let x=0;x<s;x++){ let v=0; for(const w of waves) v += Math.sin((w[0]*x+w[1]*y)/s*6.2832+w[2])/(w[3]*Math.hypot(w[0],w[1])); h[y*s+x]=v; }
  for(let y=0;y<s;y++) for(let x=0;x<s;x++){ const dx = h[y*s+(x+1)%s]-h[y*s+(x+s-1)%s], dy = h[((y+1)%s)*s+x]-h[((y+s-1)%s)*s+x]; const nx=-dx*1.4, ny=-dy*1.4, l=Math.hypot(nx,ny,1);
    img.data[(y*s+x)*4]=(nx/l*.5+.5)*255; img.data[(y*s+x)*4+1]=(ny/l*.5+.5)*255; img.data[(y*s+x)*4+2]=(1/l*.5+.5)*255; img.data[(y*s+x)*4+3]=255; }
  ctx.putImageData(img,0,0); return repTex(cv); })();

/* nuages : grand plan animé au-dessus de la ville */
const cloudMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, fog:false,
  uniforms:{ uTex:{value:cloudTex}, uTime:U.uTime, uCover:{value:.3}, uLight:{value:new THREE.Color(1,1,1)}, uDark:{value:new THREE.Color(.55,.6,.68)} },
  vertexShader:`varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader:`uniform sampler2D uTex; uniform float uTime, uCover; uniform vec3 uLight, uDark; varying vec3 vW;
    void main(){ vec2 p = vW.xz/5200.0 + vec2(uTime*0.0022, uTime*0.0009);
      float n = texture2D(uTex, p).r*0.62 + texture2D(uTex, p*2.3+0.31).r*0.28 + texture2D(uTex, p*5.1+0.7).r*0.1;
      float c = smoothstep(1.0-uCover, 1.12-uCover*0.6, n);
      float d = length(vW.xz - cameraPosition.xz); c *= smoothstep(13000.0, 4000.0, d);
      vec3 colr = mix(uLight, uDark, smoothstep(0.2, 0.9, c)*0.8);
      gl_FragColor = vec4(colr, c*0.92); }` });
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(30000,30000).rotateX(Math.PI/2), cloudMat); clouds.position.y = 1500; clouds.renderOrder = -1; clouds.frustumCulled = false; scene.add(clouds);

/* ---------- texture de hauteur du terrain (pour les calques qui épousent le relief) ---------- */
const EH = new Float32Array(NE1*NE1);
const hTex = new THREE.DataTexture(EH, NE1, NE1, THREE.RedFormat, THREE.FloatType); hTex.needsUpdate = true; U.uHTex.value = hTex;
const GLSL_HEIGHT = `
  uniform sampler2D uHTex; uniform float uEHalf, uCell, uNE1;
  float terrainH(vec2 p){ vec2 g = (p + uEHalf)/uCell; g = clamp(g, vec2(0.0), vec2(uNE1-1.001)); ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
    float h00 = texelFetch(uHTex, i, 0).r, h10 = texelFetch(uHTex, i+ivec2(1,0), 0).r, h01 = texelFetch(uHTex, i+ivec2(0,1), 0).r, h11 = texelFetch(uHTex, i+ivec2(1,1), 0).r;
    return f.x+f.y <= 1.0 ? h00+(h10-h00)*f.x+(h01-h00)*f.y : h11+(h01-h11)*(1.0-f.x)+(h10-h11)*(1.0-f.y); }`;

/* ---------- pools d'instances : une draw call par type d'objet ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color(), UP = new THREE.Vector3(0,1,0);
const _e = new THREE.Euler();
const POOLS = [];
class Pool{
  constructor(geo, mat, cap, o={}){ this.o = o; this.cap = cap; this.count = 0; this.handles = []; this.dirty = true; this.linked = [];
    this.extras = o.extras || null; this.geo = this.extras ? geo.clone() : geo; this.mat = mat; this.mesh = this.make(cap); POOLS.push(this); }
  make(cap){ const m = new THREE.InstancedMesh(this.geo, this.mat, cap); m.count = 0; m.frustumCulled = false;
    m.castShadow = this.o.cast !== false; m.receiveShadow = this.o.receive !== false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap*3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if(this.extras) for(const k in this.extras){ const n = this.extras[k], old = this.geo.getAttribute(k); const a = new THREE.InstancedBufferAttribute(new Float32Array(cap*n), n); a.setUsage(THREE.DynamicDrawUsage);
      if(old) a.array.set(old.array.subarray(0, Math.min(old.array.length, a.array.length))); this.geo.setAttribute(k, a); }
    if(this.o.order !== undefined) m.renderOrder = this.o.order; if(this.o.layer) m.layers.set(this.o.layer); scene.add(m); return m; }
  link(geo, mat, cast=false){ const lm = new THREE.InstancedMesh(geo, mat, this.cap); lm.instanceMatrix = this.mesh.instanceMatrix; lm.count = 0; lm.frustumCulled = false; lm.castShadow = cast; scene.add(lm); this.linked.push(lm); return lm; }
  grow(){ if(this.o.fixed) return false; const cap = this.cap*2, old = this.mesh; const m = this.make(cap);
    m.instanceMatrix.array.set(old.instanceMatrix.array); m.instanceColor.array.set(old.instanceColor.array);
    scene.remove(old); old.dispose(); this.mesh = m; this.cap = cap; this.dirty = true;
    for(let k=0;k<this.linked.length;k++){ const o = this.linked[k], n = new THREE.InstancedMesh(o.geometry, o.material, cap); n.instanceMatrix = m.instanceMatrix; n.frustumCulled = false; n.castShadow = o.castShadow; scene.remove(o); o.dispose(); scene.add(n); this.linked[k] = n; }
    return true; }
  add(mx, c, ex){ if(this.count >= this.cap && !this.grow()) return null; const i = this.count++;
    mx.toArray(this.mesh.instanceMatrix.array, i*16); const a = this.mesh.instanceColor.array; a[i*3]=c.r; a[i*3+1]=c.g; a[i*3+2]=c.b;
    if(ex) for(const k in ex){ const at = this.geo.getAttribute(k); at.array.set(ex[k], i*at.itemSize); }
    const h = { i, pool:this }; this.handles[i] = h; this.dirty = true; return h; }
  remove(h){ if(!h || h.i < 0 || h.pool !== this) return; const i = h.i, l = --this.count;
    if(i !== l){ this.mesh.instanceMatrix.array.copyWithin(i*16, l*16, l*16+16); this.mesh.instanceColor.array.copyWithin(i*3, l*3, l*3+3);
      if(this.extras) for(const k in this.extras){ const at = this.geo.getAttribute(k), n = at.itemSize; at.array.copyWithin(i*n, l*n, l*n+n); }
      const mv = this.handles[l]; mv.i = i; this.handles[i] = mv; }
    this.handles.length = l; h.i = -1; this.dirty = true; }
  setColor(h, c){ if(h.i < 0) return; const a = this.mesh.instanceColor.array; a[h.i*3]=c.r; a[h.i*3+1]=c.g; a[h.i*3+2]=c.b; this.dirty = true; }
  getColor(h, out){ const a = this.mesh.instanceColor.array; return out.setRGB(a[h.i*3], a[h.i*3+1], a[h.i*3+2]); }
  setMatrix(h, mx){ if(h.i < 0) return; mx.toArray(this.mesh.instanceMatrix.array, h.i*16); this.dirty = true; }
  getMatrix(h, out){ return out.fromArray(this.mesh.instanceMatrix.array, h.i*16); }
  clear(){ for(const h of this.handles) if(h) h.i = -1; this.handles.length = 0; this.count = 0; this.dirty = true; }
  sync(){ for(const l of this.linked) l.count = this.count; if(!this.dirty) return; const m = this.mesh; m.count = this.count;
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; if(this.extras) for(const k in this.extras) this.geo.getAttribute(k).needsUpdate = true; this.dirty = false; }
}
function place(pool, x, y, z, sx, sy, sz, rot, c, ex){ _q.setFromAxisAngle(UP, rot); _m.compose(_p.set(x,y,z), _q, _s.set(sx,sy,sz)); return pool.add(_m, c, ex); }

/* ---------- matériaux ---------- */
const GLSL_HASH = `float fhash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }`;
// Façades : un seul matériau pour tous les bâtiments, style de fenêtres par instance (aStyle, aStyle2)
function facadeMaterial(){
  const m = new THREE.MeshStandardMaterial({ roughness:.86, metalness:0, envMapIntensity:.55 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aStyle; attribute vec4 aStyle2;
      varying vec3 vWPos; varying vec3 vWN; varying float vBase; varying float vH; varying float vSeed; varying vec4 vSt; varying vec4 vSt2;`)
    .replace('#include <project_vertex>', `#include <project_vertex>
      { mat4 imx = mat4(1.0);
        #ifdef USE_INSTANCING
        imx = instanceMatrix;
        #endif
        vec4 wp4 = modelMatrix * imx * vec4(transformed,1.0); vWPos = wp4.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(imx) * objectNormal);
        vec4 b4 = modelMatrix * imx * vec4(0.0,0.0,0.0,1.0); vBase = b4.y; vH = length(imx[1].xyz);
        vSeed = fract(sin(dot(b4.xz, vec2(12.9898,78.233)))*43758.5453); vSt = aStyle; vSt2 = aStyle2; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec3 vWN; varying float vBase; varying float vH; varying float vSeed; varying vec4 vSt; varying vec4 vSt2;
      uniform float uNight, uLitMul, uOverOn, uHalf, uWet, uSnow; uniform sampler2D uOver; ${GLSL_HASH}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      float floorH = max(vSt.x, 1.0), winW = max(vSt.y, 0.5), fillX = vSt.z, fillY = vSt.w;
      float litP = vSt2.x, storeF = vSt2.y, gMetal = vSt2.z, gTint = vSt2.w;
      vec3 fN = normalize(vWN);
      float fWall = 1.0 - step(0.5, abs(fN.y));
      float fRoof = step(0.6, fN.y);
      float fu = abs(fN.x) > abs(fN.z) ? vWPos.z : vWPos.x;
      float fv = vWPos.y - vBase;
      float faceId = floor(fN.x*1.5+2.0) + floor(fN.z*1.5+2.0)*4.0;
      float store = storeF * (1.0 - step(floorH*1.15, fv));
      vec2 fg = vec2(fu / mix(winW, winW*1.7, store), fv / floorH);
      vec2 fc = floor(fg); vec2 ff = fract(fg);
      vec2 fill = mix(vec2(fillX, fillY), vec2(0.9, 0.7), store);
      vec2 fw = fwidth(fg) + 1e-4;
      float cy = mix(0.56, 0.45, store);
      vec2 lo = vec2(0.5 - fill.x*0.5, cy - fill.y*0.5), hi = vec2(0.5 + fill.x*0.5, cy + fill.y*0.5);
      float wx = smoothstep(lo.x-fw.x, lo.x+fw.x, ff.x) * (1.0 - smoothstep(hi.x-fw.x, hi.x+fw.x, ff.x));
      float wy = smoothstep(lo.y-fw.y, lo.y+fw.y, ff.y) * (1.0 - smoothstep(hi.y-fw.y, hi.y+fw.y, ff.y));
      float fr = 0.06;
      float frx = smoothstep(lo.x-fr-fw.x, lo.x-fr+fw.x, ff.x) * (1.0 - smoothstep(hi.x+fr-fw.x, hi.x+fr+fw.x, ff.x));
      float fry = smoothstep(lo.y-fr*1.3-fw.y, lo.y-fr*1.3+fw.y, ff.y) * (1.0 - smoothstep(hi.y+fr*0.6-fw.y, hi.y+fr*0.6+fw.y, ff.y));
      float farF = clamp(max(fw.x, fw.y)*1.6 - 0.35, 0.0, 1.0);
      float valid = fWall * step(0.45, fv) * (1.0 - step(vH - 0.7, fv)) * step(0.05, fillX);
      float win = mix(wx*wy, fill.x*fill.y, farF) * valid;
      float frame = mix(frx*fry - wx*wy, 0.0, farF) * valid;
      float wr = fhash(vec3(fc, faceId + vSeed*113.0));
      float wr2 = fhash(vec3(fc.yx + 7.0, faceId*3.0 + vSeed*57.0));
      float grime = 0.9 + 0.1*fhash(vec3(fc.x, 3.0, faceId + vSeed));
      diffuseColor.rgb *= mix(1.0, grime, fWall) * (0.88 + 0.12*smoothstep(0.0, 5.0, fv));
      diffuseColor.rgb *= 1.0 - 0.08*fWall*(1.0 - smoothstep(0.0, 0.06, ff.y))*(1.0 - farF);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.55, clamp(frame,0.0,1.0)*0.8);
      vec3 roofC = mix(vec3(0.33,0.33,0.32), vec3(0.45,0.43,0.40), vSeed) * (0.85 + 0.3*fhash(vec3(floor(vWPos.xz*0.5), 1.0))*(1.0-farF));
      diffuseColor.rgb = mix(diffuseColor.rgb, roofC, fRoof * step(0.5, vSt.x));
      vec3 fGlass = mix(vec3(0.13,0.16,0.19), diffuseColor.rgb*0.45, gTint) * (0.7 + 0.6*wr2);
      diffuseColor.rgb = mix(diffuseColor.rgb, fGlass, win);
      diffuseColor.rgb *= 1.0 - uWet*0.18*fWall;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93,0.95,0.97), uSnow * fRoof);
      if(uOverOn > 0.5){ vec4 ovc = texture2D(uOver, (vWPos.xz + uHalf)/(2.0*uHalf)); diffuseColor.rgb = mix(vec3(0.8), ovc.rgb, step(0.02, ovc.a)*0.92); win = 0.0; }
      float lit = mix(step(wr, litP*uLitMul), litP*uLitMul, farF) * win;
      vec3 litCol = mix(vec3(1.0,0.62,0.32), vec3(1.0,0.9,0.75), wr2);
      if(wr2 > 0.85) litCol = vec3(0.65,0.8,1.0);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.05 + 0.12*wr2, win); roughnessFactor *= 1.0 - uWet*0.45*fRoof;`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, gMetal, win);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += litCol * lit * uNight * (0.45 + 0.8*wr2);`);
  };
  m.customProgramCacheKey = () => 'facade2';
  return m;
}
function nightEmissiveMaterial(base=.25, night=2.2){ // enseignes, éclairages : couleur d'instance lumineuse la nuit
  const m = new THREE.MeshStandardMaterial({ roughness:.5, envMapIntensity:.4 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uNight:U.uNight });
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * (${base.toFixed(2)} + uNight*${night.toFixed(2)});`); };
  m.customProgramCacheKey = () => 'nightEm'+base+night; return m;
}
function swayMaterial(){
  const m = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.92, envMapIntensity:.3 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uTime:U.uTime, uSnow:U.uSnow });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying float vUp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vUp = normal.y;
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz; float sw = sin(uTime*1.3 + ip.x*0.07 + ip.z*0.05) * 0.035 * max(position.y - 0.25, 0.0);
        transformed.x += sw; transformed.z += sw*0.6;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSnow; varying float vUp;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.96), uSnow*smoothstep(0.1,0.7,vUp)*0.85);'); };
  m.customProgramCacheKey = () => 'sway'; return m;
}
function fieldMaterial(){ // champs agricoles : sillons en coordonnées monde
  const m = new THREE.MeshStandardMaterial({ roughness:.95, envMapIntensity:.25 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uSnow:U.uSnow });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos2; varying vec2 vDir;').replace('#include <project_vertex>', `#include <project_vertex>
      { mat4 imx = mat4(1.0);
        #ifdef USE_INSTANCING
        imx = instanceMatrix;
        #endif
        vWPos2 = (modelMatrix*imx*vec4(transformed,1.0)).xyz; vDir = normalize(imx[0].xz); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSnow; varying vec3 vWPos2; varying vec2 vDir;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rows = dot(vWPos2.xz, vDir); float st = 0.5+0.5*sin(rows*2.6); float fw = fwidth(rows*2.6);
        diffuseColor.rgb *= mix(0.72 + 0.28*st, 0.86, clamp(fw,0.0,1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), uSnow*0.9);`); };
  m.customProgramCacheKey = () => 'field'; return m;
}
function sirenMaterial(){ // gyrophares : alternance rouge/bleu selon le côté du véhicule
  const m = new THREE.MeshBasicMaterial({ vertexColors:true });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uTime:U.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSide;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vSide = sign(position.x);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying float vSide;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ph = step(0.5, fract(uTime*2.2)); float on = vSide > 0.0 ? ph : 1.0 - ph; diffuseColor.rgb *= 0.25 + on*5.0;`); };
  m.customProgramCacheKey = () => 'siren'; return m;
}
function walkerMaterial(){ // piétons : balancement des jambes
  const m = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.8, envMapIntensity:.3 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uTime:U.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aLeg;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float ph = uTime*7.0 + instanceMatrix[3].x*3.1 + instanceMatrix[3].z*1.7;
      transformed.z += aLeg * sin(ph) * (0.9 - position.y) * 0.45;
      transformed.y += abs(sin(ph))*0.03;
      #endif`); };
  m.customProgramCacheKey = () => 'walker'; return m;
}
const MAT = {
  fac: facadeMaterial(),
  pad: new THREE.MeshStandardMaterial({ roughness:.95, envMapIntensity:.35 }),
  roof: new THREE.MeshStandardMaterial({ roughness:.78, envMapIntensity:.5 }),
  equip: new THREE.MeshStandardMaterial({ roughness:.6, metalness:.25, envMapIntensity:.6 }),
  metal: new THREE.MeshStandardMaterial({ roughness:.32, metalness:.7, envMapIntensity:.9 }),
  chim: new THREE.MeshStandardMaterial({ roughness:.92, envMapIntensity:.3 }),
  glass: new THREE.MeshStandardMaterial({ roughness:.05, metalness:.9, envMapIntensity:1.2 }),
  sign: nightEmissiveMaterial(.18, 2.4),
  field: fieldMaterial(),
  solar: new THREE.MeshStandardMaterial({ color:0x1b2a44, roughness:.12, metalness:.8, envMapIntensity:1.1 }),
  poolw: new THREE.MeshStandardMaterial({ color:0x2a9fc7, roughness:.05, metalness:.1, envMapIntensity:1 }),
  tree: swayMaterial(),
  veh: new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.3, metalness:.55, envMapIntensity:1 }),
  vlight: new THREE.MeshBasicMaterial({ vertexColors:true }),
  siren: sirenMaterial(),
  walker: walkerMaterial(),
  lampHead: new THREE.MeshBasicMaterial({ color:0xffffff }),
  tlHead: new THREE.MeshBasicMaterial({ color:0xffffff }),
  concrete: new THREE.MeshStandardMaterial({ color:0xb4b0a8, roughness:.92, envMapIntensity:.35 }),
  white: new THREE.MeshStandardMaterial({ color:0xeef0f1, roughness:.45, metalness:.1 }),
};

/* ---------- géométries de base ---------- */
const BOX = new THREE.BoxGeometry(1,1,1).translate(0,.5,0);
const CYL = new THREE.CylinderGeometry(1,1,1,20).translate(0,.5,0);
const CYL8 = new THREE.CylinderGeometry(1,1,1,8).translate(0,.5,0);
const CHIM = new THREE.CylinderGeometry(.72,1,1,14).translate(0,.5,0);
const CONE = new THREE.ConeGeometry(1,1,16).translate(0,.5,0);
const SPHERE = new THREE.SphereGeometry(1,20,14);
const DOME = new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2);
const PRISM = (() => { const g = new THREE.BufferGeometry(); const v = [];
  const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],E=[-.5,1,0],F=[.5,1,0];
  const q = (a,b,c) => v.push(...a,...b,...c); q(D,C,F); q(D,F,E); q(B,A,E); q(B,E,F); q(A,D,E); q(C,B,F);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v,3)); g.computeVertexNormals(); return g; })();
const HIP = (() => { const g = new THREE.BufferGeometry(); const v = []; // toit en croupe, faîtage le long de x
  const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],E=[-.25,1,0],F=[.25,1,0];
  const q = (a,b,c) => v.push(...a,...b,...c); q(D,C,F); q(D,F,E); q(B,A,E); q(B,E,F); q(A,D,E); q(C,B,F);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v,3)); g.computeVertexNormals(); return g; })();
const SAW = (() => { const g = new THREE.BufferGeometry(); const v = []; // toit en sheds (un module)
  const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],E=[-.5,1,.5],F=[.5,1,.5];
  const q = (a,b,c) => v.push(...a,...b,...c); q(A,D,E); q(B,F,C); q(A,E,F); q(A,F,B); q(D,C,F); q(D,F,E);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v,3)); g.computeVertexNormals(); return g; })();
function prep(geo, c, extra){ const g = geo.index ? geo.toNonIndexed() : geo.clone(); for(const k of Object.keys(g.attributes)) if(k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.position.count, a = new Float32Array(n*3); const cc = col(c); for(let i=0;i<n;i++){ a[i*3]=cc.r; a[i*3+1]=cc.g; a[i*3+2]=cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a,3));
  if(extra) for(const k in extra) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n).fill(extra[k]),1));
  return g; }
const bx = (w,h,d,x,y,z,c,ex) => prep(new THREE.BoxGeometry(w,h,d).translate(x,y,z), c, ex);
const cy = (r1,r2,h,x,y,z,c,seg=10,rotZ=0) => { const g = new THREE.CylinderGeometry(r1,r2,h,seg); if(rotZ) g.rotateZ(rotZ); return prep(g.translate(x,y,z), c); };
const wheel = (x,z,r=.33,w=.24) => cy(r,r,w,x,r,z,'#111111',10,Math.PI/2);
function blob(detail, r, cx, cy_, cz, c, jit, seed){
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, nrm = g.attributes.normal;
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i); const l = Math.hypot(x,y,z);
    const k = 1 + jit*Math.sin(x*9.1+seed)*Math.sin(y*7.3+seed*2)*Math.sin(z*8.7+seed*3);
    nrm.setXYZ(i, x/l, y/l, z/l); p.setXYZ(i, x*k+cx, y*k*.9+cy_, z*k+cz); }
  return prep(g, c);
}
/* arbres : feuillu, conifère, peuplier */
const TREE_D = mergeGeometries([ prep(new THREE.CylinderGeometry(.025,.045,.5,5,1,true).translate(0,.25,0), '#5a4634'),
  blob(0, .31, 0, .64, 0, '#557a2e', .3, 1), blob(0, .23, .15, .52, .08, '#4d7229', .3, 2), blob(0, .21, -.12, .78, -.06, '#638635', .3, 3) ]);
const TREE_C = mergeGeometries([ prep(new THREE.CylinderGeometry(.02,.04,.3,5,1,true).translate(0,.15,0), '#4f3e2e'),
  prep(new THREE.ConeGeometry(.28,.5,7,1,true).translate(0,.4,0), '#2f5226'), prep(new THREE.ConeGeometry(.2,.42,7,1,true).translate(0,.64,0), '#35592a'), prep(new THREE.ConeGeometry(.12,.3,7,1,true).translate(0,.86,0), '#3c632f') ]);
const TREE_P = mergeGeometries([ prep(new THREE.CylinderGeometry(.02,.035,.4,5,1,true).translate(0,.2,0), '#5b4a38'),
  blob(0, .15, 0, .62, 0, '#6a8a36', .25, 5), blob(0, .12, 0, .42, 0, '#5f8232', .25, 6), blob(0, .1, 0, .85, 0, '#76963c', .25, 7) ]);

/* véhicules (avant vers +z) */
function lightsFor(len, y, halfW){ return mergeGeometries([ ...[halfW-.22,-(halfW-.22)].map(x => bx(.34,.14,.06,x,y,len/2+.01,'#fff3d6')), ...[halfW-.2,-(halfW-.2)].map(x => bx(.3,.12,.06,x,y+.05,-len/2-.01,'#ff1e0a')) ]); }
const VEH = {
  sedan:{ geo:mergeGeometries([ bx(1.78,.62,4.4,0,.64,0,'#ffffff'), bx(1.58,.56,2.25,0,1.22,-.2,'#1c232b'), bx(1.5,.05,2.0,0,1.52,-.2,'#ffffff'), ...[[.84,1.4],[-.84,1.4],[.84,-1.35],[-.84,-1.35]].map(([x,z]) => wheel(x,z)) ]), lights:lightsFor(4.4,.72,.89), len:4.4 },
  hatch:{ geo:mergeGeometries([ bx(1.7,.62,3.9,0,.64,0,'#ffffff'), bx(1.56,.6,2.3,0,1.24,-.45,'#1c232b'), bx(1.48,.05,2.1,0,1.56,-.45,'#ffffff'), ...[[.8,1.2],[-.8,1.2],[.8,-1.2],[-.8,-1.2]].map(([x,z]) => wheel(x,z,.31)) ]), lights:lightsFor(3.9,.72,.85), len:3.9 },
  suv:{ geo:mergeGeometries([ bx(1.9,.82,4.7,0,.8,0,'#ffffff'), bx(1.8,.68,2.9,0,1.55,-.3,'#1c232b'), bx(1.72,.06,2.7,0,1.9,-.3,'#ffffff'), ...[[.9,1.5],[-.9,1.5],[.9,-1.45],[-.9,-1.45]].map(([x,z]) => wheel(x,z,.38,.28)) ]), lights:lightsFor(4.7,.9,.95), len:4.7 },
  van:{ geo:mergeGeometries([ bx(1.96,1.9,5.1,0,1.25,-.1,'#ffffff'), bx(1.9,.7,.1,0,1.55,2.46,'#1c232b'), ...[[.9,1.6],[-.9,1.6],[.9,-1.6],[-.9,-1.6]].map(([x,z]) => wheel(x,z,.36,.26)) ]), lights:lightsFor(5.1,.85,.98), len:5.1 },
  truck:{ geo:mergeGeometries([ bx(2.3,2.3,2.2,0,1.45,3.4,'#ffffff'), bx(2.1,.6,.1,0,2.0,4.51,'#1c232b'), bx(2.45,2.8,7.4,0,2.0,-1.3,'#d9d9d6'),
    ...[[1.05,3.4],[-1.05,3.4],[1.05,-3.2],[-1.05,-3.2],[1.05,-4.4],[-1.05,-4.4]].map(([x,z]) => wheel(x,z,.48,.32)) ]), lights:lightsFor(10.2,.95,1.15), len:10.2 },
  bus:{ geo:mergeGeometries([ bx(2.5,2.9,12,0,1.75,0,'#ffffff'), bx(2.54,1.0,10.6,0,2.2,-.3,'#1b2530'), bx(2.4,1.3,.1,0,2.1,6.01,'#1b2530'), bx(2.3,.25,6,0,3.3,-1,'#cfd4d8'),
    ...[[1.15,4],[-1.15,4],[1.15,-3.6],[-1.15,-3.6]].map(([x,z]) => wheel(x,z,.5,.34)) ]), lights:lightsFor(12,.85,1.25), len:12 },
  fire:{ geo:mergeGeometries([ bx(2.45,2.6,8.4,0,1.65,0,'#ffffff'), bx(2.3,.8,.1,0,2.3,4.21,'#1c232b'), bx(.9,.3,6.5,0,3.1,-.6,'#c9ccd0'), bx(2.5,.22,8.4,0,.95,0,'#f2f2f2'),
    ...[[1.1,2.9],[-1.1,2.9],[1.1,-2.6],[-1.1,-2.6]].map(([x,z]) => wheel(x,z,.5,.34)) ]), lights:lightsFor(8.4,.9,1.2), len:8.4, siren:mergeGeometries([bx(.7,.2,.3,.5,3.0,3.6,'#ff2020'), bx(.7,.2,.3,-.5,3.0,3.6,'#2050ff')]) },
  police:{ geo:mergeGeometries([ bx(1.8,.62,4.6,0,.64,0,'#ffffff'), bx(1.6,.56,2.3,0,1.22,-.2,'#1c232b'), bx(1.82,.2,2.6,0,.75,.1,'#1d3f86'), ...[[.84,1.45],[-.84,1.45],[.84,-1.4],[-.84,-1.4]].map(([x,z]) => wheel(x,z)) ]),
    lights:lightsFor(4.6,.72,.9), len:4.6, siren:mergeGeometries([bx(.55,.16,.3,.35,1.6,-.1,'#ff2020'), bx(.55,.16,.3,-.35,1.6,-.1,'#2050ff')]) },
  ambulance:{ geo:mergeGeometries([ bx(2.1,2.3,5.8,0,1.45,-.3,'#ffffff'), bx(2.12,.3,5.82,0,1.2,-.3,'#d8262b'), bx(2.0,.7,.1,0,1.8,2.61,'#1c232b'), ...[[.95,1.8],[-.95,1.8],[.95,-1.9],[-.95,-1.9]].map(([x,z]) => wheel(x,z,.38,.28)) ]),
    lights:lightsFor(6.4,.85,1.05), len:6.2, siren:mergeGeometries([bx(.5,.18,.3,.45,2.7,2.0,'#ff2020'), bx(.5,.18,.3,-.45,2.7,2.0,'#2050ff')]) },
  garbage:{ geo:mergeGeometries([ bx(2.3,2.2,2.0,0,1.4,2.9,'#f0f0ec'), bx(2.1,.6,.1,0,1.9,3.91,'#1c232b'), bx(2.4,2.7,5.2,0,1.8,-.8,'#ffffff'), ...[[1.05,2.9],[-1.05,2.9],[1.05,-1.9],[-1.05,-1.9],[1.05,-2.9],[-1.05,-2.9]].map(([x,z]) => wheel(x,z,.46,.32)) ]),
    lights:lightsFor(8,.9,1.15), len:8 },
  hearse:{ geo:mergeGeometries([ bx(1.85,.66,5.4,0,.66,0,'#ffffff'), bx(1.65,.62,3.4,0,1.28,-.5,'#1c232b'), bx(1.66,.06,3.2,0,1.62,-.5,'#ffffff'), ...[[.86,1.8],[-.86,1.8],[.86,-1.8],[-.86,-1.8]].map(([x,z]) => wheel(x,z)) ]), lights:lightsFor(5.4,.74,.92), len:5.4 },
  train:{ geo:mergeGeometries([ bx(3,3.6,15.5,0,2.5,0,'#ffffff'), bx(3.04,.9,13,0,3.0,0,'#1b2530'), bx(2.6,.3,15,0,.55,0,'#2a2a2a'), bx(3.02,.25,15.5,0,1.25,0,'#c8201f') ]), lights:lightsFor(15.5,1.2,1.3), len:16 },
  plane:{ geo:mergeGeometries([ cy(2,2,34,0,0,0,'#f4f5f6',14,Math.PI/2).rotateY(Math.PI/2), prep(new THREE.SphereGeometry(2,14,10).scale(1,1,2).translate(0,0,17), '#f4f5f6'), prep(new THREE.ConeGeometry(2,7,14).rotateX(-Math.PI/2).translate(0,.3,-20), '#f4f5f6'),
    bx(34,.5,5,0,-.6,1,'#dfe2e6'), bx(12,.4,3,0,.8,-19,'#dfe2e6'), bx(.4,6,4,0,3.5,-19,'#1d4f91'), cy(1,1,4,-7,-1.8,2,'#b8bcc2',10,Math.PI/2).rotateY(Math.PI/2).translate(0,0,0), cy(1,1,4,7,-1.8,2,'#b8bcc2',10,Math.PI/2).rotateY(Math.PI/2) ]), len:40 },
  ship:{ geo:mergeGeometries([ bx(22,8,110,0,2,0,'#2a3440'), bx(22.2,1.2,110,0,5.4,0,'#8d2a22'), bx(18,10,14,0,11,-44,'#f0f0ec'), bx(14,3,8,0,17,-44,'#1c232b'),
    ...Array.from({length:6},(_,k)=>bx(19,6,11,0,9,-28+k*13,['#b83a2d','#2d6fa8','#3f8a4a','#c9922b','#6d7780','#a44a8a'][k])) ]), len:110 },
};
const PED = mergeGeometries([ prep(new THREE.CylinderGeometry(.2,.17,.62,6).translate(0,1.12,0), '#ffffff', {aLeg:0}), prep(new THREE.SphereGeometry(.13,8,6).translate(0,1.58,0), '#c89478', {aLeg:0}),
  prep(new THREE.BoxGeometry(.12,.82,.14).translate(.09,.41,0), '#2b3440', {aLeg:1}), prep(new THREE.BoxGeometry(.12,.82,.14).translate(-.09,.41,0), '#2b3440', {aLeg:-1}) ]);
/* mobilier */
const LAMP = mergeGeometries([ cy(.07,.11,7.6,0,3.8,0,'#3b3f44',6), bx(.08,.08,2.3,0,7.5,1.05,'#3b3f44') ]);
const LAMP_H = new THREE.BoxGeometry(.36,.12,.8).translate(0,7.42,2.15);
const TL_POLE = mergeGeometries([ cy(.1,.12,6,0,3,0,'#2e3236',6), bx(.1,.1,4.2,0,5.9,2.0,'#2e3236'), bx(.42,1.1,.36,0,5.35,3.8,'#1b1d20') ]);
const TL_HEAD = new THREE.SphereGeometry(.17,8,6).translate(0,5.35,4.0);
const SHELTER = mergeGeometries([ bx(3.2,.1,1.5,0,2.5,0,'#6b7a86'), bx(.08,2.5,1.4,-1.55,1.25,0,'#8a959d'), bx(.08,2.5,1.4,1.55,1.25,0,'#8a959d'), bx(3.1,2.1,.05,0,1.3,-.7,'#9fc1d6'), bx(2.6,.08,.45,0,.5,-.4,'#6b4f35') ]);
const BENCH = mergeGeometries([ bx(1.8,.08,.5,0,.45,0,'#6b4f35'), bx(1.8,.45,.06,0,.75,-.24,'#6b4f35'), bx(.08,.45,.45,-.8,.22,0,'#333'), bx(.08,.45,.45,.8,.22,0,'#333') ]);
const PILLAR = new THREE.BoxGeometry(1,1,1).translate(0,.5,0);
const GRAVE = mergeGeometries([ bx(.6,.9,.14,0,.45,0,'#9a9a96') ]);
const PUMPJACK = mergeGeometries([ bx(.6,3.2,.6,0,1.6,0,'#4a4f55'), bx(.3,.4,7,0,3.3,0,'#2c3e5c'), bx(1,1.4,.6,0,2.6,3.2,'#2c3e5c'), bx(3,.4,4,0,.2,0,'#6a6d70') ]);
const CRANE = mergeGeometries([ bx(1.6,30,1.6,0,15,0,'#d7a52b'), bx(1.4,1.4,34,0,30,6,'#d7a52b'), bx(3,3,4,0,31.5,-8,'#6c6f73'), bx(.2,14,.2,0,23,20,'#333') ]);
const CONTAINER = new THREE.BoxGeometry(2.4,2.6,6).translate(0,1.3,0);
