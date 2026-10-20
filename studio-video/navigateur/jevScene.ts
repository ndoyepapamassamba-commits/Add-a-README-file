// JEV LIT UNE SCÈNE (moteur de scène instantané, v64) : un appel typé (≈ 0,0001 $) affine la lecture locale — univers,
// éléments nommés ou sous-entendus, nombres, heure, saison, cadrage, ambiance. La lecture locale est gardée telle quelle
// quand JEV ne peut pas répondre (fournisseur local, pas de clé, budget du jour, erreur). L'univers que JEV choisit avec
// confiance relit la demande avec le catalogue de cet univers. (Venu de Workbench, direct/lib/jev.ts, le 16/10/2026.)
import { jevAsk } from '@workbench/direct/lib/jev';
import { jevSceneQuestions, jevSceneState, parseSceneLocal, specFromJev, type SceneSpec } from '../coeur/realize/sceneKit';

export async function jevSceneSpec(prompt: string, local: SceneSpec): Promise<SceneSpec> {
  const answers = await jevAsk(jevSceneState(prompt), jevSceneQuestions());
  if (!answers) return local;
  const th = answers.theme;
  const base = th?.choice && th.choice !== local.theme && (th.confidence ?? 0) >= 0.7 ? parseSceneLocal(prompt, { theme: th.choice as SceneSpec['theme'] }) : local;
  return specFromJev(base, answers, prompt);
}
