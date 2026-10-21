/**
 * `midnite-studio://view?id=<ViewId>[&tab=<MediaTab>|&page=<SettingsPageId>]` — the link that opens
 * Midnite Studio on one of its views, spelled once for both ends of it.
 *
 * The Midnite Apps launcher (`apps/launcher`) builds these for its tiles: until
 * each app ships on its own, every tile resolves to Studio and lands on the
 * view that app will one day be (Coder → Sessions, Cleaner → Optimizer). The
 * desktop's `parseDeepLink` reads them back. One builder for both is what keeps
 * a tile from pointing at a view the parser no longer accepts.
 *
 * Type-only imports and nothing else: the launcher takes this file by a source
 * alias (`@midnite/studio-shared/studio-link`) rather than through the package
 * barrel — the same reason `install-command.ts` is import-free — so its
 * renderer never bundles the wire contract's zod schemas.
 */

import type { SettingsPageId, ViewId } from './domain/view';
import type { MediaTab } from './media';

export const STUDIO_PROTOCOL = 'midnite-studio:' as const;

/** Builds the link; `tab` only means something next to `view: 'media'`, and is dropped elsewhere. */
export function studioViewLink(view: ViewId, tab?: MediaTab): string {
  const params = new URLSearchParams({ id: view });
  if (tab !== undefined && view === 'media') params.set('tab', tab);
  return `${STUDIO_PROTOCOL}//view?${params.toString()}`;
}

/** Opens Settings on one page: `midnite-studio://view?id=settings&page=<page>`. */
export function studioSettingsLink(page: SettingsPageId): string {
  const params = new URLSearchParams({ id: 'settings', page });
  return `${STUDIO_PROTOCOL}//view?${params.toString()}`;
}

/**
 * Opens `url` in Studio's browser panel — a `reveal` link carrying a
 * `browserTab` ref, byte-for-byte what `resourceRefLink` builds for one. Spelled
 * here without it because `resource-ref.ts` imports zod and this file may not;
 * `studio-link.test.ts` holds the two to the same output.
 */
export function studioBrowserLink(url: string): string {
  return studioRevealLinkFromParam(encodeRefParam({ kind: 'browserTab', url }));
}

/**
 * base64url of a ref's JSON — the `ref=` parameter of `midnite-studio://reveal` and of
 * `midnite://open`. The same bytes `resourceRefLink` produces; kept here zod-free so the
 * launcher can take it by source path.
 */
export function encodeRefParam(ref: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ref));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * `midnite-studio://run?req=<param>` from an already-encoded agent run (`encodeAgentRunParam`) —
 * Phase 113 Theme O's hand-off. Studio decodes and validates it on arrival, resolves the repository
 * among the ones already open, and always asks before anything runs.
 */
export function studioRunLinkFromParam(param: string): string {
  return `${STUDIO_PROTOCOL}//run?req=${param}`;
}

/** `midnite-studio://reveal?ref=<param>` from an already-encoded ref (Studio validates it on arrival). */
export function studioRevealLinkFromParam(param: string): string {
  return `${STUDIO_PROTOCOL}//reveal?ref=${param}`;
}

/**
 * `midnite-studio://capture?id=<CaptureId>` — Midnite Capture's "Open in Midnite Studio" (Phase 113
 * Theme K): Studio asks, then imports that capture from Midnite Capture's own captures directory and shows
 * it in its Capture view, where Send to reaches a chat, a PR comment or a Creator project. Only the id
 * travels — never a path; Studio's parser validates it against the capture id pattern.
 */
export function studioCaptureLink(id: string): string {
  return `${STUDIO_PROTOCOL}//capture?${new URLSearchParams({ id }).toString()}`;
}
