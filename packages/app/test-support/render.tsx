import type { ReactElement, ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';

import { ThemeProvider } from '@bilo-io/ui/theme';

import { DialogHost } from '../src/components/dialog-host';
import { useUiStore, type UiState } from '../src/store/ui-store';
import { installMockBridgeJsdom } from './mock-bridge';
import type { MockFixtures } from './mock-bridge';

/**
 * The provider stack every assembled-view unit test needs, in one place.
 *
 * Before this, 62 test files hand-rolled their own `QueryClientProvider`
 * (`projects-view.test.tsx`, `board-view.test.tsx`, …), most wrapping a
 * `DialogHost` too the moment the view under test reaches `useDialogs()` for
 * a menu, a confirm or a prompt — and a few also needed `ThemeProvider`
 * because they mount something that reads `prefers-color-scheme` on mount
 * (`code-editor.test.tsx`). `renderView` is that same stack, built once:
 *
 * ```tsx
 * renderView(<DiagnosticsSegment />, {
 *   fixtures: { diagnostics: { trust: { state: 'trusted', ... } } },
 *   uiState: { selectedRepoId: 'repo-1' },
 * });
 * ```
 *
 * `fixtures` and `uiState` are both optional — a test that drives its own
 * `vi.mock('../../services/bridge', …)` (the pattern `projects-view.test.tsx`
 * and `transcript-view.test.tsx` use, and this helper does not replace) can
 * still use `renderView` for the provider stack alone and skip both.
 *
 * `fixtures`, when given, goes through the exact same `buildMockBridge` the
 * Playwright suite serialises into a real page (`installMockBridgeJsdom`
 * calls it directly instead) — so a `MockFixtures` value written for an e2e
 * spec drives a unit test identically, which is what makes migrating a spec
 * from `e2e/` here a data problem rather than a rewrite.
 *
 * `uiState`, when given, is applied via `useUiStore.setState` rather than
 * through the bridge's seeded `localStorage` key: `useUiStore` is a module
 * singleton that reads persisted state once, at import time, and every test
 * file's imports are already resolved by the time a test body runs — so
 * seeding `localStorage` afterwards (the way the real app's first paint
 * reads it) would be invisible to an already-constructed store. Driving the
 * store's own `setState` is also exactly what `use-default-selection.test.ts`
 * and `modal.test.tsx` already do by hand.
 */
export type RenderViewOptions = Omit<RenderOptions, 'wrapper'> & {
  /** Seeds `window.midniteStudio` via `buildMockBridge` — see `installMockBridgeJsdom`. */
  fixtures?: MockFixtures;
  /** Applied with `useUiStore.setState` before the first render. */
  uiState?: Partial<UiState>;
  /** Supply your own to assert against it, or to pre-seed data with `setQueryData`. */
  queryClient?: QueryClient;
};

/**
 * A `QueryClient` shaped for tests: no retries (a broken query should fail
 * once, not spend the test's own timeout retrying it) and no background
 * refetch-on-window-focus (jsdom has no real window focus to lose, and a
 * refetch racing a test's own assertions is a flake nobody asked for).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function wrap(queryClient: QueryClient) {
  return function ViewProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <DialogHost>{children}</DialogHost>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
}

/** Renders `ui` inside `QueryClientProvider` + `ThemeProvider` + `DialogHost`. */
export function renderView(ui: ReactElement, options: RenderViewOptions = {}): RenderResult {
  const { fixtures, uiState, queryClient, ...renderOptions } = options;

  if (fixtures) installMockBridgeJsdom(fixtures);
  if (uiState) useUiStore.setState(uiState);

  return render(ui, { wrapper: wrap(queryClient ?? createTestQueryClient()), ...renderOptions });
}

/**
 * `renderHook`'s equivalent of `renderView` — the same provider stack and the
 * same `fixtures`/`uiState` seeding, for the 34 files that test a hook rather
 * than a mounted view (`use-default-selection.test.ts` among them).
 */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'wrapper'> &
    Pick<RenderViewOptions, 'fixtures' | 'uiState' | 'queryClient'> = {},
): RenderHookResult<Result, Props> {
  const { fixtures, uiState, queryClient, ...renderHookOptions } = options;

  if (fixtures) installMockBridgeJsdom(fixtures);
  if (uiState) useUiStore.setState(uiState);

  return renderHook(hook, {
    wrapper: wrap(queryClient ?? createTestQueryClient()),
    ...renderHookOptions,
  });
}
