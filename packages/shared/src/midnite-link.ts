/**
 * `midnite://open?app=<id>[&view=<ViewId>][&tab=<MediaTab>|&page=<SettingsPageId>]` — the one
 * link that opens any midnite app, spelled once for both ends of it (Phase 113 Theme D).
 *
 * Where `midnite-studio://` can only ever land in Studio, `midnite://` names the *app* and lets
 * the Midnite Apps launcher decide what that means today: an installed bundle of that app, else
 * Studio (which still hosts every app) on the matching view, else the launcher's own detail sheet
 * for the app. `view`/`tab`/`page` are optional deep-link targets inside it, with the same
 * meaning they have in `studio-link.ts`.
 *
 * Type-only imports and nothing else — like `studio-link.ts`, the launcher takes this file by
 * source path (`@midnite/studio-shared/midnite-link`), never through the barrel, so it carries no
 * zod. That is also why the parser cannot validate `view`/`tab`/`page` against the real enums by
 * itself: a caller that holds them (`VIEW_IDS`, `MEDIA_TABS`, `SETTINGS_PAGE_IDS`) passes them as
 * the optional `vocabulary`, and anything outside it is dropped; with none given, a value is
 * only checked for being a short slug.
 */

import type { PlacementAppId } from './domain/placement';
import type { SettingsPageId, ViewId } from './domain/view';
import type { MediaTab } from './media';

export const MIDNITE_PROTOCOL = 'midnite:' as const;

/** Every app a `midnite://` link can name: the placement map's twelve, plus Studio itself. */
export type MidniteAppId = PlacementAppId | 'studio';

/**
 * The runtime twin of `MidniteAppId`. `placement.ts` imports zod, so its `PLACEMENT_APP_IDS`
 * cannot be taken here; `midnite-link.test.ts` holds the two lists equal, and the two
 * assertions below make a missing or extra id a compile error.
 */
export const MIDNITE_APP_IDS = [
  'studio',
  'cleaner',
  'monitor',
  'vault',
  'capture',
  'browser',
  'mind',
  'agents',
  'coder',
  'money',
  'creator',
  'media',
  'gamer',
] as const satisfies readonly MidniteAppId[];
type _AllAppsListed = MidniteAppId extends (typeof MIDNITE_APP_IDS)[number] ? true : never;
export const _allAppsListed: _AllAppsListed = true;

export type MidniteLinkTarget = {
  app: MidniteAppId;
  view?: ViewId;
  /** Only with `view: 'media'`, as in `studioViewLink`; ignored by `page`. */
  tab?: MediaTab;
  /** Only with `view: 'settings'` (implied when `view` is absent). */
  page?: SettingsPageId;
};

/** The lists the parser filters `view`/`tab`/`page` against; each optional. */
export type MidniteLinkVocabulary = {
  views?: readonly string[];
  tabs?: readonly string[];
  pages?: readonly string[];
};

export function midniteOpenLink(target: MidniteLinkTarget): string {
  const params = new URLSearchParams({ app: target.app });
  if (target.view !== undefined) params.set('view', target.view);
  if (target.page !== undefined) params.set('page', target.page);
  else if (target.tab !== undefined && target.view === 'media') params.set('tab', target.tab);
  return `${MIDNITE_PROTOCOL}//open?${params.toString()}`;
}

const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * Reads a `midnite://open` link back. `null` for anything that is not one (other scheme, other
 * action, unknown app). An unknown or malformed `view`, `tab` or `page` is dropped rather than
 * failing the link — the app still opens, just on its front door.
 */
export function parseMidniteLink(raw: unknown, vocabulary: MidniteLinkVocabulary = {}): MidniteLinkTarget | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== MIDNITE_PROTOCOL) return null;
  const action = url.hostname || url.pathname.replace(/^\/\//, '').split('/')[0];
  if (action !== 'open') return null;

  const app = url.searchParams.get('app');
  if (app === null || !(MIDNITE_APP_IDS as readonly string[]).includes(app)) return null;
  const target: MidniteLinkTarget = { app: app as MidniteAppId };

  const pick = (key: string, allowed: readonly string[] | undefined): string | undefined => {
    const value = url.searchParams.get(key);
    if (value === null || !SLUG.test(value)) return undefined;
    return allowed === undefined || allowed.includes(value) ? value : undefined;
  };
  const view = pick('view', vocabulary.views);
  const tab = pick('tab', vocabulary.tabs);
  const page = pick('page', vocabulary.pages);

  if (view !== undefined) target.view = view as ViewId;
  if (page !== undefined && (view === undefined || view === 'settings')) target.page = page as SettingsPageId;
  else if (tab !== undefined && view === 'media') target.tab = tab as MediaTab;
  return target;
}
