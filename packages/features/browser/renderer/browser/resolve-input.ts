export type SearchEngine = 'google' | 'duckduckgo' | 'bing';

/**
 * The address bar's blurred-and-unedited display value (Theme G): scheme
 * and a bare trailing `/` dropped, everything else kept. `github.com/o/r`
 * reads as what it is; `https://github.com/o/r/` reads as noise around it.
 * Falls back to the raw value for anything `URL` cannot parse — a blank new
 * tab, say — so the field never renders empty when it has a real value.
 */
/** `true` when `unicode` is the same host as the ASCII `hostname` (WHATWG URL punycodes an IDN). */
function sameHost(unicode: string, hostname: string): boolean {
  try {
    return new URL(`http://${unicode}`).hostname === hostname;
  } catch {
    return false;
  }
}

export function trimUrlForDisplay(url: string, displayHost?: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    // `displayHost` is the verdict's (Phase 117 Theme C): the Unicode form of an IDN host only when
    // `lookalike.ts` judged it safe to show, else the punycode `URL` already gives. Never trusted for
    // a different host than the URL's own — that would let a stale verdict relabel a new page.
    const host =
      displayHost && displayHost !== parsed.hostname && sameHost(displayHost, parsed.hostname)
        ? `${displayHost}${parsed.port ? `:${parsed.port}` : ''}`
        : parsed.host;
    return `${host}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export function resolveInput(input: string, engine: SearchEngine = 'google'): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  if (/^localhost(:[0-9]+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:\d+)?(\/.*)?$/.test(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }

  const encoded = encodeURIComponent(trimmed);
  switch (engine) {
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${encoded}`;
    case 'bing':
      return `https://www.bing.com/search?q=${encoded}`;
    case 'google':
    default:
      return `https://www.google.com/search?q=${encoded}`;
  }
}
