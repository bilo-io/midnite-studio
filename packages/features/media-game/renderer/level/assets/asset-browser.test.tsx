// vitest/jsdom: the browser panel's tiles, skeleton and empty states, filter and keyboard (Phase 139 Theme C).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBottomPanelStore } from '@midnite/studio-frame';

import { newClient } from '../test-helpers';
import { assetDragStore } from './asset-drag';
import { AssetBrowser, ASSET_PANEL_ID } from './asset-browser';
import type { ThumbSource } from './thumb-source';

const asset = (name: string, kind: string) => ({ name, kind: kind as 'model', path: `assets/${name}`, sha256: `sha-${name}` });
const assets = [asset('tree.glb', 'model'), asset('rock.glb', 'model'), asset('hero.png', 'sprite'), asset('theme.ogg', 'audio')];
const source = (get: ThumbSource['get'] = async (a) => `data:image/png;base64,${a.name}`): ThumbSource => ({ get, dispose: vi.fn() });

const open = () => useBottomPanelStore.setState({ panels: { [ASSET_PANEL_ID]: { size: 180, collapsed: false } } } as never);
const renderBrowser = (props: Partial<Parameters<typeof AssetBrowser>[0]> = {}) =>
  render(
    <QueryClientProvider client={newClient()}>
      <AssetBrowser gameId="g1" assets={assets} thumbs={source()} {...props}>
        <div data-testid="canvas-column" />
      </AssetBrowser>
    </QueryClientProvider>,
  );

// jsdom measures every element as 0 x 0, which leaves the virtualiser with no rows: give elements a size.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240);
  useBottomPanelStore.setState({ panels: {} } as never);
  assetDragStore.set({ dragging: null, armed: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AssetBrowser', () => {
  it('C4: is collapsed by default and remembers being opened', () => {
    const { unmount } = renderBrowser();
    expect(screen.getByTestId('level-asset-browser').getAttribute('data-collapsed')).toBe('true');
    expect(screen.queryByTestId('level-assets-grid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Assets/ }));
    expect(screen.getByTestId('level-assets-grid')).toBeTruthy();
    unmount();
    renderBrowser();
    expect(screen.getByTestId('level-assets-grid')).toBeTruthy();
  });

  it('C2: renders one tile per placeable asset, skeletons before thumbnails resolve', async () => {
    open();
    const releases: Array<(url: string) => void> = [];
    renderBrowser({ thumbs: source(() => new Promise((r) => releases.push(r))) });
    const tiles = screen.getAllByTestId('level-asset-tile');
    expect(tiles).toHaveLength(3);
    expect(screen.queryByLabelText('theme.ogg (audio)')).toBeNull();
    expect(tiles[0]!.querySelector('img')).toBeNull();
    await act(async () => releases.forEach((r) => r('data:image/png;base64,x')));
    await waitFor(() => expect(tiles[0]!.querySelector('img')).toBeTruthy());
  });

  it('shows a kind icon when a thumbnail fails', async () => {
    open();
    renderBrowser({ thumbs: source(async () => null) });
    await waitFor(() => expect(screen.getAllByTestId('level-asset-tile')[0]!.querySelector('svg')).toBeTruthy());
  });

  it('C2: shows skeleton tiles while the manifest loads and the empty state with its button when there are none', () => {
    open();
    const { unmount } = renderBrowser({ assets: undefined });
    expect(screen.getByTestId('level-assets-loading')).toBeTruthy();
    unmount();
    const onImport = vi.fn();
    renderBrowser({ assets: [asset('theme.ogg', 'audio')], onImport });
    expect(screen.getByText('No assets yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import assets' }));
    expect(onImport).toHaveBeenCalled();
  });

  it('filters by name and kind chip', () => {
    open();
    renderBrowser();
    fireEvent.change(screen.getByPlaceholderText('Filter assets'), { target: { value: 'ROCK' } });
    expect(screen.getAllByTestId('level-asset-tile')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Filter assets'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'model' }));
    expect(screen.getAllByTestId('level-asset-tile').map((t) => t.getAttribute('aria-label'))).toEqual(['hero.png (sprite)']);
  });

  it('C3: "/" focuses the filter and arrows move focus across tiles', () => {
    open();
    renderBrowser();
    const tiles = screen.getAllByTestId('level-asset-tile');
    tiles[0]!.focus();
    fireEvent.keyDown(tiles[0]!, { key: '/' });
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Filter assets'));
    tiles[0]!.focus();
    fireEvent.keyDown(tiles[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getAllByTestId('level-asset-tile')[1]);
  });

  it('Enter or a click arms a tile; a second one disarms; a drag records the payload', () => {
    open();
    renderBrowser();
    const tile = screen.getAllByTestId('level-asset-tile')[0]!;
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(assetDragStore.get().armed).toEqual({ kind: 'asset', name: 'tree.glb', assetKind: 'model' });
    fireEvent.click(tile);
    expect(assetDragStore.get().armed).toBeNull();
    const dt = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(tile, { dataTransfer: dt });
    expect(dt.setData).toHaveBeenCalledWith('application/x-midnite-level-asset', expect.stringContaining('tree.glb'));
    expect(assetDragStore.get().dragging?.kind).toBe('asset');
    fireEvent.dragEnd(tile);
    expect(assetDragStore.get().dragging).toBeNull();
  });

  it('adds extra tabs through the extension point', () => {
    open();
    renderBrowser({ tabs: [{ id: 'prefabs', label: 'Prefabs', render: () => <p>prefab body</p> }] });
    fireEvent.click(screen.getByRole('radio', { name: 'Prefabs' }));
    expect(screen.getByText('prefab body')).toBeTruthy();
    expect(screen.queryByTestId('level-assets-grid')).toBeNull();
  });
});
