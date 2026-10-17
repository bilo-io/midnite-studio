// vitest/jsdom: the Library tab against a fake bridge and a minimal media kit — DOM roles and text only.
import type { LibraryItem, MidniteStudioBridge } from '@midnite/studio-shared';
import {
  createFrameChrome,
  FrameChromeProvider,
  MediaKitProvider,
  type MediaKit,
  type MediaLayoutProps,
  type MediaAccordionProps,
} from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LibraryHostProvider, type LibraryHost, type LibraryPlayerProps } from './host';
import { makeItem } from './test-items';
import { LibraryTab } from './library-tab';

/** The kit members the tab reads: a plain three-slot layout and a plain accordion. */
const kit = {
  MediaLayout: ({ toolbar, explorer, content, detail }: MediaLayoutProps) => (
    <div>
      <div data-testid="toolbar">{toolbar}</div>
      <div data-testid="explorer">{explorer}</div>
      <div data-testid="content">{content}</div>
      <div data-testid="detail">{detail}</div>
    </div>
  ),
  Accordion: ({ sections }: MediaAccordionProps) => (
    <div>
      {sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <h3>{section.title}</h3>
          {section.actions}
          {section.children}
        </section>
      ))}
    </div>
  ),
} as unknown as MediaKit;

const ROOT = {
  id: 'r0123456789ab',
  path: '/media',
  label: 'media',
  addedAt: 1,
  lastScanAt: 2,
  itemCount: 3,
};

function installBridge(items: LibraryItem[], roots = [ROOT], onlineMetadata = false) {
  const library = {
    roots: vi.fn().mockResolvedValue({ roots }),
    addRoot: vi.fn().mockResolvedValue({ ok: true, value: { root: null } }),
    removeRoot: vi.fn().mockResolvedValue({ ok: true }),
    scan: vi
      .fn()
      .mockResolvedValue({
        ok: true,
        value: { scanned: 0, added: 0, updated: 0, removed: 0, skipped: 0 },
      }),
    items: vi.fn().mockResolvedValue({ items }),
    progress: vi.fn().mockResolvedValue({ ok: true }),
    clearProgress: vi.fn().mockResolvedValue({ ok: true }),
    settings: vi
      .fn()
      .mockResolvedValue({
        settings: { onlineMetadata, onlineProvider: 'tmdb' },
        onlineKeyAvailable: false,
      }),
    setSettings: vi.fn().mockResolvedValue({ ok: true }),
    onChanged: vi.fn(() => () => {}),
    onScanProgress: vi.fn(() => () => {}),
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    media: { library } as unknown as MidniteStudioBridge['media'],
  } as Partial<MidniteStudioBridge>;
  return library;
}

function renderTab(host: LibraryHost = {}, node: ReactNode = <LibraryTab />) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <MediaKitProvider kit={kit}>
          <LibraryHostProvider host={host}>{node}</LibraryHostProvider>
        </MediaKitProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const ITEMS = [
  makeItem({
    id: 'up',
    kind: 'film',
    title: 'Up',
    year: 2009,
    plot: 'Balloons.',
    progress: { positionS: 600, durationS: 5760, finished: false, updatedAt: 5 },
  }),
  makeItem({ id: 'heat', kind: 'film', title: 'Heat', year: 1995 }),
  makeItem({
    id: 'e1',
    kind: 'show',
    title: 'The Target',
    showTitle: 'The Wire',
    season: 1,
    episode: 1,
  }),
  makeItem({
    id: 't1',
    kind: 'music',
    title: 'Joga',
    artist: 'Björk',
    album: 'Homogenic',
    track: 3,
  }),
];

describe('LibraryTab', () => {
  it('offers to add a folder when the library has none', async () => {
    const library = installBridge([], []);
    renderTab();
    const add = await screen.findByRole('button', { name: 'Add a folder…' });
    fireEvent.click(add);
    await waitFor(() => expect(library.addRoot).toHaveBeenCalled());
  });

  it('shows films with a continue-watching row, and the detail resumes', async () => {
    installBridge(ITEMS);
    renderTab();
    const resume = await screen.findByRole('region', { name: 'Continue watching' });
    expect(resume.textContent).toContain('Up');
    expect(screen.getByText('Heat')).toBeDefined();
    expect(screen.queryByText('Joga')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /Heat/ })[0]!);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: /^Up/ })[0]!);
    expect(await screen.findByRole('button', { name: 'Resume from 10:00' })).toBeDefined();
    expect(screen.getByText('Balloons.')).toBeDefined();
  });

  it('opens a show into its episodes and an album into its tracks', async () => {
    installBridge(ITEMS);
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /^Shows/ }));
    fireEvent.click(await screen.findByRole('button', { name: /The Wire/ }));
    expect(await screen.findByRole('list', { name: 'The Wire episodes' })).toBeDefined();
    expect(screen.getByText('S01E01')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^Music/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Homogenic/ }));
    expect(await screen.findByRole('list', { name: 'Homogenic tracks' })).toBeDefined();
  });

  it('plays through the host player and saves progress when it pauses', async () => {
    const library = installBridge(ITEMS);
    const seen: LibraryPlayerProps[] = [];
    const Player = (props: LibraryPlayerProps) => {
      seen.push(props);
      return (
        <button type="button" onClick={() => props.onProgress(700, 5760, 'paused')}>
          fake pause
        </button>
      );
    };
    renderTab({ Player });
    fireEvent.click((await screen.findAllByRole('button', { name: /^Up/ }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume from 10:00' }));
    const pause = await screen.findByRole('button', { name: 'fake pause' });
    expect(seen[0]?.resumeAt).toBe(600);
    expect(seen[0]?.src).toBe('mstudio-file://library/r0123456789ab/Up.mkv');
    await act(async () => fireEvent.click(pause));
    expect(library.progress).toHaveBeenCalledWith({
      itemId: 'up',
      positionS: 700,
      durationS: 5760,
    });
  });

  it('keeps online metadata off until switched on, and says nothing leaves', async () => {
    const library = installBridge(ITEMS);
    renderTab({ onlineKeyHint: 'Set the key in Vault.' });
    const toggle = (await screen.findByRole('switch')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByText('Off: nothing leaves this computer.')).toBeDefined();
    expect(screen.getByText('Set the key in Vault.')).toBeDefined();
    fireEvent.click(toggle);
    await waitFor(() => expect(library.setSettings).toHaveBeenCalledWith({ onlineMetadata: true }));
  });
});
