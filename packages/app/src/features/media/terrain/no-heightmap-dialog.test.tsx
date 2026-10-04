import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { imageModelsFor } from '@midnite/studio-shared';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { useImagePrefs } from '../image/use-images';
import { MediaView } from '../media-view';

/**
 * The no-heightmap question (Phase 105 Theme C), through the mock bridge. vitest/jsdom: it is a dialog
 * and a few calls, no layout and no WebGL.
 */
const spec = JSON.stringify({ version: 1, name: 'dunes', inputs: {}, resolution: 513, worldSize: 1024, heightRange: [0, 200] });
const data: MockFixtures = {
  ...fixtures,
  media: { files: { 'terrain:terrains': { 'dunes-20261004-120000/terrain.json': spec } } },
};

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'terrain', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openGenerate() {
  renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
  const explorer = document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;
  fireEvent.click(await within(explorer).findByRole('button', { name: 'dunes' }));
  const panel = await screen.findByTestId('terrain-panel');
  fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
  return panel;
}

describe('NoHeightmapDialog', () => {
  it('opens when the build answers needs-height-source, asking the question verbatim', async () => {
    await openGenerate();
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('No heightmap attached — generate the shape from noise, or upload one?')).toBeTruthy();
    for (const name of ['Use noise', 'Upload heightmap…', 'Generate from a prompt', 'Cancel']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    }
    // Focus starts on the safe, productive choice.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Use noise' }));
  });

  it('Use noise saves a noise block on the spec and then builds', async () => {
    const api = () => window.midniteStudio!.media.terrain;
    await openGenerate();
    const dialog = await screen.findByRole('alertdialog');
    const setSpec = vi.spyOn(api(), 'setSpec');
    const build = vi.spyOn(api(), 'build');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use noise' }));
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    const patch = (setSpec.mock.calls[0]![0] as { patch: { noise: { kind: string; seed: number } } }).patch;
    expect(patch.noise.kind).toBe('fbm');
    expect(Number.isInteger(patch.noise.seed)).toBe(true);
    await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.invocationCallOrder[0]!).toBeLessThan(build.mock.invocationCallOrder[0]!);
    // A noise terrain now has a Seed field with a re-roll button.
    const panel = screen.getByTestId('terrain-panel');
    expect(await within(panel).findByRole('button', { name: 'Re-roll seed' })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Cancel closes it and does nothing else', async () => {
    const api = () => window.midniteStudio!.media.terrain;
    await openGenerate();
    const setSpec = vi.spyOn(api(), 'setSpec');
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(setSpec).not.toHaveBeenCalled();
  });

  it('asks again on the next Generate: there is no remembered default', async () => {
    const panel = await openGenerate();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('Generate from a prompt hands the prompt, provider and model to main', async () => {
    const api = () => window.midniteStudio!.media.terrain;
    // The mock bridge's default provider (agy) is unavailable; Gemini is the one that can run.
    useImagePrefs.setState({ provider: 'gemini', model: imageModelsFor('gemini')[0]!.id });
    await openGenerate();
    const setInput = vi.spyOn(api(), 'setInput');
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Generate from a prompt' }));
    const dialog = await screen.findByTestId('heightmap-prompt-dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'a volcanic island' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate heightmap' }));
    await waitFor(() => expect(setInput).toHaveBeenCalledTimes(1));
    expect(setInput.mock.calls[0]![0]).toMatchObject({ slot: 'heightmap', prompt: 'a volcanic island', provider: expect.any(String), model: expect.any(String) });
  });
});
