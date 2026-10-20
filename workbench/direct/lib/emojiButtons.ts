// ÉMOJIS 3D SUR LES BOUTONS (v64, consigne du 15/10/2026 : « partout où il y a un bouton, un émoji premium de
// décoration »). Chaque bouton de l'app reçoit l'émoji 3D Fluent (MIT) de son action, choisi d'après son libellé
// (« Envoyer » 🚀, « Enregistrer » 💾, « Exporter » 📥…). Rendu en CSS (::before + image) : aucun nœud ajouté dans
// le DOM géré par React, rien dans le nom accessible du bouton (décoratif), l'icône au trait est remplacée.
import { emojiKey, fluentDataUrl } from '../../server/assets/fluentEmoji';

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** The action words of the app's buttons → their emoji (first match wins: the most specific first). */
const ACTIONS: [RegExp, string][] = [
  [/\bjev\b/, '🧠'],
  [/envoyer|\bsend\b|soumettre/, '🚀'],
  [/realiser|generer|creer avec|magie|ameliorer|optimiser|\bia\b/, '✨'],
  [/executer|lancer|\brun\b|demarrer|commencer|jouer|\bplay\b|reprendre/, '▶️'],
  [/arreter|\bstop\b|interrompre/, '⏹️'],
  [/pause/, '⏸️'],
  [/enregistrer|sauvegarder|\bsave\b/, '💾'],
  [/telecharger|exporter|download|\bexport\b/, '📥'],
  [/importer|charger|upload|deposer|televerser/, '📤'],
  [/joindre|piece jointe|attach/, '📎'],
  [/supprimer|effacer|delete|retirer|vider/, '🗑️'],
  [/copier|\bcopy\b|dupliquer/, '📋'],
  [/modifier|editer|\bedit\b|renommer/, '✏️'],
  [/corriger|reparer|\bfix\b/, '🛠️'],
  [/ajouter|nouveau|nouvelle|creer|\bnew\b|\badd\b/, '➕'],
  [/rechercher|chercher|search|trouver|explorer/, '🔎'],
  [/parametre|reglage|setting|configur|preference/, '⚙️'],
  [/fermer|\bclose\b|annuler|cancel|ignorer/, '❌'],
  [/ouvrir|\bopen\b|afficher|voir|apercu|consulter/, '📂'],
  [/actualiser|rafraichir|refresh|reessayer|recharger|relancer|recommencer/, '🔄'],
  [/aide|\bhelp\b|astuce|conseil/, '💡'],
  [/partager|\bshare\b|lien|\blink\b/, '🔗'],
  [/video|film|clip|montage|animation/, '🎬'],
  [/image|photo|illustration|dessin/, '🖼️'],
  [/voix|audio|micro|dicter|ecouter|son\b/, '🎙️'],
  [/plein ecran|fullscreen/, '🖥️'],
  [/onglet|html|\bweb\b|navigateur|internet/, '🌐'],
  [/valider|approuver|confirmer|\bok\b|accepter|appliquer|terminer/, '✅'],
  [/tester|test\b|benchmark|banc|experience|essai/, '🧪'],
  [/analyser|analyse|diagnostic|inspecter/, '🔬'],
  [/tableau de bord|dashboard|graphique|chart|statistique|kpi/, '📊'],
  [/excel|xlsx|classeur/, '📊'],
  [/word|docx|rapport|document|pdf/, '📄'],
  [/powerpoint|pptx|deck|diapo|presentation/, '🎨'],
  [/donnee|data|table|base/, '🗂️'],
  [/modele|model|\bllm\b|robot|agent/, '🤖'],
  [/cle\b|cles|\bkey\b|connexion|login|token/, '🔑'],
  [/memoire|souvenir|lecon|apprendre/, '🧠'],
  [/archive|historique/, '🗄️'],
  [/filtre|filtrer|trier/, '🎚️'],
  [/precedent|retour|\bback\b/, '⬅️'],
  [/suivant|\bnext\b|continuer/, '➡️'],
  [/accueil|\bhome\b/, '🏠'],
  [/chat|conversation|discussion|message|repondre/, '💬'],
  [/calendrier|planifier|date/, '📅'],
  [/mail|courriel/, '📮'],
  [/imprimer|\bprint\b/, '🖨️'],
  [/code|terminal|console|script/, '🧰'],
  [/blender|3d|scene/, '🎲'],
  [/design|theme|palette|couleur|style/, '🎨'],
  [/securite|verrou|confidentiel|prive/, '🔒'],
  [/cout|budget|prix|depense|\$/, '💰'],
  [/notification|alerte/, '🔔'],
  [/projet|dossier|fichier|file/, '📁'],
  [/livr|paquet|package/, '📦'],
  [/carte|map|monde|lieu/, '🗺️'],
  [/plus|more|menu|options/, '💠'],
];

/** The emoji of a button label (null: no decoration). */
export function emojiForLabel(label: string): string | null {
  const t = fold(label).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return null;
  const hit = ACTIONS.find(([re]) => re.test(t))?.[1] ?? null;
  return hit && fluentDataUrl(hit) ? hit : null;
}

const injected = new Set<string>();
let sheet: HTMLStyleElement | null = null;
function ensureRule(key: string, e: string) {
  if (injected.has(key)) return;
  injected.add(key);
  sheet ??= document.head.appendChild(document.createElement('style'));
  sheet.dataset.emoji = '3d';
  sheet.append(`button[data-emo="${key}"]::before{background-image:url(${fluentDataUrl(e)})}`);
}
const keyOf = (e: string) => [...emojiKey(e)].map((c) => c.codePointAt(0)!.toString(16)).join('-');

const BASE_CSS = `
button[data-emo]::before{content:"";display:inline-block;flex:none;width:1.25em;height:1.25em;margin-right:.42em;vertical-align:-.25em;background-position:center;background-size:contain;background-repeat:no-repeat;filter:drop-shadow(0 1px 1px rgb(0 0 0 / .18));transition:transform .18s ease}
button[data-emo][data-emo-only]::before{margin-right:0;width:1.35em;height:1.35em}
button[data-emo]:hover:not(:disabled)::before{transform:translateY(-1px) scale(1.08) rotate(-4deg)}
button[data-emo] > svg.lucide{display:none}
@media (prefers-reduced-motion: reduce){button[data-emo]::before{transition:none}button[data-emo]:hover::before{transform:none}}
`;

function decorate(b: HTMLButtonElement) {
  if (b.closest('[data-no-emoji],.monaco-editor,.cm-editor') || b.getAttribute('role') === 'switch') return;
  const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
  const label = text || b.getAttribute('aria-label') || b.title || '';
  if (b.dataset.emoLabel === label) return;
  b.dataset.emoLabel = label;
  const e = emojiForLabel(label);
  if (!e) {
    delete b.dataset.emo;
    return;
  }
  const key = keyOf(e);
  ensureRule(key, e);
  b.dataset.emo = key;
  if (text) delete b.dataset.emoOnly;
  else b.dataset.emoOnly = '';
}

/** Starts the decoration (idempotent): every button now and every button React adds or relabels later. */
export function installEmojiButtons(root: HTMLElement = document.body): () => void {
  if (typeof document === 'undefined') return () => {};
  if (!document.querySelector('style[data-emoji-base]')) {
    const st = document.createElement('style');
    st.dataset.emojiBase = '';
    st.textContent = BASE_CSS;
    document.head.appendChild(st);
  }
  let queued = false;
  const pass = () => {
    queued = false;
    root.querySelectorAll('button').forEach((b) => decorate(b as HTMLButtonElement));
  };
  const mo = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(pass);
  });
  mo.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title'],
  });
  pass();
  return () => mo.disconnect();
}
