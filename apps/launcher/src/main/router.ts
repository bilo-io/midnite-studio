import { SETTINGS_PAGE_IDS, VIEW_IDS } from '@midnite/studio-shared/domain/view';
import { MEDIA_TABS } from '@midnite/studio-shared/media';
import { parseMidniteLink, type MidniteAppId, type MidniteLinkTarget } from '@midnite/studio-shared/midnite-link';
import { studioSettingsLink, studioViewLink } from '@midnite/studio-shared/studio-link';

import { appLink } from './links';

/**
 * The `midnite://open?app=…` router (Phase 113 Theme D). A link names an app; what opening it
 * means depends on what is installed, in this order:
 *
 *  1. the app's own bundle — none exist yet, so `findAppBundle` is the seam that returns `null`
 *     until per-app bundles ship;
 *  2. Midnite Studio, which hosts every app today — forwarded as a `midnite-studio://` link;
 *  3. neither — the launcher comes forward with that app's detail sheet open, which is where
 *     Install lives.
 *
 * Pure decision plus one executor, so each branch is a unit test with fake deps.
 */

export type RouteDecision =
  | { kind: 'bundle'; path: string }
  | { kind: 'studio'; url: string }
  | { kind: 'detail'; app: MidniteAppId };

export type RouterDeps = {
  /** Path of the installed per-app bundle, or `null`. Always `null` until apps ship on their own. */
  findAppBundle(app: MidniteAppId): Promise<string | null>;
  isStudioInstalled(): Promise<boolean>;
};

/** The seam for step 1: no per-app bundle exists yet. */
export const findAppBundle: RouterDeps['findAppBundle'] = async () => null;

/** The `midnite-studio://` link a target lands on when Studio hosts it. */
export function studioUrlFor(target: MidniteLinkTarget): string {
  if (target.page !== undefined) return studioSettingsLink(target.page);
  if (target.view !== undefined) return studioViewLink(target.view, target.tab);
  return appLink(target.app);
}

export async function routeTarget(target: MidniteLinkTarget, deps: RouterDeps): Promise<RouteDecision> {
  const bundle = await deps.findAppBundle(target.app);
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
