// Réglages « Cerveau JEV & modèles gratuits » (v63) : ce que JEV fait sur chaque appel, ses compteurs MESURÉS sur cet
// appareil, les modèles gratuits sans clé et le modèle intégré au navigateur (téléchargement, test, vitesse mesurée).
import { useEffect, useReducer, useState } from 'react';
import { Brain, Cpu, RefreshCw } from 'lucide-react';
import { Button, Field, Select, Toggle } from '../../web/components/ui';
import { brainOptions, brainStats, onBrainChange, research, RESEARCH_CAP, setBrainOptions } from '../lib/jevBrain';
import { freeOptions, setFreeOptions } from '../lib/freeMode';
import { browserChat, BROWSER_SPECS, loadBrowserModel, localState, onLocalState, webgpuAvailable } from '../lib/localModel';
import { directChat, freeCooled } from '../lib/providers';
import { useStore } from '../lib/store';
import { LIBRARY } from '../../server/jev/library';
import type { BrowserModel } from '../../server/llm/freeRoute';

const fmt = (n: number) => n.toLocaleString('fr-FR');

export function BrainSettings() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onBrainChange(rerender), []);
  useEffect(() => onLocalState(rerender), []);
  const o = brainOptions();
  const st = brainStats();
  const fo = freeOptions();
  const knowledge = useStore((s) => s.knowledge);
  const learned = knowledge.filter((k) => k.origin === 'learned').length;
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => void webgpuAvailable().then(setGpu), []);
  const [test, setTest] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const ls = localState();
  const cooled = Object.entries(freeCooled()).filter(([, t]) => t > Date.now());

  const testFree = async () => {
    setBusy(true);
    const out: string[] = [];
    for (const m of ['llm7:gpt-oss:20b', 'pollinations:openai']) {
      const t0 = performance.now();
      try {
        const r = await directChat({ model: m, messages: [{ role: 'user', content: 'Réponds en une phrase : que mesure le ratio de créances en souffrance ?' }], maxTokens: 120 }, {}, 'test');
        out.push(`✓ ${m} — ${Math.round(performance.now() - t0)} ms : ${r.content.slice(0, 140)}`);
      } catch (e) {
        out.push(`✗ ${m} — ${(e as Error).message.slice(0, 140)}`);
      }
    }
    setTest(out.join('\n'));
    setBusy(false);
  };
  const testLocal = async () => {
    if (!fo.browser) return;
    setBusy(true);
    try {
      await loadBrowserModel(fo.browser);
      const r = await browserChat(fo.browser, { model: `browser:${fo.browser}`, messages: [{ role: 'user', content: 'Réponds en une phrase : qu’est-ce qu’un prêt amortissable ?' }], maxTokens: 80 });
      setTest(`✓ ${BROWSER_SPECS[fo.browser]!.label} (${localState().device === 'webgpu' ? 'carte graphique' : 'processeur'}) — ${r.metrics.tokensPerS ?? '?'} jetons/s, ${r.metrics.totalMs} ms : ${r.content.slice(0, 160)}`);
    } catch (e) {
      setTest(`✗ Modèle intégré : ${(e as Error).message.slice(0, 200)}`);
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-x-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2" data-testid="brain-settings">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium sm:col-span-2">
        <Brain size={15} className="text-accent" /> JEV, le cerveau de l’app : il comprend chaque demande, nourrit le modèle, le surveille, le contrôle, et apprend sur Internet.
      </div>
      <Field label="Alimenter tous les contextes" hint="Cadre d’objectif (livrable, critères, interdits), techniques apprises et leçons ajoutés à chaque appel (dossier, Prompt Studio, vidéo, 3D…) ; réponse identique resservie du cache (0 $).">
        <Toggle checked={o.feed} onChange={(v) => setBrainOptions({ feed: v })} />
      </Field>
      <Field label="JEV prend le modèle en main" hint="Tâches légères (idées, reformulation, résumé, amélioration de prompt) : modèles gratuits d’abord ; si son contrôle qualité les juge insuffisants, le modèle choisi prend le relais.">
        <Toggle checked={o.pilot} onChange={(v) => setBrainOptions({ pilot: v })} />
      </Field>
      <Field label="Surveiller pendant la requête" hint="Boucle de répétition ou réponse partie dans une autre langue : JEV coupe l’appel et le relance une fois avec la consigne corrective.">
        <Toggle checked={o.watch} onChange={(v) => setBrainOptions({ watch: v })} />
      </Field>
      <Field label="Réflexes et calcul par le code" hint="Taux BCE, conversions F CFA, fiches d’entité, définitions : réponse sans modèle. Calculs (mensualité, VAN, intérêts…) : JEV fait écrire le programme, l’exécute dans le bac à sable et lit le résultat.">
        <Toggle checked={o.reflexes} onChange={(v) => setBrainOptions({ reflexes: v })} />
      </Field>
      <Field label="Veille Internet permanente" hint={`Ce que JEV ne sait pas est cherché (moteurs gratuits + bibliothèque), lu et rangé en fiche datée et sourcée ; les techniques utilisées sont remises à jour. Plafond dur : ${RESEARCH_CAP} recherches automatiques par jour. Aucun chiffre ni nom propre de vos demandes n’est envoyé.`}>
        <Toggle checked={o.learn} onChange={(v) => setBrainOptions({ learn: v })} />
      </Field>
      <Field label="Bibliothèque mondiale" hint={LIBRARY.map((s) => s.label).join(' · ')}>
        <span className="text-[12.5px] text-muted">{LIBRARY.length} sources gratuites, sans clé (outil library.search)</span>
      </Field>
      <div className="mb-3 rounded-lg border border-line bg-elev p-3 text-[12px] text-muted sm:col-span-2" data-testid="brain-stats">
        <b>Mesuré sur cet appareil</b> — appels nourris : {fmt(st.fed)} · réponses du cache : {fmt(st.cacheHits)} ({st.cacheSavedUsd.toFixed(4)} $ évités) · contrôles qualité : {fmt(st.qaChecked)} ({fmt(st.qaFlagged)} signalés) · interventions pendant la requête : {fmt(st.interventions)} · réflexes : {fmt(st.reflexes)} · calculs exécutés : {fmt(st.computed)} · tâches confiées au gratuit : {fmt(st.pilotFree)} (repris par le modèle : {fmt(st.pilotEscalated)}) · techniques apprises : {fmt(st.learned)} (mises à jour : {fmt(st.refreshed)}) · fiches en mémoire : {fmt(learned)} / {fmt(knowledge.length)} · veille aujourd’hui : {st.researchToday.day === new Date().toISOString().slice(0, 10) ? st.researchToday.n : 0}/{RESEARCH_CAP}
        <Button size="sm" variant="ghost" className="ml-2" disabled={busy} onClick={() => void research('principes de gestion du risque de crédit Bâle', 'manque').then((ok) => setTest(ok ? '✓ Veille faite : une fiche apprise a été rangée.' : '✗ Veille : rien de fiable trouvé, ou plafond / hors ligne.'))}>
          <RefreshCw size={12} /> Lancer une veille test
        </Button>
      </div>

      <div className="mb-2 mt-1 flex items-center gap-2 text-[13px] font-medium sm:col-span-2">
        <Cpu size={15} className="text-accent" /> Modèles gratuits, sans clé
      </div>
      <Field label="Modèles gratuits en ligne (LLM7, Pollinations)" hint={`Utilisés sans clé, ou quand vos fournisseurs échouent (clé, crédit, quota, réseau). Quotas anonymes des services.${cooled.length ? ` Au repos : ${cooled.map(([p]) => p).join(', ')}.` : ''}`}>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void testFree()} data-testid="free-llm-test">
          Tester
        </Button>
      </Field>
      <Field label="Autoriser les modèles gratuits en ligne sur mes données" hint="Désactivé : une conversation qui porte vos fichiers ou résultats de données n’est traitée que par le modèle intégré au navigateur (rien ne sort de l’ordinateur).">
        <Toggle checked={fo.allowCloudOnPrivate} onChange={(v) => (setFreeOptions({ allowCloudOnPrivate: v }), rerender())} />
      </Field>
      <Field label="Modèle intégré au navigateur" hint={`Qwen3 (Apache-2.0) exécuté dans cette page, téléchargé une fois puis hors ligne. ${gpu === null ? '' : gpu ? 'Carte graphique compatible (WebGPU).' : 'Pas de WebGPU : processeur (plus lent).'}`}>
        <Select<string>
          value={fo.browser ?? 'off'}
          onChange={(v) => (setFreeOptions({ browser: v === 'off' ? null : (v as BrowserModel) }), rerender())}
          options={[
            { value: 'off', label: 'Désactivé' },
            ...Object.entries(BROWSER_SPECS).map(([id, s]) => ({ value: id, label: `${s.label} (≈ ${(s.mb.webgpu / 1000).toFixed(1)} Go)` })),
          ]}
        />
      </Field>
      <Field label="Télécharger et tester le modèle intégré" hint={ls.phase === 'idle' ? 'Téléchargement unique, puis mis en cache par le navigateur.' : `${ls.note}${ls.phase === 'loading' ? ` — ${Math.round(ls.progress * 100)} %` : ''}`}>
        <Button size="sm" variant="ghost" disabled={busy || !fo.browser} onClick={() => void testLocal()} data-testid="browser-model-test">
          {busy && ls.phase === 'loading' ? `${Math.round(ls.progress * 100)} %` : 'Télécharger et tester'}
        </Button>
      </Field>
      {test && <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-elev p-2 text-[11.5px] text-muted sm:col-span-2" data-testid="brain-test-out">{test}</pre>}
    </div>
  );
}
