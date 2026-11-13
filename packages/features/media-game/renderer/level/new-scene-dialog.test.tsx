// vitest/jsdom: name validation, the perspective's defaults, create, and the start-scene opt-in.
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewSceneDialog } from './new-scene-dialog';
import { installBridge, newClient, removeBridge } from './test-helpers';

const list = vi.fn();
const set = vi.fn();
const manifestGet = vi.fn();
const manifestSet = vi.fn();
const onCreated = vi.fn();

const manifest = (over: Record<string, unknown> = {}) => ({ manifest: { perspective: 'isometric', ...over }, issues: [] });

beforeEach(() => {
  for (const m of [list, set, manifestGet, manifestSet, onCreated]) m.mockReset();
  list.mockResolvedValue({ ok: true, value: { scenes: [{ scene: 'level', bytes: 1, dimension: '2d', issue: null }], start: null, readsLevels: false } });
  set.mockResolvedValue({ ok: true, value: { sha: 'abc' } });
  manifestGet.mockResolvedValue(manifest());
  manifestSet.mockResolvedValue({ ok: true });
  installBridge({ list, set, manifestGet, manifestSet });
});
afterEach(() => {
  cleanup();
  removeBridge();
});

const renderDialog = () => render(<QueryClientProvider client={newClient()}><NewSceneDialog gameId="g1" onClose={() => undefined} onCreated={onCreated} /></QueryClientProvider>);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const create = () => screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement;

describe('NewSceneDialog', () => {
  it('prefills the perspective\'s size and tile size', async () => {
    renderDialog();
    await waitFor(() => expect((screen.getByLabelText('Width (tiles)') as HTMLInputElement).value).toBe('20'));
    expect((screen.getByLabelText('Height (tiles)') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Tile width (px)') as HTMLInputElement).value).toBe('64');
    expect((screen.getByLabelText('Tile height (px)') as HTMLInputElement).value).toBe('32');
  });

  it('validates the name live: the manifest rule, then duplicates', async () => {
    renderDialog();
    await waitFor(() => expect((screen.getByLabelText('Width (tiles)') as HTMLInputElement).value).toBe('20'));
    expect(create().disabled).toBe(true);
    type('Name', 'Cave');
    expect((await screen.findByRole('alert')).textContent).toMatch(/lowercase/);
    expect(create().disabled).toBe(true);
    type('Name', 'level');
    expect((await screen.findByRole('alert')).textContent).toBe('A scene named "level" already exists.');
    type('Name', 'cave');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(create().disabled).toBe(false);
  });

  it('creates through level-set with create, as a valid blank isometric level', async () => {
    renderDialog();
    await waitFor(() => expect((screen.getByLabelText('Width (tiles)') as HTMLInputElement).value).toBe('20'));
    type('Name', 'cave');
    fireEvent.click(create());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('cave'));
    const req = set.mock.calls[0]![0] as { create: boolean; scene: string; level: { orientation: string; width: number } };
    expect(req).toMatchObject({ gameId: 'g1', scene: 'cave', create: true });
    expect(req.level).toMatchObject({ orientation: 'isometric', width: 20 });
    expect(manifestSet).not.toHaveBeenCalled();
  });

  it('offers the start-scene opt-in only before the game has a levels key, and writes it to the manifest', async () => {
    renderDialog();
    const box = await screen.findByLabelText('Make this the start scene');
    expect((box as HTMLInputElement).checked).toBe(false);
    type('Name', 'cave');
    fireEvent.click(box);
    fireEvent.click(create());
    await waitFor(() => expect(manifestSet).toHaveBeenCalledWith({ gameId: 'g1', patch: { levels: { dir: 'levels', start: 'cave' } } }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('cave'));
  });

  it('does not offer it once the manifest has levels', async () => {
    manifestGet.mockResolvedValue(manifest({ levels: { dir: 'levels', start: 'level' } }));
    renderDialog();
    await waitFor(() => expect((screen.getByLabelText('Width (tiles)') as HTMLInputElement).value).toBe('20'));
    expect(screen.queryByLabelText('Make this the start scene')).toBeNull();
  });

  it('cannot create a scene for a 3D game', async () => {
    manifestGet.mockResolvedValue(manifest({ perspective: 'first-person' }));
    renderDialog();
    expect(await screen.findByText(/3D game/)).toBeTruthy();
    expect(create().disabled).toBe(true);
  });
});
