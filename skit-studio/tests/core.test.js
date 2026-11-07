// Tests Node : node --test skit-studio/tests
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const Core = require('../js/00-core.js');
const Script = require('../js/10-script.js');
const Timeline = require('../js/20-timeline.js');
const Zip = require('../js/85-zip.js');
const Batch = require('../js/90-batch.js');

test('parseMarked : marqueurs explicites et surlignage automatique', () => {
  const a = Core.parseMarked('Le bébé ne me *ressemble pas* !');
  assert.deepStrictEqual(a.words.map(w => w.hl), [false, false, false, false, true, true, false]);
  const b = Core.parseMarked('Justement je cherche à qui il ressemble.');
  assert.strictEqual(b.words.filter(w => w.hl).length, 2);
  assert.strictEqual(b.words[b.words.length - 1].hl, true);
  const c = Core.parseMarked('Salut toi');
  assert.strictEqual(c.words.filter(w => w.hl).length, 1);
  const d = Core.parseMarked('Justement, je cherche à qui il *ressemble*.');
  assert.strictEqual(d.words[d.words.length - 1].text, 'ressemble.');
  assert.strictEqual(d.words[d.words.length - 1].hl, true);
  const e = Core.parseMarked('Tu as oublié notre *mariage* !');
  assert.deepStrictEqual(e.words.slice(-2).map(w => w.text), ['mariage', '!']);
});

test('rng déterministe', () => {
  const r1 = Core.rng(42), r2 = Core.rng(42);
  assert.strictEqual(r1(), r2());
  assert.deepStrictEqual(r1.shuffle([1, 2, 3, 4]), r2.shuffle([1, 2, 3, 4]));
});

test('parseText : titres, décor, emoji, plan, émotion', () => {
  const sk = Script.parseText('# Le test 🤣\n@scene marche\nA: Bonjour *toi* ! | 🔥\nB: Salut. [close] (smug)\n---\nA: Deuxième\nB: Sketch');
  assert.strictEqual(sk.length, 2);
  assert.strictEqual(sk[0].title, 'Le test');
  assert.strictEqual(sk[0].emoji, '🤣');
  assert.strictEqual(sk[0].scene, 'marche');
  assert.strictEqual(sk[0].lines[0].emoji, '🔥');
  assert.strictEqual(sk[0].lines[0].text, 'Bonjour *toi* !');
  assert.strictEqual(sk[0].lines[1].shot, 'close');
  assert.strictEqual(sk[0].lines[1].emotion, 'smug');
  assert.strictEqual(sk[1].lines.length, 2);
});

test('parseCSV : guillemets, point-virgule, regroupement par sketch', () => {
  const csv = 'sketch;title;speaker;text;emoji\n1;Le prix;A;"Combien, ça ?";🔥\n1;;B;"Trop ""cher""";😂\n2;La dot;A;Bonjour;';
  const sk = Script.parseCSV(csv);
  assert.strictEqual(sk.length, 2);
  assert.strictEqual(sk[0].lines[0].text, 'Combien, ça ?');
  assert.strictEqual(sk[0].lines[1].text, 'Trop "cher"');
  assert.strictEqual(sk[1].title, 'La dot');
});

test('importAny : détection JSON / CSV / texte', () => {
  assert.strictEqual(Script.importAny('[{"title":"x","lines":[{"speaker":"A","text":"hey"}]}]').sketches.length, 1);
  assert.strictEqual(Script.importAny('speaker,text\nA,hey\nB,ho').sketches.length, 1);
  assert.strictEqual(Script.importAny('A: hey\nB: ho').sketches.length, 1);
});

test('normalizeProject : valeurs par défaut, plans et émotions inférés', () => {
  const p = Script.normalizeProject({ sketches: [{ lines: [{ text: 'Un' }, { text: 'Deux' }] }, { lines: [] }] });
  assert.strictEqual(p.sketches.length, 1);
  assert.strictEqual(p.sketches[0].lines[0].shot, 'wide');
  assert.strictEqual(p.sketches[0].lines[1].shot, 'close');
  assert.strictEqual(p.sketches[0].lines[0].speaker, 'A');
  assert.strictEqual(p.sketches[0].lines[1].speaker, 'B');
  assert.strictEqual(p.characters.length, 2);
  assert.strictEqual(p.timing.reaction, 3.2);
});

test('generateSketches : déterministe, catégories, slots remplis', () => {
  const a = Script.generateSketches(6, { seed: 3, categories: ['couple'] });
  const b = Script.generateSketches(6, { seed: 3, categories: ['couple'] });
  assert.deepStrictEqual(a.map(s => s.title), b.map(s => s.title));
  a.forEach(s => { assert.strictEqual(s.category, 'couple'); s.lines.forEach(l => assert.ok(!/\{[A-Z]+\}/.test(l.text), l.text)); });
  const many = Script.generateSketches(100, { seed: 1 });
  assert.strictEqual(many.length, 100);
});

test('export texte / CSV ré-importables', () => {
  const p = Script.sampleProject();
  const txt = Script.toText(p);
  const back = Script.normalizeProject({ sketches: Script.parseText(txt) });
  assert.strictEqual(back.sketches.length, p.sketches.length);
  assert.strictEqual(back.sketches[0].lines[1].shot, 'close');
  const csvBack = Script.parseCSV(Script.toCSV(p));
  assert.strictEqual(csvBack.length, p.sketches.length);
  assert.strictEqual(csvBack[1].lines[1].text, p.sketches[1].lines[1].text);
});

test('Timeline.build : structure de la référence (accroche à froid, cartes, outro)', () => {
  const p = Script.sampleProject();
  const tl = Timeline.build(p);
  const types = tl.segments.map(s => s.type);
  assert.deepStrictEqual(types.slice(0, 5), ['line', 'line', 'reaction', 'title', 'line']);
  assert.strictEqual(types[types.length - 1], 'outro');
  assert.strictEqual(types[types.length - 2], 'reaction');
  assert.strictEqual(types.filter(t => t === 'title').length, 4);
  const titles = tl.segments.filter(s => s.type === 'title');
  assert.deepStrictEqual(titles.map(s => s.num), [2, 3, 4, 5]);
  assert.ok(titles.every(s => s.count === 5));
  assert.strictEqual(types.filter(t => t === 'reaction').length, 5);
  assert.ok(Math.abs(tl.total - tl.segments[tl.segments.length - 1].end) < 1e-9);
  tl.segments.forEach((s, i) => { if (i) assert.ok(Math.abs(s.start - tl.segments[i - 1].end) < 1e-9); });
  // durée mesurée respectée
  const tl2 = Timeline.build(p, { '0:0': { duration: 4.0 } });
  assert.ok(Math.abs(tl2.segments[0].dur - 4.5) < 1e-9);
  assert.ok(tl2.segments[1].dur >= p.timing.closeMin);
});

test('Timeline.at : recherche binaire', () => {
  const p = Script.sampleProject();
  const tl = Timeline.build(p);
  assert.strictEqual(Timeline.at(tl.segments, 0).index, 0);
  const s3 = tl.segments[3];
  assert.strictEqual(Timeline.at(tl.segments, s3.start + 0.01).index, 3);
  assert.strictEqual(Timeline.at(tl.segments, tl.total + 5).index, tl.segments.length - 1);
});

test('Zip.build : archive valide (unzip -t) et CRC correct', () => {
  assert.strictEqual(Zip.crc32(Buffer.from('123456789')), 0xCBF43926);
  const bytes = Zip.build([
    { name: 'a/un.txt', data: Buffer.from('bonjour'), date: new Date(2026, 0, 1, 10, 0, 0) },
    { name: 'deux.bin', data: new Uint8Array([0, 1, 2, 255]) }
  ]);
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'skz-'));
  const f = path.join(tmp, 't.zip');
  fs.writeFileSync(f, bytes);
  const out = execFileSync('unzip', ['-t', f]).toString();
  assert.match(out, /No errors detected/);
  const list = execFileSync('unzip', ['-p', f, 'a/un.txt']).toString();
  assert.strictEqual(list, 'bonjour');
});

test('Batch.makeVariants : thèmes tournants, sketches variés, déterministe', () => {
  const base = Script.sampleProject();
  const bank = Script.generateSketches(12, { seed: 9 });
  const v = Batch.makeVariants(base, bank, { count: 4, perVideo: 5, seed: 5, themes: ['violet', 'nuit'] });
  assert.strictEqual(v.length, 4);
  v.forEach(p => assert.strictEqual(p.sketches.length, 5));
  assert.strictEqual(v[0].theme.id, 'violet');
  assert.strictEqual(v[1].theme.id, 'nuit');
  const keys = v.map(p => p.sketches.map(s => s.title).join('|'));
  assert.strictEqual(new Set(keys).size, 4);
  const v2 = Batch.makeVariants(base, bank, { count: 4, perVideo: 5, seed: 5, themes: ['violet', 'nuit'] });
  assert.deepStrictEqual(v2.map(p => p.sketches.map(s => s.title)), v.map(p => p.sketches.map(s => s.title)));
});

test('Batch.Queue : séquentiel, événements, annulation', async () => {
  const q = new Batch.Queue();
  const order = [];
  q.add({ name: 'j1' }); q.add({ name: 'j2' }); q.add({ name: 'j3' });
  q.on('done', (j) => order.push(j.name));
  await q.run(async (job, progress) => { progress(0.5, 'mi-chemin'); if (job.name === 'j2') q.cancel(); return job.name.toUpperCase(); });
  assert.deepStrictEqual(order, ['j1']);
  assert.strictEqual(q.jobs[1].status, 'cancelled');
  assert.strictEqual(q.jobs[2].status, 'cancelled');
});
