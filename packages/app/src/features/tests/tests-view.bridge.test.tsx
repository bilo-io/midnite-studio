import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { ReposPanel } from '../repos/repos-panel';
import { TestsView } from './tests-view';
import { useTestsStream } from './use-tests-stream';

/**
 * Migrated from `e2e/tests-view.spec.ts` (Phase 82 Theme C, wave 5) — the
 * sidebar Tests section grouping discovered suites by kind, the Tests view's
 * own package tree and selected-suite command, and trusting/running a suite
 * rendering the streamed result. All 3 of the original tests moved here;
 * none stay in Playwright.
 *
 * Discovery, classification and the trust/run wiring are covered under bare
 * vitest (`git-engine/src/tests`, `desktop/src/main/testing`) — what these
 * prove is only what an assembled render can: a discovered suite reaches the
 * sidebar grouped by kind, `TestsView`'s own package tree, and that
 * trusting and running one actually renders what the live stream sends back.
 *
 * Mounted through `ReposPanel` (the sidebar test) and `TestsView` (the other
 * two) directly — neither has a `React.lazy` boundary of its own, so no
 * chunk warm-up is needed.
 *
 * **The run/trust test also mounts `useTestsStream()` in a small harness
 * beside `TestsView`.** That hook's own doc comment says it is "subscribed
 * once, at the app root" — real `app.tsx` calls it once for the app's whole
 * life, independently of which view is on screen — so `TestsView` itself
 * never calls it, and a bare `<TestsView />` never receives the mock
 * bridge's `tests.onResult` event a run finishes with. Mounting the hook
 * alongside is the same "assemble what the real app assembles" substitution
 * `search-view.bridge.test.tsx` makes for `SearchProgressSegment`.
 */

function Harness() {
  useTestsStream();
  return <TestsView />;
}

const MAIN = '/tmp/midnite-studio';

const unitSuite = {
  id: 'packages/app::test',
  package: 'packages/app',
  packageName: '@midnite/studio-app',
  name: 'test',
  kind: 'unit',
  source: 'package.json',
  sourceFile: 'packages/app/package.json',
  displayCommand: 'pnpm run test',
  run: { command: 'pnpm', args: ['run', 'test'], cwd: `${MAIN}/packages/app` },
};

const e2eSuite = {
  ...unitSuite,
  id: 'packages/app::e2e',
  name: 'e2e',
  kind: 'e2e',
  displayCommand: 'pnpm run e2e',
  run: { command: 'pnpm', args: ['run', 'e2e'], cwd: `${MAIN}/packages/app` },
};

// The sidebar nests Tests under Forge alongside Actions/Reviews/Issues
// (Phase 28 Theme F), and `RepoTree` gates the whole Forge parent — Tests
// included — behind a GitHub remote (`hasGithubForge`), same as its three
// siblings. Test discovery itself has nothing to do with GitHub, but the
// sidebar section it renders in does, so the fixture needs one to show it.
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  tests: {
    packages: [
      { path: 'packages/app', name: '@midnite/studio-app', suites: [unitSuite, e2eSuite] },
    ],
  },
};

const UI_STATE = { selectedRepoId: 'repo-1' };

const suites = () => screen.getByRole('region', { name: 'Suites' });
const findSuites = () => screen.findByRole('region', { name: 'Suites' });
const detail = () => screen.getByRole('region', { name: 'Suite detail' });

afterEach(cleanup);

describe('the sidebar Tests section, assembled through the real bridge', () => {
  it('groups discovered suites by kind', async () => {
    renderView(
      <ToastHost>
        <ReposPanel />
      </ToastHost>,
      { fixtures: base, uiState: UI_STATE },
    );
    await screen.findByRole('heading', { name: 'Worktrees' });

    fireEvent.click(await screen.findByRole('button', { name: /^Tests\b/ }));
    expect(await screen.findByText('unit · 1')).toBeTruthy();
    expect(screen.getByText('e2e · 1')).toBeTruthy();
  });
});

describe('TestsView, assembled through the real bridge', () => {
  it("lists suites by package and shows the selected one's command", async () => {
    renderView(<TestsView />, { fixtures: base, uiState: UI_STATE });

    expect(await within(await findSuites()).findByText('@midnite/studio-app')).toBeTruthy();
    expect(within(suites()).getByRole('button', { name: /^test/ })).toBeTruthy();
    expect(within(suites()).getByRole('button', { name: /^e2e/ })).toBeTruthy();

    fireEvent.click(within(suites()).getByRole('button', { name: /^test/ }));
    expect(await within(detail()).findByText('pnpm run test')).toBeTruthy();
    expect(
      within(detail()).getByText('Not trusted. Running it approves this exact command.'),
    ).toBeTruthy();
  });

  it('trusting and running a suite renders the streamed result', async () => {
    const data: MockFixtures = {
      ...base,
      tests: {
        ...base.tests,
        runResult: {
          ok: true,
          structured: true,
          exitCode: 0,
          passed: 4,
          failed: 1,
          skipped: 0,
          failures: [{ name: 'renders', file: 'a.test.ts', message: 'boom' }],
          output: 'output',
          truncated: false,
          ranAt: 1,
          durationMs: 5,
        },
      },
    };
    renderView(<Harness />, { fixtures: data, uiState: UI_STATE });

    fireEvent.click(await within(await findSuites()).findByRole('button', { name: /^test/ }));
    fireEvent.click(await within(detail()).findByRole('button', { name: 'Trust and run suite' }));

    expect(await within(detail()).findByText('4 passed')).toBeTruthy();
    expect(within(detail()).getByText('1 failed')).toBeTruthy();
    expect(within(detail()).getByText('renders')).toBeTruthy();
    expect(within(detail()).getByText('boom')).toBeTruthy();
    // Trust persisted past the run — the button no longer offers to trust again.
    expect(within(detail()).getByRole('button', { name: 'Run suite' })).toBeTruthy();
  });
});
