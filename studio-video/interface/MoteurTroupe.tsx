// MOTEUR DE LA TROUPE — la chaîne Python (dossier moteur-troupe/) et ses carnets GPU gratuits (carnets/), vus depuis
// l'app : à quoi sert chaque étape et la commande exacte à lancer sur le poste. L'app ne lance pas Python (navigateur) ;
// cette page donne l'ordre des opérations, les règles de garde du juge JEV et les commandes à copier.
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@workbench/web/components/ui';
import { PageHeader } from '@workbench/direct/views/PageHeader';

interface Etape {
  titre: string;
  quoi: string;
  cmd: string;
}

const ETAPES: Etape[] = [
  { titre: '1. Voix', quoi: 'histoire.json → voix au ton de la chaîne (Piper, WORLD) et timeline.json', cmd: 'python3 moteur-troupe/voix.py' },
  { titre: '2. Scène', quoi: 'repère les acteurs, découpe le premier plan, reconstruit le décor derrière (LaMa)', cmd: 'python3 moteur-troupe/prepare_scene.py scenes/x.png prep/x "A,B"' },
  { titre: '3. Visages', quoi: 'bouche et paupières vivantes (LivePortrait, MIT), une fois par scène', cmd: 'python3 moteur-troupe/visages.py prep/x' },
  { titre: '4. Lèvres', quoi: 'visèmes depuis l’audio (Rhubarb Lip Sync, MIT)', cmd: 'python3 moteur-troupe/levres.py timeline.json' },
  { titre: '5. Tournage', quoi: 'jeu sur place, découpage mesuré, aucun plan < 0,5 s, tête entière ou absente', cmd: 'python3 moteur-troupe/tourne.py montage.json sortie' },
  {
    titre: '6. Animation par outil (facultatif)',
    quoi: 'plans parlants animés par Wan2.2-S2V ou EchoMimicV3 sur une carte gratuite, puis JEV garde le plan seulement s’il est fidèle',
    cmd: 'python3 moteur-troupe/anime_ia.py prepare sortie timeline.json && python3 moteur-troupe/anime_ia.py genere sortie kaggle && python3 moteur-troupe/anime_ia.py insere sortie',
  },
  { titre: '7. Juge JEV seul', quoi: 'verdict sur un dossier de plans générés (identité, déformation, « vivant ») → jev.json', cmd: 'python3 moteur-troupe/anime_ia.py juge sortie <dossier des plans>' },
  { titre: '8. Montage 9:16', quoi: 'sous-titres karaoké, cartes émoji, −14 LUFS', cmd: 'python3 moteur-troupe/compose.py sortie sortie/film.mp4' },
  {
    titre: '9. Contrôle avant livraison',
    quoi: 'durée, cadence, décodage, sonie, gels, fluidité, lèvres, Whisper (tests 1 à 6)',
    cmd: 'python3 moteur-troupe/controle_video.py sortie/film.mp4 timeline.json sortie/tournage.json sortie/controle.json',
  },
  { titre: '10. Œil de JEV sur le film', quoi: 'tête coupée, visage déformé, artefacts, style : une image par plan (test 7)', cmd: 'python3 moteur-troupe/jev_plans.py sortie/film.mp4 sortie/tournage.json sortie/jev_plans.json' },
];

const CARNETS: [string, string][] = [
  ['carnets/troupe-colab-v16-drive.ipynb', 'Wan2.2-S2V sur la carte T4 gratuite de Colab ; chaque plan est sauvé dans Google Drive dès qu’il est fini (reprise sans perte).'],
  ['carnets/troupe-openrouter-essai.ipynb', 'Essai des modèles vidéo d’OpenRouter sur vos plans (clé dans les Secrets Colab, plafond de dépense appliqué).'],
  ['carnets/troupe-3d/troupe-3d.ipynb', 'Troupe en 3D : corps gonflé depuis le dessin, rig, clips (GPU gratuit).'],
];

function Commande({ cmd }: { cmd: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-fg">{cmd}</code>
      <button
        type="button"
        className="shrink-0 text-faint hover:text-fg"
        title="Copier la commande"
        onClick={() => {
          void navigator.clipboard?.writeText(cmd).then(() => {
            setOk(true);
            setTimeout(() => setOk(false), 1200);
          });
        }}
      >
        {ok ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function MoteurTroupe() {
  return (
    <div className="h-full overflow-auto" data-testid="moteur-troupe">
      <PageHeader title="Moteur de la troupe" subtitle="La chaîne Python qui tourne les films de la troupe, dans l’ordre, avec la commande de chaque étape." />
      <div className="mx-auto grid max-w-[980px] gap-4 p-4 md:p-6">
        <div className="rounded-xl border border-line bg-elev p-4 text-[13px] text-muted">
          Les scripts sont dans le dossier <b>moteur-troupe/</b> livré avec l’app (Python 3.10+, bibliothèques libres MIT, Apache-2.0 ou
          BSD). Règle de garde du juge JEV : un plan animé par un outil n’est gardé que si l’identité ≥ 0,6, la déformation &lt; 0,5 et
          qu’il est jugé plus vivant à la majorité ; sinon le plan du moteur reste. Fluidité : chaque plan passe à 30 i/s par RIFE (MIT),
          couleur recalée sur le film, cadre sans déformation (moteur-troupe/fluide.py).
        </div>
        <section className="grid gap-3">
          {ETAPES.map((e) => (
            <div key={e.titre} className="rounded-xl border border-line bg-elev p-3">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold">{e.titre}</span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted">{e.quoi}</div>
              <Commande cmd={e.cmd} />
            </div>
          ))}
        </section>
        <section className="rounded-xl border border-line bg-elev p-4">
          <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold">
            Carnets GPU gratuits <Badge tone="accent">Colab · Kaggle</Badge>
          </div>
          <ul className="grid gap-2 text-[12.5px]">
            {CARNETS.map(([f, d]) => (
              <li key={f}>
                <code className="font-mono text-[12px]">{f}</code>
                <div className="text-muted">{d}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
