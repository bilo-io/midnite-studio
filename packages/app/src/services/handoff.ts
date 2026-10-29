import {
  MIDNITE_APP_IDS,
  RETIRED_APP_IDS,
  planHandoff,
  type HandoffRequest,
  type HandoffAppId,
  type ResourceRef,
} from '@midnite/studio-shared';

import type { RevealOutcome } from '../features/companion/reveal/types';
import { useUiStore } from '../store/ui-store';

/**
 * Phase 113 Theme D — the cross-app hand-off, renderer side. A surface that wants to send the user
 * to a place another *app* owns ("open this workflow run in Agents") calls `requestHandoff`
 * instead of importing that app's code or writing to its store; `shared/handoff.ts` says whether
 * this process hosts the target.
 *
 * Studio composes every app, so {@link STUDIO_HOSTED_APPS} is all of them and every hand-off is
 * `local` — it navigates in-process exactly as the direct `setActiveView` it replaces did. A
 * standalone app would host only itself plus the frame; a hand-off to anything else becomes
 * `external` and goes to the transport below as a `midnite://open` link, for the launcher's router.
 */
export const STUDIO_HOSTED_APPS: ReadonlySet<HandoffAppId> = new Set<HandoffAppId>([...MIDNITE_APP_IDS, ...RETIRED_APP_IDS]);

export type HandoffOutcome =
  | { ok: true; via: 'local' | 'external' }
  | { ok: false; reason: 'no-transport' | 'reveal-failed'; say: string };

/**
 * The seam for crossing a process boundary: hand the `midnite://open` link to main, which opens it
 * for the Midnite Apps launcher's router (installed app → Studio → detail sheet; `docs/APPS.md`,
 * "The shared data plane"). Installed by default over the bridge's `handoff.open`; Studio hosts
 * every app, so today nothing it plans is external — the transport is for when that set narrows.
 */
export type ExternalHandoffTransport = (link: string) => Promise<boolean>;

/** The bridge's `handoff.open`, when this window's preload carries it; false otherwise. */
export const bridgeHandoffTransport: ExternalHandoffTransport = async (link) => {
  const handoff = window.midniteStudio?.handoff;
  if (!handoff) return false;
  try {
    return (await handoff.open({ link })).ok;
  } catch {
    return false;
  }
};

export type HandoffDeps = {
  hosted: ReadonlySet<HandoffAppId>;
  navigate: (request: HandoffRequest) => void;
  reveal: (ref: ResourceRef) => Promise<RevealOutcome>;
  external: ExternalHandoffTransport | null;
};

let externalTransport: ExternalHandoffTransport | null = bridgeHandoffTransport;

/** Replaces the transport (a test, or a composer with its own); `null` removes it. */
export function setExternalHandoffTransport(transport: ExternalHandoffTransport | null): void {
  externalTransport = transport;
}

/** In-process navigation to a view: what a direct `setActiveView` did, plus tab/page when named. */
function navigateLocally(request: HandoffRequest): void {
  const ui = useUiStore.getState();
  if (request.tab !== undefined) ui.setMediaTab(request.tab);
  if (request.page !== undefined) ui.setSettingsPage(request.page);
  if (request.view !== undefined) ui.setActiveView(request.view);
}

export function liveHandoffDeps(): HandoffDeps {
  return {
    hosted: STUDIO_HOSTED_APPS,
    navigate: navigateLocally,
    // Loaded on demand: the reveal engine reaches most of the app, and a view-only hand-off
    // (the common one) should not drag it into the calling surface's module graph.
    reveal: async (ref) => (await import('../features/companion/reveal/reveal')).revealResource(ref, { caller: 'link' }),
    external: externalTransport,
  };
}

export async function requestHandoff(
  request: HandoffRequest,
  deps: HandoffDeps = liveHandoffDeps(),
): Promise<HandoffOutcome> {
  const plan = planHandoff(request, deps.hosted);
  if (plan.kind === 'external') {
    if (deps.external !== null && (await deps.external(plan.link))) return { ok: true, via: 'external' };
    return { ok: false, reason: 'no-transport', say: "That belongs to another app, and I can't reach it from here yet." };
  }
  if (plan.request.ref !== undefined) {
    // The reveal engine opens the ref's own view and selects it; it never throws.
    const outcome = await deps.reveal(plan.request.ref);
    return outcome.ok ? { ok: true, via: 'local' } : { ok: false, reason: 'reveal-failed', say: outcome.say };
  }
  deps.navigate(plan.request);
  return { ok: true, via: 'local' };
}
