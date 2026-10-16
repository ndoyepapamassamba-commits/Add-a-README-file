#!/usr/bin/env python3
"""Lance une commande, affiche le temps mural et le pic de RAM (ru_maxrss des enfants)."""
import resource, subprocess, sys, time
t0 = time.time()
rc = subprocess.call(sys.argv[1:])
dt = time.time() - t0
ru = resource.getrusage(resource.RUSAGE_CHILDREN)
print(f"\n[mesure] rc={rc} temps_mural={dt:.1f}s ({dt/60:.2f} min) user={ru.ru_utime:.1f}s sys={ru.ru_stime:.1f}s pic_RAM={ru.ru_maxrss/1024/1024:.2f} Go", flush=True)
sys.exit(rc)
