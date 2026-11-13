import { featureForView, featureToggle, type FeatureToggleId, type ResourceKind, type ResourceRef, type ViewId } from '@midnite/studio-shared';

import { useFeatureTogglesStore } from '@midnite/studio-frame';
import type { ResourceSource, RevealContext, RevealerTable, RevealOutcome } from '@midnite/studio-feature-companion/renderer';

/**
 * Phase 135 Theme C — the companion's reveal and find tables, minus switched-off features.
 *
 * A revealer whose page belongs to a switched-off feature answers `unavailable` without switching view, and a
 * source whose every kind lands on one is not asked: an off feature's IPC answers the error envelope, not the list
 * shape a source reads. Both read the toggles at call time, so a switch takes hold without rebuilding the host.
 */
type AnyRevealer = {
  view: ViewId | null | ((ref: ResourceRef) => ViewId | null);
  reveal: (ref: ResourceRef, ctx: RevealContext) => Promise<RevealOutcome>;
};

function offOwner(view: ViewId | null): FeatureToggleId | undefined {
  if (view === null) return undefined;
  const owner = featureForView(view);
  return owner !== undefined && useFeatureTogglesStore.getState().disabled.includes(owner) ? owner : undefined;
}

const viewFor = (revealer: AnyRevealer, ref: ResourceRef): ViewId | null =>
  typeof revealer.view === 'function' ? revealer.view(ref) : revealer.view;

export function gateRevealers(table: RevealerTable): RevealerTable {
  const gated: Record<string, AnyRevealer> = {};
  for (const [kind, revealer] of Object.entries(table as unknown as Record<string, AnyRevealer>)) {
    gated[kind] = {
      view: (ref) => {
        const view = viewFor(revealer, ref);
        return offOwner(view) === undefined ? view : null;
      },
      reveal: async (ref, ctx) => {
        const off = offOwner(viewFor(revealer, ref));
        if (off === undefined) return revealer.reveal(ref, ctx);
        return { ok: false, reason: 'unavailable', say: `${featureToggle(off).label} is switched off in Settings ▸ Features.` };
      },
    };
  }
  return gated as unknown as RevealerTable;
}

/** True when `kind`'s page (a static revealer view) belongs to a switched-off feature. */
function kindOff(table: RevealerTable, kind: ResourceKind): boolean {
  const view = (table as unknown as Record<string, AnyRevealer>)[kind]?.view;
  return typeof view === 'string' && offOwner(view) !== undefined;
}

export function gateSources(sources: readonly ResourceSource[], table: RevealerTable): ResourceSource[] {
  return sources.map((source) => ({
    ...source,
    load: async (query) => (source.kinds.every((kind) => kindOff(table, kind)) ? [] : source.load(query)),
  }));
}
