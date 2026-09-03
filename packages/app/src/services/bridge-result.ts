import { failure, type GitOpResult } from '@midnite/studio-shared';

import { useToastStore } from '../store/toast-store';

/**
 * The two helpers every bridge-backed mutation hook needs, hoisted out of
 * `use-council.ts` and `use-council-run.ts` where they used to be duplicated
 * verbatim (Phase 43 Theme H). `use-workflow.ts` is the third call site that
 * would otherwise have started a third copy.
 */

/**
 * No preload under vitest/jsdom — the fallback every write mutation returns.
 * Generic (rather than one shared constant) so each call site's
 * `GitOpResult<T>` keeps its own `value` shape instead of collapsing into a
 * union across every T this file's callers use.
 */
export function noBridge<T>(): GitOpResult<T> {
  return failure('The app bridge is unavailable.');
}

export function reportFailure<T>(result: GitOpResult<T>): void {
  if (!result.ok && result.kind === 'error') {
    useToastStore.getState().addToast({ message: result.message, status: 'error' });
  }
}
