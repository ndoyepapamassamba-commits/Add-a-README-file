#!/usr/bin/env python3
"""Ajoute le préfixe 'diffusion_model.' aux clés d'un .safetensors (format LightX2V -> format ComfyUI),
sans toucher aux données : on réécrit seulement l'en-tête JSON."""
import json, struct, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src, 'rb') as f:
    n = struct.unpack('<Q', f.read(8))[0]
    h = json.loads(f.read(n))
    data = f.read()
nh = {}
for k, v in h.items():
    nh[k if k == '__metadata__' or k.startswith('diffusion_model.') else 'diffusion_model.' + k] = v
b = json.dumps(nh, separators=(',', ':')).encode()
b += b' ' * ((8 - len(b) % 8) % 8)
with open(dst, 'wb') as f:
    f.write(struct.pack('<Q', len(b))); f.write(b); f.write(data)
print(len(nh) - ('__metadata__' in nh), 'tenseurs ->', dst)
