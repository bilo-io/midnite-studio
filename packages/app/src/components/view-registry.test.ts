import { describe, expect, it } from 'vitest';

import { VIEW_IDS, type ViewId } from '../store/ui-store';
import { VIEW_COMPONENT } from './view-registry';

/**
 * The two things the record has to keep promising, neither of which the type
 * system can say on its own once the file has compiled.
 *
 * Exhaustiveness IS enforced by `Record<ViewId, ViewEntry>` at build time — so
 * this half is really about `VIEW_IDS`, the runtime list `pathForView`,
 * `viewForPath` and the palette all walk. The type and the array are two
 * different spellings of "every view", and nothing but this test makes them
 * agree.
 */
describe('VIEW_COMPONENT', () => {
  it('has exactly one entry per VIEW_IDS member', () => {
    expect(new Set(Object.keys(VIEW_COMPONENT))).toEqual(new Set(VIEW_IDS));
  });

  it('gives every entry a component', () => {
    for (const view of VIEW_IDS) {
      expect(VIEW_COMPONENT[view].Component, view).toBeTruthy();
    }
  });

  /**
   * The global set, written out — so widening it is a deliberate test change
   * rather than a silent reorder.
   *
   * Eight, not the seven a stale comment might suggest: Phase 59 added
   * `optimizer` and Phase 61 added `database` above the `!selectedRepoId`
   * guard in the ternary this record replaced, and Phase 67 Theme E added
   * `sessions` once its history spans every repo in one list rather than
   * following the active checkout. Dropping any of these to repo-scoped here
   * would be a regression disguised as fidelity to a stale list.
   */
  it('marks exactly the repo-independent views global', () => {
    const global = VIEW_IDS.filter((view) => VIEW_COMPONENT[view].global === true);
    expect(new Set(global)).toEqual(
      new Set<ViewId>([
        'landing',
        'settings',
        'councils',
        'workflows',
        'video',
        'optimizer',
        'database',
        'sessions',
      ]),
    );
  });

  it('never spells a non-global entry as `global: false`', () => {
    // The flag is `true | undefined` by type, and the point of that is that
    // "needs a repo" is the absence of a claim, not a second claim.
    for (const view of VIEW_IDS) {
      const entry = VIEW_COMPONENT[view];
      expect(entry.global === undefined || entry.global === true, view).toBe(true);
    }
  });

  /**
   * The cascade set, written out — Phase 84 Theme K.5. Graph, Actions,
   * Reviews and Issues each wire `useCascadeReveal` (Theme K.1/K.2) inside
   * their own row renderers; Files does the same per directory listing
   * (Theme K.3); Dashboard cascades its tiles (staggered, not literally
   * top-to-bottom — `react-grid-layout` positions by grid coordinate, not
   * document flow). Changes, Projects and Sessions are Theme K.5's own named
   * targets that this pass did NOT wire (a nested `StatusPanel`, a
   * virtualized table, and two-level grouped rows respectively) — see
   * `outstanding.md`. Widening or narrowing this set is a deliberate test
   * change, the same reason the `global` set above is spelled out.
   */
  it('marks exactly the views with a wired cascade', () => {
    const cascading = VIEW_IDS.filter((view) => VIEW_COMPONENT[view].cascade === true);
    expect(new Set(cascading)).toEqual(
      new Set<ViewId>(['graph', 'actions', 'reviews', 'issues', 'files', 'dashboard']),
    );
  });

  it('never spells a non-cascading entry as `cascade: false`', () => {
    for (const view of VIEW_IDS) {
      const entry = VIEW_COMPONENT[view];
      expect(entry.cascade === undefined || entry.cascade === true, view).toBe(true);
    }
  });
});
