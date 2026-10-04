// APEX Studio in the browser: the house kit embedded at build time + an
// isolated-frame QA run of the generated application.
import kit from 'virtual:house-kit';
import type { HouseKit } from '../../server/services/apexCore';

let current: HouseKit | null = kit;
/** The kit embedded at build time, or one imported by the user (Plugins → Kit maison). */
export const getHouseKit = (): HouseKit | null => current;
export const setHouseKit = (k: HouseKit | null): void => {
  current = k ?? kit;
};
export const embeddedKit = (): boolean => Boolean(kit);

/**
 * Builds a HouseKit from a .zip of the skill folder (the folder that contains
 * assets/template/shell.html), plus an optional sibling domain skill.
 */
export function kitFromZip(files: Record<string, Uint8Array>): HouseKit {
  const dec = new TextDecoder();
  const names = Object.keys(files);
  const shell = names.find((n) => n.endsWith('assets/template/shell.html'));
  if (!shell)
    throw new Error('assets/template/shell.html introuvable dans le zip (dossier du skill attendu).');
  const root = shell.slice(0, -'assets/template/shell.html'.length);
  const t = (rel: string) => {
    const f = files[root + rel];
    if (!f) throw new Error(`Fichier manquant dans le kit : ${rel}`);
    return dec.decode(f);
  };
  const domain: Record<string, string> = {};
  for (const n of names)
    if (!n.startsWith(root) && /credit-risk-engine\/(SKILL|references\/[^/]+)\.md$/.test(n))
      domain[n.endsWith('/SKILL.md') ? 'credit-risk' : n.split('/').pop()!.replace(/\.md$/, '')] = dec.decode(
        files[n]!,
      );
  return {
    skill: t('SKILL.md'),
    domain,
    shell: t('assets/template/shell.html'),
    kitJs: `${t('assets/kit/g3_xlsx_kit.js')}\n${t('assets/kit/pipeline_word_mail_ppt_kit.js')}`,
    logoB64: t('assets/kit/logo_ecobank_png.b64'),
    vendor: {
      xlsx: t('assets/vendor/xlsx-js-style.min.js'),
      chart: t('assets/vendor/chart.umd.min.js'),
      zip: t('assets/vendor/jszip-pptxgen.min.js'),
    },
    example: t('references/exemple_deal_pipe_app.js'),
    source: root.replace(/\/$/, '').split('/').pop() || 'kit importé',
  };
}

/** Syntax check without executing the code. */
export function syntaxError(js: string): string | null {
  try {
    new Function(js);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * Runs the app in a hidden sandboxed iframe (opaque origin: no access to this
 * page, the key or the files) and collects page errors for a few seconds.
 */
export function qaInFrame(
  html: string,
  ms = 3000,
): Promise<{ errors: string[]; globals: Record<string, string>; title: string }> {
  const token = Math.random().toString(36).slice(2);
  const probe = `<script>(function(){var E=[];window.addEventListener('error',function(e){E.push(String(e.message||e))});window.addEventListener('unhandledrejection',function(e){E.push('Promise: '+String(e.reason&&e.reason.message||e.reason))});setTimeout(function(){var g={};['KIT','XLSX','Chart','PptxGenJS','JSZip','docxBuild','xlsxAttach','mailShell','g3Bars'].forEach(function(k){try{g[k]=typeof window[k]==='undefined'?typeof eval(k):typeof window[k]}catch(x){g[k]='undefined'}});parent.postMessage({apexqa:'${token}',errors:E,globals:g,title:document.title},'*')},${ms})})();</script>`;
  const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + probe) : probe + html;
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1280px;height:800px;opacity:0;pointer-events:none';
    const done = (r: { errors: string[]; globals: Record<string, string>; title: string }) => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      f.remove();
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as {
        apexqa?: string;
        errors: string[];
        globals: Record<string, string>;
        title: string;
      };
      if (d && d.apexqa === token) done({ errors: d.errors, globals: d.globals, title: d.title });
    };
    const timer = setTimeout(
      () =>
        done({
          errors: ["L'application n'a pas fini de se charger (blocage ou boucle infinie)."],
          globals: {},
          title: '',
        }),
      ms + 8000,
    );
    window.addEventListener('message', onMsg);
    f.srcdoc = doc;
    document.body.appendChild(f);
  });
}
