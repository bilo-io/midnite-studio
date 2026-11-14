import type { TerminalSession } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { groupSessionsByFolder } from './terminal-session-list';

const row = (id: string, over: Partial<TerminalSession> = {}): TerminalSession => ({
  id,
  kind: 'shell',
  title: 'repo',
  cwd: '/repo',
  repoId: 'repo:/repo',
  createdAt: 0,
  ...over,
});

/** A previous-build session must always land in some group — the sidebar drops nothing it cannot place. */
describe('groupSessionsByFolder', () => {
  it('groups by live cwd first, then the spawn cwd a recovered row carries', () => {
    const groups = groupSessionsByFolder([row('a'), row('b', { cwd: '/elsewhere' })], { a: '/repo/sub' });
    expect(groups.map((g) => [g.title, g.items.map((s) => s.id)])).toEqual([
      ['sub', ['a']],
      ['elsewhere', ['b']],
    ]);
  });

  it('falls back to the repo, then to one "Other" group, when a row has no usable folder', () => {
    const groups = groupSessionsByFolder(
      [row('a', { cwd: ' ', title: 'midnite' }), row('b', { cwd: ' ', title: '', repoId: '' }), row('c', { cwd: ' ', title: '', repoId: '' })],
      {},
    );
    expect(groups.map((g) => [g.title, g.items.map((s) => s.id)])).toEqual([
      ['midnite', ['a']],
      ['Other', ['b', 'c']],
    ]);
  });
});
