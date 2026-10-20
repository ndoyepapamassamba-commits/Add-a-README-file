import type { PermissionMode } from '@shared/types';
import type { CommandLevel } from './commandPolicy';

/** What a tool does, from the permission system's point of view. */
export type ToolRisk =
  | 'read' // reads project data, analysis, visualisation
  | 'network' // web search, read-only browsing
  | 'browser_interact' // clicks, typing, downloads in the controlled browser
  | 'write' // modifies project files
  | 'write_internal' // writes workbench-managed files (artifacts, memory)
  | 'delete' // deletes project files
  | 'execute' // runs commands / code (refined by CommandLevel)
  | 'vcs_write' // git commit / checkout / branch
  | 'external'; // actions in third-party apps via plugins (MCP)

export type Decision = 'allow' | 'ask' | 'deny';

const MATRIX: Record<Exclude<ToolRisk, 'execute'>, Record<PermissionMode, Decision>> = {
  read: { safe: 'allow', normal: 'allow', autonomous: 'allow' },
  network: { safe: 'allow', normal: 'allow', autonomous: 'allow' },
  browser_interact: { safe: 'ask', normal: 'allow', autonomous: 'allow' },
  write: { safe: 'deny', normal: 'ask', autonomous: 'allow' },
  write_internal: { safe: 'deny', normal: 'allow', autonomous: 'allow' },
  delete: { safe: 'deny', normal: 'ask', autonomous: 'allow' },
  vcs_write: { safe: 'deny', normal: 'ask', autonomous: 'allow' },
  external: { safe: 'ask', normal: 'ask', autonomous: 'allow' },
};

const EXECUTE: Record<CommandLevel, Record<PermissionMode, Decision>> = {
  readonly: { safe: 'allow', normal: 'allow', autonomous: 'allow' },
  safe: { safe: 'deny', normal: 'allow', autonomous: 'allow' },
  moderate: { safe: 'deny', normal: 'ask', autonomous: 'allow' },
  dangerous: { safe: 'deny', normal: 'ask', autonomous: 'ask' },
  blocked: { safe: 'deny', normal: 'deny', autonomous: 'deny' },
};

export interface DecisionInput {
  mode: PermissionMode;
  risk: ToolRisk;
  commandLevel?: CommandLevel;
  /** Session setting: auto-accept file edits in normal mode. */
  autoApproveEdits?: boolean;
  /** Matching "always allow for this session" grant exists. */
  granted?: boolean;
}

export function decide(input: DecisionInput): Decision {
  let decision: Decision;
  if (input.risk === 'execute') decision = EXECUTE[input.commandLevel ?? 'moderate'][input.mode];
  else decision = MATRIX[input.risk][input.mode];

  if (decision === 'ask') {
    if (input.autoApproveEdits && input.mode === 'normal' && input.risk === 'write') return 'allow';
    // Grants never bypass "dangerous" commands: those are confirmed each time.
    if (input.granted && input.commandLevel !== 'dangerous') return 'allow';
  }
  return decision;
}

export const MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  safe: 'SAFE — lecture seule : aucune écriture, aucune commande modifiante.',
  normal: 'NORMAL — modifications de fichiers avec validation (diff), commandes non dangereuses autorisées.',
  autonomous:
    "AUTONOMOUS — l'agent modifie et exécute librement ; seules les actions dangereuses sont confirmées.",
};
