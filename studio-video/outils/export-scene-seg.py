#!/usr/bin/env python3
"""
One-time export of the scene-parsing model used by the film engine (« sol praticable », objects of a painted set):

  UperNet + ConvNeXt-small trained on ADE20K (150 classes) — OpenMMLab, MIT licence
  https://huggingface.co/openmmlab/upernet-convnext-small

The OFFICIAL weights are converted to ONNX here (no anonymous re-upload is trusted), then checked against the original
(max |Δlogits| and argmax agreement), so the engine only needs onnxruntime afterwards. The pyramid pooling module needs a
feature map divisible by 1, 2, 3 and 6 at stride 32: the input is fixed at 576 × 1152 (the 2:1 shape of the sets; other
shapes are padded by reflection in troupe-enhance.py).

Needs, ONCE: pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install transformers onnx
Output: ~/.cache/massamba-models/upernet-convnext-small-ade.onnx (+ .labels.json). Never committed.
"""
import json
import os
import sys

H, W = 576, 1152
MODEL = 'openmmlab/upernet-convnext-small'
OUT = os.path.expanduser('~/.cache/massamba-models/upernet-convnext-small-ade.onnx')


def main() -> int:
    try:
        import numpy as np
        import torch
        from transformers import UperNetForSemanticSegmentation
    except ImportError as e:
        print(f'manque {e.name} — installer une fois : pip install torch --index-url https://download.pytorch.org/whl/cpu '
              '&& pip install transformers onnx', file=sys.stderr)
        return 2
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    model = UperNetForSemanticSegmentation.from_pretrained(MODEL).eval()
    x = torch.randn(1, 3, H, W)
    torch.onnx.export(model, (x,), OUT + '.part', input_names=['pixel_values'], output_names=['logits'], opset_version=17)
    os.replace(OUT + '.part', OUT)
    labels = [model.config.id2label[i].strip() for i in range(len(model.config.id2label))]
    json.dump(labels, open(OUT.replace('.onnx', '.labels.json'), 'w'), ensure_ascii=False)
    import onnxruntime as ort
    s = ort.InferenceSession(OUT, providers=['CPUExecutionProvider'])
    with torch.no_grad():
        a = model(pixel_values=x).logits.numpy()
    b = s.run(None, {'pixel_values': x.numpy()})[0]
    diff, agree = float(np.abs(a - b).max()), float((a.argmax(1) == b.argmax(1)).mean())
    print(f'export ONNX vérifié : écart max {diff:.2e}, même classe sur {100 * agree:.4f} % des pixels → {OUT}')
    return 0 if agree > 0.999 else 1


if __name__ == '__main__':
    sys.exit(main())
