#!/usr/bin/env python3
"""Audit de sécurité d'une équipe d'agents OpenClaw (lecture seule de openclaw.json).

    py audit_agents.py %USERPROFILE%\\.openclaw\\openclaw.json      # code 1 s'il y a un risque bloquant

Contrôle, pour chaque agent, la « triade dangereuse » : contenu NON FIABLE (web, navigateur, MCP externes)
+ accès aux DONNÉES PRIVÉES (fichiers, mémoire, commandes) + moyen de les FAIRE SORTIR (requêtes web, messages,
commandes). Les trois réunis = une page web piégée peut voler des fichiers. Vérifie aussi : modèle local pour les
données bancaires, délégation, espaces partagés, exposition de la passerelle.
"""
import json
import re
import sys
from pathlib import Path

ALL_TOOLS = {"read", "write", "edit", "apply_patch", "exec", "process", "browser", "web_search", "web_fetch",
             "message", "sessions_spawn", "sessions_send", "sessions_list", "memory_search", "memory_get",
             "gateway", "cron", "canvas", "nodes", "image"}
UNTRUSTED = {"web_search", "web_fetch", "browser"}
PRIVATE = {"read", "exec", "process", "memory_search", "memory_get"}
EXFIL = {"web_fetch", "browser", "message", "sessions_send", "exec", "process", "gateway", "nodes"}
# serveurs MCP de ce dépôt (mcp/*.json5), par nature
MCP_UNTRUSTED = {"web", "navigateur", "youtube", "wikipedia", "github", "docs_code", "huggingface", "notion",
                 "todoist", "pollinations", "excalidraw"}
MCP_PRIVATE = {"fichiers", "notes", "sql_local", "excel", "git", "graphe", "documents", "word", "powerpoint"}
MCP_EXFIL = {"web", "navigateur", "github", "notion", "todoist", "pollinations", "excalidraw", "huggingface"}
BANK_SKILLS = {"analyse-portefeuille", "dossier-comite"}   # skills qui manipulent des données bancaires réelles


def json5_load(text: str):
    try:
        import json5
        return json5.loads(text)
    except ImportError:
        pass
    out, i, n = [], 0, len(text)
    while i < n:                                   # retire commentaires, convertit les chaînes '…'
        c = text[i]
        if c in "\"'":
            q, j, buf = c, i + 1, []
            while j < n and text[j] != q:
                if text[j] == "\\":
                    buf.append(text[j:j + 2])
                    j += 2
                    continue
                buf.append('\\"' if text[j] == '"' else text[j])
                j += 1
            out.append('"' + "".join(buf) + '"')
            i = j + 1
        elif text.startswith("//", i):
            i = text.find("\n", i) if "\n" in text[i:] else n
        elif text.startswith("/*", i):
            i = text.find("*/", i) + 2
        else:
            out.append(c)
            i += 1
    s = "".join(out)
    s = re.sub(r'(?<=[{,\s])([A-Za-z_$][\w$]*)\s*:', r'"\1":', s)    # clés sans guillemets
    s = re.sub(r",\s*([}\]])", r"\1", s)                             # virgules finales
    return json.loads(s)


def mcp_servers(cfg):
    return set(((cfg.get("mcp") or {}).get("servers") or {}).keys())


def agents_of(cfg):
    ag = cfg.get("agents") or {}
    if isinstance(ag.get("entries"), dict):
        return ag["entries"], ag.get("defaults") or {}
    if isinstance(ag.get("list"), list):
        return {a.get("id", f"agent{i}"): a for i, a in enumerate(ag["list"])}, ag.get("defaults") or {}
    return {"main": {}}, ag.get("defaults") or {}


def effective(agent, glob, servers):
    tools = set(ALL_TOOLS) | {f"mcp:{s}" for s in servers}
    for pol in (glob, agent.get("tools") or {}):
        allow, deny = pol.get("allow"), set(pol.get("deny") or [])
        if allow:
            keep = set()
            for t in tools:
                name = t[4:] if t.startswith("mcp:") else t
                if any(x == name or x == t or (t.startswith("mcp:") and str(x).startswith(name + "__")) for x in allow):
                    keep.add(t)
            tools = keep
        tools = {t for t in tools if t not in deny and not (t.startswith("mcp:") and (
            t[4:] in deny or f"{t[4:]}__*" in deny))}
    return tools


def classify(tools):
    mcp = {t[4:] for t in tools if t.startswith("mcp:")}
    u = (tools & UNTRUSTED) | {f"mcp:{m}" for m in mcp & MCP_UNTRUSTED}
    p = (tools & PRIVATE) | {f"mcp:{m}" for m in mcp & MCP_PRIVATE}
    e = (tools & EXFIL) | {f"mcp:{m}" for m in mcp & MCP_EXFIL}
    return u, p, e


def skills_in(ws):
    if not ws:
        return set()
    d = Path(str(ws).replace("~", str(Path.home()), 1)) / "skills"
    return {p.name for p in d.iterdir()} if d.is_dir() else set()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = Path(sys.argv[1])
    cfg = json5_load(path.read_text("utf-8"))
    servers = mcp_servers(cfg)
    glob = (cfg.get("tools") or {})
    agents, defaults = agents_of(cfg)
    issues = []

    def add(level, who, msg):
        issues.append((level, who, msg))

    seen_ws, seen_dir = {}, {}
    defaults_allow = (defaults.get("subagents") or {}).get("allowAgents")
    if defaults_allow and "*" in defaults_allow:
        add("ATTENTION", "défauts", "subagents.allowAgents = * : tout agent peut en lancer un autre (y compris plus puissant).")
    n_default = sum(1 for a in agents.values() if a.get("default"))
    if len(agents) > 1 and n_default != 1:
        add("ATTENTION", "équipe", f"{n_default} agent(s) marqué(s) default : il en faut exactement 1.")
    print(f"{len(agents)} agent(s), {len(servers)} serveur(s) MCP : {', '.join(sorted(servers)) or '—'}\n")
    for aid, a in agents.items():
        tools = effective(a, glob, servers)
        u, p, e = classify(tools)
        name = a.get("name", aid)
        model = str(a.get("model") or (cfg.get("agents") or {}).get("defaults", {}).get("model") or "défaut")
        print(f"■ {aid} ({name}) — modèle {model}")
        print(f"   non fiable : {', '.join(sorted(u)) or '—'}")
        print(f"   données    : {', '.join(sorted(p)) or '—'}")
        print(f"   sortie     : {', '.join(sorted(e)) or '—'}")
        if u and p and e:
            add("BLOQUANT", aid, "triade dangereuse : une page piégée peut faire sortir des fichiers. Retirer de cet "
                f"agent soit les sources non fiables ({', '.join(sorted(u))}), soit l'accès aux données "
                f"({', '.join(sorted(p - e) or p)}) et les sorties ({', '.join(sorted(e))}) — en général : confier "
                "Internet à un agent séparé sans accès aux fichiers.")
        elif u and "exec" in tools:
            add("BLOQUANT", aid, "Internet + exécution de commandes dans le même agent.")
        if not (a.get("tools") or {}).get("allow"):
            add("ATTENTION", aid, "pas de liste « allow » : l'agent a tous les outils non interdits (et les futurs).")
        sk = skills_in(a.get("workspace"))
        if (sk & BANK_SKILLS or aid == "risques") and not model.startswith(("ollama/", "lmstudio/", "local/", "vllm/")):
            add("BLOQUANT", aid, "skills bancaires avec un modèle cloud : utiliser un modèle local (ollama/…).")
        if sk & BANK_SKILLS and u:
            add("BLOQUANT", aid, "skills bancaires + accès à du contenu Internet.")
        if "sessions_spawn" in tools:
            allow = (a.get("subagents") or {}).get("allowAgents") or defaults_allow or []
            if "*" in allow:
                add("ATTENTION", aid, "peut déléguer à n'importe quel agent (allowAgents = *).")
            if u:
                add("BLOQUANT", aid, "lit du contenu Internet ET pilote d'autres agents.")
        if "gateway" in tools:
            add("ATTENTION", aid, "outil gateway : peut modifier la configuration d'OpenClaw.")
        sb = (a.get("sandbox") or {}).get("mode", "off")
        if sb == "off" and "exec" in tools:
            add("INFO", aid, "exécute des commandes hors bac à sable (normal sous Windows sans Docker ; rester sur des copies).")
        for key, seen in (("workspace", seen_ws), ("agentDir", seen_dir)):
            v = a.get(key)
            if v:
                if v in seen:
                    add("BLOQUANT", aid, f"{key} partagé avec « {seen[v]} » : identités et secrets mélangés.")
                seen[v] = aid
        print()
    gw = cfg.get("gateway") or {}
    bind = gw.get("bind")
    if bind and bind not in ("loopback", "127.0.0.1", "localhost"):
        add("BLOQUANT", "passerelle", f"gateway.bind = {bind} : OpenClaw est joignable depuis le réseau.")
    if ((glob.get("elevated") or {}).get("enabled")) is True:
        add("ATTENTION", "global", "outils « elevated » activés : exécution sur l'hôte hors bac à sable.")
    order = {"BLOQUANT": 0, "ATTENTION": 1, "INFO": 2}
    for lvl, who, msg in sorted(issues, key=lambda x: order[x[0]]):
        print(f"[{lvl}] {who} : {msg}")
    blocking = sum(1 for i in issues if i[0] == "BLOQUANT")
    print("\nAucun risque bloquant." if not blocking else f"\n{blocking} risque(s) bloquant(s) : corriger avant usage.")
    sys.exit(1 if blocking else 0)


if __name__ == "__main__":
    main()
