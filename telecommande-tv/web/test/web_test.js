// Tests de bout en bout de TelecommandeTV.html (Playwright + Chromium).
// Pré-requis (voir run_tests.sh) : streams.py sur $STREAMS, passerelle sur $BRIDGE, fausse télé (FAKE_TV_DIR).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const STREAMS = process.env.STREAMS || 'http://127.0.0.1:18080';
const BRIDGE = process.env.BRIDGE || 'http://127.0.0.1:18765';
const TV_DIR = process.env.FAKE_TV_DIR;
const PY = process.env.PYTHON || 'python3';
const PAGE = 'file://' + path.resolve(__dirname, '..', 'TelecommandeTV.html');
const ONLY = process.env.ONLY || '';

let failures = 0;
function check(cond, msg) {
  console.log((cond ? 'OK    ' : 'ÉCHEC ') + msg);
  if (!cond) failures++;
}

async function openPage(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent);
    }))).observe(document, { childList: true, subtree: true });
  });
  page.on('pageerror', e => { console.log('ERREUR JS', e.message); failures++; });
  await page.goto(url);
  return { ctx, page };
}

async function addTestList(page) {
  await page.locator('#bouquets .chip', { hasText: 'Mes listes' }).click();
  await page.fill('#mineUrl', STREAMS + '/list.m3u');
  await page.click('#mineAdd');
  await page.click('#mineShow');
  await page.waitForFunction(() => document.querySelectorAll('#list .ch').length === 9, null, { timeout: 15000 });
}

const now = page => page.evaluate(() => ({
  name: document.querySelector('#nowName').textContent,
  info: document.querySelector('#nowInfo').textContent,
  live: !document.querySelector('#live').hidden,
  t: document.querySelector('#video').currentTime,
  overlay: document.querySelector('#overlay').hidden ? '' : document.querySelector('#ovT1').textContent,
}));

async function waitPlaying(page, pred, ms) {
  try {
    await page.waitForFunction(p => {
      const n = document.querySelector('#nowName').textContent;
      return !document.querySelector('#live').hidden && (p.not ? n !== p.not : n === p.is);
    }, pred, { timeout: ms || 45000 });
  } catch (e) {
    console.log('  état :', JSON.stringify(await now(page)), JSON.stringify(await page.evaluate(() => window.__toasts)));
    return false;
  }
  const a = (await now(page)).t;
  await page.waitForTimeout(2000);
  const b = await now(page);
  return b.t > a && b.live;
}

async function clickChannel(page, name) {
  await page.locator('#list .ch', { hasText: name }).first().click();
}
const toastsHave = async (page, re) => (await page.evaluate(() => window.__toasts)).some(t => re.test(t));
const clearToasts = page => page.evaluate(() => { window.__toasts = []; });

async function standalone(browser) {
  console.log('--- Page seule (fichier ouvert dans le navigateur, sans passerelle)');
  const { ctx, page } = await openPage(browser, PAGE);
  await addTestList(page);
  check(true, 'liste M3U ajoutée : 9 chaînes affichées');

  await clickChannel(page, 'Alpha TV');
  check(await waitPlaying(page, { is: 'Alpha TV' }), 'Alpha TV : lecture (lien mort écarté)');
  check(/lien 2\/2|lien 1\/2 · 127\.0\.0\.1:\d+$/.test((await now(page)).info) && !/dead404/.test((await now(page)).info), 'Alpha TV : le bon lien est utilisé');

  await clearToasts(page);
  await clickChannel(page, 'Bravo');
  check(await waitPlaying(page, { not: 'Bravo' }), 'Bravo (2 liens morts) : bascule sur une autre chaîne qui marche');
  check(await toastsHave(page, /Bravo.*je passe sur/), 'Bravo : message de bascule affiché');

  await clearToasts(page);
  await clickChannel(page, 'India');
  check(await waitPlaying(page, { is: 'India' }), 'India : lecture du lien 1');
  check(/lien 1\/2/.test((await now(page)).info), 'India : lien 1/2 en cours');
  await page.waitForFunction(() => /lien 2\/2/.test(document.querySelector('#nowInfo').textContent), null, { timeout: 60000 }).catch(() => {});
  check(await waitPlaying(page, { is: 'India' }), 'India : le lien 1 saute en pleine lecture → reprise sur le lien 2 de la même chaîne');
  check(/lien 2\/2/.test((await now(page)).info) && await toastsHave(page, /India.*a sauté/), 'India : message « le lien a sauté »');

  await clearToasts(page);
  await clickChannel(page, 'Delta');
  check(await waitPlaying(page, { is: 'Delta' }), 'Delta : lecture');
  await page.waitForFunction(() => document.querySelector('#nowName').textContent !== 'Delta', null, { timeout: 60000 }).catch(() => {});
  check(await waitPlaying(page, { not: 'Delta' }), 'Delta : la chaîne coupe en pleine lecture → bascule sur une autre chaîne qui marche');
  check(await toastsHave(page, /Delta.*coupée.*je passe sur/), 'Delta : message « coupée → je passe sur … »');

  await clearToasts(page);
  await clickChannel(page, 'Echo');
  check(await waitPlaying(page, { not: 'Echo' }), 'Echo (refusé par le navigateur, sans passerelle) : bascule');

  await clickChannel(page, 'Hotel');
  check(await waitPlaying(page, { is: 'Hotel (vidéo)' }), 'Hotel : vidéo simple lue par le lecteur du navigateur');

  // Coupure d'internet : ne pas accuser les chaînes, reprendre tout seul
  await clickChannel(page, 'Charlie');
  check(await waitPlaying(page, { is: 'Charlie' }), 'Charlie : lecture');
  await ctx.setOffline(true);
  let off = false;
  try { await page.waitForFunction(() => /connexion internet/.test(document.querySelector('#ovT1').textContent) && !document.querySelector('#overlay').hidden, null, { timeout: 60000 }); off = true; } catch (e) { console.log('  état :', JSON.stringify(await now(page))); }
  check(off, 'internet coupé : message « Pas de connexion internet », pas de bascule');
  check((await now(page)).name === 'Charlie', 'internet coupé : on reste sur Charlie');
  await ctx.setOffline(false);
  check(await waitPlaying(page, { is: 'Charlie' }, 30000), 'internet revenu : Charlie reprend toute seule');
  const dot = await page.locator('#list .ch', { hasText: 'Charlie' }).first().locator('.dot').getAttribute('class');
  check(!/bad/.test(dot), 'Charlie n\'est pas marquée en panne après la coupure');

  // Favoris, recherche, filtre
  await page.locator('#list .ch', { hasText: 'Foxtrot' }).first().locator('.star').click();
  await page.locator('#bouquets .chip', { hasText: 'Favoris' }).click();
  check(await page.locator('#list .ch').count() === 1, 'favori : Foxtrot dans « Favoris »');
  await page.locator('#bouquets .chip', { hasText: 'Mes listes' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#list .ch').length === 9);
  await page.fill('#search', 'foxt');
  await page.waitForTimeout(400);
  check(await page.locator('#list .ch').count() === 1, 'recherche « foxt » : 1 chaîne');
  await page.fill('#search', '');
  await page.check('#onlyOk');
  await page.waitForTimeout(400);
  const shown = await page.locator('#list .ch:not([hidden])').allTextContents();
  check(!shown.some(t => /Bravo/.test(t)), '« Qui marchent » cache Bravo (en panne)');
  await ctx.close();
}

async function withBridge(browser) {
  console.log('--- Avec la passerelle (télécommande Wi-Fi + relais vidéo)');
  const { ctx, page } = await openPage(browser, BRIDGE + '/#telecommande');
  await page.waitForSelector('#rmSetup:not([hidden])', { timeout: 10000 });
  check(true, 'onglet Télécommande : écran « Trouver la télé »');

  // QR code pour le téléphone
  await page.waitForSelector('#rmPhone:not([hidden]) svg');
  const url = await page.evaluate(() => fetch('/api/state').then(r => r.json()).then(j => j.urls[0]));
  const png = path.join(require('os').tmpdir(), 'qr-test.png');
  await page.locator('#qrRm').screenshot({ path: png });
  let decoded = '';
  try { decoded = execFileSync(PY, ['-c', 'import sys,zxingcpp;from PIL import Image;r=zxingcpp.read_barcodes(Image.open(sys.argv[1]));print(r[0].text if r else "")', png]).toString().trim(); } catch (e) { console.log(e.message); }
  check(decoded === url, 'QR code lisible : ' + decoded);
  for (const t of ['http://192.168.1.20:8765/', 'http://192.168.100.200:18765/', 'http://10.0.0.5:8765/' + 'x'.repeat(60)]) {
    const svg = await page.evaluate(u => window.qrSvg(u), t);
    await page.setContent('<div style="width:300px;height:300px">' + svg + '</div>');
    await page.locator('div').screenshot({ path: png });
    let d = '';
    try { d = execFileSync(PY, ['-c', 'import sys,zxingcpp;from PIL import Image;r=zxingcpp.read_barcodes(Image.open(sys.argv[1]));print(r[0].text if r else "")', png]).toString().trim(); } catch (e) { /* rien */ }
    check(d === t, 'QR code (' + t.length + ' caractères) lisible');
  }
  await page.goto(BRIDGE + '/?retour#telecommande');
  await page.waitForSelector('#rmSetup:not([hidden])');

  // Appairage
  await page.click('#scanBtn');
  await page.waitForSelector('#tvList button', { timeout: 20000 });
  await page.click('#tvList button');
  await page.waitForSelector('#codeBox:not([hidden])', { timeout: 15000 });
  const code = fs.readFileSync(path.join(TV_DIR, 'code.txt'), 'utf8').trim();
  await page.fill('#codeIn', code.toLowerCase());
  await page.click('#codeBtn');
  await page.waitForSelector('#rmPad:not([hidden])', { timeout: 15000 });
  await page.waitForFunction(() => /connectée/.test(document.querySelector('#tvSt').textContent), null, { timeout: 10000 });
  check(true, 'appairage avec le code de la télé : télécommande prête');

  const evFile = path.join(TV_DIR, 'events.jsonl');
  const mark = fs.readFileSync(evFile, 'utf8').length;
  await page.click('[data-k="24"]');
  await page.click('.k.ok');
  await page.click('[data-k="12"]');
  await page.click('.k.netflix');
  const up = page.locator('[data-k="19"]');
  const box = await up.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const ev = fs.readFileSync(evFile, 'utf8').slice(mark).trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const keys = ev.filter(e => e.recv === 'key').map(e => e.key);
  const apps = ev.filter(e => e.recv === 'app').map(e => e.link);
  console.log('  touches reçues par la télé :', keys.join(' '), apps.join(' '));
  check(keys[0] === 24 && keys[1] === 23 && keys[2] === 12, 'Vol+, OK, 5 reçus dans l\'ordre');
  check(apps[0] === 'https://www.netflix.com/title', 'Netflix ouvert sur la télé');
  check(keys.filter(k => k === 19).length >= 4, 'appui long sur ▲ : touche répétée (' + keys.filter(k => k === 19).length + ' fois)');
  check(keys.includes(20) && keys[keys.length - 1] === 4, 'clavier de l\'ordinateur : ↓ et Échap (Retour)');
  const vol = await page.evaluate(() => document.querySelector('#volBar').style.width);
  check(vol === '20%', 'volume de la télé affiché (' + vol + ')');

  // Relais vidéo de la passerelle
  await page.click('#tabTv');
  await addTestList(page);
  await clickChannel(page, 'Echo');
  check(await waitPlaying(page, { is: 'Echo' }), 'Echo (sans CORS) : lu grâce au relais de la passerelle');
  check(/via la passerelle/.test((await now(page)).info), 'Echo : « via la passerelle » affiché');
  await clickChannel(page, 'Golf');
  check(await waitPlaying(page, { is: 'Golf' }), 'Golf (exige un Referer) : lu grâce au relais');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (!ONLY || ONLY === 'seule') await standalone(browser);
    if (!ONLY || ONLY === 'passerelle') await withBridge(browser);
  } catch (e) {
    console.log('ÉCHEC exception :', e.stack);
    failures++;
  }
  await browser.close();
  console.log(failures ? failures + ' échec(s)' : 'Tous les tests sont passés');
  process.exit(failures ? 1 : 0);
})();
