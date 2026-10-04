export function fmtCost(usd: number | null | undefined, digits?: number): string {
  if (usd === null || usd === undefined || Number.isNaN(usd)) return '—';
  if (usd === 0) return '$0';
  const d = digits ?? (usd < 0.01 ? 4 : usd < 1 ? 3 : 2);
  return `$${usd.toFixed(d)}`;
}

export function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function fmtPrice(perMillion: number | null): string {
  if (perMillion === null) return '—';
  if (perMillion === 0) return 'gratuit';
  return `$${perMillion < 1 ? perMillion.toFixed(3) : perMillion.toFixed(2)}`;
}

export function shortModel(id: string): string {
  if (id === 'auto') return 'Auto';
  return id.replace(/^[^/]+\//, '');
}

export function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
