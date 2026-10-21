/**
 * Helper to resolve markdown links against the current file's relative path.
 * Internal relative paths within the repo resolve to `{ kind: 'internal', relPath }`.
 * External URLs (http, https, mailto, etc.) resolve to `{ kind: 'external', url }`.
 * In-page anchors or invalid paths resolve to null.
 */
export type ResolvedMarkdownLink =
  | { kind: 'external'; url: string }
  | { kind: 'internal'; relPath: string; anchor?: string };

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

  const hashAt = href.indexOf('#');
  const anchor = hashAt >= 0 ? decodeAnchor(href.slice(hashAt + 1)) : '';
  return anchor
    ? { kind: 'internal', relPath: stack.join('/'), anchor }
    : { kind: 'internal', relPath: stack.join('/') };
}

function decodeAnchor(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `#section` → `section`; anything that is not a pure in-page anchor → null. */
export function inPageAnchor(href: string | undefined): string | null {
  if (!href || !href.startsWith('#') || href.length < 2) return null;
  return decodeAnchor(href.slice(1));
}

/** GitHub-style heading slug: lower-case, drop punctuation, spaces to hyphens. */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Finds the heading (or element id) an anchor names, with GitHub's `-1` de-dupe suffixes. */
export function findAnchorTarget(root: HTMLElement, anchor: string): HTMLElement | null {
  const wanted = anchor.toLowerCase();
  const seen = new Map<string, number>();
  for (const heading of root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    const base = slugifyHeading(heading.textContent ?? '');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if ((n === 0 ? base : `${base}-${n}`) === wanted) return heading;
  }
  return Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((el) => el.id === anchor) ?? null;
}
