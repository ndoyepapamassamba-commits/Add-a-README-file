// « Gazouille » : le fil social des habitants, qui réagit à la vie de la ville.
import { G } from './state.js';
import { MILESTONES, SERVICE_BY_ID } from './config.js';
import { personName, handle } from './names.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LINES = {
  welcome: [
    'Premier jour dans {city} ! Hâte de voir pousser les premières maisons. #nouveauDépart',
    'Il paraît que {city} va devenir une grande ville. Qui construit la première route ? #urbanisme',
  ],
  firstHouse: ['On vient d’emménager à {city} ! Les cartons sont encore dans le salon. #déménagement', 'Première maison de {city}, et c’est la nôtre !'],
  milestone: ['{city} vient d’atteindre le palier « {m} » ! Fiers de notre ville. #{tag}', 'Bravo à notre maire : {city} devient « {m} » ! 🎉', 'Officiel : {city} est maintenant « {m} ».'],
  power: ['Pas d’électricité depuis ce matin… mon frigo pleure. #pasdejus', 'Coupure de courant, encore ! Il nous faut une centrale. #électricité', 'Je lis à la bougie ce soir. Romantique, mais bon. #panne'],
  water: ['Le robinet ne crache que de l’air. On fait comment pour le café ? #pasdeau', 'Toujours pas d’eau courante dans le quartier. #soif'],
  sewage: ['Les toilettes refoulent… je n’en dirai pas plus. #égouts', 'Il faut traiter les eaux usées, ça sent pas la rose ici.'],
  pollutedWater: ['L’eau du robinet a un drôle de goût. On pompe à côté des égouts ou quoi ?! #eaupolluée', 'Malade après avoir bu l’eau du robinet. Merci la station de pompage mal placée.'],
  garbage: ['Les poubelles débordent dans ma rue. #déchets', 'Ça fait des jours que le camion poubelle n’est pas passé. #odeurs'],
  dead: ['Mon grand-père est mort et personne ne vient le chercher… #corbillard', 'Il faut plus de corbillards, c’est indécent. #vagueDeMorts'],
  sick: ['Toute la famille est malade, aucune clinique à proximité. #santé', 'On attend une ambulance depuis des heures.'],
  fire: ['Un immeuble brûle près de chez moi ! Où sont les pompiers ?! #incendie', 'Grosse fumée noire au-dessus du quartier… #feu'],
  fireOut: ['Bravo aux pompiers, incendie maîtrisé ! #héros', 'Les pompiers ont été super rapides, merci !'],
  fireLost: ['Le bâtiment a entièrement brûlé… il faut une caserne dans le quartier. #incendie'],
  crime: ['Encore un cambriolage dans la rue. Il faut plus de police. #sécurité', 'On ne se sent plus en sécurité le soir. #criminalité'],
  traffic: ['Bloqué dans les bouchons depuis 20 minutes… #trafic', 'Qui a dessiné ces carrefours ? #embouteillages', 'Un rond-point, juste UN rond-point, c’est trop demander ? #trafic'],
  taxes: ['Encore une hausse d’impôts ? Je vais déménager. #impôts', 'Les impôts sont trop élevés à {city}. #raslebol'],
  lowTaxes: ['Des impôts aussi bas, c’est le paradis ! #{city}'],
  unemployment: ['Je cherche du travail depuis des semaines… #chômage', 'Pas assez d’emplois en ville. Il faut des usines ou des bureaux.'],
  happy: ['J’adore vivre à {city} ! #bonheur', 'Belle journée au parc avec les enfants. #qualitédevie', 'Le nouveau quartier est magnifique. Bravo la mairie !'],
  park: ['Un nouveau parc près de chez moi, génial ! #nature', 'Pique-nique au parc ce week-end, qui vient ?'],
  school: ['Les enfants ont enfin une école près de la maison ! #éducation'],
  bus: ['Nouvelle ligne de bus, je laisse ma voiture au garage ! #transports', 'Le bus est pratique, j’arrive à l’heure au travail. #mobilité'],
  levelUp: ['Notre immeuble vient d’être rénové, il a fière allure ! #rénovation', 'Le quartier monte en gamme, les prix aussi… #immobilier'],
  chatter: [
    'Quelqu’un connaît une bonne boulangerie à {city} ?',
    'Coucher de soleil incroyable sur la baie ce soir. #{city}',
    'Ma voisine a encore garé sa voiture devant mon garage. #voisins',
    'Le café du coin fait les meilleurs croissants de la ville.',
    'Embouteillage de canards sur la route ce matin. #nature',
    'Qui a vu le chat roux du quartier ? Il a disparu depuis hier.',
    'Footing au bord de la mer, rien de tel ! #sport',
    'Ce matin j’ai vu trois camions de déménagement dans ma rue. La ville grandit !',
    'Les lampadaires viennent de s’allumer, la ville est belle la nuit. #citylights',
  ],
};

export class Chirper {
  constructor() {
    this.feed = [];
    this.unread = 0;
    this.cool = {};
    this.chatT = 40;
    G.on('game:new', () => {
      this.feed = [];
      this.unread = 0;
      this.cool = {};
      this.firstHouse = false;
      this.post('welcome', {}, true);
    });
    G.on('milestone', ({ m }) => this.post('milestone', { m: m.name, tag: m.name.replace(/[^A-Za-zÀ-ÿ]/g, '') }, true));
    G.on('bld:problem', (b) => {
      if (!b.problem) return;
      const k = b.problem;
      if (LINES[k]) this.maybe(k, 0.25);
    });
    G.on('fire:start', () => this.maybe('fire', 0.8));
    G.on('fire:out', () => this.maybe('fireOut', 0.5));
    G.on('fire:destroyed', () => this.maybe('fireLost', 0.9));
    G.on('bld:completed', (b) => {
      if (!this.firstHouse && b.kind === 'zone' && b.zone <= 2) {
        this.firstHouse = true;
        this.post('firstHouse', {}, true);
      }
    });
    G.on('bld:level', () => this.maybe('levelUp', 0.08));
    G.on('built:service', (b) => {
      if (b.def.cat === 'parks') this.maybe('park', 0.5);
      if (b.def.cat === 'education') this.maybe('school', 0.6);
    });
    G.on('transit:line', () => this.maybe('bus', 1));
    G.on('sim:day', (day) => this.daily(day));
  }

  maybe(kind, p) {
    if (Math.random() < p) this.post(kind);
  }

  post(kind, ctx = {}, force = false) {
    const now = performance.now();
    if (!force && this.cool[kind] && now - this.cool[kind] < 45000) return;
    this.cool[kind] = now;
    const lines = LINES[kind];
    if (!lines) return;
    const city = G.cityName || 'la ville';
    const text = pick(lines)
      .replace(/\{city\}/g, city)
      .replace(/\{m\}/g, ctx.m || '')
      .replace(/\{tag\}/g, ctx.tag || '');
    const msg = { name: personName(), handle: handle(), text, day: G.sim ? G.sim.day : 0, hue: Math.floor(Math.random() * 360) };
    this.feed.unshift(msg);
    if (this.feed.length > 60) this.feed.pop();
    this.unread++;
    if (G.audio) G.audio.play('chirp');
    G.emit('chirp', msg);
  }

  daily(day) {
    const S = G.sim.stats;
    if (day % 4 !== 0) return;
    if (S.pop > 50) {
      if (G.sim.taxes.res >= 14) this.maybe('taxes', 0.4);
      else if (G.sim.taxes.res <= 5) this.maybe('lowTaxes', 0.2);
      if (S.unemployment > 0.15) this.maybe('unemployment', 0.35);
      if (S.happy > 75) this.maybe('happy', 0.25);
      let jam = 0;
      for (const seg of G.roads.segs.values()) if (seg.density > 0.8) jam++;
      if (jam > 3) this.maybe('traffic', 0.35);
    }
    this.chatT -= 4;
    if (this.chatT <= 0 && S.pop > 20) {
      this.chatT = 30 + Math.random() * 40;
      this.post('chatter');
    }
  }

  markRead() {
    this.unread = 0;
  }
}

export function serviceName(id) {
  return SERVICE_BY_ID[id] ? SERVICE_BY_ID[id].name : id;
}

export { MILESTONES };
