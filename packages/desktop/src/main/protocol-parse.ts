import { decodeResourceRefParam, type ResourceRef } from '@midnite/studio-shared';

export type DeepLink =
  | { kind: 'open'; repo: string }
  | { kind: 'clone'; url: string }
  | { kind: 'reveal'; ref: ResourceRef | null };

/**
 * Pure deep-link URL parser (Phase 33 Theme C).
 *
 * Grammars:
 * - midnite-studio://open?repo=<encoded-abs-path>
 * - midnite-studio://clone?url=<encoded-repo-url>
 * - midnite-studio://reveal?ref=<base64url JSON ResourceRef> (Phase 112 Theme I) —
 *   a payload that fails validation yields `ref: null`, which the renderer toasts.
 *
 * Returns `null` on any malformed input, invalid scheme/host, non-absolute repo path,
 * path with NUL bytes, or clone URL scheme other than https/ssh/git.
 */
export function parseDeepLink(raw: string): DeepLink | null {
  if (!raw || typeof raw !== 'string') return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'midnite-studio:') return null;

    const action = parsed.hostname || parsed.pathname.replace(/^\/\//, '').split('/')[0];

    if (action === 'open') {
      const repo = parsed.searchParams.get('repo');
      if (!repo || !repo.startsWith('/') || repo.includes('\0')) return null;
      return { kind: 'open', repo };
    }

    if (action === 'clone') {
      const url = parsed.searchParams.get('url');
      if (!url) return null;
      try {
        const parsedUrl = new URL(url);
        if (!['https:', 'ssh:', 'git:'].includes(parsedUrl.protocol)) return null;
      } catch {
        if (!url.startsWith('git@') && !url.includes(':')) return null;
      }
      return { kind: 'clone', url };
    }

    if (action === 'reveal') {
      const param = parsed.searchParams.get('ref');
      return { kind: 'reveal', ref: param ? decodeResourceRefParam(param) : null };
    }

    return null;
  } catch {
    return null;
  }
}
