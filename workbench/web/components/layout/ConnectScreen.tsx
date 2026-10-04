import { useState } from 'react';
import { KeyRound, Server, Terminal } from 'lucide-react';
import { defaultBaseUrl, getConnection } from '../../lib/api';
import { useApp } from '../../store/app';
import { Button, Field, Input, Kbd, Spinner } from '../ui';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M16 6.5l8.2 9.5-8.2 9.5-8.2-9.5z" fill="var(--accent-fg)" />
      <path d="M16 11.5l4 4.5-4 4.5-4-4.5z" fill="var(--accent)" />
    </svg>
  );
}

export function ConnectScreen() {
  const connect = useApp((s) => s.connect);
  const connState = useApp((s) => s.connState);
  const connError = useApp((s) => s.connError);
  const prev = getConnection();
  const [baseUrl, setBaseUrl] = useState(prev?.baseUrl ?? defaultBaseUrl());
  const [token, setToken] = useState(prev?.token ?? '');

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="wb-in w-full max-w-[520px]">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="text-[18px] font-semibold">OpenRouter AI Workbench</div>
            <div className="text-[13px] text-muted">
              Centre de commande d'ingénierie IA — agents, code, navigateur, données
            </div>
          </div>
        </div>
        <form
          className="rounded-2xl border border-line bg-elev p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void connect({ baseUrl: baseUrl.replace(/\/$/, ''), token: token.trim() });
          }}
        >
          <Field
            label="Agent local (serveur)"
            hint="L'interface (ce fichier HTML) pilote un agent qui tourne sur votre machine : il garde la clé OpenRouter et exécute les outils."
          >
            <div className="flex items-center gap-2">
              <Server size={15} className="text-faint" />
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:8787"
              />
            </div>
          </Field>
          <Field
            label="Jeton d'accès"
            hint="Affiché dans le terminal au démarrage (« Jeton d'accès ») et enregistré dans workbench/data/.workbench-token."
          >
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-faint" />
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Collez le jeton"
                autoFocus
              />
            </div>
          </Field>
          {connError && (
            <div className="mb-3 rounded-lg border border-err/40 bg-err/8 px-3 py-2 text-[13px] text-err">
              {connError}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={!token.trim() || connState === 'connecting'}
          >
            {connState === 'connecting' ? <Spinner /> : null} Se connecter
          </Button>
        </form>
        <div className="mt-4 rounded-2xl border border-line bg-panel/60 p-4 text-[13px]">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Terminal size={15} /> Démarrer l'agent local
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              Dans le dossier <code className="font-mono">workbench</code> : <Kbd>npm install</Kbd> puis{' '}
              <Kbd>npm run build</Kbd>
            </li>
            <li>
              Copiez <code className="font-mono">.env.example</code> en{' '}
              <code className="font-mono">.env</code> et renseignez{' '}
              <code className="font-mono">OPENROUTER_API_KEY</code>
            </li>
            <li>
              <Kbd>npm start</Kbd> — le lien affiché ouvre l'interface déjà connectée
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
