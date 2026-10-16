"""Synthèse d'une réplique avec un modèle de voix Piper (fichier ONNX), SANS le code Piper : notre propre appel à
onnxruntime (MIT). Le graphe est modifié en mémoire pour exposer la sortie du prédicteur de durée (nœud `Ceil`,
« w_ceil ») : on obtient la durée EXACTE de chaque symbole, au pas de `hop` échantillons.

Entrée (JSON sur stdin) :
  {"modele": "...onnx", "ids": [1, 0, 25, 0, ...], "locuteur": 36, "echelles": [0.333, 1.0, 0.333],
   "fils": 2, "graine": 7, "wav": "sortie.wav", "frequence": 22050}
Sortie (JSON sur stdout) :
  {"frequence": 22050, "hop": 256, "durees": [n_trames par id], "echantillons": N}

Déterminisme : les nœuds aléatoires du graphe reçoivent une graine et la session est neuve à chaque appel ; même
entrée, mêmes échantillons.

Dépendances : onnxruntime (MIT), onnx (Apache-2.0), numpy (BSD-3-Clause). Utilisation :
  python3 piper_onnx.py < requete.json
"""
import json
import sys
import wave

import numpy as np
import onnx
import onnxruntime as ort

HOP = 256


def charger_graphe(chemin, graine):
    modele = onnx.load(chemin)
    sortie_duree = None
    for noeud in modele.graph.node:
        if noeud.op_type == 'Ceil' and sortie_duree is None:
            sortie_duree = noeud.output[0]
        if noeud.op_type == 'RandomNormalLike':
            noeud.attribute.append(onnx.helper.make_attribute('seed', float(graine)))
    if sortie_duree is None:
        raise SystemExit('modèle sans nœud Ceil : durées indisponibles')
    if sortie_duree not in [o.name for o in modele.graph.output]:
        modele.graph.output.append(onnx.helper.make_tensor_value_info(sortie_duree, onnx.TensorProto.FLOAT, None))
    return modele.SerializeToString(), sortie_duree


def main():
    req = json.load(sys.stdin)
    octets, nom_duree = charger_graphe(req['modele'], req.get('graine', 7))
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = int(req.get('fils', 2))
    opts.inter_op_num_threads = 1
    session = ort.InferenceSession(octets, sess_options=opts, providers=['CPUExecutionProvider'])
    ids = np.array([req['ids']], dtype=np.int64)
    entrees = {
        'input': ids,
        'input_lengths': np.array([ids.shape[1]], dtype=np.int64),
        'scales': np.array(req.get('echelles', [0.333, 1.0, 0.333]), dtype=np.float32),
    }
    if any(i.name == 'sid' for i in session.get_inputs()):
        entrees['sid'] = np.array([int(req.get('locuteur', 0))], dtype=np.int64)
    noms = [session.get_outputs()[0].name, nom_duree]
    audio, durees = session.run(noms, entrees)
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    durees = np.asarray(durees).reshape(-1).astype(np.int64)
    crete = float(np.max(np.abs(audio))) if audio.size else 0.0
    if crete > 0.98:
        audio = audio * (0.98 / crete)
    pcm = np.clip(audio * 32767.0, -32767, 32767).astype(np.int16)
    frequence = int(req.get('frequence', 22050))
    with wave.open(req['wav'], 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(frequence)
        w.writeframes(pcm.tobytes())
    json.dump({'frequence': frequence, 'hop': HOP, 'durees': durees.tolist(), 'echantillons': int(pcm.size)}, sys.stdout)


if __name__ == '__main__':
    main()
