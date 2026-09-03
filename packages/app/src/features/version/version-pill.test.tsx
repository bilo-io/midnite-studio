import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseNotes } from '@midnite/studio-shared';

import { RailVersion } from './rail-version';
import { VersionPill } from './version-pill';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const NO_NOTES: ReleaseNotes = { version: '1.2.3', notes: null, error: null };

/** A bridge carrying only the pieces this surface touches. */
function stubBridge(appVersion: string, notes: ReleaseNotes = NO_NOTES) {
  const releaseNotes = vi.fn(async () => notes);
  const openExternal = vi.fn();
  Object.defineProperty(window, 'midniteStudio', {
    configurable: true,
    value: { appVersion, update: { releaseNotes }, shell: { openExternal } },
  });
  return { releaseNotes, openExternal };
}

const open = () => fireEvent.click(screen.getByTestId('version-pill'));

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'midniteStudio');
  vi.restoreAllMocks();
});

describe('VersionPill', () => {
  it('shows the running build as a v-prefixed pill', () => {
    stubBridge('1.2.3');
    render(<VersionPill />, { wrapper });
    expect(screen.getByTestId('version-pill').textContent).toBe('v1.2.3');
  });

  /*
    `0.0.0` is the preload's "main never told me" fallback, not a build. A pill
    claiming it would be the one readout in the window that is confidently wrong.
  */
  it('renders nothing when the version is the unknown-version fallback', () => {
    stubBridge('0.0.0');
    const { container } = render(<VersionPill />, { wrapper });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing with no bridge at all', () => {
    const { container } = render(<VersionPill />, { wrapper });
    expect(container.innerHTML).toBe('');
  });

  // Nothing is fetched for a panel most sessions never open.
  it('fetches the notes only once the panel opens', async () => {
    const { releaseNotes } = stubBridge('1.2.3', {
      version: '1.2.3',
      notes: '### Added\n\n- A version pill.',
      error: null,
    });
    render(<VersionPill />, { wrapper });
    expect(releaseNotes).not.toHaveBeenCalled();

    open();
    await waitFor(() => expect(releaseNotes).toHaveBeenCalledWith({ version: '1.2.3' }));
    expect(await screen.findByText('A version pill.')).toBeDefined();
    expect(screen.getByText("What's new in v1.2.3")).toBeDefined();
  });

  /*
    The mirror gains a version's section when that version's tag publishes, so a
    freshly-built app legitimately has nothing to show — and the links below are
    the whole value of the panel in exactly that case.
  */
  it('keeps both links standing when there are no notes', async () => {
    stubBridge('1.2.3');
    render(<VersionPill />, { wrapper });
    open();

    expect(await screen.findByText('No published notes for this build yet.')).toBeDefined();
    expect(screen.getByTitle(/blob\/main\/midnite-studio\/CHANGELOG\.md$/)).toBeDefined();
    // No section means no published tag, so the release list — not a tag page
    // that would 404.
    expect(screen.getByTitle(/releases\?q=midnite-studio/)).toBeDefined();
  });

  it("points at this version's namespaced tag once notes exist", async () => {
    stubBridge('1.2.3', { version: '1.2.3', notes: 'Shipped.', error: null });
    render(<VersionPill />, { wrapper });
    open();

    expect(
      await screen.findByTitle(
        'https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v1.2.3',
      ),
    ).toBeDefined();
  });

  it('says so when the mirror could not be reached', async () => {
    stubBridge('1.2.3', { version: '1.2.3', notes: null, error: 'changelog: HTTP 500' });
    render(<VersionPill />, { wrapper });
    open();

    expect(await screen.findByText('Release notes are unavailable right now.')).toBeDefined();
  });

  it('opens a panel link through the guarded external-open channel', async () => {
    const { openExternal } = stubBridge('1.2.3');
    render(<VersionPill />, { wrapper });
    open();
    fireEvent.click(await screen.findByText('Full changelog'));

    expect(openExternal).toHaveBeenCalledWith({
      url: 'https://github.com/bilo-io/midnite-apps/blob/main/midnite-studio/CHANGELOG.md',
    });
  });
});

describe('RailVersion', () => {
  /*
    The rail is fixed to the window's left edge and the status bar is the last
    row of <main>; the two meet at the bottom-left corner with nothing joining
    them. `h-6` is the status bar's own height, and the strip is positioned
    against the rail's padding box rather than sized — `rail-version.tsx` has
    the long version. Whether the pixels actually land is a measurement, and
    `e2e/rail-version.spec.ts` makes it; this is the guard on the mechanism the
    measurement depends on.
  */
  it('matches the status bar height and spans the rail, flush with its bottom', () => {
    stubBridge('1.2.3');
    render(<RailVersion expanded />, { wrapper });
    const strip = screen.getByTestId('rail-version');
    expect(strip.className).toContain('h-6');
    expect(strip.className).toContain('absolute');
    expect(strip.className).toContain('inset-x-0');
    expect(strip.className).toContain('bottom-0');
    expect(strip.className).toContain('border-t');
  });

  // Expanded, the pill lines up with the nav rows' own `px-2` inset; collapsed,
  // it centres in 3.5rem that a wider inset would not leave room for.
  it('insets the pill with the rail rows while expanded and centres it when not', () => {
    stubBridge('1.2.3');
    const { rerender } = render(<RailVersion expanded />, { wrapper });
    expect(screen.getByTestId('rail-version').className).toContain('justify-start px-2');

    rerender(<RailVersion expanded={false} />);
    expect(screen.getByTestId('rail-version').className).toContain('justify-center px-1');
  });
});
