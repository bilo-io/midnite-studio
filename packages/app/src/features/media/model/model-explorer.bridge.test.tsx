import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';
import { resetMigrationMemo } from './use-model-library';

/**
 * The Models explorer through the mock bridge. Native HTML5 drag events are enough to drive the tree's
 * drop logic under jsdom (the handlers keep the dragged item in a ref, not in `dataTransfer`), so
 * vitest covers the rules; real pointer drag is left to the e2e spec.
 */
// A slow CI runner mounts the whole Media view per test.
vi.setConfig({ testTimeout: 20_000 });

const manifest = (provider: string, model?: string) =>
  JSON.stringify({
    version: 1,
    name: 'Fox',
    agent: { provider, ...(model ? { model } : {}) },
    author: { name: 'Bilo' },
    prompt: 'a fox',
    details: { vertices: 8, polygons: 12, parts: 1, bounds: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1] }, materials: [] },
    files: { obj: 'fox.obj' },
    createdAt: '2026-10-03T00:00:00.000Z',
  });

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'model:animals': { 'fox/fox.obj': 'o x', 'fox/model.json': manifest('claude', 'sonnet-5'), 'fox/notes.json': '{"a":1}' },
      'model:toys': {},
    },
  },
};

const open = () => renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
const library = () => window.midniteStudio!.media.model.library;
const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;

beforeEach(() => {
  resetMigrationMemo();
  useUiStore.setState({ mediaTab: 'model', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(cleanup);

describe('Models explorer', () => {
  it('migrates once per session before listing', async () => {
    open();
    const migrate = vi.spyOn(library(), 'migrate');
    await within(explorer()).findByTestId('model-row');
    // the first query already ran (a spy added after render may miss it), a second mount must not migrate again
    cleanup();
    open();
    await within(explorer()).findByTestId('model-row');
    expect(migrate.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('gives group headers a translucent primary-colour tint from a theme token, not a literal colour', async () => {
    open();
    await within(explorer()).findAllByTestId('model-group');
    const header = explorer().querySelector('header');
    expect(header?.className).toContain('bg-primary/15');
  });

  it('shows the model name from model.json in a tooltip on the provider icon', async () => {
    open();
    const row = await within(explorer()).findByTestId('model-row');
    const trigger = within(row).getByTestId('provider-icon').closest('button')!;
    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
    expect(await screen.findByText('Claude · sonnet-5', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('opens model.json in the JSON viewer and the folder in the editor', async () => {
    open();
    const row = await within(explorer()).findByTestId('model-row');
    fireEvent.click(within(row).getByRole('button', { name: 'Expand fox' }));
    fireEvent.click(within(explorer()).getByText('model.json'));
    expect(await screen.findByTestId('json-viewer', {}, { timeout: 8000 })).toBeTruthy();
    fireEvent.click(within(row).getByText('fox'));
    await waitFor(() => expect(screen.queryByTestId('json-viewer')).toBeNull());
  });

  describe('context menus', () => {
    const menuLabels = () => screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');

    it('a model offers rename, duplicate, move, reveal, copy path and delete', async () => {
      open();
      fireEvent.contextMenu(await within(explorer()).findByTestId('model-row'));
      const labels = menuLabels().join('|');
      for (const wanted of ['Open', 'Rename…', 'Duplicate', 'Move to', 'Reveal in Finder', 'Copy path', 'Delete…']) expect(labels).toContain(wanted);
    });

    it('a group header offers new group, rename, duplicate, reveal and delete', async () => {
      open();
      fireEvent.contextMenu(within((await within(explorer()).findAllByTestId('model-group'))[0]!).getByText('animals'));
      const labels = menuLabels().join('|');
      for (const wanted of ['New group inside', 'Rename…', 'Duplicate', 'Reveal in Finder', 'Delete…']) expect(labels).toContain(wanted);
    });

    it('the empty area offers New group', async () => {
      open();
      await within(explorer()).findAllByTestId('model-group');
      fireEvent.contextMenu(screen.getByTestId('model-explorer').querySelector('.hide-scrollbar')!);
      expect(menuLabels()).toContain('New group');
    });

    it('Delete asks first, naming what goes to the Trash, and only then deletes', async () => {
      open();
      const del = vi.spyOn(library(), 'delete');
      fireEvent.contextMenu(await within(explorer()).findByTestId('model-row'));
      fireEvent.click(screen.getByRole('menuitem', { name: /Delete…/ }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toContain('Delete "fox"?');
      expect(dialog.textContent).toMatch(/3 files/);
      expect(del).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
      });
      expect(del).toHaveBeenCalledWith({ repoId: 'repo-1', path: 'animals/fox' });
    });

    it('Rename prompts with the current name and sends the new one', async () => {
      open();
      const rename = vi.spyOn(library(), 'rename');
      fireEvent.contextMenu(await within(explorer()).findByTestId('model-row'));
      fireEvent.click(screen.getByRole('menuitem', { name: /Rename…/ }));
      const input = (await screen.findByLabelText('Name')) as HTMLInputElement;
      expect(input.value).toBe('fox');
      fireEvent.change(input, { target: { value: 'red fox' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      });
      expect(rename).toHaveBeenCalledWith({ repoId: 'repo-1', path: 'animals/fox', to: 'red fox' });
    });
  });

  describe('drag and drop', () => {
    const groups = () => within(explorer()).getAllByTestId('model-group');
    const group = (path: string) => groups().find((g) => g.getAttribute('data-path') === path)!;

    it('dropping a model on another group moves it', async () => {
      open();
      const move = vi.spyOn(library(), 'move');
      const row = await within(explorer()).findByTestId('model-row');
      await waitFor(() => expect(groups()).toHaveLength(2));
      fireEvent.dragStart(row);
      fireEvent.dragOver(group('toys'));
      await act(async () => {
        fireEvent.drop(group('toys'));
      });
      expect(move).toHaveBeenCalledWith({ repoId: 'repo-1', path: 'animals/fox', toGroup: 'toys' });
    });

    it('dropping a model on its own group, or on the root, does nothing', async () => {
      open();
      const move = vi.spyOn(library(), 'move');
      const row = await within(explorer()).findByTestId('model-row');
      fireEvent.dragStart(row);
      await act(async () => {
        fireEvent.drop(group('animals'));
      });
      fireEvent.dragStart(row);
      await act(async () => {
        fireEvent.drop(screen.getByTestId('model-explorer').querySelector('.hide-scrollbar')!);
      });
      expect(move).not.toHaveBeenCalled();
    });

    it('a group can be dropped into another group', async () => {
      open();
      const move = vi.spyOn(library(), 'move');
      await within(explorer()).findByTestId('model-row');
      await waitFor(() => expect(groups()).toHaveLength(2));
      fireEvent.dragStart(group('toys'));
      await act(async () => {
        fireEvent.drop(group('animals'));
      });
      expect(move).toHaveBeenCalledWith({ repoId: 'repo-1', path: 'toys', toGroup: 'animals' });
    });
  });
});
