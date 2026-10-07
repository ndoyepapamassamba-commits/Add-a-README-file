// OMNIPOTENT V4.1 — MISSION-AWARE TOOL FIREWALL (§71, §92).
// AVAILABLE ≠ EXPOSED. The tools offered to the model are derived from the mission (objective, artifact type, planned operations,
// verification needs), not from what the Workbench happens to have. Every tool definition costs tokens on EVERY call, so a
// trivial question exposes none; a missing family can always be requested dynamically (tools.request).
import { TOOL_FAMILIES } from '../tools';
import type { LanePolicy } from './lane';
import type { Reclass } from './reclassify';

export interface ToolFirewallResult {
  allowed: string[];
  blocked: string[];
  reasons: string[];
  available: number;
}
const FILES = /(fichier|file|dossier|r[ée]pertoire|chemin|path|lis (?:le|la|ce)|ouvre|\.\w{2,5}\b|repo|projet)/i;
const COMPUTE = /(calcul\w*|total\w*|moyenne|somme|combien|pourcentage|ratio|compare\w* (?:les )?chiffres)/i;
const WEB = /(cherche\w*|recherche\w*|actualit[ée]|web|internet|sources?|prix actuel|cours (?:du|de)|derni[èe]res? nouvelles?|aujourd['’]hui)/i;
const BROWSE = /(https?:\/\/|ouvre le site|navigue|navigateur|page web|capture d['’][ée]cran|rendu)/i;
const DELIVER = /(rapport|export\w*|excel|xlsx|word|docx|powerpoint|pptx|pdf|livrable|tableau de bord|dashboard|mail|e-?mail|synth[èe]se)/i;
const APEX = /(apex|dashboard|tableau de bord|cockpit|application html)/i;

const family = (...f: string[]) => f.flatMap((x) => TOOL_FAMILIES[x] ?? []);

export function toolFirewall(o: { names: string[]; lane: LanePolicy; reclass: Reclass; text: string; attachments: number }): ToolFirewallResult {
  const names = [...new Set(o.names)];
  const t = o.text;
  const named = new Set(names.filter((n) => t.toLowerCase().includes(n.toLowerCase())));
  const reasons: string[] = [];
  const allow = new Set<string>(['tools.request', ...named]);
  const rc = o.reclass;
  if (o.lane.tools === 'none') {
    reasons.push(`voie ${o.lane.lane} : aucun outil exposé (tools.request reste disponible)`);
  } else if (o.lane.tools === 'minimal') {
    const need: string[] = [];
    if (o.attachments > 0 || FILES.test(t) || rc.artifactInvolved) need.push(...family('read'));
    if (rc.mutationRequired) need.push(...family('write'));
    if (COMPUTE.test(t) && (o.attachments > 0 || FILES.test(t))) need.push(...family('data'), 'code.run');
    if (WEB.test(t)) need.push(...family('web'));
    if (BROWSE.test(t) || rc.visualRegression) need.push(...family('browser'));
    if (DELIVER.test(t) && rc.mutationRequired) need.push(...family('deliver'));
    for (const n of need) allow.add(n);
    reasons.push(`voie ${o.lane.lane} : ensemble minimal dérivé de la mission (${[...allow].length - 1} outil(s))`);
  } else {
    // Standard and above: the JEV pack is kept; the firewall only removes what the mission cannot use.
    for (const n of names) allow.add(n);
    if (rc.mutationRequired && (rc.trueTask.startsWith('artifact:repair') || rc.trueTask === 'artifact:regression-repair')) {
      const drop = new Set<string>([...family('visual', 'finance', 'geo'), 'wikipedia.search', 'papers.search', 'timemachine.restore']);
      if (!APEX.test(t)) for (const a of family('apex')) drop.add(a);
      if (!DELIVER.test(t)) for (const a of family('deliver')) drop.add(a);
      for (const d of drop) if (!named.has(d)) allow.delete(d);
      reasons.push('réparation d’artefact : outils de génération visuelle, finance, géo et recherche exclus');
    }
  }
  const allowed = names.filter((n) => allow.has(n));
  if (!allowed.includes('tools.request')) allowed.push('tools.request');
  return { allowed, blocked: names.filter((n) => !allow.has(n)), reasons, available: names.length };
}
