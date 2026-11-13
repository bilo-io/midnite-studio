// vitest/jsdom: picking a scene reads its level, then jumps the game; a dirty level asks first; next-run says so.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { paint } from './level-edit-model';
import { useLevelStore } from './level-store';
import { ScenePicker } from './scene-picker';
import { blankLevel, installBridge, newClient, removeBridge, stubCanvas } from './test-helpers';

const list = vi.fn();
const get = vi.fn();
const set = vi.fn();
const goto = vi.fn();
const calls: string[] = [];

beforeEach(() => {
  stubCanvas();
  calls.length = 0;
  for (const m of [list, get, set, goto]) m.mockReset();
  list.mockResolvedValue({ ok: true, value: { scenes: [{ scene: 'level', bytes: 1, dimension: '2d', issue: null }, { scene: 'cave', bytes: 1, dimension: '2d', issue: null }], start: 'level', readsLevels: true } });
  get.mockImplementation(async () => {
    calls.push('get');
    return { ok: true, value: { level: blankLevel(), issues: [], images: [] } };
  });
  goto.mockImplementation(async () => {
    calls.push('goto');
    return { ok: true, value: { via: 'hook' } };
  });
  set.mockResolvedValue({ ok: true, value: { sha: 'abc' } });
  installBridge({ list, get, goto, set });
  useLevelStore.setState({ byGame: {}, newSceneFor: null });
});
afterEach(() => {
  cleanup();
  removeBridge();
});

const renderPicker = () => render(<QueryClientProvider client={newClient()}><ScenePicker gameId="g1" /></QueryClientProvider>);
const pick = (scene: string) => fireEvent.change(screen.getByLabelText('Scene'), { target: { value: scene } });

describe('ScenePicker', () => {
  it('lists the scenes, marks the start scene and ends with New scene…', async () => {
    renderPicker();
    await screen.findByRole('option', { name: 'level (start)' });
    const options = Array.from(screen.getByLabelText('Scene').querySelectorAll('option')).map((o) => o.textContent);
    expect(options.at(-1)).toBe('New scene…');
    expect(options).toContain('cave');
  });

  it('is disabled without a game', () => {
    render(<QueryClientProvider client={newClient()}><ScenePicker gameId={null} /></QueryClientProvider>);
    expect((screen.getByLabelText('Scene') as HTMLSelectElement).disabled).toBe(true);
  });

  it('reads the level, then jumps the game, and shows the editor\'s scene', async () => {
    renderPicker();
    await screen.findByRole('option', { name: 'cave' });
    pick('cave');
    await waitFor(() => expect(goto).toHaveBeenCalledWith({ gameId: 'g1', scene: 'cave' }));
    expect(calls).toEqual(['get', 'goto']);
    expect(get).toHaveBeenCalledWith({ gameId: 'g1', scene: 'cave' });
    expect(useLevelStore.getState().byGame.g1?.scene).toBe('cave');
    await waitFor(() => expect((screen.getByLabelText('Scene') as HTMLSelectElement).value).toBe('cave'));
  });

  it('says where the next run starts only for next-run', async () => {
    goto.mockResolvedValueOnce({ ok: true, value: { via: 'next-run' } });
    renderPicker();
    await screen.findByRole('option', { name: 'cave' });
    pick('cave');
    expect((await screen.findByRole('status')).textContent).toBe('The next run starts at cave.');
    pick('level');
    await waitFor(() => expect(goto).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status').textContent).toBe('The next run starts at cave.');
  });

  describe('with unsaved edits', () => {
    const seedDirty = async () => {
      renderPicker();
      await screen.findByRole('option', { name: 'cave' });
      pick('level');
      await waitFor(() => expect(goto).toHaveBeenCalledTimes(1));
      act(() => useLevelStore.getState().update('g1', (s) => paint(s, 1, [{ x: 0, y: 0 }], 3)));
      get.mockClear();
      goto.mockClear();
    };

    it('asks, and Cancel leaves the level and the game untouched', async () => {
      await seedDirty();
      pick('cave');
      expect(await screen.findByRole('dialog', { name: 'Save changes to level?' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(get).not.toHaveBeenCalled();
      expect(goto).not.toHaveBeenCalled();
      expect(useLevelStore.getState().byGame.g1?.scene).toBe('level');
      expect(useLevelStore.getState().byGame.g1?.edit.dirty).toBe(true);
    });

    it('Discard opens the other scene without saving', async () => {
      await seedDirty();
      pick('cave');
      fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
      await waitFor(() => expect(goto).toHaveBeenCalledWith({ gameId: 'g1', scene: 'cave' }));
      expect(set).not.toHaveBeenCalled();
      expect(useLevelStore.getState().byGame.g1?.scene).toBe('cave');
    });

    it('Save writes the open level first, then opens and jumps', async () => {
      await seedDirty();
      pick('cave');
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      await waitFor(() => expect(goto).toHaveBeenCalledWith({ gameId: 'g1', scene: 'cave' }));
      expect(set).toHaveBeenCalledTimes(1);
      expect(set.mock.calls[0]![0]).toMatchObject({ gameId: 'g1', scene: 'level' });
    });
  });

  it('New scene… opens the dialog\'s request instead of jumping', async () => {
    renderPicker();
    await screen.findByRole('option', { name: 'cave' });
    pick('__new__');
    expect(useLevelStore.getState().newSceneFor).toBe('g1');
    expect(goto).not.toHaveBeenCalled();
  });
});
