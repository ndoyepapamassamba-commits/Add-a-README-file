import { EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';

// Node's global fetch ignores HTTPS_PROXY. When a proxy is configured we route
// outbound requests through undici's EnvHttpProxyAgent (honours NO_PROXY).
let dispatcher: Dispatcher | undefined;
const hasProxy = Boolean(
  process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy,
);
if (hasProxy) dispatcher = new EnvHttpProxyAgent();

export type HttpResponse = Awaited<ReturnType<typeof undiciFetch>>;

export function httpFetch(url: string, init: Parameters<typeof undiciFetch>[1] = {}): Promise<HttpResponse> {
  return undiciFetch(url, dispatcher ? { ...init, dispatcher } : init);
}
