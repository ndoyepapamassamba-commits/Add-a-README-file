// Monaco is bundled locally (no CDN) so the single HTML file works offline.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorkerUrl from 'monaco-editor/editor/editor.worker?worker&url';
import jsonWorkerUrl from 'monaco-editor/languages/features/json/json.worker?worker&url';
import cssWorkerUrl from 'monaco-editor/languages/features/css/css.worker?worker&url';
import htmlWorkerUrl from 'monaco-editor/languages/features/html/html.worker?worker&url';
import tsWorkerUrl from 'monaco-editor/languages/features/typescript/ts.worker?worker&url';
import { getConnection } from './api';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: (id: string, label: string) => Worker | Promise<Worker> };
  }
}

// Workers (≈9 MB) are not embedded in the single HTML file: they are fetched
// from the local agent on first use and started from a Blob URL, which also
// works when the HTML is opened from disk (file://).
const blobCache = new Map<string, Promise<string>>();
function workerBlob(url: string): Promise<string> {
  let p = blobCache.get(url);
  if (!p) {
    const base =
      location.protocol.startsWith('http') && !getConnection()?.baseUrl
        ? location.origin
        : (getConnection()?.baseUrl ?? location.origin);
    const abs = new URL(`/web-assets/${url.replace(/^.*\//, '')}`, base).toString();
    p = fetch(abs)
      .then((r) => {
        if (!r.ok) throw new Error(`worker ${r.status}`);
        return r.text();
      })
      .then((code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    p.catch(() => blobCache.delete(url));
    blobCache.set(url, p);
  }
  return p;
}

window.MonacoEnvironment = {
  async getWorker(_id, label) {
    const url =
      label === 'json'
        ? jsonWorkerUrl
        : label === 'css' || label === 'scss' || label === 'less'
          ? cssWorkerUrl
          : label === 'html' || label === 'handlebars' || label === 'razor'
            ? htmlWorkerUrl
            : label === 'typescript' || label === 'javascript'
              ? tsWorkerUrl
              : editorWorkerUrl;
    return new Worker(await workerBlob(url));
  },
};

monaco.editor.defineTheme('wb-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '7d7a70', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'e09a7d' },
    { token: 'string', foreground: 'a8c98a' },
    { token: 'number', foreground: 'e3b552' },
    { token: 'type', foreground: '79acee' },
  ],
  colors: {
    'editor.background': '#232220',
    'editor.foreground': '#efede6',
    'editorLineNumber.foreground': '#5e5b54',
    'editorLineNumber.activeForeground': '#a7a399',
    'editor.selectionBackground': '#d9775740',
    'editor.lineHighlightBackground': '#2c2b28',
    'editorCursor.foreground': '#d97757',
    'editorWidget.background': '#2c2b28',
    'editorWidget.border': '#3b3a36',
    'minimap.background': '#232220',
    'scrollbarSlider.background': '#4c4a4560',
  },
});
monaco.editor.defineTheme('wb-light', {
  base: 'vs',
  inherit: true,
  rules: [{ token: 'comment', foreground: '8a867b', fontStyle: 'italic' }],
  colors: {
    'editor.background': '#fbfaf7',
    'editor.lineHighlightBackground': '#f1efe8',
    'editorCursor.foreground': '#c8623f',
    'editor.selectionBackground': '#c8623f30',
  },
});

monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  allowJs: true,
  allowNonTsExtensions: true,
  esModuleInterop: true,
});
// Without the project's node_modules types, semantic errors are noisy: keep syntax checks.
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

loader.config({ monaco });

export { monaco };
