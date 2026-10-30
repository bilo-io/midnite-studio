import { SETTINGS_PAGE_IDS, VIEW_IDS } from '@midnite/studio-shared/domain/view';
import { MEDIA_TABS } from '@midnite/studio-shared/media';
import { parseMidniteLink, type MidniteAppId, type MidniteLinkTarget } from '@midnite/studio-shared/midnite-link';
import type { RetiredAppId } from '@midnite/studio-shared/modules';
import type { LinkRateLimiter } from '@midnite/studio-shared/page-deep-link';
import { studioRevealLinkFromParam, studioRunLinkFromParam, studioSettingsLink, studioViewLink } from '@midnite/studio-shared/studio-link';

import { findInstalled } from './bundles/state';
import { MODULE_FEATURE_PREFIX } from '../common/catalog';
import { appLink } from './links';

/**
 * The `midnite://open?app=…` router (Phase 113 Theme D). A link names an app; what opening it
 * means depends on what is installed, in this order:
 *
 *  1. the app's own bundle — its Dock stub, as `installed.json` records it (Theme E,
 *     `bundles/state.ts`); no app ships as a bundle yet, so today this finds nothing;
 *  2. Midnite Studio, which hosts every app today — forwarded as a `midnite-studio://` link;
 *  3. neither — the launcher comes forward with that app's detail sheet open, which is where
 *     Install lives.
 *
 * An **agent run** (`run=`, Phase 113 Theme O) skips step 1: a bundle is opened, not handed the
 * link, so it would drop the run. It goes to Studio — the one app that can start an agent from it
 * today — which validates it, resolves the repository among the ones already open and asks before
 * anything runs. When Agents can receive a run itself, it joins step 1 for run links.
 *
 * A retired id (`app=coder`, Phase 124 Theme G) is already rewritten to its host + module by the parser.
 * Step 1 then looks for the **host's** bundle first; only when the host is not installed does it fall
 * back to the old app's own bundle (`legacyApp`, still installed until the launcher offers to remove
 * it), so a bookmark keeps working through the swap. A bundle is opened, not handed the link, so the
 * module itself is landed on only through Studio today (step 2).
 *
 * Pure decision plus one executor, so each branch is a unit test with fake deps.
 */

export type RouteDecision =
  | { kind: 'bundle'; path: string }
  | { kind: 'studio'; url: string }
  | { kind: 'detail'; app: MidniteAppId }
  /** Phase 117 Theme G: a second agent run inside the rate window, dropped before it reaches Studio. */
  | { kind: 'throttled' };

export type RouterDeps = {
  /** Path of the installed per-app bundle's Dock stub, or `null`. */
  findAppBundle(app: MidniteAppId | RetiredAppId): Promise<string | null>;
  isStudioInstalled(): Promise<boolean>;
  /**
   * Phase 117 Theme G: the page deep-link rule for `run=` links. The OS does not say which page sent
   * a `midnite://` link, so every run shares one key: one per 10 s, the rest dropped. Absent, none is.
   */
  runLimiter?: LinkRateLimiter;
};

/** Step 1, from the installed-state record under `installRoot`. */
export function installedBundleFinder(installRoot: string): RouterDeps['findAppBundle'] {
  return async (app) => (await findInstalled(installRoot, app))?.stubPath ?? null;
}

/** The `midnite-studio://` link a target lands on when Studio hosts it. */
export function studioUrlFor(target: MidniteLinkTarget): string {
  // An agent run wins: Studio's receiver checks it and asks before starting anything.
  if (target.run !== undefined) return studioRunLinkFromParam(target.run);
  // A hand-off's resource next: Studio's reveal engine selects the thing, and opens its view itself.
  if (target.ref !== undefined) return studioRevealLinkFromParam(target.ref);
  if (target.page !== undefined) return studioSettingsLink(target.page);
  if (target.view !== undefined) return studioViewLink(target.view, target.tab);
  // A module link lands on that module's own front door, a bare app link on the app's.
  return appLink(target.app, target.module === undefined ? undefined : `${MODULE_FEATURE_PREFIX}${target.module}`);
}

export async function routeTarget(target: MidniteLinkTarget, deps: RouterDeps): Promise<RouteDecision> {
  let bundle = target.run === undefined ? await deps.findAppBundle(target.app) : null;
  // The host is not installed but the app it replaced still is: keep the old link working.
  // A link that carries a view, page or resource goes to Studio instead: an old bundle would drop it.
  const carriesTarget = target.view !== undefined || target.page !== undefined || target.ref !== undefined;
  if (bundle === null && target.run === undefined && !carriesTarget && target.legacyApp !== undefined) {
    bundle = await deps.findAppBundle(target.legacyApp);
  }
  if (bundle !== null) return { kind: 'bundle', path: bundle };
  if (await deps.isStudioInstalled()) return { kind: 'studio', url: studioUrlFor(target) };
  return { kind: 'detail', app: target.app };
}

export type RouterActions = {
  openBundle(path: string): Promise<void>;
  openStudioUrl(url: string): Promise<void>;
  showDetail(app: MidniteAppId): void;
};

/** Parses `raw` at the edge, routes it, performs the outcome. `null` when `raw` is not a valid link. */
export async function handleMidniteLink(
  raw: unknown,
  deps: RouterDeps,
  actions: RouterActions,
): Promise<RouteDecision | null> {
  const target = parseMidniteLink(raw, { views: VIEW_IDS, tabs: MEDIA_TABS, pages: SETTINGS_PAGE_IDS });
  if (target === null) return null;
  if (target.run !== undefined && deps.runLimiter && !deps.runLimiter.allow('run')) return { kind: 'throttled' };
  const decision = await routeTarget(target, deps);
  try {
    if (decision.kind === 'bundle') await actions.openBundle(decision.path);
    else if (decision.kind === 'studio') await actions.openStudioUrl(decision.url);
  } catch {
    // The bundle or Studio would not open: fall back to the sheet rather than swallowing the click.
    actions.showDetail(target.app);
    return { kind: 'detail', app: target.app };
  }
  if (decision.kind === 'detail') actions.showDetail(decision.app);
  return decision;
}

/** The first `midnite://` argument of an argv (second-instance on a platform that passes links there). */
export function linkFromArgv(argv: readonly string[]): string | undefined {
  return argv.find((arg) => arg.startsWith('midnite://'));
}
