export type SearchEngine = 'google' | 'duckduckgo' | 'bing';

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
