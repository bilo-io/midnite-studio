import {
  decodeResourceRefParam,
  MEDIA_TABS,
  VIEW_IDS,
  type MediaTab,
  type ResourceRef,
  type ViewId,
} from '@midnite/studio-shared';

export type DeepLink =
  | { kind: 'open'; repo: string }
  | { kind: 'clone'; url: string }
  | { kind: 'reveal'; ref: ResourceRef | null }
  | { kind: 'view'; view: ViewId; tab?: MediaTab };

/**
 * Pure deep-link URL parser (Phase 33 Theme C).
 *
 * Grammars:
 * - midnite-studio://open?repo=<encoded-abs-path>
 * - midnite-studio://clone?url=<encoded-repo-url>
 * - midnite-studio://reveal?ref=<base64url JSON ResourceRef> (Phase 112 Theme I) —
 *   a payload that fails validation yields `ref: null`, which the renderer toasts.
 * - midnite-studio://view?id=<ViewId>[&tab=<MediaTab>] — the Midnite Apps launcher's
 *   tiles (`studioViewLink`). An unknown view is `null`; an unknown or misplaced
 *   `tab` is dropped rather than failing the whole link.
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

    if (action === 'view') {
      const id = parsed.searchParams.get('id');
      if (!id || !(VIEW_IDS as readonly string[]).includes(id)) return null;
      const view = id as ViewId;
      const tab = parsed.searchParams.get('tab');
      if (view === 'media' && tab !== null && (MEDIA_TABS as readonly string[]).includes(tab)) {
        return { kind: 'view', view, tab: tab as MediaTab };
      }
      return { kind: 'view', view };
    }

    return null;
  } catch {
    return null;
  }
}
