import { RESOURCE_KINDS } from '@midnite/studio-shared';

import { getCompanionHost } from '../host';
import { unavailableRevealer } from './revealers/stub';
import type { Revealer, RevealerTable } from './types';

/**
 * The revealer table the engine runs (Phase 112 Theme D, made the host's in Phase 123 Theme F): the
 * host supplies one revealer per resource kind it can open — Studio's live in
 * `packages/app/src/compose/companion/revealers/`, each next to the store it writes — and a kind the
 * host lacks answers "I can't pick out … yet" (`unavailableRevealer`), which is every kind in an app
 * that composes no Studio views.
 */
export function companionRevealers(): RevealerTable {
  const supplied = getCompanionHost().revealers as Record<string, Revealer<never> | undefined>;
  const table: Record<string, unknown> = {};
  for (const kind of RESOURCE_KINDS) table[kind] = supplied[kind] ?? unavailableRevealer(null);
  return table as RevealerTable;
}
