import type { BranchStatus } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { syncResolution } from './sync-resolution';

const branch = (partial: Partial<BranchStatus> = {}): BranchStatus => ({
  head: 'main',
  oid: 'deadbeef',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  unborn: false,
  detached: false,
  ...partial,
});

describe('syncResolution', () => {
  it('names the repair in the button, not the helper', () => {
    // The contract the dialog rests on: you are agreeing to a described act.
    // A button reading "Ask Claude" would be the same button for every failure.
    const resolution = syncResolution(
      { step: 'pull', kind: 'conflict', op: 'merge', files: ['a.ts', 'b.ts'] },
      branch({ behind: 3 }),
    );
    expect(resolution.confirmLabel).toBe('Resolve the 2 merge conflicts with Claude');
    expect(resolution.title).toBe('The pull left 2 files conflicted');
    expect(resolution.warnings).toEqual(['a.ts', 'b.ts']);
  });

  it('follows git into a rebase rather than calling everything a merge', () => {
    const resolution = syncResolution(
      { step: 'pull', kind: 'conflict', op: 'rebase', files: ['a.ts'] },
      branch(),
    );
    expect(resolution.confirmLabel).toBe('Resolve the 1 rebase conflict with Claude');
    expect(resolution.prompt).toContain('complete the rebase');
  });

  it('answers a rejected push with the rebase, and forbids the force-push', () => {
    const resolution = syncResolution(
      {
        step: 'push',
        kind: 'error',
        message: 'The push was rejected.',
        stderr: 'hint: Updates were rejected because the remote contains work (non-fast-forward)',
      },
      branch({ ahead: 2, upstream: 'origin/main' }),
    );
    expect(resolution.confirmLabel).toBe('Rebase onto origin/main and push, with Claude');
    expect(resolution.prompt).toContain('2 local commits');
    expect(resolution.prompt).toContain('Never force-push');
  });

  it('promises a diagnosis, not a fix, for a credential failure', () => {
    // Nothing in the working tree can repair this one, so the button may not
    // imply that clicking it resolves anything.
    const resolution = syncResolution(
      {
        step: 'fetch',
        kind: 'error',
        message: 'Authentication failed.',
        stderr: 'fatal: could not read Username for https://github.com',
      },
      branch(),
    );
    expect(resolution.confirmLabel).toBe('Diagnose the credentials with Claude');
    expect(resolution.prompt).toContain('Do not change any credentials yourself.');
  });

  it('keeps the prompt to one line, whatever git wrote', () => {
    // It becomes one shell word in a pty: a newline inside the open quote
    // leaves the user at a `>` continuation prompt.
    const resolution = syncResolution(
      {
        step: 'pull',
        kind: 'error',
        message: 'It failed.',
        stderr: 'fatal: one\nfatal: two\n\nfatal: three',
      },
      branch(),
    );
    expect(resolution.prompt).not.toContain('\n');
    expect(resolution.prompt).toContain('fatal: one fatal: two fatal: three');
  });

  it('shows git its own words, deduplicated, in the alert box', () => {
    const resolution = syncResolution(
      { step: 'fetch', kind: 'error', message: 'It failed.', stderr: 'It failed.\n\nfatal: nope' },
      branch(),
    );
    expect(resolution.warnings).toEqual(['It failed.', 'fatal: nope']);
  });
});
