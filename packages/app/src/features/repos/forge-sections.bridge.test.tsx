import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useBrowserStore } from '../../store/browser-store';
import { ActionsSection, IssuesSection } from './forge-sections';

/**
 * Migrated from `e2e/forge-issues.spec.ts` (Phase 82 Theme C wave 5) — the
 * Issues section's row rendering and link-out, the disabled-tracker and
 * failed-listing empties, and the Actions section's job-tree peek (fetched
 * only once expanded, and a no-steps job rendering as a job rather than an
 * error). 5 of the original 5 tests moved here — no straggler needed a real
 * browser.
 *
 * `IssuesSection`/`ActionsSection` are mounted directly rather than through
 * the whole sidebar tree — the parsers are already covered under bare
 * vitest, and what this file is actually about (the calm-sentence vs.
 * red-card empties, the lazy job fetch) lives entirely inside these two
 * components. The link-out assertion reads `useBrowserStore` directly rather
 * than a rendered tab strip — this file does not mount `BrowserPane` —
 * exactly the pattern `actions-view.bridge.test.tsx` already uses for the
 * same class of link.
 */

const MAIN = '/tmp/midnite-studio';

function baseFixtures(overrides: Partial<MockFixtures> = {}): MockFixtures {
  return {
    commitDetails: {},
    revisions: {},
    diffs: {},
    graphRows: [],
    statusEntries: [],
    statusByWorktree: { [MAIN]: [] },
    ...overrides,
  };
}

const issue = (over: Record<string, unknown> = {}) => ({
  number: 42,
  title: 'Graph rows jump on resize',
  state: 'open',
  author: 'bilo',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  assignees: [],
  createdAt: '2026-08-01T09:00:00Z',
  updatedAt: '2026-08-20T09:00:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/issues/42',
  ...over,
});

const run = {
  id: '1',
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  headBranch: 'main',
  headSha: 'a'.repeat(40),
  createdAt: '2026-08-26T10:00:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1',
  event: 'push',
  workflowId: '900',
  workflowName: 'CI',
  number: 128,
};

function openIssues(forge: MockFixtures['forge']): void {
  renderView(<IssuesSection repoId="repo-1" index={0} depth={1} />, {
    fixtures: baseFixtures({ forge }),
  });
}

function openActions(forge: MockFixtures['forge']): void {
  renderView(<ActionsSection repoId="repo-1" index={0} depth={1} />, {
    fixtures: baseFixtures({ forge }),
  });
}

afterEach(() => {
  cleanup();
  useBrowserStore.setState({ tabs: [], activeTabId: null });
});

describe('IssuesSection, assembled through the real bridge', () => {
  it('lists what gh reports, and each row links out', async () => {
    openIssues({
      cli: { reason: 'ready' },
      issues: [issue(), issue({ number: 7, title: 'Dark mode contrast', labels: [] })],
    });

    // Closed by default and issuing no query until opened, exactly like Actions
    // and Reviews: each one is a `gh` subprocess against a rate-limited API.
    fireEvent.click(screen.getByRole('button', { name: 'Issues' }));

    expect(await screen.findByText('Graph rows jump on resize')).toBeTruthy();
    // The subtitle is the row's whole context: number, author and labels.
    expect(screen.getByText('#42 · by bilo · bug')).toBeTruthy();
    expect(screen.getByText('Dark mode contrast')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Graph rows jump on resize' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open issue on GitHub' }));
    // Phase 71 Theme B: `forgeRowMenu` routes through `openInMidnite`, which opens
    // a browser tab under the default in-app preference rather than reaching
    // `shell.openExternal` directly.
    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(1));
    expect(useBrowserStore.getState().tabs[0]?.url).toMatch(/github\.com/);
  });

  it('a repo with issues turned off says so, and does not look broken', async () => {
    openIssues({ cli: { reason: 'ready' }, issues: [], issuesDisabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'Issues' }));

    expect(await screen.findByText('Issues are turned off for this repository.')).toBeTruthy();
    // The distinction the `disabled` field exists for: a repository behaving as
    // its owner configured it must not read as a repository that has no issues,
    // nor as one whose issue listing failed.
    expect(screen.queryByText('No open issues.')).toBeNull();
  });

  it('a failed listing is a different empty from an empty listing', async () => {
    openIssues({ cli: { reason: 'ready' }, issues: [], error: 'HTTP 502: Bad gateway' });

    fireEvent.click(screen.getByRole('button', { name: 'Issues' }));

    expect(await within(screen.getByLabelText('Issues')).findByText('HTTP 502: Bad gateway')).toBeTruthy();
  });
});

describe('ActionsSection, assembled through the real bridge', () => {
  it('expanding a run row shows its jobs, and only then fetches them', async () => {
    openActions({
      cli: { reason: 'ready' },
      runs: [run],
      runDetail: {
        '1': {
          jobs: [
            {
              id: '10',
              name: 'typecheck',
              status: 'completed',
              conclusion: 'success',
              startedAt: '2026-08-26T10:00:10Z',
              completedAt: '2026-08-26T10:01:00Z',
              url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1/job/10',
              steps: [
                {
                  number: 1,
                  name: 'Set up job',
                  status: 'completed',
                  conclusion: 'success',
                  startedAt: null,
                  completedAt: null,
                },
              ],
            },
            {
              id: '11',
              name: 'test',
              status: 'completed',
              conclusion: 'failure',
              startedAt: '2026-08-26T10:00:10Z',
              completedAt: '2026-08-26T10:04:00Z',
              url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1/job/11',
              steps: [],
            },
          ],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));

    /*
      `getByRole('img', …)`, not `getByText`: a settled status renders as a
      bare coloured glyph now, so its word survives only as the mark's
      accessible name.
    */
    expect(await screen.findByRole('img', { name: 'Failed' })).toBeTruthy();
    // Nothing has expanded yet, so nothing has been asked of `gh run view`.
    expect(screen.queryByRole('button', { name: 'test' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Jobs in CI #128' }));

    // The question the red dot leaves open: which job failed.
    expect(await screen.findByRole('button', { name: 'typecheck' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'test' })).toBeTruthy();
    expect(screen.getByText('1 steps')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Jobs in CI #128' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'typecheck' })).toBeNull());
  });

  it('a job with no steps renders as a job, not as an error', async () => {
    openActions({
      cli: { reason: 'ready' },
      runs: [run],
      runDetail: {
        '1': {
          jobs: [
            {
              id: '12',
              name: 'deploy',
              status: 'completed',
              conclusion: 'skipped',
              startedAt: null,
              completedAt: null,
              url: '',
              steps: [],
            },
          ],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Jobs in CI #128' }));

    // `steps: []` is what GitHub sends for a job an `if:` declined to run.
    const deployButton = await screen.findByRole('button', { name: 'deploy' });
    expect(deployButton).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Skipped' })).toBeTruthy();
    // No url means nothing to open — the row says so by being disabled rather
    // than by opening a link that goes nowhere.
    expect((deployButton as HTMLButtonElement).disabled).toBe(true);
  });
});
