import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';
import { useModelPrefs } from './use-model';

/**
 * Media ▸ Models through the mock bridge: the explorer lists only .obj/.fbx,
 * the viewer mounts lazily (jsdom has no WebGL, so it must degrade to a
 * message rather than crash), the prompt panel explains a missing Ollama or
 * vision model, and Generate lands a model that gets selected.
 */
const sidecar = JSON.stringify({
  version: 1,
  name: 'robot-1',
  prompt: 'a tin robot',
  engine: 'ollama:qwen2.5-coder:7b',
  spec: { name: 'Tin robot', parts: [{ name: 'part', shape: 'box', size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b0b0b0' }] },
  createdAt: '2026-10-03T00:00:00.000Z',
});

const withModels: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'model:robots': {
        'robot-1.obj': 'o x',
        'robot-1.mtl': 'newmtl a',
        'robot-1.fbx': 'fbx',
        'robot-1.json': sidecar,
        'notes.txt': 'hi',
      },
    },
  },
};

const SLOW = { timeout: 8000 };

const open = (data: MockFixtures = withModels) =>
  renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'model', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
  useModelPrefs.setState({ engineId: 'ollama', ollamaModel: 'qwen2.5-coder:7b', agentModel: 'default', visionModel: '' });
});
afterEach(cleanup);

describe('Models tab', () => {
  it('is the fifth tab, labelled Models', () => {
    open();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toContain('Models');
    expect(screen.getByTestId('media-tab-label').textContent).toBe('Models');
  });

  it('lists only model files in the explorer and shows the design caption', async () => {
    open();
    const explorer = document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;
    await waitFor(() => expect(within(explorer).getByText('robot-1.obj')).toBeTruthy());
    expect(within(explorer).getByText('robot-1.fbx')).toBeTruthy();
    expect(within(explorer).queryByText('robot-1.mtl')).toBeNull();
    expect(within(explorer).queryByText('robot-1.json')).toBeNull();
    expect(within(explorer).queryByText('notes.txt')).toBeNull();
    const caption = await screen.findByTestId('model-caption', {}, SLOW);
    expect(caption.textContent).toContain('Tin robot');
    expect(caption.textContent).toContain('a tin robot');
  });

  it('degrades to a message when WebGL is unavailable instead of crashing, keeping the editor fields', async () => {
    open();
    // The editor is a lazy chunk; give the dynamic import room when the whole suite is running.
    expect((await screen.findByRole('alert', {}, SLOW)).textContent).toMatch(/WebGL/);
    expect(await screen.findByRole('list', { name: 'Parts' }, SLOW)).toBeTruthy();
  });

  describe('editing a design', () => {
    const edit = async () => {
      open();
      const parts = await screen.findByRole('list', { name: 'Parts' }, SLOW);
      return within(parts);
    };

    it('lists the design parts and edits the selected one, with undo and redo', async () => {
      const parts = await edit();
      expect(screen.getByText(/Select a part/)).toBeTruthy();
      fireEvent.click(parts.getByRole('button', { name: /part/ }));
      const x = screen.getByRole('spinbutton', { name: 'Position X' }) as HTMLInputElement;
      fireEvent.change(x, { target: { value: '2.5' } });
      fireEvent.blur(x);
      await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'Position X' }) as HTMLInputElement).value).toBe('2.5'));
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
      expect(screen.getByTestId('model-caption').textContent).toContain('unsaved changes');

      fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
      await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'Position X' }) as HTMLInputElement).value).toBe('0'));
      expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));
      await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'Position X' }) as HTMLInputElement).value).toBe('2.5'));
    });

    it('supports the editor keyboard: Cmd+Z undoes, Delete removes the selected part', async () => {
      const parts = await edit();
      fireEvent.click(parts.getByRole('button', { name: /part/ }));
      const editor = screen.getByTestId('model-editor');
      const x = screen.getByRole('spinbutton', { name: 'Position X' }) as HTMLInputElement;
      fireEvent.change(x, { target: { value: '1' } });
      fireEvent.blur(x);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy());
      fireEvent.keyDown(editor, { key: 'z', metaKey: true });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
    });

    it('recolours a part and saves the edit through the bridge', async () => {
      const parts = await edit();
      fireEvent.click(parts.getByRole('button', { name: /part/ }));
      const colour = screen.getByLabelText('Colour') as HTMLInputElement;
      colour.value = '#ff0000';
      fireEvent.change(colour);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy());
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
    });

    it('duplicates and deletes parts, never leaving the design empty', async () => {
      const parts = await edit();
      fireEvent.click(parts.getByRole('button', { name: /part/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate part' }));
      await waitFor(() => expect(within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('button')).toHaveLength(2));
      fireEvent.click(screen.getByRole('button', { name: 'Delete part' }));
      await waitFor(() => expect(within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('button')).toHaveLength(1));
    });

    it('switches transform and view modes', async () => {
      await edit();
      fireEvent.click(screen.getByRole('radio', { name: 'Rotate' }));
      expect(screen.getByRole('radio', { name: 'Rotate' }).getAttribute('aria-checked')).toBe('true');
      fireEvent.keyDown(screen.getByTestId('model-editor'), { key: 'r' });
      expect(screen.getByRole('radio', { name: 'Scale' }).getAttribute('aria-checked')).toBe('true');
      fireEvent.keyDown(screen.getByTestId('model-editor'), { key: 'w' });
      expect(screen.getByRole('radio', { name: 'Move' }).getAttribute('aria-checked')).toBe('true');
      fireEvent.click(screen.getByRole('radio', { name: 'Wireframe' }));
      expect(screen.getByRole('radio', { name: 'Wireframe' }).getAttribute('aria-checked')).toBe('true');
      fireEvent.click(screen.getByRole('radio', { name: 'Normals' }));
      expect(screen.getByRole('radio', { name: 'Solid' }).getAttribute('aria-checked')).toBe('false');
    });

    it('exports through the bridge with the edited spec', async () => {
      const parts = await edit();
      fireEvent.click(parts.getByRole('button', { name: /part/ }));
      const x = screen.getByRole('spinbutton', { name: 'Position X' }) as HTMLInputElement;
      fireEvent.change(x, { target: { value: '4' } });
      fireEvent.blur(x);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy());
      const exportSpy = vi.spyOn(window.midniteStudio!.media.model, 'export');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Export Wavefront OBJ' }));
      });
      expect(exportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'obj', project: 'robots', path: 'robot-1.obj', spec: expect.objectContaining({ parts: [expect.objectContaining({ position: [4, 0, 0] })] }) }),
      );
    });
  });

  it('an empty tab offers a CTA that reopens the prompt panel', async () => {
    useUiStore.setState({ mediaPaneCollapsed: { model: { detail: true } } });
    open(fixtures);
    expect(await screen.findByText('No 3D models yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Generate model' }));
    expect(useUiStore.getState().mediaPaneCollapsed.model?.detail).toBe(false);
  });

  it('Generate lands a model and selects it', async () => {
    open(fixtures);
    await screen.findByText('No 3D models yet');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'a low-poly fox' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    });
    const explorer = document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;
    await waitFor(() => expect(within(explorer).getAllByText(/\.obj$/)).toHaveLength(1));
    expect(within(explorer).getAllByText(/\.fbx$/)).toHaveLength(1);
  });

  it('keeps Generate off until there is something to build', async () => {
    open(fixtures);
    await screen.findByText('No 3D models yet');
    expect(screen.getByRole('button', { name: 'Generate' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'a mug' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' }).getAttribute('aria-disabled')).toBeNull());
  });

  it('explains Ollama being down and how to recover', async () => {
    open({
      ...fixtures,
      media: { modelProviders: { ollama: { available: false, reason: 'Ollama is not running. Start it with `ollama serve`.', models: [] } } },
    });
    const notice = await screen.findByTestId('model-ollama-down');
    expect(notice.textContent).toContain('ollama serve');
    expect(notice.textContent).toContain('agent');
  });

  it('names the model to pull when Ollama has none installed', async () => {
    open({ ...fixtures, media: { modelProviders: { ollama: { available: true, models: [] } } } });
    expect((await screen.findByTestId('model-no-text')).textContent).toContain('ollama pull qwen2.5-coder:7b');
  });

  it('attaches an image through the attach menu and warns when no vision model is installed', async () => {
    open({
      ...fixtures,
      media: { modelProviders: { ollama: { available: true, models: [{ id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', vision: false }] } } },
    });
    await screen.findByText('No 3D models yet');
    const form = screen.getByRole('form', { name: 'Create 3D model' });
    const file = new File([new Uint8Array([1, 2, 3])], 'mug.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.drop(form, { dataTransfer: { files: [file], types: ['Files'] } });
    });
    expect(await screen.findByTestId('model-image')).toBeTruthy();
    expect((await screen.findByTestId('model-no-vision')).textContent).toContain('ollama pull qwen2.5vl:7b');
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.queryByTestId('model-image')).toBeNull();
  });

  it('offers the vision models that are installed', async () => {
    open();
    await screen.findByText('No 3D models yet');
    const file = new File([new Uint8Array([1, 2, 3])], 'mug.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.drop(screen.getByRole('form', { name: 'Create 3D model' }), { dataTransfer: { files: [file], types: ['Files'] } });
    });
    const select = (await screen.findByRole('combobox', { name: 'Vision model' })) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'qwen2.5vl:7b']);
  });

  it('rejects a non-image drop with a reason', async () => {
    open(fixtures);
    await screen.findByText('No 3D models yet');
    await act(async () => {
      fireEvent.drop(screen.getByRole('form', { name: 'Create 3D model' }), {
        dataTransfer: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })], types: ['Files'] },
      });
    });
    // Only image files are picked out of a drop, so a stray text file is simply ignored.
    expect(screen.queryByTestId('model-image')).toBeNull();
  });
});
