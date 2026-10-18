import resource, subprocess, sys, time, os
la = open('/proc/loadavg').read().split()[:3]
t = time.time()
p = subprocess.run(sys.argv[1:], capture_output=True, text=True, env=os.environ)
w = time.time() - t
r = resource.getrusage(resource.RUSAGE_CHILDREN)
lines = [l for l in (p.stdout + p.stderr).splitlines() if l.strip() and not l.startswith('Fra:')]
print('\n'.join(lines[-30:]))
print(f"BENCH wall={w:.2f}s cpu={r.ru_utime + r.ru_stime:.2f}s (user {r.ru_utime:.2f} sys {r.ru_stime:.2f}) maxrss={r.ru_maxrss/1024:.0f}MB load0={la} rc={p.returncode}")
