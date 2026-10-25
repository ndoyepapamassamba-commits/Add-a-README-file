// Noms français générés pour les bâtiments, les habitants et le fil Gazouille.
import { mulberry32 } from './util.js';

const SURN = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefèvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Diallo', 'Ndiaye', 'Faye', 'Sow', 'Benali', 'Nguyen', 'Haddad', 'Rossi', 'Lopez', 'Fontaine', 'Chevalier', 'Blanc', 'Guérin', 'Muller', 'Henry', 'Rousseau', 'Clément', 'Gauthier'];
const FIRST = ['Camille', 'Léa', 'Manon', 'Chloé', 'Inès', 'Jade', 'Louise', 'Emma', 'Lucas', 'Hugo', 'Louis', 'Nathan', 'Gabriel', 'Jules', 'Arthur', 'Adam', 'Raphaël', 'Moussa', 'Awa', 'Fatou', 'Yanis', 'Sofia', 'Rose', 'Paul', 'Zoé', 'Malik', 'Aïcha', 'Théo', 'Clara', 'Nina', 'Sacha', 'Mamadou', 'Lina', 'Noah', 'Mila', 'Omar', 'Jeanne', 'Victor', 'Alice', 'Ibrahima'];
const FLOWERS = ['Lilas', 'Tilleuls', 'Acacias', 'Glycines', 'Mimosas', 'Peupliers', 'Châtaigniers', 'Hortensias', 'Platanes', 'Cerisiers', 'Magnolias', 'Iris', 'Bleuets', 'Pins', 'Chênes', 'Saules', 'Érables', 'Coquelicots'];
const PLACES = ['du Port', 'de la Gare', 'du Centre', 'des Halles', 'du Marché', 'de la Plage', 'du Parc', 'des Collines', 'du Lac', 'de la Corniche', 'du Canal', 'des Arts', 'du Moulin', 'de la Fontaine', 'des Pins'];
const SHOPS = ['Boulangerie', 'Café', 'Épicerie', 'Pharmacie', 'Librairie', 'Fleuriste', 'Supérette', 'Brasserie', 'Pâtisserie', 'Quincaillerie', 'Boucherie', 'Salon de coiffure', 'Pizzeria', 'Fromagerie', 'Cave à vins', 'Bazar', 'Opticien'];
const BIGSHOPS = ['Galeries', 'Centre commercial', 'Grand Magasin', 'Hypermarché', 'Passage', 'Halles'];
const INDUS = ['Usine', 'Entrepôts', 'Ateliers', 'Fonderie', 'Conserverie', 'Scierie', 'Imprimerie', 'Tannerie', 'Laiterie', 'Verrerie', 'Menuiserie industrielle', 'Logistique'];
const OFFICES = ['Tour', 'Immeuble', 'Siège', 'Campus', 'Centre d\'affaires', 'Espace'];
const BRANDS = ['Horizon', 'Novalis', 'Atlantis', 'Zénith', 'Méridien', 'Équinoxe', 'Altaïr', 'Cobalt', 'Sirius', 'Opaline', 'Boréal', 'Kéros', 'Vertigo', 'Pléiade', 'Odyssée', 'Lumen'];
const RESHIGH = ['Résidence', 'Les Jardins', 'Le Clos', 'Les Terrasses', 'Le Domaine', 'Les Hauts', 'Le Carré', 'La Cité'];

const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];

export function buildingName(zone, seed) {
  const r = mulberry32(seed * 7 + 13);
  switch (zone) {
    case 1:
      return r() < 0.5 ? `Maison ${pick(SURN, r)}` : `Villa des ${pick(FLOWERS, r)}`;
    case 2:
      return `${pick(RESHIGH, r)} des ${pick(FLOWERS, r)}`;
    case 3:
      return r() < 0.5 ? `${pick(SHOPS, r)} ${pick(SURN, r)}` : `${pick(SHOPS, r)} ${pick(PLACES, r)}`;
    case 4:
      return `${pick(BIGSHOPS, r)} ${pick(BRANDS, r)}`;
    case 5:
      return `${pick(INDUS, r)} ${pick(SURN, r)}${r() < 0.4 ? ' & Fils' : ''}`;
    default:
      return `${pick(OFFICES, r)} ${pick(BRANDS, r)}`;
  }
}

export function personName(r = Math.random) {
  return `${pick(FIRST, r)} ${pick(SURN, r)}`;
}

export function handle(r = Math.random) {
  const f = pick(FIRST, r).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const s = pick(SURN, r).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = Math.floor(r() * 99);
  return '@' + (r() < 0.5 ? f + '_' + s : f + s.slice(0, 3) + n);
}
