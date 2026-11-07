/* Test de bout en bout : Chromium headless (Playwright) → page → images importées → voix Piper → export MP4 WebCodecs.
   Usage : node tests/e2e.js [dossier_sortie]   (nécessite ffprobe pour la vérification)
   E2E_IMAGES=openrouter OPENROUTER_KEY=sk-or-… : génère les images en direct via OpenRouter depuis la page
   (sans OPENROUTER_KEY, une clé factice est envoyée : utile derrière un proxy qui injecte la vraie clé). */
const LIVE = process.env.E2E_IMAGES === 'openrouter';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'skit-e2e');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/markdown' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = p.startsWith('/__fixtures/') ? path.join(OUT, 'fixtures', p.slice(12)) : path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); } else { res.writeHead(404); res.end('not found ' + p); }
}).listen(0);
const port = srv.address().port;

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForFunction(() => window.SkitApp && window.SkitApp.state.timeline.segments.length > 0, null, { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, 'ui-scripts.png') });
  const fixtures = LIVE ? ['live', 'live'] : fs.readdirSync(path.join(OUT, 'fixtures')).filter(f => /\.(jpg|png)$/.test(f));
  if (fixtures.length < 2) throw new Error('Il faut 2 images dans ' + path.join(OUT, 'fixtures') + ' (wide.jpg, close.jpg)');

  // Projet réduit : 2 sketches, images importées (évite le réseau Pollinations), voix Piper
  const result = await page.evaluate(async ({ port, live, orKey }) => {
    const App = window.SkitApp, NS = window.SkitStudio, S = App.state;
    const p = NS.Script.sampleProject(); p.sketches = p.sketches.slice(0, 2); p.title = 'Test e2e'; p.width = 1080; p.height = 1920; p.fps = 30;
    p.timing.reaction = 2.0; p.timing.title = 1.5;
    const fetchFile = async (name) => { const b = await (await fetch(`http://localhost:${port}/__fixtures/${name}`)).blob(); return new File([b], name, { type: b.type, lastModified: 1 }); };
    if (live) { S.settings.openrouter = { apiKey: orKey, imageModel: 'google/gemini-2.5-flash-image' }; p.visual.provider = 'openrouter'; p.visual.seed = 21; }
    else {
      const wide = await NS.ImageGen.importFile(await fetchFile('wide.jpg'));
      const close = await NS.ImageGen.importFile(await fetchFile('close.jpg'));
      p.sketches.forEach(sk => { sk.imageWide = wide.key; sk.imageClose = close.key; });
    }
    App.loadProject(p);
    const t0 = performance.now();
    await App.prepareAll({ force: true });
    const prepMs = performance.now() - t0;
    const segs = S.timeline.segments.map(s => ({ type: s.type, start: +s.start.toFixed(2), dur: +s.dur.toFixed(2), spoken: s.spoken ? +s.spoken.toFixed(2) : undefined }));
    const assets = Object.keys(S.assetKeys).map(k => { const a = NS.Animator.get(S.assetKeys[k]); return { line: k, faces: a ? a.faces.map(f => f.source) : null, tris: a ? a.mesh.dynTris.length : 0 }; });
    // aperçu à deux instants
    const shots = [];
    for (const t of [0.6, segs[1].start + 0.5, segs[2].start + 0.8, segs[3].start + 0.5]) { App.seek(t); await new Promise(r => setTimeout(r, 120)); shots.push(document.getElementById('preview').toDataURL('image/jpeg', 0.85)); }
    const t1 = performance.now();
    document.getElementById('engineSel').value = 'webcodecs';
    const out = await App.exportCurrent();
    const encMs = performance.now() - t1;
    const buf = new Uint8Array(await out.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const imgs = [];
    for (const k of Object.keys(S.imageUrls)) { const b = await (await fetch(S.imageUrls[k])).blob(); const fr = new FileReader(); imgs.push(await new Promise(r => { fr.onload = () => r({ line: k, data: fr.result }); fr.readAsDataURL(b); })); }
    return { imgs, total: S.timeline.total, segs, assets, measured: Object.keys(S.measured).length, mixDur: S.audioMix && S.audioMix.duration, prepMs: Math.round(prepMs), encMs: Math.round(encMs), engine: out.engine, codec: out.codec, audioCodec: out.audioCodec, size: out.blob.size, mp4: btoa(bin), shots, caps: S.caps };
  }, { port, live: LIVE, orKey: process.env.OPENROUTER_KEY || 'sk-or-proxy-injected' });
  const mp4 = path.join(OUT, 'e2e.mp4'); fs.writeFileSync(mp4, Buffer.from(result.mp4, 'base64'));
  result.shots.forEach((d, i) => fs.writeFileSync(path.join(OUT, `preview-${i}.jpg`), Buffer.from(d.split(',')[1], 'base64')));
  const seen = new Set(); result.imgs.forEach(im => { const ext = /image\/png/.test(im.data) ? 'png' : 'jpg'; if (seen.has(im.data.length)) return; seen.add(im.data.length); fs.writeFileSync(path.join(OUT, `gen-${im.line.replace(':', '_')}.${ext}`), Buffer.from(im.data.split(',')[1], 'base64')); });
  result.generatedImages = seen.size;
  delete result.mp4; delete result.shots; delete result.imgs;
  await page.screenshot({ path: path.join(OUT, 'ui-after.png') });
  await browser.close(); srv.close();
  let probe = null;
  try { probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', mp4]).toString(); } catch (e) { probe = 'ffprobe indisponible : ' + e.message; }
  console.log(JSON.stringify({ ok: true, seconds: Math.round((Date.now() - t0) / 1000), errors, result, probe: probe && probe.startsWith('{') ? JSON.parse(probe) : probe, mp4 }, null, 1));
})().catch(e => { console.log(JSON.stringify({ ok: false, error: e.message, stack: e.stack })); process.exit(1); });
