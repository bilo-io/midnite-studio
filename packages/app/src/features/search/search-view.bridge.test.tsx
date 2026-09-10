import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useUiStore } from '../../store/ui-store';
import { SearchProgressSegment } from '../status-bar/search-progress';
import { useSearchStore } from './search-store';
import { SearchView } from './search-view';

/**
 * Migrated from `e2e/search-view.spec.ts` (Phase 82 Theme C, wave 1 + the
 * harness-gap follow-up) — now all five of its tests, assertion parity
 * preserved. `e2e/search-view.spec.ts` itself is deleted.
 *
 * **The race test (`a second query cancels the first…`) uses vitest's fake
 * timers rather than the fixture's real `delayMs` `setTimeout`** — the phase
 * doc calls this out as the one place a direct translation would be wrong.
 * `use-search.ts`'s own `DEBOUNCE_MS` (250ms) and the mock bridge's
 * `search.start` (`delayMs`) are both plain `setTimeout`s, so
 * `vi.advanceTimersByTimeAsync` steps through the same sequence the e2e
 * spec's two `page.waitForTimeout(400)` calls approximated, deterministically
 * and without the real 800ms+800ms wall-clock cost.
 *
 * **"Each mode returns and renders its own results" — the last of the five,
 * and the one that stayed in Playwright until now.** `SearchView`'s results
 * list is `@tanstack/react-virtual`, and wave 1 left this one behind on a
 * documented, *empirically confirmed* finding: with
 * `HTMLElement.prototype.clientWidth`/`clientHeight` stubbed the same way
 * `projects-view.test.tsx` does, the store correctly received and
 * auto-selected the first result, but the virtualized row itself never
 * painted — `getVirtualItems()` stayed empty regardless, because the
 * measurement `@tanstack/react-virtual` actually keys off is a
 * `ResizeObserver` callback, and this repo's stub at the time never fired
 * one at all.
 *
 * That gap is what `vitest-setup.ts`'s `FiringResizeObserver` (Phase 82
 * Theme C's harness prerequisite) closes: it now invokes its callback with a
 * real `borderBoxSize`, which is the *only* thing `@tanstack/virtual-core`'s
 * `observeElementRect` needs — it prefers `entry.borderBoxSize` over
 * re-reading `offsetWidth`/`offsetHeight` (permanently `0` under jsdom), so
 * no separate `clientWidth`/`getBoundingClientRect` shim was needed once the
 * callback itself fired with real numbers. See `vitest-setup.ts`'s own
 * comment for the full mechanism.
 */

const COMMIT_HIT = {
  sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  parents: [],
  subject: 'fix(search): cancel the previous request',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  authorDate: 1_700_000_000,
  committerDate: 1_700_000_000,
  refs: [],
};

const CONTENT_HIT = { path: 'src/index.ts', line: 10, kind: 'match', text: 'export const foo = 1;' };

const UI_STATE = { selectedRepoId: 'repo-1' };

const SEARCH_STORE_DEFAULTS = {
  mode: 'commits' as const,
  commitsOptions: {
    grep: '',
    author: '',
    since: '',
    until: '',
    paths: '',
    pickaxeString: '',
    regexp: false,
    ignoreCase: false,
  },
  contentOptions: {
    pattern: '',
    rev: '',
    paths: '',
    regexp: false,
    ignoreCase: false,
    wordMatch: false,
    contextLines: 0,
  },
  filesOptions: { query: '' },
  selectedItem: null,
  inFlight: null,
  commitsResults: [],
  contentResults: [],
  filesResults: [],
  totalResults: 0,
  truncated: false,
  error: null,
};

beforeEach(() => {
  useSearchStore.setState(SEARCH_STORE_DEFAULTS);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SearchView, assembled through the real bridge', () => {
  it('a truncated result set says so', async () => {
    const fx: MockFixtures = { ...fixtures, search: { contentHits: [CONTENT_HIT], truncated: true } };
    renderView(<SearchView />, { fixtures: fx, uiState: UI_STATE });

    fireEvent.click(screen.getByRole('button', { name: 'content' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern to grep' }), {
      target: { value: 'foo' },
    });
    expect(await screen.findByText(/capped at 5,000/)).toBeTruthy();
  });

  it('an invalid pattern surfaces the error state, not an empty list', async () => {
    const fx: MockFixtures = { ...fixtures, search: { contentHits: [], error: 'fatal: bad pattern' } };
    renderView(<SearchView />, { fixtures: fx, uiState: UI_STATE });

    fireEvent.click(screen.getByRole('button', { name: 'content' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern to grep' }), {
      target: { value: '(unterminated' },
    });
    expect(await screen.findByText('fatal: bad pattern')).toBeTruthy();
  });

  it('a second query cancels the first rather than letting it run to completion', async () => {
    vi.useFakeTimers();
    const fx: MockFixtures = { ...fixtures, search: { contentHits: [CONTENT_HIT], delayMs: 800 } };
    // `status-segment-search-progress` lives on `SearchProgressSegment` (a
    // status-bar segment), not on `SearchView` itself — mounted alongside it
    // here the same way the real footer sits beside the real view.
    renderView(
      <>
        <SearchProgressSegment />
        <SearchView />
      </>,
      { fixtures: fx, uiState: UI_STATE },
    );

    fireEvent.click(screen.getByRole('button', { name: 'content' }));
    const pattern = screen.getByRole('textbox', { name: 'Pattern to grep' });

    fireEvent.change(pattern, { target: { value: 'aaa' } });
    // Past `DEBOUNCE_MS`: the first `search.start` has fired and is sitting
    // in its 800ms mock delay, not yet resolved.
    await vi.advanceTimersByTimeAsync(250);
    expect(screen.getByTestId('status-segment-search-progress')).toBeTruthy();

    fireEvent.change(pattern, { target: { value: 'bbb' } });
    // Past the second debounce: `use-search.ts` must cancel the first
    // request's id before starting the second.
    await vi.advanceTimersByTimeAsync(250);
    expect(
      (window as unknown as { __mstudioSearchCancels: string[] }).__mstudioSearchCancels,
    ).toHaveLength(1);

    // The cancelled request's mock timer was cleared, so only the second
    // request's batch ever lands — the count is not doubled.
    await vi.advanceTimersByTimeAsync(800);
    expect(screen.getByText('1 match')).toBeTruthy();
  });

  it('the footer readout survives navigation, reopens Search on click, and its Stop button cancels in place', async () => {
    const fx: MockFixtures = { ...fixtures, search: { contentHits: [CONTENT_HIT], delayMs: 600 } };
    /*
      `SearchProgressSegment` is a status-bar segment, not part of
      `SearchView` itself, and `inFlight` lives in the zustand store rather
      than in either component's own tree — the same relationship the real
      app has between the footer and whichever view is on top. `showSearch`
      stands in for the rail's view switch: `clickRailLink(page, 'Graph')`
      in the e2e original swaps the mounted view the same way, just through
      `app.tsx`'s router instead of this one `useUiStore.activeView` read.
    */
    function Harness() {
      const showSearch = useUiStore((s) => s.activeView === 'search');
      return (
        <>
          <SearchProgressSegment />
          {showSearch ? <SearchView /> : <div data-testid="graph-view-stub" />}
        </>
      );
    }
    renderView(<Harness />, { fixtures: fx, uiState: { ...UI_STATE, activeView: 'search' } });

    fireEvent.click(screen.getByRole('button', { name: 'content' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern to grep' }), {
      target: { value: 'foo' },
    });

    const readout = await screen.findByTestId('status-segment-search-progress');
    expect(readout.textContent).toContain('Searching content');

    // Navigate away: the readout keeps tracking the store after the view
    // that started the search unmounts.
    useUiStore.getState().setActiveView('graph');
    expect(await screen.findByTestId('status-segment-search-progress')).toBeTruthy();
    expect(screen.getByTestId('graph-view-stub')).toBeTruthy();

    // Clicking the label half reopens the Search view without touching the
    // in-flight search.
    fireEvent.click(screen.getByRole('button', { name: /go to Search/ }));
    expect(await screen.findByRole('button', { name: 'content' })).toBeTruthy();
    expect(screen.getByTestId('status-segment-search-progress')).toBeTruthy();

    // The trailing Stop button cancels without navigating.
    useUiStore.getState().setActiveView('graph');
    fireEvent.click(await screen.findByRole('button', { name: 'Stop search' }));
    await waitFor(() => expect(screen.queryByTestId('status-segment-search-progress')).toBeNull());
    expect(
      (window as unknown as { __mstudioSearchCancels: string[] }).__mstudioSearchCancels.length,
    ).toBeGreaterThan(0);
  });

  // --- migrated from e2e/search-view.spec.ts (Phase 82 Theme C, harness follow-up) -----

  it('each mode returns and renders its own results', async () => {
    const fx: MockFixtures = {
      ...fixtures,
      search: { commits: [COMMIT_HIT], contentHits: [CONTENT_HIT] },
      fsListFilesResult: { ok: true, files: ['src/index.ts', 'README.md'], truncated: false },
      // The first content hit auto-selects into the preview pane, so it
      // needs a real fixture — without one the pane renders "no fixture for
      // …", which itself contains the path substring and makes every path
      // assertion below ambiguous.
      fsFiles: {
        'repo:src/index.ts': { kind: 'text', content: 'export const foo = 1;\n', size: 23 },
      },
    };
    renderView(<SearchView />, { fixtures: fx, uiState: UI_STATE });

    // Commits — the default tab.
    fireEvent.change(screen.getByRole('textbox', { name: 'Commit message grep' }), {
      target: { value: 'cancel' },
    });
    expect(await screen.findByText(COMMIT_HIT.subject)).toBeTruthy();

    // Content. The first hit auto-selects into the preview pane too, so both
    // the path and its text render twice (list row + preview) — `getAllBy`
    // is enough here; this test only needs to know each mode renders at all.
    fireEvent.click(screen.getByRole('button', { name: 'content' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern to grep' }), {
      target: { value: 'foo' },
    });
    expect((await screen.findAllByText(CONTENT_HIT.path)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(CONTENT_HIT.text).length).toBeGreaterThan(0);

    // Files — no bridge search call at all, just `fs.listFiles` filtered client-side.
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter files' }), {
      target: { value: 'index' },
    });
    expect((await screen.findAllByText('src/index.ts')).length).toBeGreaterThan(0);
  });
});
