// Icônes de problème flottant au-dessus des bâtiments (électricité, eau, déchets, défunts, feu…).
import * as THREE from 'three';
import { G } from './state.js';

export const PROBLEMS = {
  fire: { label: 'Incendie !', color: '#e8501f' },
  road: { label: 'Aucun accès routier', color: '#d64045' },
  power: { label: "Pas d'électricité", color: '#e0a800' },
  water: { label: "Pas d'eau courante", color: '#2f8fd8' },
  sewage: { label: 'Égouts saturés', color: '#8a6038' },
  dead: { label: 'Défunts à récupérer', color: '#5a5f6b' },
  sick: { label: 'Habitants malades', color: '#d64045' },
  garbage: { label: 'Déchets accumulés', color: '#7a8a35' },
  crime: { label: 'Criminalité élevée', color: '#3d4f9e' },
  full: { label: 'Capacité maximale atteinte', color: '#a0522d' },
  pollutedWater: { label: 'Pompe dans une eau polluée', color: '#6b5a2e' },
  workers: { label: 'Pas assez de travailleurs', color: '#c96f22' },
  abandoned: { label: 'Bâtiment abandonné', color: '#555b63' },
};

function glyph(g, kind, s) {
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineWidth = s * 0.07;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const c = s / 2;
  g.beginPath();
  switch (kind) {
    case 'power':
      g.moveTo(c + s * 0.06, c - s * 0.3);
      g.lineTo(c - s * 0.16, c + s * 0.04);
      g.lineTo(c, c + s * 0.04);
      g.lineTo(c - s * 0.06, c + s * 0.3);
      g.lineTo(c + s * 0.16, c - s * 0.06);
      g.lineTo(c, c - s * 0.06);
      g.closePath();
      g.fill();
      break;
    case 'water':
    case 'sewage':
    case 'pollutedWater':
      g.moveTo(c, c - s * 0.3);
      g.bezierCurveTo(c + s * 0.05, c - s * 0.15, c + s * 0.22, c, c + s * 0.2, c + s * 0.12);
      g.arc(c, c + s * 0.12, s * 0.2, 0, Math.PI);
      g.bezierCurveTo(c - s * 0.22, c, c - s * 0.05, c - s * 0.15, c, c - s * 0.3);
      g.fill();
      if (kind !== 'water') {
        g.fillStyle = kind === 'sewage' ? '#8a6038' : '#6b5a2e';
        g.fillRect(c - s * 0.1, c + s * 0.04, s * 0.2, s * 0.06);
      }
      break;
    case 'garbage':
      g.fillRect(c - s * 0.17, c - s * 0.1, s * 0.34, s * 0.36);
      g.fillRect(c - s * 0.22, c - s * 0.18, s * 0.44, s * 0.06);
      g.fillRect(c - s * 0.06, c - s * 0.25, s * 0.12, s * 0.06);
      break;
    case 'dead':
      g.moveTo(c - s * 0.17, c + s * 0.28);
      g.lineTo(c - s * 0.17, c - s * 0.1);
      g.arc(c, c - s * 0.1, s * 0.17, Math.PI, 0);
      g.lineTo(c + s * 0.17, c + s * 0.28);
      g.closePath();
      g.fill();
      g.fillStyle = '#5a5f6b';
      g.fillRect(c - s * 0.025, c - s * 0.18, s * 0.05, s * 0.26);
      g.fillRect(c - s * 0.09, c - s * 0.1, s * 0.18, s * 0.05);
      break;
    case 'sick':
      g.fillRect(c - s * 0.07, c - s * 0.24, s * 0.14, s * 0.48);
      g.fillRect(c - s * 0.24, c - s * 0.07, s * 0.48, s * 0.14);
      break;
    case 'fire':
      g.moveTo(c, c - s * 0.3);
      g.bezierCurveTo(c + s * 0.3, c - s * 0.05, c + s * 0.22, c + s * 0.3, c, c + s * 0.3);
      g.bezierCurveTo(c - s * 0.22, c + s * 0.3, c - s * 0.26, c, c - s * 0.08, c - s * 0.12);
      g.bezierCurveTo(c - s * 0.06, c, c, c + s * 0.02, c, c - s * 0.3);
      g.fill();
      break;
    case 'crime':
      g.fillRect(c - s * 0.05, c - s * 0.26, s * 0.1, s * 0.34);
      g.fillRect(c - s * 0.05, c + s * 0.15, s * 0.1, s * 0.1);
      break;
    case 'road':
      g.arc(c, c, s * 0.24, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(c - s * 0.17, c + s * 0.17);
      g.lineTo(c + s * 0.17, c - s * 0.17);
      g.stroke();
      break;
    case 'full':
      g.moveTo(c, c - s * 0.26);
      g.lineTo(c + s * 0.2, c);
      g.lineTo(c + s * 0.07, c);
      g.lineTo(c + s * 0.07, c + s * 0.24);
      g.lineTo(c - s * 0.07, c + s * 0.24);
      g.lineTo(c - s * 0.07, c);
      g.lineTo(c - s * 0.2, c);
      g.closePath();
      g.fill();
      break;
    case 'workers':
      g.arc(c, c - s * 0.13, s * 0.1, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(c - s * 0.2, c + s * 0.26);
      g.quadraticCurveTo(c - s * 0.2, c, c, c);
      g.quadraticCurveTo(c + s * 0.2, c, c + s * 0.2, c + s * 0.26);
      g.closePath();
      g.fill();
      break;
    default:
      g.moveTo(c - s * 0.22, c);
      g.lineTo(c, c - s * 0.22);
      g.lineTo(c + s * 0.22, c);
      g.lineTo(c + s * 0.22, c + s * 0.24);
      g.lineTo(c - s * 0.22, c + s * 0.24);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.moveTo(c - s * 0.04, c - s * 0.05);
      g.lineTo(c + s * 0.05, c + s * 0.07);
      g.lineTo(c - s * 0.02, c + s * 0.16);
      g.stroke();
  }
}

const cache = new Map();
export function iconCanvas(kind, size = 96) {
  const key = kind + size;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const p = PROBLEMS[kind] || { color: '#666' };
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  g.fillStyle = p.color;
  g.fill();
  g.lineWidth = size * 0.05;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.stroke();
  glyph(g, kind, size);
  cache.set(key, c);
  return c;
}

export function iconURL(kind) {
  return iconCanvas(kind, 64).toDataURL();
}

export class Icons {
  constructor(scene) {
    this.scene = scene;
    this.mats = {};
    this.sprites = new Map();
    this.visible = true;
    G.on('bld:problem', (b) => this.set(b));
    G.on('bld:removed', (b) => this.remove(b.id));
  }

  mat(kind) {
    if (!this.mats[kind]) {
      const t = new THREE.CanvasTexture(iconCanvas(kind));
      t.colorSpace = THREE.SRGBColorSpace;
      this.mats[kind] = new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, transparent: true });
    }
    return this.mats[kind];
  }

  set(b) {
    if (!b.problem) return this.remove(b.id);
    let s = this.sprites.get(b.id);
    if (!s) {
      s = new THREE.Sprite(this.mat(b.problem));
      s.renderOrder = 20;
      s.scale.set(0.038, 0.038, 1);
      this.sprites.set(b.id, s);
      this.scene.add(s);
    } else s.material = this.mat(b.problem);
    s.userData.b = b;
  }

  remove(id) {
    const s = this.sprites.get(id);
    if (s) {
      this.scene.remove(s);
      this.sprites.delete(id);
    }
  }

  update(time, camPos) {
    for (const s of this.sprites.values()) {
      const b = s.userData.b;
      const dx = b.x - camPos.x;
      const dz = b.z - camPos.z;
      const far = dx * dx + dz * dz > 2600 * 2600;
      s.visible = this.visible && !far;
      if (!s.visible) continue;
      const bob = Math.sin(time * 3 + b.id) * 0.8;
      s.position.set(b.x, b.y + (b.height || 10) * (b.mesh ? b.mesh.scale.y : 1) + 7 + bob, b.z);
    }
  }

  clear() {
    for (const id of [...this.sprites.keys()]) this.remove(id);
  }
}
