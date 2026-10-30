/**
 * `midnite://open?app=<id>[&module=<ModuleId>][&view=<ViewId>][&tab=<MediaTab>|&page=<SettingsPageId>]` — the one
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

import type { SettingsPageId, ViewId } from './domain/view';
import type { MediaTab } from './media';
import {
  APP_MODULES,
  MODULE_IDS,
  RETIRED_APP_ALIASES,
  RETIRED_APP_IDS,
  type ModuleHostId,
  type ModuleId,
  type RetiredAppId,
} from './modules';

export const MIDNITE_PROTOCOL = 'midnite:' as const;

/**
 * Every app a `midnite://` link resolves to: the hosts that carry modules, minus Science (no feature
 * yet), plus Studio itself. Phase 124 Theme G: the apps merged into a host are no longer here — a
 * link naming one (`RetiredAppId`) is rewritten to host + module by `parseMidniteLink`.
 */
export type MidniteAppId = Exclude<ModuleHostId, 'science'>;

/** What a link or a hand-off may *name*: a live app, or a retired one that still resolves to its host. */
export type HandoffAppId = MidniteAppId | RetiredAppId;

/**
 * The runtime twin of `MidniteAppId`. `midnite-link.test.ts` holds it equal to `MODULE_HOST_IDS`
 * minus Science, and the two assertions below make a missing or extra id a compile error.
 */
export const MIDNITE_APP_IDS = [
  'studio',
  'agents',
  'media',
  'gamer',
  'vanguard',
  'mind',
  'money',
  'browser',
] as const satisfies readonly MidniteAppId[];
type _AllAppsListed = MidniteAppId extends (typeof MIDNITE_APP_IDS)[number] ? true : never;
export const _allAppsListed: _AllAppsListed = true;

export type MidniteLinkTarget = {
  app: MidniteAppId;
  /**
   * A module of the app (Phase 124 Theme E): lands on that module's nav group. Only kept when the
   * app hosts it (`APP_MODULES`); a link naming a module its app does not carry drops the param and
   * still opens the app.
   */
  module?: ModuleId;
  view?: ViewId;
  /** Only with `view: 'media'`, as in `studioViewLink`; ignored by `page`. */
  tab?: MediaTab;
  /** Only with `view: 'settings'` (implied when `view` is absent). */
  page?: SettingsPageId;
  /**
   * A hand-off's resource: the base64url JSON of a `ResourceRef` (`encodeRefParam`), opaque here.
   * The router never reads it — it rides through to `midnite-studio://reveal?ref=…`, where Studio
   * validates it against `ResourceRefSchema`. Optional, so every older link still parses.
   */
  ref?: string;
  /**
   * An agent-run hand-off (Phase 113 Theme O): the base64url JSON of `{ issueUrl, skill }`
   * (`encodeAgentRunParam`), opaque here like `ref`. The router sends it to whichever app can start
   * an agent from it — Studio today — never to a bundle that would drop it, and the receiver
   * validates it against `AgentRunHandoffSchema` on arrival.
   */
  run?: string;
  /**
   * Set when the link named a retired app (`app=coder`): the id it used. `app` and `module` already
   * hold where it lives now; the launcher's router reads this to open a still-installed old bundle
   * when the host is not installed yet.
   */
  legacyApp?: RetiredAppId;
};

/** A target as a caller writes it: `app` may be a retired id, which the link keeps and the parser resolves. */
export type MidniteLinkInput = Omit<MidniteLinkTarget, 'app' | 'legacyApp'> & { app: HandoffAppId };

/** The lists the parser filters `view`/`tab`/`page` against; each optional. */
export type MidniteLinkVocabulary = {
  views?: readonly string[];
  tabs?: readonly string[];
  pages?: readonly string[];
};

export function midniteOpenLink(target: MidniteLinkInput): string {
  const params = new URLSearchParams({ app: target.app });
  if (target.module !== undefined) params.set('module', target.module);
  if (target.view !== undefined) params.set('view', target.view);
  if (target.page !== undefined) params.set('page', target.page);
  else if (target.tab !== undefined && target.view === 'media') params.set('tab', target.tab);
  if (target.ref !== undefined && REF_PARAM.test(target.ref)) params.set('ref', target.ref);
  if (target.run !== undefined && RUN_PARAM.test(target.run)) params.set('run', target.run);
  return `${MIDNITE_PROTOCOL}//open?${params.toString()}`;
}

/** base64url, at most 4 KB — a ref is a few dozen bytes; anything bigger is not one. */
const REF_PARAM = /^[A-Za-z0-9_-]{1,4096}$/;
/** base64url, at most 2 KB — `{ issueUrl, skill }` is a few hundred bytes at most. */
const RUN_PARAM = /^[A-Za-z0-9_-]{1,2048}$/;
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

  const named = url.searchParams.get('app');
  if (named === null) return null;
  let app: MidniteAppId;
  let legacyApp: RetiredAppId | undefined;
  if ((MIDNITE_APP_IDS as readonly string[]).includes(named)) {
    app = named as MidniteAppId;
  } else if ((RETIRED_APP_IDS as readonly string[]).includes(named)) {
    // A retired id lands on its host, on the module it became (Phase 124 Theme G).
    const alias = RETIRED_APP_ALIASES[named as RetiredAppId];
    if (!(MIDNITE_APP_IDS as readonly string[]).includes(alias.app)) return null;
    app = alias.app as MidniteAppId;
    legacyApp = named as RetiredAppId;
  } else {
    return null;
  }
  const target: MidniteLinkTarget = { app };
  if (legacyApp !== undefined) target.legacyApp = legacyApp;

  const pick = (key: string, allowed: readonly string[] | undefined): string | undefined => {
    const value = url.searchParams.get(key);
    if (value === null || !SLUG.test(value)) return undefined;
    return allowed === undefined || allowed.includes(value) ? value : undefined;
  };
  const module = pick('module', MODULE_IDS);
  const view = pick('view', vocabulary.views);
  const tab = pick('tab', vocabulary.tabs);
  const page = pick('page', vocabulary.pages);

  const ref = url.searchParams.get('ref');
  if (ref !== null && REF_PARAM.test(ref)) target.ref = ref;
  const run = url.searchParams.get('run');
  if (run !== null && RUN_PARAM.test(run)) target.run = run;

  if (module !== undefined && hostsModule(target.app, module as ModuleId)) target.module = module as ModuleId;
  else if (legacyApp !== undefined) target.module = RETIRED_APP_ALIASES[legacyApp].module;
  if (view !== undefined) target.view = view as ViewId;
  if (page !== undefined && (view === undefined || view === 'settings')) target.page = page as SettingsPageId;
  else if (tab !== undefined && view === 'media') target.tab = tab as MediaTab;
  return target;
}

/** Whether `app` carries `module`: a host lists it in `APP_MODULES`; an app that is no host carries none. */
function hostsModule(app: MidniteAppId, module: ModuleId): boolean {
  const modules = (APP_MODULES as Record<string, readonly ModuleId[] | undefined>)[app as ModuleHostId];
  return modules?.includes(module) ?? false;
}
