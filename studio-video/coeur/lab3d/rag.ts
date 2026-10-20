// RAG TECHNIQUE LOCAL — une base de connaissances embarquée (three.js r186, GLSL, glTF 2.0, cannon-es, API du bac à
// sable) découpée en fiches courtes. Recherche BM25 hors-ligne : les fiches les plus pertinentes pour la demande (ou
// pour l'erreur à corriger) sont injectées dans le contexte du modèle. Rien n'est inventé à l'exécution : ce sont des
// faits d'API stables, écrits une fois et testés.
export interface Doc {
  id: string;
  title: string;
  tags: string;
  text: string;
}
export const DOCS: Doc[] = [
  {
    id: 'sandbox-api',
    title: 'API du bac à sable 3D (MASSAMBA)',
    tags: 'sandbox api scene camera renderer controls physics onFrame helpers import module',
    text: `Le code s'exécute dans une fonction async : pas d'« import », pas d'export. Variables fournies : THREE (three.js r186 complet + OrbitControls, GLTFExporter, GLTFLoader, DRACOLoader, RoundedBoxGeometry), CANNON (cannon-es), scene (déjà éclairée : HemisphereLight + DirectionalLight avec ombres), camera (PerspectiveCamera en (4,3,6)), renderer (WebGLRenderer, ombres actives, SRGB), controls (OrbitControls). Animation : onFrame((dt, t) => {...}) — ne jamais appeler requestAnimationFrame ni renderer.render soi-même. Physique : physics.ground(y), physics.add(mesh, {mass, kinematic, shape:'box'|'sphere'|'cylinder', restitution, friction}) renvoie le corps CANNON ; la position du mesh suit le corps automatiquement. physics.path(body, [[x,y,z],...], vitesse, fermé) fait suivre une trajectoire à un corps cinématique. Aides : helpers.grid(n), helpers.shaderPreview(vertexShader, fragmentShader, 'sphere'|'plane'|'torus') (uniforms uTime et uResolution fournis). Le scène est remise à zéro à chaque exécution. console.log est affiché dans la console du studio.`,
  },
  {
    id: 'three-colorspace',
    title: 'three.js r152+ : espaces colorimétriques (outputEncoding supprimé)',
    tags: 'outputEncoding sRGBEncoding encoding colorSpace SRGBColorSpace texture couleur deprecated removed',
    text: `renderer.outputEncoding et THREE.sRGBEncoding n'existent plus (supprimés en r162). Utiliser renderer.outputColorSpace = THREE.SRGBColorSpace (valeur par défaut) et, pour une texture de couleur, texture.colorSpace = THREE.SRGBColorSpace. Les textures de données (normal, roughness) restent en THREE.NoColorSpace / LinearSRGBColorSpace.`,
  },
  {
    id: 'three-geometry',
    title: 'three.js : BufferGeometry (la classe Geometry est supprimée)',
    tags: 'Geometry BufferGeometry vertices faces setAttribute Float32BufferAttribute setIndex computeVertexNormals position normal uv procedural',
    text: `THREE.Geometry, geometry.vertices et geometry.faces n'existent plus (r125). Géométrie procédurale : const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); Après modification : g.attributes.position.needsUpdate = true. Primitives : BoxGeometry(w,h,d,ws,hs,ds), SphereGeometry(r, wSeg, hSeg), CylinderGeometry(rTop, rBottom, h, radialSeg), ConeGeometry(r,h,seg), TorusGeometry(R, tube, radSeg, tubSeg), TorusKnotGeometry(r, tube, tubSeg, radSeg), PlaneGeometry(w,h,ws,hs), CapsuleGeometry(r, length, capSeg, radSeg), LatheGeometry(points Vector2[], seg), ExtrudeGeometry(shape, {depth, bevelEnabled}), TubeGeometry(curve, tubSeg, r, radSeg, closed). mergeGeometries est dans BufferGeometryUtils (non fourni : construire un Group à la place).`,
  },
  {
    id: 'three-lights',
    title: 'three.js r155+ : éclairage physique (intensités, decay)',
    tags: 'light PointLight SpotLight DirectionalLight intensity decay physicallyCorrectLights useLegacyLights candela dark sombre noir',
    text: `renderer.physicallyCorrectLights et renderer.useLegacyLights sont supprimés : l'éclairage est toujours physique. PointLight(color, intensity, distance=0, decay=2) et SpotLight utilisent des candelas : une intensité de 1 est très faible, compter 20 à 200 selon la distance. DirectionalLight(color, intensity) : 1 à 3. Ombres : renderer.shadowMap.enabled = true; light.castShadow = true; mesh.castShadow = true; sol.receiveShadow = true; light.shadow.mapSize.set(1024,1024). Une scène noire vient souvent d'un MeshStandardMaterial sans lumière ou d'une PointLight trop faible.`,
  },
  {
    id: 'three-materials',
    title: 'three.js : matériaux PBR et ShaderMaterial',
    tags: 'material MeshStandardMaterial MeshPhysicalMaterial MeshBasicMaterial metalness roughness transmission clearcoat emissive ShaderMaterial RawShaderMaterial uniforms transparent side DoubleSide',
    text: `MeshStandardMaterial({color, metalness:0..1, roughness:0..1, emissive, emissiveIntensity, map, normalMap}) ; MeshPhysicalMaterial ajoute clearcoat, transmission (verre), ior, sheen, iridescence. MeshBasicMaterial n'est pas éclairé. transparent:true + opacity pour la transparence ; side: THREE.DoubleSide pour les deux faces. ShaderMaterial({uniforms:{uTime:{value:0}}, vertexShader, fragmentShader}) fournit automatiquement projectionMatrix, modelViewMatrix, modelMatrix, viewMatrix, normalMatrix, cameraPosition et les attributs position, normal, uv : ne pas les redéclarer. RawShaderMaterial ne fournit rien : tout déclarer, y compris « precision highp float; ». Mettre à jour un uniform : mat.uniforms.uTime.value = t.`,
  },
  {
    id: 'glsl-basics',
    title: 'GLSL (WebGL 2, ShaderMaterial) : syntaxe et pièges',
    tags: 'glsl shader vertex fragment gl_Position gl_FragColor varying uniform attribute float int vec2 vec3 vec4 mat4 error syntax compile ERROR',
    text: `Vertex : void main(){ vUv = uv; vec3 p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); } Fragment : varying vec2 vUv; uniform float uTime; void main(){ gl_FragColor = vec4(vec3(vUv, 0.5), 1.0); } (three.js accepte gl_FragColor et « varying » en WebGL 2 grâce à ses #define). Pièges qui cassent la compilation : un entier là où un float est attendu (écrire 1.0, pas 1 : « float x = 1; » est une erreur), opérations entre types différents (vec3 * vec4), variable non déclarée, point-virgule manquant, fonction utilisée avant sa déclaration, varying déclaré dans un seul des deux shaders ou avec des types différents. Fonctions utiles : mix, smoothstep, step, fract, mod, clamp, length, normalize, dot, cross, reflect, sin, cos, pow (pow(x,y) indéfini pour x<0). Pas de noise() intégré : l'écrire (hash + interpolation).`,
  },
  {
    id: 'glsl-noise',
    title: 'GLSL : bruit procédural (hash, value noise, fbm)',
    tags: 'noise fbm hash random procedural terrain fire nuage cloud marble',
    text: `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y); } float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 5; k++){ v += a*noise(p); p *= 2.0; a *= 0.5; } return v; } Les boucles GLSL doivent avoir une borne constante.`,
  },
  {
    id: 'three-instancing',
    title: 'three.js : InstancedMesh (milliers d’objets)',
    tags: 'InstancedMesh instance setMatrixAt instanceMatrix setColorAt performance many objects forest crowd particles',
    text: `const m = new THREE.InstancedMesh(geometry, material, count); const o = new THREE.Object3D(); for (let i=0;i<count;i++){ o.position.set(x,y,z); o.rotation.set(...); o.scale.setScalar(s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, new THREE.Color(...)); } m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; scene.add(m). Particules : THREE.Points(geometry, new THREE.PointsMaterial({size, sizeAttenuation:true, vertexColors:true})).`,
  },
  {
    id: 'three-scene',
    title: 'three.js : objets, groupes, transformations, textures générées',
    tags: 'Group Object3D position rotation scale lookAt add remove Euler Quaternion Vector3 Color CanvasTexture texture text fog background',
    text: `Group pour assembler : const g = new THREE.Group(); g.add(a, b); scene.add(g). Transformations : obj.position.set(x,y,z); obj.rotation.set(rx,ry,rz) en radians (THREE.MathUtils.degToRad) ; obj.scale.set(...); obj.lookAt(v). Couleurs : new THREE.Color('#ff8800') ou color.setHSL(h,s,l). Brouillard : scene.fog = new THREE.Fog(couleur, near, far). Pas de police chargée dans le bac à sable : pour écrire du texte, dessiner dans un canvas 2D et l'utiliser comme THREE.CanvasTexture (texture.colorSpace = THREE.SRGBColorSpace). Courbes : CatmullRomCurve3(points).getPointAt(u).`,
  },
  {
    id: 'cannon-basics',
    title: 'cannon-es : monde, corps, formes, contacts',
    tags: 'cannon physics physique World Body Box Sphere Plane Cylinder Vec3 mass gravity fixedStep impulse velocity collision ContactMaterial friction restitution rigid',
    text: `world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) }) (déjà créé : physics.world). Body({ mass, shape, position: new CANNON.Vec3(...) }) ; mass 0 = statique. Formes : new CANNON.Box(new CANNON.Vec3(demiLargeur, demiHauteur, demiProfondeur)) — DEMI-dimensions ; Sphere(rayon) ; Plane() dont la normale est +Z : le tourner body.quaternion.setFromEuler(-Math.PI/2, 0, 0) pour un sol ; Cylinder(rTop, rBottom, hauteur, segments) aligné sur Y dans cannon-es. Forces : body.applyImpulse(new CANNON.Vec3(...), body.position) ; body.velocity.set(...) ; body.angularVelocity. Contacts : const a = new CANNON.Material(); world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction: 0.3, restitution: 0.7 })). Événements : body.addEventListener('collide', e => ...). Corps cinématique : type: CANNON.Body.KINEMATIC, déplacé par sa vitesse ou sa position (physics.path le fait).`,
  },
  {
    id: 'gltf-export',
    title: 'glTF 2.0 / GLB : export et compression Draco',
    tags: 'gltf glb export GLTFExporter draco KHR_draco_mesh_compression compression binary materials pbr units meters y-up ShaderMaterial texture',
    text: `glTF 2.0 : mètres, axe Y vers le haut, matériaux PBR metallic-roughness. GLTFExporter exporte MeshStandardMaterial / MeshPhysicalMaterial (en partie : clearcoat, transmission… via extensions KHR_materials_*), MeshBasicMaterial (KHR_materials_unlit) ; un ShaderMaterial ne s'exporte PAS (le rendu GLSL est perdu). Les objets cachés et les helpers sont exclus. GLB = un seul fichier binaire (JSON + buffers). Draco (KHR_draco_mesh_compression) compresse positions, normales et UV des maillages (souvent 5 à 10 fois plus petit pour des maillages denses) ; le lecteur doit avoir un décodeur Draco (GLTFLoader + DRACOLoader). Les animations par onFrame ne sont pas exportées : seul l'état courant de la scène l'est.`,
  },
  {
    id: 'three-errors',
    title: 'Erreurs fréquentes three.js et corrections',
    tags: 'error TypeError undefined is not a constructor is not a function cannot read properties null NaN black screen erreur',
    text: `« THREE.X is not a constructor » : la classe n'existe pas ou a été renommée (Geometry → BufferGeometry, CubeGeometry → BoxGeometry, PlaneBufferGeometry → PlaneGeometry, SphereBufferGeometry → SphereGeometry : les « …BufferGeometry » sont supprimées depuis r144). « Cannot read properties of undefined (reading 'x') » : objet non créé avant usage ou mauvais nom de propriété. NaN dans les positions : division par zéro, BoxGeometry de taille 0. Écran noir : pas de lumière avec un matériau standard, caméra à l'intérieur d'un objet, objet hors champ (vérifier camera.position et camera.lookAt). Ne pas créer de nouveau renderer ni de nouvelle scène : utiliser ceux fournis.`,
  },
];

// ── BM25 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1);
const INDEX = (() => {
  const docs = DOCS.map((d) => {
    const toks = [...tokens(d.title), ...tokens(d.tags), ...tokens(d.tags), ...tokens(d.text)];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { d, tf, len: toks.length };
  });
  const df = new Map<string, number>();
  for (const x of docs) for (const t of x.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((a, x) => a + x.len, 0) / docs.length;
  return { docs, df, avg };
})();
/** The k most relevant knowledge cards for a query (BM25, k1 = 1.4, b = 0.75); score 0 cards are never returned. */
export function searchDocs(query: string, k = 3): { doc: Doc; score: number }[] {
  const q = [...new Set(tokens(query))];
  const N = INDEX.docs.length;
  return INDEX.docs
    .map(({ d, tf, len }) => {
      let s = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - (INDEX.df.get(t) ?? 0) + 0.5) / ((INDEX.df.get(t) ?? 0) + 0.5));
        s += (idf * (f * 2.4)) / (f + 1.4 * (0.25 + 0.75 * (len / INDEX.avg)));
      }
      return { doc: d, score: Math.round(s * 1000) / 1000 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
/** The context block injected for the model: the sandbox API card always, then the most relevant cards. */
export function ragContext(query: string, k = 3): string {
  const hits = searchDocs(query, k + 1)
    .filter((h) => h.doc.id !== 'sandbox-api')
    .slice(0, k);
  const cards = [DOCS[0]!, ...hits.map((h) => h.doc)];
  return `DOCUMENTATION TECHNIQUE (base locale, à respecter) :\n${cards.map((c) => `## ${c.title}\n${c.text}`).join('\n\n')}`;
}
