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
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: 'browserTab', url }));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${STUDIO_PROTOCOL}//reveal?ref=${b64url}`;
}
