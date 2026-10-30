import { beforeEach, describe, expect, it } from 'vitest';

import { getCompanionHost, installCompanionHost, resolveUiAction } from '@midnite/studio-feature-companion/renderer';

import { STUDIO_COMPANION_HOST } from '../companion-host';

/**
 * The companion's engine against Studio's real tables — the cases that left the package's own suite
 * because they need a Studio view, store or source (Phase 123 Theme F). The package tests the engine
 * with stand-in revealers; this file proves the Studio host fills what the engine asks for.
 */
beforeEach(() => {
  installCompanionHost(STUDIO_COMPANION_HOST);
});

describe('Studio companion host', () => {
  it('supplies a revealer for every Studio resource family', () => {
    const kinds = Object.keys(getCompanionHost().revealers);
    for (const kind of ['commit', 'pull', 'chat', 'session', 'note', 'media', 'setting', 'browserTab']) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it('routes a live session to no view and a closed one to Sessions', () => {
    const view = getCompanionHost().revealers.session?.view as (ref: { kind: 'session'; id: string; closed?: boolean }) => string | null;
    expect(view({ kind: 'session', id: 's' })).toBeNull();
    expect(view({ kind: 'session', id: 's', closed: true })).toBe('sessions');
  });

  it('answers find with ranked titles and ids, never a score', async () => {
    const result = await resolveUiAction({ kind: 'find', query: 'appearance settings theme', limit: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.did !== 'found') throw new Error('expected found');
    const matches = result.value.matches;
    expect(matches[0]).toEqual({
      ref: { kind: 'setting', page: 'appearance', section: 'theme' },
      title: 'Appearance settings — Theme',
      detail: 'Appearance settings section',
    });
    expect(matches.length).toBeLessThanOrEqual(3);
    expect(matches.every((match) => !('score' in match))).toBe(true);
  });
});
