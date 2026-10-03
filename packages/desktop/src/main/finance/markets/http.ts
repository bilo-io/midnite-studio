/**
 * The one HTTP seam for the Finance dashboard. Every provider call goes
 * through a `Fetcher`, so tests inject a fixture and nothing in the suite can
 * reach the network.
 */
export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

/** A response that says "slow down" — the service backs the provider off rather than retrying. */
export class RateLimitedError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} is rate limiting requests`);
  }
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

export const REQUEST_TIMEOUT_MS = 12_000;

export async function getText(
  fetcher: Fetcher,
  provider: string,
  url: string,
  accept = 'application/json, text/plain, */*',
): Promise<string> {
  const res = await fetcher(url, {
    headers: { 'user-agent': BROWSER_UA, accept },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 429) throw new RateLimitedError(provider);
  if (!res.ok) throw new Error(`${provider} answered ${res.status}`);
  return res.text();
}

export async function getJson(fetcher: Fetcher, provider: string, url: string): Promise<unknown> {
  const body = await getText(fetcher, provider, url);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`${provider} sent something that was not JSON`);
  }
}

/**
 * Only public http(s) hosts. A feed URL is user input that main will fetch, so
 * loopback, link-local, private-range and `.local` hosts are refused — a feed
 * is never a way to poke at the user's own network.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  // Any IPv6 literal is refused outright: none of the feeds worth reading use one.
  if (host.includes(':')) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}
