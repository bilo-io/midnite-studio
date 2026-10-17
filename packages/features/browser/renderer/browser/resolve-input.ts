export type SearchEngine = 'google' | 'duckduckgo' | 'bing';

/**
 * The address bar's blurred-and-unedited display value (Theme G): scheme
 * and a bare trailing `/` dropped, everything else kept. `github.com/o/r`
 * reads as what it is; `https://github.com/o/r/` reads as noise around it.
 * Falls back to the raw value for anything `URL` cannot parse — a blank new
 * tab, say — so the field never renders empty when it has a real value.
 */
export function trimUrlForDisplay(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}${parsed.hash}`;
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
