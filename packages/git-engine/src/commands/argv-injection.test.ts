import { describe, expect, it } from 'vitest';

import { buildBlameArgs } from './blame';
import { buildGrepArgs } from './grep';
import { buildLogArgs } from './log';
import { buildReflogArgs } from './reflog';
import {
  buildBranchArgs,
  buildBranchDeleteArgs,
  buildBranchRenameArgs,
  buildCheckoutArgs,
  buildResetArgs,
  buildTagArgs,
} from './refs-ops';
import { buildCherryPickArgs, buildMergeArgs, buildRebaseArgs } from './sequencer';
import {
  buildStashArgs,
  buildStashBranchArgs,
  buildStashStoreArgs,
  buildStashStoreArgs,
} from './stash';
import { buildFetchArgs, buildPullArgs, buildPushArgs } from './sync';
import { buildWorktreeAddArgs, buildWorktreeRemoveArgs } from './worktree-ops';

const GUARD = '--end-of-options';
const HOSTILE = ['--exec=touch /tmp/mstudio-pwn', '--upload-pack=touch /tmp/mstudio-pwn'];

type Case = { name: string; build: (v: string) => string[]; attached?: string };

/** One entry per (builder, string field). Adding a builder without a guard fails the loop below. */
const CASES: Case[] = [
  { name: 'checkout.target', build: (v) => buildCheckoutArgs({ target: v }) },
  { name: 'checkout.target(detach)', build: (v) => buildCheckoutArgs({ target: v, detach: true }) },
  { name: 'branch.name', build: (v) => buildBranchArgs({ name: v, startPoint: 'HEAD' }) },
  { name: 'branch.startPoint', build: (v) => buildBranchArgs({ name: 'n', startPoint: v }) },
  { name: 'branch.name(checkout)', attached: '-b', build: (v) => buildBranchArgs({ name: v, startPoint: 'HEAD', checkout: true }) },
  { name: 'branch.startPoint(checkout)', build: (v) => buildBranchArgs({ name: 'n', startPoint: v, checkout: true }) },
  { name: 'branchDelete.name', build: (v) => buildBranchDeleteArgs({ name: v }) },
  { name: 'branchRename.from', build: (v) => buildBranchRenameArgs(v, 'b') },
  { name: 'branchRename.to', build: (v) => buildBranchRenameArgs('a', v) },
  { name: 'tag.name', build: (v) => buildTagArgs({ name: v, target: 'HEAD' }) },
  { name: 'tag.target', build: (v) => buildTagArgs({ name: 't', target: v }) },
  { name: 'tag.name(annotated)', build: (v) => buildTagArgs({ name: v, target: 'HEAD', message: 'm' }) },
  { name: 'reset.target', build: (v) => buildResetArgs(v, 'hard') },
  { name: 'merge.source', build: (v) => buildMergeArgs({ source: v }) },
  { name: 'rebase.onto', build: (v) => buildRebaseArgs({ onto: v }) },
  { name: 'cherryPick.shas', build: (v) => buildCherryPickArgs([v]) },
  { name: 'worktreeAdd.path', build: (v) => buildWorktreeAddArgs({ path: v, branch: 'b', createBranch: false }) },
  { name: 'worktreeAdd.branch', build: (v) => buildWorktreeAddArgs({ path: '/p', branch: v, createBranch: false }) },
  { name: 'worktreeAdd.branch(create)', attached: '-b', build: (v) => buildWorktreeAddArgs({ path: '/p', branch: v, createBranch: true }) },
  { name: 'worktreeAdd.startPoint', build: (v) => buildWorktreeAddArgs({ path: '/p', branch: 'b', createBranch: true, startPoint: v }) },
  { name: 'worktreeRemove.path', build: (v) => buildWorktreeRemoveArgs(v, true) },
  { name: 'stash.pop', build: (v) => buildStashArgs('pop', v) },
  { name: 'stash.apply', build: (v) => buildStashArgs('apply', v) },
  { name: 'stash.drop', build: (v) => buildStashArgs('drop', v) },
  { name: 'stashBranch.name', build: (v) => buildStashBranchArgs(v, 'stash@{0}') },
  { name: 'stashBranch.selector', build: (v) => buildStashBranchArgs('b', v) },
  { name: 'blame.rev', build: (v) => buildBlameArgs({ relPath: 'f', rev: v }) },
  { name: 'reflog.ref', build: (v) => buildReflogArgs(v, 10) },
  { name: 'grep.rev', build: (v) => buildGrepArgs({ pattern: 'p', rev: v }) },
  { name: 'log.revisions', build: (v) => buildLogArgs({ revisions: [v] }) },
  { name: 'fetch.remote', build: (v) => buildFetchArgs({ remote: v }) },
  { name: 'pull.remote', build: (v) => buildPullArgs({ remote: v }) },
  { name: 'pull.branch', build: (v) => buildPullArgs({ remote: 'origin', branch: v }) },
  { name: 'push.remote', build: (v) => buildPushArgs({ remote: v }) },
  { name: 'push.branch', build: (v) => buildPushArgs({ remote: 'origin', branch: v }) },
];

describe('stash store', () => {
  it('refuses an option-shaped sha (store has no --end-of-options)', () => {
    expect(() => buildStashStoreArgs('--exec=x')).toThrow();
    expect(buildStashStoreArgs('abc1234', 'm')).toEqual(['stash', 'store', '-m', 'm', 'abc1234']);
  });
});

describe('every git positional sits after --end-of-options (Phase 91 Theme B)', () => {
  it('enumerates the full builder table', () => {
    // A new builder not registered here must change this count deliberately.
    expect(CASES).toHaveLength(35);
  });

  for (const c of CASES) {
    for (const hostile of HOSTILE) {
      it(`${c.name} ← ${hostile.slice(0, 14)}`, () => {
        const args = c.build(hostile);
        if (c.attached) {
          // Glued to its flag (`-b<name>`): can never be read as a separate option.
          expect(args).toContain(`${c.attached}${hostile}`);
          expect(args).not.toContain(hostile);
          return;
        }
        const guard = args.indexOf(GUARD);
        expect(guard).toBeGreaterThan(-1);
        expect(args.indexOf(hostile)).toBeGreaterThan(guard);
      });
    }
  }
});
