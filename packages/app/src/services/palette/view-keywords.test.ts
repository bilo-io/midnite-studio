// vitest/jsdom: pure table logic over VIEW_KEYWORDS — no browser capability needed.
import { describe, expect, it } from 'vitest';

import { VIEW_KEYWORDS } from './providers';
import { VIEW_IDS } from '../../store/ui-store';

/**
 * The companion's `longestViewMatch` (shared/src/companion.ts) scores each
 * view's label, its id and every single word of its keywords by word count,
 * then breaks a tie on *first match in `VIEW_IDS` order*. So a keyword token
 * that is also another view's id steals that view's one-word spoken form —
 * but only when the view declaring it sorts EARLIER than the view the token
 * names. That is how Phase 87 Theme C's `knowledge: '… graph …'` took
 * "show me the graph" from the Commit Graph view: `knowledge` is VIEW_IDS[3]
 * and `graph` is VIEW_IDS[10]. It failed `companion-panel.spec.ts`, not this
 * layer, which is why the guard lives here now.
 *
 * Two such pairs predate Phase 87 and are left standing deliberately — fixing
 * them changes companion routing that is outside this phase's scope, and both
 * are recorded in `.midnite/tasks/outstanding.md`.
 */
const KNOWN_PRE_EXISTING = new Set(['projects → issues', 'graph → history']);

describe('VIEW_KEYWORDS', () => {
  it('never lets an earlier view steal a later view id as a keyword token', () => {
    const rank = new Map(VIEW_IDS.map((id, i) => [id as string, i]));
    const collisions: string[] = [];

    for (const id of VIEW_IDS) {
      for (const token of new Set(VIEW_KEYWORDS[id].split(/\s+/))) {
        if (token === '' || token === id || !rank.has(token)) continue;
        // Only an earlier declarer wins the tie, so only that direction bites.
        if (rank.get(id)! < rank.get(token)!) collisions.push(`${id} → ${token}`);
      }
    }

    expect(collisions.filter((c) => !KNOWN_PRE_EXISTING.has(c))).toEqual([]);
  });
});
