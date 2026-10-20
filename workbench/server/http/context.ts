import type { AgentOrchestrator } from '../agent/orchestrator';
import type { Services } from '../services/container';

export interface AppContext {
  services: Services;
  orchestrator: AgentOrchestrator;
  authToken: string;
  previewToken: string;
  version: string;
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
