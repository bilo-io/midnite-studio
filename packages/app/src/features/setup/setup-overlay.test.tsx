import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { ThemeProvider } from '@bilo-io/ui/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_SETUP_STATE } from '../../store/setup-state';
import { useUiStore } from '../../store/ui-store';
import { CHOREO } from './setup-choreography';
import { ToastHost } from '../../components/toast-host';
import { SetupOverlay } from './setup-overlay';
import { SETUP_PAGES } from './setup-pages';
import { useSetupStore } from './setup-store';

/**
 * Phase 98 Theme A — the overlay frame: the first-run gate, the chrome (X,
 * theme toggle, dots, Skip), page navigation by button and by arrow key, and
 * what each way out records. Each page's own content is covered beside it in
 * `pages/`.
 *
 * Those run under `data-motion='reduced'`, where Theme B's choreography
 * resolves instantly — they are about the frame, not its motion. Theme B's
 * own ordering (typed title first, body after) runs with full motion on fake
 * timers further down, and Theme C's handoff to the FAB after that. The
 * sequencer's timelines themselves are `setup-choreography.test.ts`.
 */
function installBridge() {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    systemHealth: vi.fn().mockResolvedValue({
      git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
      shell: '/bin/zsh',
      sshAgent: { running: true, keys: 1 },
      cli: { installed: false, path: null, target: null, managed: false },
    }),
    forgeAccounts: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      remove: vi.fn(),
      switch: vi.fn(),
      capabilities: vi.fn(),
      reachableRepos: vi.fn(),
    } as unknown as MidniteStudioBridge['forgeAccounts'],
  };
}

function renderOverlay() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastHost>
          <SetupOverlay />
        </ToastHost>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const DONE = '2026-01-01T00:00:00.000Z';

const RESET_REQUESTS = { requested: false, startPageId: null, resume: false, aside: false };

beforeEach(() => {
  installBridge();
  document.documentElement.dataset['motion'] = 'reduced';
  useUiStore.setState({
    setupState: INITIAL_SETUP_STATE,
    fabPanelOpen: false,
    fabDetached: false,
    companionPanelOpen: false,
  });
  useSetupStore.setState(RESET_REQUESTS);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset['motion'];
  document.querySelector('[data-testid="fab-button"]')?.remove();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({ setupState: INITIAL_SETUP_STATE });
  useSetupStore.setState(RESET_REQUESTS);
});

const overlay = () => screen.queryByTestId('setup-overlay');
const stepOf = () => overlay()?.getAttribute('data-step');

/** Theme C: after X or Skip the overlay holds the hint; a click anywhere lets it go. */
function dismissHandoff() {
  fireEvent.click(overlay()!);
}

describe('SetupOverlay — the gate', () => {
  it('opens by itself on a fresh profile, at the intro', () => {
    renderOverlay();
    expect(screen.getByRole('dialog', { name: 'Set up Midnite Studio' })).toBeTruthy();
    expect(stepOf()).toBe('intro');
  });

  it('stays closed for a profile that finished or left setup', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE } });
    const { unmount } = renderOverlay();
    expect(overlay()).toBeNull();
    unmount();

    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, dismissedAt: DONE } });
    renderOverlay();
    expect(overlay()).toBeNull();
  });

  it('opens on request for a finished profile, at the page asked for', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE } });
    renderOverlay();
    act(() => useSetupStore.getState().openSetup('forges'));
    expect(stepOf()).toBe('forges');
    expect(screen.getByRole('dialog', { name: 'Connect your forges' })).toBeTruthy();
  });
});

describe('SetupOverlay — chrome', () => {
  it('renders X, the theme toggle, one dot per page, and Skip', () => {
    renderOverlay();
    expect(screen.getByRole('button', { name: 'Close setup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeTruthy();
    const dots = screen.getByRole('list', { name: 'Setup pages' }).querySelectorAll('button');
    expect(dots).toHaveLength(SETUP_PAGES.length);
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  });

  it('marks the current dot active and the ones behind it done', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const dots = [...screen.getByRole('list', { name: 'Setup pages' }).querySelectorAll('button')];
    expect(dots.map((dot) => dot.getAttribute('data-dot'))).toEqual([
      'done',
      'active',
      ...SETUP_PAGES.slice(2).map(() => 'upcoming'),
    ]);
    expect(dots[1]?.getAttribute('aria-current')).toBe('step');
  });

  it('is a modal dialog whose Tab cycle cannot leave it', () => {
    renderOverlay();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: 'Close setup' });
    const skip = screen.getByRole('button', { name: 'Skip' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(skip);
    fireEvent.keyDown(skip, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });
});

describe('SetupOverlay — navigation', () => {
  it('Next and Back walk intro → pages → finale and back', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    // Driven by the registry, so appending a page never breaks this walk.
    SETUP_PAGES.forEach((page, index) => {
      if (index > 0) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(stepOf()).toBe(page.id);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepOf()).toBe('finale');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(stepOf()).toBe(SETUP_PAGES[SETUP_PAGES.length - 1]?.id);
  });

  it('→ and ← step between pages', () => {
    renderOverlay();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('git');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('forge-select');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(stepOf()).toBe('git');
  });

  it('ignores arrows typed into a text field, and arrows with a modifier', async () => {
    act(() => useSetupStore.getState().openSetup('forges'));
    renderOverlay();
    const [token] = await screen.findAllByPlaceholderText('paste a token');
    fireEvent.keyDown(token!, { key: 'ArrowLeft' });
    expect(stepOf()).toBe('forges');
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true });
    expect(stepOf()).toBe('forges');
  });

  it('→ on the finale does not finish setup — only Get started does', () => {
    renderOverlay();
    for (let i = 0; i <= SETUP_PAGES.length; i += 1)
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('finale');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('finale');
    expect(useUiStore.getState().setupState.completedAt).toBeNull();
  });

  it('Get started on the finale completes setup and closes', () => {
    renderOverlay();
    for (let i = 0; i <= SETUP_PAGES.length; i += 1)
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(useUiStore.getState().setupState.completedAt).not.toBeNull();
    expect(overlay()).toBeNull();
  });

  it('a dot jumps straight to its page', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: /^Connect your forges/ }));
    expect(stepOf()).toBe('forges');
  });
});

describe('SetupOverlay — leaving early', () => {
  it('Skip records the page it left, and when', () => {
    act(() => useSetupStore.getState().openSetup('forges'));
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    const state = useUiStore.getState().setupState;
    expect(state.skippedPageIds).toEqual(['forges']);
    expect(state.lastPageId).toBe('forges');
    expect(state.dismissedAt).not.toBeNull();
    expect(state.completedAt).toBeNull();
    dismissHandoff();
    expect(overlay()).toBeNull();
  });

  it('X records where it left but marks nothing skipped', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    const state = useUiStore.getState().setupState;
    expect(state.skippedPageIds).toEqual([]);
    expect(state.lastPageId).toBe('git');
    expect(state.dismissedAt).not.toBeNull();
    dismissHandoff();
    expect(overlay()).toBeNull();
  });

  it('Escape takes the X path', () => {
    renderOverlay();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().setupState.dismissedAt).not.toBeNull();
    expect(useUiStore.getState().setupState.skippedPageIds).toEqual([]);
    // A second Escape, during the handoff, is "go now".
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(overlay()).toBeNull();
  });

  it('Next through a page skipped on an earlier visit clears that skip', () => {
    useUiStore.setState({
      setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE, skippedPageIds: ['forges'] },
    });
    renderOverlay();
    act(() => useSetupStore.getState().openSetup('forges'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(useUiStore.getState().setupState.skippedPageIds).toEqual([]);
  });

  it('hands focus back to whatever opened it', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <button type="button" data-testid="opener">
            Open setup
          </button>
          <SetupOverlay />
        </QueryClientProvider>
      </ThemeProvider>,
    );
    const opener = screen.getByTestId('opener');
    opener.focus();
    act(() => useSetupStore.getState().openSetup());
    expect(overlay()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    dismissHandoff();
    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('SetupOverlay — brand choreography (Theme B)', () => {
  beforeEach(() => {
    document.documentElement.dataset['motion'] = 'full';
    vi.useFakeTimers();
  });

  const word = () => screen.getByTestId('setup-intro-word').firstChild?.textContent ?? '';
  const introPhase = () => screen.getByTestId('setup-intro').getAttribute('data-intro');
  const title = () => screen.queryByTestId('setup-page-title')?.textContent ?? '';
  const body = () => screen.queryByTestId('setup-page-body');

  it('types "Midnite" beside the mark, then shows Begin', () => {
    renderOverlay();
    expect(introPhase()).toBe('typing');
    expect(word()).toBe('');
    act(() => vi.advanceTimersByTime(CHOREO.introLeadMs));
    expect(word()).toBe('M');
    act(() => vi.advanceTimersByTime(CHOREO.introCharMs * 6));
    expect(word()).toBe('Midnite');
    expect(introPhase()).toBe('typing');
    act(() => vi.advanceTimersByTime(CHOREO.introSettleMs));
    expect(introPhase()).toBe('ready');
    expect(
      screen.getByRole('button', { name: 'Begin setup' }).parentElement?.style.visibility,
    ).toBe('visible');
  });

  it('the intro word wears the brand gradient, not the rainbow', () => {
    renderOverlay();
    const el = screen.getByTestId('setup-intro-word');
    expect(el.className).toContain('setup-brand-gradient');
    expect(el.className).not.toMatch(/rainbow/);
  });

  it('Begin fades the word, then the page title types and only then does the body fade in', () => {
    renderOverlay();
    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    // The word fades first; the step has not moved yet.
    expect(stepOf()).toBe('intro');
    act(() => vi.advanceTimersByTime(CHOREO.wordFadeMs));
    expect(stepOf()).toBe('git');
    // Held back while the mark glides into the anchor.
    expect(title()).toBe('');
    expect(body()).toBeNull();
    act(() => vi.advanceTimersByTime(CHOREO.glideMs + 60));
    expect(title().length).toBeGreaterThan(0);
    expect(title()).not.toBe('Get git ready');
    expect(body()).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(title()).toBe('Get git ready');
    expect(body()).not.toBeNull();
    expect(body()?.className).toContain('setup-page-enter');
  });

  it('a page-to-page Next types without waiting for a glide; Back is instant', () => {
    act(() => useSetupStore.getState().openSetup('git'));
    renderOverlay();
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepOf()).toBe('forge-select');
    expect(body()).toBeNull();
    act(() => vi.advanceTimersByTime(60));
    expect(title().length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(body()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(title()).toBe('Get git ready');
    expect(body()).not.toBeNull();
  });

  it('opening straight onto a page glides the mark in from the centre (FLIP)', () => {
    const animate = vi.fn();
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof original;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 100, top: 40, width: 32, height: 32 } as DOMRect);
    try {
      act(() => useSetupStore.getState().openSetup('forges'));
      renderOverlay();
      expect(animate).toHaveBeenCalledTimes(1);
      const [keyframes, options] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
      expect(keyframes[0]?.transform).toContain('scale(2)');
      expect(keyframes[1]?.transform).toBe('none');
      expect(options.duration).toBe(CHOREO.glideMs);
      // The mark is the frame's: moving between pages does not glide it again.
      act(() => vi.advanceTimersByTime(2000));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(animate).toHaveBeenCalledTimes(1);
    } finally {
      HTMLElement.prototype.animate = original;
      rect.mockRestore();
    }
  });

  it('Back wears a left chevron and Next is the shared CTA', () => {
    act(() => useSetupStore.getState().openSetup('git'));
    renderOverlay();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Back' }).querySelector('svg')).not.toBeNull();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.getAttribute('data-testid')).toBe('empty-state-cta');
  });

  it('pages slide in from the side they came from: Next from the right, Back from the left', () => {
    act(() => useSetupStore.getState().openSetup('git'));
    renderOverlay();
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(body()?.getAttribute('data-dir')).toBe('forward');
    expect(body()?.className).toContain('setup-page-enter');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(body()?.getAttribute('data-dir')).toBe('back');
    expect(body()?.className).toContain('setup-page-enter');
  });

  it('reduced motion resolves every step at once', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    renderOverlay();
    expect(introPhase()).toBe('ready');
    expect(word()).toBe('Midnite');
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    expect(stepOf()).toBe('git');
    expect(title()).toBe('Get git ready');
    expect(body()).not.toBeNull();
    expect(body()?.className ?? '').not.toContain('setup-page-enter');
  });
});

describe('SetupOverlay — the FAB handoff (Theme C)', () => {
  function mountFab() {
    const fab = document.createElement('button');
    fab.setAttribute('data-testid', 'fab-button');
    fab.getBoundingClientRect = () => ({ left: 900, top: 700, width: 40, height: 40 }) as DOMRect;
    document.body.appendChild(fab);
  }

  it('Skip points at the FAB with a hint, then any click lets the app back', () => {
    mountFab();
    act(() => useSetupStore.getState().openSetup('git'));
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(overlay()?.getAttribute('data-handoff')).toBe('pointing');
    expect(screen.getByRole('status').textContent).toBe('You can always continue setup from here');
    expect(screen.getByTestId('setup-handoff-arrow')).toBeTruthy();
    const standIn = screen.getByTestId('setup-handoff-fab');
    expect(standIn.style.left).toBe('900px');
    expect(standIn.style.top).toBe('700px');
    // The page behind the hint is faded and inert.
    expect(overlay()?.querySelector('main')?.hasAttribute('inert')).toBe(true);

    dismissHandoff();
    expect(overlay()).toBeNull();
  });

  it('with the FAB hidden behind a docked panel, the hint names the palette command and there is no arrow', () => {
    mountFab();
    useUiStore.setState({ fabPanelOpen: true, fabDetached: false });
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    expect(screen.getByRole('status').textContent).toContain('command palette');
    expect(screen.getByRole('status').textContent).toContain('Run Setup Wizard');
    expect(screen.queryByTestId('setup-handoff-arrow')).toBeNull();
    expect(screen.queryByTestId('setup-handoff-fab')).toBeNull();
  });

  it('with full motion: content fades, the hint holds for a beat, and the overlay dissolves by itself', () => {
    document.documentElement.dataset['motion'] = 'full';
    vi.useFakeTimers();
    mountFab();
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(overlay()?.getAttribute('data-handoff')).toBe('fading');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(CHOREO.handoffFadeMs));
    expect(overlay()?.getAttribute('data-handoff')).toBe('pointing');
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => vi.advanceTimersByTime(CHOREO.handoffBeatMs));
    expect(overlay()?.getAttribute('data-handoff')).toBe('dissolving');
    expect(overlay()?.style.opacity).toBe('0');
    act(() => vi.advanceTimersByTime(CHOREO.dissolveMs));
    expect(overlay()).toBeNull();
  });

  it('Resume setup reopens at the first page neither passed nor skipped, past the intro', () => {
    useUiStore.setState({
      setupState: {
        ...INITIAL_SETUP_STATE,
        dismissedAt: DONE,
        lastPageId: 'git',
        skippedPageIds: ['git'],
      },
    });
    renderOverlay();
    expect(overlay()).toBeNull();
    act(() => useSetupStore.getState().resumeSetup());
    expect(stepOf()).toBe('forge-select');
  });

  it('Resume after X reopens the page X was pressed on', () => {
    useUiStore.setState({
      setupState: { ...INITIAL_SETUP_STATE, dismissedAt: DONE, lastPageId: 'forges' },
    });
    renderOverlay();
    act(() => useSetupStore.getState().resumeSetup());
    expect(stepOf()).toBe('forges');
  });
});

describe('SetupOverlay — stepping aside for the terminal (Theme D)', () => {
  it('hides the frame, lets go of Escape and the arrows, and offers the way back', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    act(() => useSetupStore.getState().stepAside());
    expect(overlay()?.hidden).toBe(true);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(stepOf()).toBe('git');
    expect(useUiStore.getState().setupState.dismissedAt).toBeNull();

    fireEvent.click(screen.getByTestId('setup-return'));
    expect(overlay()?.hidden).toBe(false);
    expect(screen.queryByTestId('setup-return')).toBeNull();
    expect(stepOf()).toBe('git');
  });
});

describe('SetupOverlay — completion transition and finale (Theme J)', () => {
  /** Reaches the last page with reduced motion's instant steps, then flips nothing: callers set motion first. */
  function toLastPage() {
    act(() => useSetupStore.getState().openSetup(SETUP_PAGES[SETUP_PAGES.length - 1]!.id));
    renderOverlay();
    expect(stepOf()).toBe(SETUP_PAGES[SETUP_PAGES.length - 1]!.id);
  }

  it('full motion: leaving the last page blooms and fades first, then the finale arrives', () => {
    document.documentElement.dataset['motion'] = 'full';
    vi.useFakeTimers();
    toLastPage();
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // Still on the page while it dissolves; the bloom is out and Next is inert.
    expect(stepOf()).toBe(SETUP_PAGES[SETUP_PAGES.length - 1]!.id);
    expect(screen.getByTestId('setup-bloom')).toBeTruthy();
    const dots = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-dot'));
    expect(new Set(dots.map((d) => d.getAttribute('data-dot')))).toEqual(new Set(['done']));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(stepOf()).toBe(SETUP_PAGES[SETUP_PAGES.length - 1]!.id);
    act(() => vi.advanceTimersByTime(CHOREO.completeFadeMs));
    expect(stepOf()).toBe('finale');
    expect(screen.getByTestId('setup-finale-mark')).toBeTruthy();
  });

  it('full motion: Get started fades the overlay out, then records completion', () => {
    document.documentElement.dataset['motion'] = 'full';
    vi.useFakeTimers();
    toLastPage();
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    act(() => vi.advanceTimersByTime(CHOREO.completeFadeMs));
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(overlay()?.style.opacity).toBe('0');
    expect(useUiStore.getState().setupState.completedAt).toBeNull();
    act(() => vi.advanceTimersByTime(CHOREO.dissolveMs));
    expect(useUiStore.getState().setupState.completedAt).not.toBeNull();
    expect(overlay()).toBeNull();
  });

  it('reduced motion: the finale is static, with no bloom, in the same render', () => {
    toLastPage();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepOf()).toBe('finale');
    expect(screen.queryByTestId('setup-bloom')).toBeNull();
    expect(screen.getByRole('heading', { name: /Welcome to\s*Midnite\s*Studio/ })).toBeTruthy();
  });

  it('the finale wordmark wears the brand gradient, and Studio does not', () => {
    toLastPage();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const heading = screen.getByRole('heading', { name: /Welcome to\s*Midnite\s*Studio/ });
    const midnite = screen.getByText('Midnite', { selector: 'span' });
    expect(heading.contains(midnite)).toBe(true);
    expect(midnite.className).toContain('setup-brand-gradient');
    expect(midnite.className).not.toMatch(/rainbow/);
    expect(screen.getByText('Studio').className).not.toContain('setup-brand-gradient');
  });
});
