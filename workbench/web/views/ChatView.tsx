import { MISSION_TEMPLATES } from '../../server/agent/mission';
import { Bot, Code2, Database, Globe, Palette, Wrench, Rocket } from 'lucide-react';
import { useApp } from '../store/app';
import { useSession } from '../store/session';
import { Composer } from '../components/chat/Composer';
import { Transcript } from '../components/chat/Transcript';
import { Logo } from '../components/layout/ConnectScreen';

const SUGGESTIONS = [
  {
    icon: <Code2 size={15} />,
    title: 'Analyser ce projet',
    text: 'Analyse ce projet : architecture, technologies, points faibles et améliorations prioritaires.',
  },
  {
    icon: <Wrench size={15} />,
    title: 'Trouver et corriger les erreurs',
    text: 'Analyse cette application, trouve les erreurs (console, build, tests) et corrige-les. Vérifie ensuite que tout fonctionne.',
  },
  {
    icon: <Globe size={15} />,
    title: 'Tester dans le navigateur',
    text: "Lance l'application, ouvre-la dans le navigateur, vérifie les erreurs console et fais une capture d'écran.",
  },
  {
    icon: <Database size={15} />,
    title: 'Analyser un fichier de données',
    text: 'Analyse le fichier de données du projet (CSV/Excel) : qualité, anomalies, KPI clés et graphiques.',
  },
  {
    icon: <Bot size={15} />,
    title: 'Construire une application',
    text: 'Construis-moi une application web complète de suivi de portefeuille de crédit (tableau de bord, filtres, graphiques), puis lance-la et vérifie-la.',
  },
  {
    icon: <Palette size={15} />,
    title: 'Créer avec un plugin',
    text: 'Avec le plugin Canva ou Blender connecté, crée un visuel simple pour présenter ce projet.',
  },
];

export function ChatView() {
  const order = useSession((s) => s.order);
  const loading = useSession((s) => s.loading);
  const setDraft = useApp((s) => s.setDraft);
  const project = useApp((s) => s.projects.find((p) => p.id === s.projectId));
  const empty = !loading && order.length === 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-5">
          <div className="wb-in w-full max-w-[760px]">
            <div className="mb-6 flex items-center gap-3">
              <Logo size={34} />
              <div>
                <div className="text-[22px] font-semibold tracking-tight">
                  Que construisons-nous{project ? ` dans ${project.name}` : ''} ?
                </div>
                <div className="text-[13px] text-muted">
                  L'agent lit et modifie vos fichiers, lance des commandes, pilote le navigateur, analyse vos
                  données et utilise vos skills et plugins.
                </div>
              </div>
            </div>
            <div className="mb-3 rounded-xl border border-accent/40 bg-accent-soft p-3">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                <Rocket size={14} className="text-accent" /> Missions autonomes
                <span className="font-normal text-muted">
                  — analyse → plan → exécution → test → review → correction → validation → livraison
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MISSION_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      useApp.getState().setPrefs({ agentMode: 'mission' });
                      setDraft({ text: t.prompt });
                    }}
                    className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12.5px] hover:border-accent"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => setDraft({ text: s.text })}
                  className="flex items-start gap-2.5 rounded-xl border border-line bg-panel p-3 text-left transition hover:border-line-strong hover:bg-hover"
                >
                  <span className="mt-0.5 text-accent">{s.icon}</span>
                  <span>
                    <span className="block text-[13px] font-medium">{s.title}</span>
                    <span className="line-clamp-2 text-[12px] text-muted">{s.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Transcript />
      )}
      <Composer />
    </div>
  );
}
