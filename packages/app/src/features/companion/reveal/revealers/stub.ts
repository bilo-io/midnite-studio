import { resourceRefLabel, type ResourceKind } from '@midnite/studio-shared';

import type { Revealer } from '../types';

/**
 * The placeholder every kind starts as (Phase 112 Theme B). The engine still
 * switches to `view` before calling it, so a stubbed reveal lands on the right
 * page and says plainly that it cannot pick the thing out yet. Themes C–F
 * replace each stub in their own family file.
 */
export function unavailableRevealer<K extends ResourceKind>(view: Revealer<K>['view']): Revealer<K> {
  return {
    view,
    reveal: async (ref) => ({
      ok: false,
      reason: 'unavailable',
      say: `I can't pick out ${resourceRefLabel(ref)} yet.`,
    }),
  };
}
