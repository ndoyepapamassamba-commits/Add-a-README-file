import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- raccourcis DOM ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const nextFrame = () => new Promise(r => setTimeout(r, 16));
function progress(msg, f){ $('#ldMsg').textContent = msg; $('#ldFill').style.width = Math.round(f*100)+'%'; }

/* ---------- monde ---------- */
const CELL = 8;             // pas du maillage de terrain (m)
const N = 240;              // cellules jouables par côté (1 920 m)
const M = 40;               // marge décorative autour de la carte
const NE = N + 2*M, NE1 = NE + 1;
const HALF = N*CELL/2;      // 960 m
const EHALF = NE*CELL/2;    // 1 280 m
const WC = 16, WN = NE*CELL/WC;          // grille de simulation de l'eau (16 m)
const FC = 16, FN = N*CELL/FC;           // grille des champs (pollution, couverture…) sur la zone jouable
const SEA = 0;
const ZC = 8;               // taille d'une cellule de zonage

/* ---------- outils mathématiques ---------- */
const clamp = (x,a,b) => x<a?a:x>b?b:x;
const smooth = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const lerp = (a,b,t) => a+(b-a)*t;
const dist2 = (ax,az,bx,bz) => (ax-bx)*(ax-bx)+(az-bz)*(az-bz);
const angDiff = (a,b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
const fmt = new Intl.NumberFormat('fr-FR');
const fmt1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits:1 });
const money = v => (v < 0 ? '−' : '') + fmt.format(Math.abs(Math.round(v))) + ' $';
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const hash1 = n => { const x = Math.sin(n*127.1+311.7)*43758.5453; return x-Math.floor(x); };
const col = h => new THREE.Color(h);
const pick = (arr, r) => arr[Math.floor(r()*arr.length)%arr.length];
const rnd = Math.random;
function makeNoise(seed){
  const r = mulberry32(seed); const P = new Uint16Array(512), G = new Float32Array(256); const p = [...Array(256).keys()];
  for(let i=255;i>0;i--){ const j = Math.floor(r()*(i+1)); [p[i],p[j]] = [p[j],p[i]]; }
  for(let i=0;i<512;i++) P[i] = p[i&255]; for(let i=0;i<256;i++) G[i] = r()*2-1;
  const fade = t => t*t*t*(t*(t*6-15)+10);
  function n2(x,y){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, X=xi&255, Y=yi&255;
    const a=G[P[X+P[Y]]], b=G[P[X+1+P[Y]]], c=G[P[X+P[Y+1]]], d=G[P[X+1+P[Y+1]]]; const u=fade(xf), v=fade(yf);
    return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
  function fbm(x,y,o=5){ let s=0,a=.5,f=1,t=0; for(let k=0;k<o;k++){ s+=a*n2(x*f,y*f); t+=a; a*=.5; f*=2.03; } return s/t; }
  return { n2, fbm };
}
// point le plus proche sur un segment [a,b]
function closestOnSeg(px,pz,ax,az,bx,bz){ const dx=bx-ax, dz=bz-az, l2=dx*dx+dz*dz; let t = l2 ? ((px-ax)*dx+(pz-az)*dz)/l2 : 0; t = clamp(t,0,1);
  const x = ax+dx*t, z = az+dz*t; return { t, x, z, d:Math.hypot(px-x, pz-z) }; }
// intersection de deux segments 2D
function segIntersect(ax,az,bx,bz,cx,cz,dx,dz){ const rx=bx-ax, rz=bz-az, sx=dx-cx, sz=dz-cz, den = rx*sz-rz*sx; if(Math.abs(den) < 1e-9) return null;
  const t = ((cx-ax)*sz-(cz-az)*sx)/den, u = ((cx-ax)*rz-(cz-az)*rx)/den; if(t < 0 || t > 1 || u < 0 || u > 1) return null; return { t, u, x:ax+rx*t, z:az+rz*t }; }
// segment orienté (OBB) contre point
function inOBB(px,pz,cx,cz,ang,hw,hd){ const c = Math.cos(ang), s = Math.sin(ang), dx = px-cx, dz = pz-cz; const lx = dx*c - dz*s, lz = dx*s + dz*c; return Math.abs(lx) <= hw && Math.abs(lz) <= hd; }
function obbCorners(cx,cz,ang,hw,hd){ const c = Math.cos(ang), s = Math.sin(ang); // repère local : x latéral, z profondeur ; rotation Y de three.js
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([x,z]) => [cx + x*c + z*s, cz - x*s + z*c]); }
function obbOverlap(a, b){ // séparation des axes pour deux rectangles orientés {x,z,ang,hw,hd}
  const ca = obbCorners(a.x,a.z,a.ang,a.hw,a.hd), cb = obbCorners(b.x,b.z,b.ang,b.hw,b.hd);
  for(const poly of [ca, cb]) for(let i=0;i<4;i++){ const p = poly[i], q = poly[(i+1)%4], nx = -(q[1]-p[1]), nz = q[0]-p[0];
    let amin=1e9, amax=-1e9, bmin=1e9, bmax=-1e9; for(const v of ca){ const d = v[0]*nx+v[1]*nz; amin=Math.min(amin,d); amax=Math.max(amax,d); }
    for(const v of cb){ const d = v[0]*nx+v[1]*nz; bmin=Math.min(bmin,d); bmax=Math.max(bmax,d); } if(amax < bmin || bmax < amin) return false; }
  return true; }

/* ---------- bus d'événements ---------- */
const bus = { h:{}, on(e,f){ (this.h[e] ||= []).push(f); }, emit(e,...a){ for(const f of this.h[e]||[]) f(...a); } };

/* ---------- état de la partie ---------- */
const state = {
  name:'Val-Clair', seed:1337, money:120000, time:16*1440 + 8*60, speed:1, lastSpeed:1, dayCycle:true,
  taxes:{ Rl:9, Rh:9, Cl:9, Ch:9, I:9, O:9 },
  budgets:{ power:100, water:100, garbage:100, health:100, fire:100, police:100, edu:100, transit:100, parks:100, roads:100 },
  loans:[], policies:{}, weatherMode:'auto', disAuto:true,
  pop:0, popPrev:0, workers:0, jobs:0, unemployed:0, students:0, happy:.7, tourists:0,
  demand:{ R:.7, C:.2, I:.5, O:-.2 },
  income:{}, expense:{}, net:0,
  power:{ prod:0, use:0 }, water:{ prod:0, use:0 }, sewage:{ prod:0, use:0 },
  garbage:{ cap:0, amount:0 }, goods:{ prod:0, need:0, imp:0, exp:0 },
  history:[], milestones:0,
};
const DAY = 1440;
const MONTHS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
/* calendrier accéléré : une année de jeu dure YEAR_D jours pour que les saisons défilent */
const YEAR_D = 48, SEASONS = ['Hiver','Printemps','Été','Automne'];
function dateStr(t){ const day = Math.floor(t/DAY), doy = day % YEAR_D, m = Math.floor(doy/(YEAR_D/12)), dd = 1 + Math.floor((doy % (YEAR_D/12))*28/(YEAR_D/12));
  return `${dd} ${MONTHS[m]} ${2026 + Math.floor(day/YEAR_D)}`; }
const yearPhase = () => ((state.time/DAY) % YEAR_D)/YEAR_D;
function seasonWeights(out){ const ph = yearPhase()*4; let s = 0; // centres : mi-janvier, mi-avril, mi-juillet, mi-octobre
  for(let k=0;k<4;k++){ let d = ph - (k + .17); d -= Math.round(d/4)*4; const w = Math.max(0, Math.cos(d*Math.PI/2.6)); out[k] = w*w*w; s += out[k]; }
  for(let k=0;k<4;k++) out[k] /= s; return out; }
const seasonIdx = () => Math.floor((((yearPhase()*4 - .17 + .5) % 4) + 4) % 4);
const hourOf = () => (state.time % DAY)/60;
const dayOf = () => Math.floor(state.time/DAY);

/* ---------- noms ---------- */
const FIRST = ['Awa','Moussa','Fatou','Ibrahima','Aminata','Cheikh','Mariama','Ousmane','Khady','Mamadou','Léa','Hugo','Chloé','Louis','Emma','Gabriel','Inès','Jules','Sarah','Adam','Lina','Nathan','Jade','Rayan','Manon','Yanis','Camille','Noah','Zoé','Karim','Nadia','Omar','Sofia','Malik','Anta','Pape','Ndeye','Babacar','Coumba','Modou','Marie','Pierre','Julie','Thomas','Elise','Paul','Alice','Victor','Clara','Lucas','Ama','Kofi','Yasmine','Idrissa','Seynabou','Alioune','Rokhaya','Samba','Dieynaba','Lamine'];
const LAST = ['Diop','Ndiaye','Fall','Sow','Ba','Diallo','Sarr','Faye','Gueye','Cissé','Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Mbaye','Seck','Kane','Thiam','Niang','Camara','Touré','Traoré','Keita','Dieng','Mendy','Gomis','Sy','Wade','Lo','Ly','Ka','Samb','Tall','Sène'];
const STREET_T = { street:['Rue','Rue','Allée','Impasse'], oneway:['Rue'], avenue:['Avenue'], busave:['Avenue'], tramst:['Rue'], tramave:['Avenue','Cours'], boulevard:['Boulevard'], highway:['Autoroute'], ramp:['Bretelle'], path:['Chemin','Sentier'], rail:['Ligne'] };
const STREET_N = ['des Lilas','des Baobabs','de la Gare','du Port','Victor Hugo','Léopold Sédar Senghor','des Tilleuls','de la République','Jean Jaurès','du Fleuve','des Artisans','Cheikh Anta Diop','des Écoles','du Marché','des Pêcheurs','Mariama Bâ','des Acacias','de la Liberté','Pasteur','des Roses','du Moulin','Blaise Diagne','Émile Zola','des Flamboyants','de la Corniche','du Stade','des Palmiers','Molière','Ousmane Sembène','des Jardins','de l\'Université','du Parc','Aimé Césaire','des Cerisiers','de la Lagune','du Belvédère','des Tisserands','Kennedy','Lamine Guèye','des Mimosas','du Soleil','de Gorée','des Vignes','Pompidou','de la Paix','des Dunes','du Phare','des Manguiers','Sainte-Anne','du Plateau'];
