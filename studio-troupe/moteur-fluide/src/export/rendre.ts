/**
 * Point d'entrée de `npm run rendre -- <projet.json> [options]` (voir `src/cli.ts` pour l'aide complète) :
 * projet → porte qualité sur l'état → capture Chromium → audio → MP4 vérifié → porte qualité sur les pixels →
 * rapports. Rien n'est simulé.
 */
import { principal } from '../cli';

process.exitCode = await principal(process.argv.slice(2));
