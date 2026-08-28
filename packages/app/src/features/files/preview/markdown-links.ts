/**
 * Helper to resolve markdown links against the current file's relative path.
 * Internal relative paths within the repo resolve to `{ kind: 'internal', relPath }`.
 * External URLs (http, https, mailto, etc.) resolve to `{ kind: 'external', url }`.
 * In-page anchors or invalid paths resolve to null.
 */
export type ResolvedMarkdownLink =
  | { kind: 'external'; url: string }
  | { kind: 'internal'; relPath: string };

const EXTERNAL_SCHEMES = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function resolveMarkdownLinkTarget(
  href: string | undefined,
  currentRelPath?: string,
): ResolvedMarkdownLink | null {
  if (!href || href.length === 0) return null;
  if (href.startsWith('#')) return null;

  // External link check (e.g. https://, http://, mailto:)
  if (EXTERNAL_SCHEMES.test(href)) {
    return { kind: 'external', url: href };
  }

  // Strip query and hash
  const withoutHash = href.split('#')[0] ?? '';
  const cleanHref = withoutHash.split('?')[0] ?? '';
  if (!cleanHref) return null;

  let baseDir = '';
  if (currentRelPath) {
    const lastSlash = currentRelPath.lastIndexOf('/');
    if (lastSlash >= 0) {
      baseDir = currentRelPath.slice(0, lastSlash);
    }
  }

  const rawPath = cleanHref.startsWith('/') ? cleanHref.slice(1) : baseDir ? `${baseDir}/${cleanHref}` : cleanHref;

  // Normalise path segments
  const parts = rawPath.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) {
        // Navigating outside root
        return null;
      }
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return { kind: 'internal', relPath: stack.join('/') };
}
