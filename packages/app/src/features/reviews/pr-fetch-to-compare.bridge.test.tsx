import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { PrDetail } from './pr-detail';

/**
 * Migrated from `e2e/pr-fetch-to-compare.spec.ts` (Phase 82 Theme C wave 5)
 * — Theme H's reverted item (Phase 26 refinement x1): "Fetch to compare" for
 * a fork PR whose base blob is not necessarily in the local object store. 2
 * of the original 2 tests moved here — no straggler needed a real browser.
 *
 * Mounted through `PrDetail` directly, the same pattern
 * `pr-detail.bridge.test.tsx`/`pr-detail-link-routing.bridge.test.tsx`
 * already use — a separate file since this is a third, unrelated concern
 * (the Files tab's base-blob gate, not review actions or link routing).
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const HEAD_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);
const IMAGE_PATH = 'docs/logo.png';

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  checks: 'passing',
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
};

const pullDetail = {
  body: 'Why this exists: reading a PR should not need a browser.',
  headSha: HEAD_SHA,
  baseSha: BASE_SHA,
  baseBranch: 'main',
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  mergeable: 'MERGEABLE',
};

const imageFile = {
  path: IMAGE_PATH,
  oldPath: null,
  change: 'modified',
  binary: true,
  oldMode: null,
  newMode: null,
  hunks: [],
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
};

function withPull(baseBlobExists: boolean): MockFixtures {
  return {
    ...fixtures,
    remotes: REMOTES,
    statusEntries: [],
    statusByWorktree: { [MAIN]: [] },
    forge: {
      cli: { reason: 'ready' },
      pulls: [pull],
      pullDetail: { '42': pullDetail },
      pullFiles: { '42': { files: [imageFile] } },
    },
    blobExists: { [`${BASE_SHA}:${IMAGE_PATH}`]: baseBlobExists },
  };
}

async function openPullFiles(baseBlobExists: boolean): Promise<void> {
  renderView(
    <ToastHost>
      <PrDetail repoId="repo-1" number={42} />
    </ToastHost>,
    { fixtures: withPull(baseBlobExists) },
  );
  await screen.findByRole('region', { name: 'Pull request #42' });

  fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
  // `PrFileAccordion` splits a path across two `<span>`s (directory, then
  // basename) — `getByText` matches one text node's own normalised text by
  // default, unlike Playwright's whole-element substring match, so this
  // waits on the basename alone rather than reproducing a multi-node matcher.
  await screen.findByText('logo.png');
}

afterEach(cleanup);

describe('PrDetail — Fetch to compare, assembled through the real bridge', () => {
  it('a present base blob renders the image diff, not the button', async () => {
    await openPullFiles(true);

    expect(await screen.findByTestId('image-diff')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fetch to compare' })).toBeNull();
  });

  it('a missing base blob offers Fetch to compare instead of a silent binary fallback', async () => {
    await openPullFiles(false);

    const button = await screen.findByRole('button', { name: 'Fetch to compare' });
    // Nothing fetches before the click — Phase 17's rule, restated by this
    // theme's own reverted item.
    expect((window as unknown as { __mstudioOps: unknown[] }).__mstudioOps.length).toBe(0);

    fireEvent.click(button);

    await waitFor(() => {
      const ops = (window as unknown as { __mstudioOps: { op: string; args: unknown }[] })
        .__mstudioOps;
      expect(ops).toHaveLength(1);
      expect(ops[0]?.op).toBe('fetch');
    });
  });
});
