// Browser side of the GitHub Intelligence Registry: GitHub REST client (CORS,
// optional token kept in memory only), discovery with offline fallback, and the
// install / enable / disable side effects — never running downloaded code.
import { GITHUB_SNAPSHOT } from '../../server/engine/capabilities';
import {
  discover,
  injectionFindings,
  scanRepo,
  type GithubHttp,
  type RepoFacts,
} from '../../server/engine/github';
import {
  newResource,
  review,
  rollback,
  transition,
  updateAvailable,
  type RegistryResource,
  type ResourceStatus,
} from '../../server/engine/registry';
import { useStore } from './store';

let token = '';
/** Optional GitHub token (raises the rate limit). Memory only: never stored. */
export const setGithubToken = (t: string) => (token = t.trim());
export const hasGithubToken = () => Boolean(token);

export const githubHttp: GithubHttp = {
  async json(path) {
    const r = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (r.status === 404) return null;
    if (!r.ok) {
      const left = r.headers.get('x-ratelimit-remaining');
      throw new Error(
        r.status === 403 || r.status === 429
          ? `GitHub : limite de requêtes atteinte${left === '0' ? ' (60/h sans jeton, 10/min pour la recherche)' : ''}`
          : `GitHub HTTP ${r.status}`,
      );
    }
    return r.json();
  },
  async text(url) {
    const r = await fetch(url);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  },
};

export async function discoverOnGithub(query: string) {
  return discover(githubHttp, query, GITHUB_SNAPSHOT.repos, 12);
}

const save = (r: RegistryResource) => {
  const st = useStore.getState();
  st.setRegistry([r, ...st.registry.filter((x) => x.id !== r.id)]);
  return r;
};

export function addToRegistry(f: RepoFacts, capability: string): RegistryResource {
  const st = useStore.getState();
  const existing = st.registry.find((x) => x.id === f.fullName.toLowerCase());
  if (existing) return existing;
  return save(newResource(f, [capability]));
}

/** Security review: deep scan on GitHub when reachable, metadata otherwise. */
export async function reviewResource(
  r: RegistryResource,
): Promise<{ resource: RegistryResource; deep: boolean; error?: string }> {
  try {
    const facts = await scanRepo(githubHttp, r.facts.fullName);
    return { resource: save(review(r, facts)), deep: true };
  } catch (e) {
    return { resource: save(review(r, r.facts)), deep: false, error: (e as Error).message };
  }
}

export function move(
  r: RegistryResource,
  to: ResourceStatus,
  confirm = false,
): { ok: boolean; error?: string } {
  const t = transition(r, to, { confirm, edition: 'direct' });
  if (!t.ok) return t;
  save(t.resource);
  return { ok: true };
}

/** INSTALL: a skill is copied as text after an injection check; a remote MCP is registered disabled. */
export async function installResource(
  r: RegistryResource,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const t = transition(r, 'INSTALLED', { edition: 'direct' });
  if (!t.ok) return t;
  const st = useStore.getState();
  if (r.install.kind === 'skill-md') {
    const text = await githubHttp.text(r.install.target!).catch(() => null);
    if (!text) return { ok: false, error: 'SKILL.md introuvable à la racine du dépôt.' };
    const bad = injectionFindings(text).filter((f) => f.severity === 'critical' || f.severity === 'high');
    if (bad.length) {
      const rej = transition(r, 'REJECTED', {
        note: `contenu dangereux : ${bad.map((b) => b.label).join(', ')}`,
      });
      if (rej.ok) save(rej.resource);
      return { ok: false, error: `Installation refusée : ${bad.map((b) => b.label).join(', ')}` };
    }
    const name = (/^name:\s*(.+)$/m.exec(text)?.[1] ?? r.name).trim().slice(0, 60);
    const description = (/^description:\s*(.+)$/m.exec(text)?.[1] ?? r.facts.description)
      .trim()
      .slice(0, 300);
    st.setSkills([
      ...st.skills.filter((s) => s.name !== name),
      {
        name,
        description,
        body: text.replace(/^---[\s\S]*?---\s*/, ''),
        files: {},
        triggers: [],
        enabled: false,
      },
    ]);
    save({ ...t.resource, install: { ...t.resource.install, target: name } });
    return { ok: true, note: `Skill « ${name} » ajouté (désactivé) : activez-le quand vous l’avez relu.` };
  }
  if (r.install.kind === 'remote-mcp') {
    st.setMcp([
      ...st.mcp.filter((m) => m.name !== r.name),
      {
        name: r.name,
        url: r.install.target!,
        enabled: false,
        autoApprove: false,
        description: r.facts.description,
      },
    ]);
    save(t.resource);
    return {
      ok: true,
      note: `Serveur MCP « ${r.name} » ajouté aux Plugins (désactivé, chaque appel demandera votre accord).`,
    };
  }
  return { ok: false, error: 'Aucune installation sûre possible dans cette édition.' };
}

/** ENABLE / DISABLE apply to the installed skill or MCP server. */
export function setEnabled(r: RegistryResource, on: boolean): { ok: boolean; error?: string } {
  const res = move(r, on ? 'ENABLED' : 'DISABLED');
  if (!res.ok) return res;
  const st = useStore.getState();
  if (r.install.kind === 'skill-md' && r.install.target)
    st.setSkills(st.skills.map((s) => (s.name === r.install.target ? { ...s, enabled: on } : s)));
  if (r.install.kind === 'remote-mcp')
    st.setMcp(st.mcp.map((m) => (m.name === r.name ? { ...m, enabled: on } : m)));
  return { ok: true };
}

export function rollbackResource(r: RegistryResource): { ok: boolean; error?: string } {
  const t = rollback(r);
  if (!t.ok) return t;
  // Rolling back an installation removes what it added.
  if (r.status === 'INSTALLED' || r.status === 'ENABLED' || r.status === 'DISABLED') {
    const st = useStore.getState();
    if (t.resource.status === 'APPROVED') {
      if (r.install.kind === 'skill-md' && r.install.target)
        st.setSkills(st.skills.filter((s) => s.name !== r.install.target));
      if (r.install.kind === 'remote-mcp') st.setMcp(st.mcp.filter((m) => m.name !== r.name));
    }
    if (r.install.kind === 'skill-md' && r.install.target && t.resource.status === 'DISABLED')
      st.setSkills(st.skills.map((s) => (s.name === r.install.target ? { ...s, enabled: false } : s)));
  }
  save(t.resource);
  return { ok: true };
}

export async function checkUpdate(r: RegistryResource): Promise<string | null> {
  const f = await scanRepo(githubHttp, r.facts.fullName);
  return updateAvailable(r, f);
}
