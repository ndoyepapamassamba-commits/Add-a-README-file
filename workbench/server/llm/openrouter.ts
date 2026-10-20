import { httpFetch } from './http';
import { OpenRouterProvider as CoreProvider, type FetchLike, type OpenRouterOptions } from './openrouterCore';

export * from './openrouterCore';

/** Server provider: same client, proxy-aware fetch by default. */
export class OpenRouterProvider extends CoreProvider {
  constructor(opts: Omit<OpenRouterOptions, 'fetch'> & { fetch?: FetchLike }) {
    super({ ...opts, fetch: opts.fetch ?? (httpFetch as unknown as FetchLike) });
  }
}
