// Configuration Playwright des 17 tests obligatoires (navigateur Chromium réel, serveur local réel).
// Les services distants (Spaces Hugging Face) sont simulés à partir de leurs configurations relevées le 22/10/2026
// (tests/fixtures/configs) : aucun appel payant, aucun quota consommé, résultats reproductibles.
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = Number(process.env.E2E_PORT || 8790);
const RACINE = path.join(__dirname, '..');

module.exports = {
  testDir: path.join(__dirname, 'e2e'),
  timeout: 180000,
  expect: { timeout: 20000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: path.join(RACINE, 'tests', 'resultats', 'e2e.json') }]],
  outputDir: path.join(os.tmpdir(), 'aims-e2e-sorties'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    acceptDownloads: true,
    viewport: { width: 1500, height: 920 },
    launchOptions: {
      executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
    }
  },
  webServer: {
    command: 'node serveur/serveur.mjs',
    cwd: RACINE,
    url: `http://127.0.0.1:${PORT}/api/sante`,
    reuseExistingServer: false,
    timeout: 30000,
    env: { PORT: String(PORT), PAYANT_AUTORISE: '0', DONNEES_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'aims-e2e-')) }
  }
};
