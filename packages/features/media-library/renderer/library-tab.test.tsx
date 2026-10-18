// vitest/jsdom: the Library tab against a fake bridge and a minimal media kit — DOM roles and text only.
import {
  DEFAULT_LIBRARY_LAN_SETTINGS,
  type LibraryItem,
  type LibraryLanStatus,
  type LibraryPlaylist,
  type MidniteStudioBridge,
} from '@midnite/studio-shared';
import {
  createFrameChrome,
  FrameChromeProvider,
  MediaKitProvider,
  type MediaKit,
  type MediaLayoutProps,
  type MediaAccordionProps,
  type FrameDialogs,
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

const STOPPED: LibraryLanStatus = {
  available: true,
  running: false,
  url: null,
  settings: { ...DEFAULT_LIBRARY_LAN_SETTINGS },
  interfaces: [
    { name: 'en0', address: '192.168.1.20' },
    { name: 'en5', address: '10.0.0.4' },
  ],
  clients: [],
  transcodes: 0,
  ffmpeg: { found: false, path: null, source: null, reason: 'not found in Homebrew, MacPorts or PATH' },
};

function installBridge(
  items: LibraryItem[],
  roots = [ROOT],
  onlineMetadata = false,
  extra: { playlists?: LibraryPlaylist[]; lan?: LibraryLanStatus } = {},
) {
  let playlists = extra.playlists ?? [];
  const playlistsApi = {
    list: vi.fn(async () => ({ playlists })),
    create: vi.fn(async (req: { name: string; itemIds?: string[] }) => {
      const playlist = {
        id: `p${String(playlists.length).padStart(12, '0')}`,
        name: req.name,
        itemIds: req.itemIds ?? [],
        createdAt: 1,
        updatedAt: 1,
      };
      playlists = [...playlists, playlist];
      return { ok: true, value: { playlist } };
    }),
    rename: vi.fn().mockResolvedValue({ ok: true }),
    setItems: vi.fn(async (req: { playlistId: string; itemIds: string[] }) => {
      playlists = playlists.map((p) => (p.id === req.playlistId ? { ...p, itemIds: req.itemIds } : p));
      return { ok: true };
    }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  };
  const lan = {
    status: vi.fn().mockResolvedValue(extra.lan ?? STOPPED),
    start: vi.fn().mockResolvedValue({ ok: true, value: extra.lan ?? STOPPED }),
    stop: vi.fn().mockResolvedValue({ ok: true }),
    regenerateToken: vi.fn().mockResolvedValue({ ok: true }),
    setSettings: vi.fn().mockResolvedValue({ ok: true }),
    detectFfmpeg: vi.fn().mockResolvedValue((extra.lan ?? STOPPED).ffmpeg),
  };
  const library = {
    playlists: playlistsApi,
    lan,
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

/** Dialogs that answer at once: a confirm confirms, a prompt takes its initial value. */
const instantDialogs = (): FrameDialogs => ({
  confirm: (request) => request.onConfirm(),
  prompt: (request) => request.onConfirm(request.initialValue ?? ''),
  notify: () => {},
  setBlastRadius: () => {},
  close: () => {},
});

function renderTab(host: LibraryHost = {}, node: ReactNode = <LibraryTab />) {
  const dialogs = instantDialogs();
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FrameChromeProvider chrome={createFrameChrome({ useDialogs: () => dialogs }).chrome}>
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

  it('creates a playlist, adds to it from the details, and reorders it', async () => {
    const library = installBridge(ITEMS);
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'New playlist' }));
    await waitFor(() => expect(library.playlists.create).toHaveBeenCalledWith({ name: 'Playlist 1' }));

    fireEvent.click((await screen.findAllByRole('button', { name: /^Up/ }))[0]!);
    const add = (await screen.findByRole('combobox', { name: 'Add to playlist' })) as HTMLSelectElement;
    await waitFor(() => expect(add.querySelectorAll('option')).toHaveLength(3));
    fireEvent.change(add, { target: { value: 'p000000000000' } });
    await waitFor(() =>
      expect(library.playlists.setItems).toHaveBeenCalledWith({
        playlistId: 'p000000000000',
        itemIds: ['up'],
      }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: /^Heat/ })[0]!);
    const addHeat = (await screen.findByRole('combobox', {
      name: 'Add to playlist',
    })) as HTMLSelectElement;
    await waitFor(() => expect(addHeat.querySelector('option[value="p000000000000"]')).not.toBeNull());
    fireEvent.change(addHeat, { target: { value: 'p000000000000' } });

    fireEvent.click(await screen.findByRole('button', { name: /^Playlist 1/ }));
    const list = await screen.findByRole('list', { name: 'Playlist 1 items' });
    await waitFor(() => expect(list.querySelectorAll('li')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Move Heat up' }));
    await waitFor(() =>
      expect(library.playlists.setItems).toHaveBeenLastCalledWith({
        playlistId: 'p000000000000',
        itemIds: ['heat', 'up'],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete Playlist 1' }));
    await waitFor(() => expect(library.playlists.delete).toHaveBeenCalledWith({ playlistId: 'p000000000000' }));
  });

  it('plays a playlist in sequence through the player', async () => {
    installBridge(ITEMS, [ROOT], false, {
      playlists: [
        { id: 'p000000000001', name: 'Night', itemIds: ['heat', 't1'], createdAt: 1, updatedAt: 1 },
      ],
    });
    const seen: LibraryPlayerProps[] = [];
    const Player = (props: LibraryPlayerProps) => {
      seen.push(props);
      return (
        <button type="button" onClick={() => props.onProgress(10, 10, 'ended')}>
          end {props.item.title}
        </button>
      );
    };
    renderTab({ Player });
    fireEvent.click(await screen.findByRole('button', { name: /^Night/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play all' }));
    const first = await screen.findByRole('button', { name: 'end Heat' });
    expect(seen.at(-1)).toMatchObject({ autoPlay: true });
    expect(screen.getByText(/Up next/).textContent).toBe('Up next: Joga');
    await act(async () => fireEvent.click(first));
    expect(await screen.findByRole('button', { name: 'end Joga' })).toBeDefined();
    expect(seen.at(-1)).toMatchObject({ autoPlay: true, item: expect.objectContaining({ id: 't1' }) });
  });

  it('shares on the network only when started, on the address picked', async () => {
    const library = installBridge(ITEMS);
    renderTab();
    const share = await screen.findByRole('region', { name: 'Share on your network' });
    const picker = (await screen.findByRole('combobox', {
      name: 'Network to share on',
    })) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.value)).toEqual(['192.168.1.20', '10.0.0.4']);
    expect(share.textContent).toContain('ffmpeg not found');
    // No transcode switch without ffmpeg.
    expect(screen.queryByRole('switch', { name: /Convert what browsers/ })).toBeNull();
    expect(library.lan.start).not.toHaveBeenCalled();
    fireEvent.change(picker, { target: { value: '10.0.0.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start sharing' }));
    await waitFor(() => expect(library.lan.start).toHaveBeenCalledWith({ address: '10.0.0.4' }));
  });

  it('shows the link, the devices and ffmpeg while running; a new link is confirmed first', async () => {
    const library = installBridge(ITEMS, [ROOT], false, {
      lan: {
        ...STOPPED,
        running: true,
        url: 'http://192.168.1.20:47620/?k=abc',
        settings: { ...STOPPED.settings, address: '192.168.1.20', wasOn: true },
        clients: [{ address: '192.168.1.31', lastRequestAt: Date.now(), requests: 4 }],
        ffmpeg: { found: true, path: '/opt/homebrew/bin/ffmpeg', source: 'homebrew' },
      },
    });
    renderTab();
    expect((await screen.findByLabelText('Share link')).textContent).toBe(
      'http://192.168.1.20:47620/?k=abc',
    );
    const devices = screen.getByRole('region', { name: 'Connected devices' });
    expect(devices.textContent).toContain('192.168.1.31');
    expect(devices.textContent).toContain('4 requests');
    expect(screen.getByText(/ffmpeg found at/).textContent).toContain('Homebrew');
    fireEvent.click(screen.getByRole('switch', { name: /Convert what browsers/ }));
    await waitFor(() => expect(library.lan.setSettings).toHaveBeenCalledWith({ transcode: true }));
    fireEvent.click(screen.getByRole('button', { name: 'New link' }));
    await waitFor(() => expect(library.lan.regenerateToken).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(library.lan.stop).toHaveBeenCalled());
  });
});
