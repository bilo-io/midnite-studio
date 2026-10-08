import { allStarterIds } from '@midnite/studio-shared';

/**
 * Thumbnails for the starter gallery. Each one is a 240x135 webp downscaled from a
 * screenshot an earlier Phase 107 PR committed under `docs/screenshots/` (the
 * source of each is listed in the adhoc-game-thumbs PR). A starter with no
 * thumbnail (fighter and soulslike have no in-game shot; the RTS one is blank)
 * falls back to the perspective glyph.
 *
 * File name = starter id with `@` written as `--` (`shooter--first-person.webp`).
 */
const FILES = import.meta.glob<string>('./thumbs/*.webp', { eager: true, query: '?url', import: 'default' });

const BY_ID = new Map<string, string>(
  Object.entries(FILES).map(([path, url]) => [
    (path.split('/').pop() ?? '').replace(/\.webp$/, '').replace('--', '@'),
    url,
  ]),
);

/** The bundled thumbnail URL for a starter id, or null when it has none. */
export const thumbnailFor = (starterId: string): string | null => BY_ID.get(starterId) ?? null;

/** Every valid starter id with the thumbnail it resolves to (null = glyph fallback). */
export const thumbnailCoverage = (): { id: string; url: string | null }[] =>
  allStarterIds().map((id) => ({ id, url: thumbnailFor(id) }));
