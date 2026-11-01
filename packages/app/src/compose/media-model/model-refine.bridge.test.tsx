import { SF3D_LICENCE_SHA256 } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useModelPrefs } from '@midnite/studio-feature-media-model/events';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useUiStore } from '../../store/ui-store';
import { MediaView } from '../../features/media/media-view';

/**
 * Continuing a model with Claude (Media ▸ Models), through the mock bridge: the open model is offered to the
 * prompt box, an SF3D result is refined by default against the picture it came from, and Refine sends an
 * `edit` request instead of a new model. The SF3D hand-over to the normal prompt box.
 */
const SLOW = { timeout: 8000 };

const sidecarFor = (engine: string, reference?: string) =>
  JSON.stringify({
    version: 1,
    name: 'robot-1',
    prompt: 'a tin robot',
    engine,
    ...(reference ? { reference } : {}),
    spec: { name: 'Tin robot', parts: [{ name: 'part', shape: 'box', size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b0b0b0' }] },
    createdAt: '2026-10-03T00:00:00.000Z',
  });

const withModel = (engine: string, reference?: string, sf3d?: NonNullable<MockFixtures['media']>['sf3d']): MockFixtures => ({
  ...fixtures,
  media: {
    ...(sf3d ? { sf3d } : {}),
    files: {
      'model:robots': {
        'robot-1/robot-1.obj': 'o x',
        'robot-1/robot-1.mtl': 'newmtl a',
        'robot-1/robot-1.fbx': 'fbx',
        'robot-1/robot-1.json': sidecarFor(engine, reference),
      },
    },
  },
});

const open = (data: MockFixtures) => renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
const generateSpy = () => vi.spyOn(window.midniteStudio!.media.model, 'generate');

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'model', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
  useModelPrefs.setState({ tier: 'procedural', engineId: 'claude', ollamaModel: 'qwen2.5-coder:7b', agentModel: 'default', visionModel: '', maxIterations: 5 });
});
afterEach(cleanup);

describe('refining the open model', () => {
  it('an SF3D model is refined by default, shows its source picture, and sends an edit request', async () => {
    open(withModel('sf3d', 'robot-1.ref.png'));
    const card = await screen.findByTestId('model-refine', {}, SLOW);
    expect(card.getAttribute('data-refining')).toBe('true');
    expect(card.textContent).toContain('Refining');
    expect(card.textContent).toContain('Tin robot');
    expect((await screen.findByTestId('model-refine-reference')).getAttribute('src')).toContain('robot-1/robot-1.ref.png');

    const generate = generateSpy();
    const send = screen.getByRole('button', { name: 'Refine' });
    expect(send.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'add a red hat' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refine' }).getAttribute('aria-disabled')).toBeNull());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refine' }));
    });
    expect(generate).toHaveBeenCalledOnce();
    const request = generate.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(request).toMatchObject({ project: 'robots', prompt: 'add a red hat', edit: { path: 'robot-1/robot-1.obj' }, engine: { kind: 'agent', agentId: 'claude' } });
    expect(request).not.toHaveProperty('image');
  });

  it('a one-shot engine cannot refine', async () => {
    useModelPrefs.setState({ engineId: 'ollama' });
    open(withModel('sf3d', 'robot-1.ref.png'));
    await screen.findByTestId('model-refine', {}, SLOW);
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'add a red hat' } });
    const send = screen.getByRole('button', { name: 'Refine' });
    expect(send.getAttribute('aria-disabled')).toBe('true');
  });

  it('another model starts as a new generation and only refines once switched on', async () => {
    open(withModel('ollama:qwen2.5-coder:7b'));
    const card = await screen.findByTestId('model-refine', {}, SLOW);
    expect(card.getAttribute('data-refining')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: 'Refine this model' }));
    await waitFor(() => expect(screen.getByTestId('model-refine').getAttribute('data-refining')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Refine' })).toBeTruthy();
    // No picture was recorded for this one, so there is nothing to show beside it.
    expect(screen.queryByTestId('model-refine-reference')).toBeNull();
  });
});

describe('after an SF3D generation', () => {
  it('hands over to the normal prompt box', async () => {
    useModelPrefs.setState({ tier: 'sf3d' });
    open({ ...fixtures, media: { files: { 'model:props': {} }, sf3d: { state: 'installed', licenceSha256: SF3D_LICENCE_SHA256 } } });
    await waitFor(() => expect(screen.getByTestId('sf3d-state').textContent).toBe('Installed'), SLOW);
    await act(async () => {
      fireEvent.drop(screen.getByTestId('sf3d-panel'), { dataTransfer: { files: [new File([new Uint8Array([1, 2, 3])], 'fox.png', { type: 'image/png' })], types: ['Files'] } });
    });
    fireEvent.change(await screen.findByTestId('sf3d-anatomy'), { target: { value: 'quadruped' } });
    const generate = vi.spyOn(window.midniteStudio!.media.model.sf3d, 'generate');
    await waitFor(() => expect((screen.getByTestId('sf3d-generate') as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(screen.getByTestId('sf3d-generate'));
    });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ anatomy: 'quadruped', facing: '+z' }));
    await waitFor(() => expect(useModelPrefs.getState().tier).toBe('procedural'), SLOW);
  });
});
