/**
 * Module RIG (à construire) : squelette, cinématique directe et inverse (2 os), maillage tiré du masque alpha,
 * poids de skinning lissés, déformation (CoR / LBS). Contrat : `deformer(rig, pose) → sommets`.
 *
 * ÉTAT : ébauche du socle. `deformer` renvoie le maillage AU REPOS (aucune déformation) pour que `rendu/` et
 * `qa/` puissent déjà se brancher. Le constructeur du module remplace ce fichier.
 */
import type { CharacterRig, Pose } from '../timeline/types';

/**
 * Positions déformées des sommets (2V, px image, AVANT la transformation de racine `Pose.racine`, que
 * `timeline/projection.matriceRacine` applique ensuite).
 * ÉBAUCHE : renvoie les positions de repos.
 */
export function deformer(rig: CharacterRig, _pose: Pose): Float32Array {
  return Float32Array.from(rig.maillage.positions);
}
