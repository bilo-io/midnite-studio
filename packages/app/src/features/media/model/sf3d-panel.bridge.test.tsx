import { SF3D_LICENCE_SHA256 } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';
import { useModelPrefs } from './use-model';

/**
 * Media ▸ Models ▸ SF3D through the mock bridge (Phase 103 Theme J): picking the tier never
 * downloads; the licence and its US$1M line are shown first; nothing installs until both boxes are
 * ticked and Accept is pressed; an installed SF3D offers Generate and a two-step uninstall.
 */
const SLOW = { timeout: 8000 };

const open = (sf3d?: NonNullable<MockFixtures['media']>['sf3d']) =>
  renderView(<MediaView />, { fixtures: { ...fixtures, media: { files: { 'model:props': {} }, ...(sf3d ? { sf3d } : {}) } }, uiState: { selectedRepoId: 'repo-1' } });

type Sf3dMock = { install: () => Promise<unknown>; consent: () => Promise<unknown>; generate: (req: unknown) => Promise<unknown> };
const mock = () => (window as unknown as { midniteStudio: { media: { model: { sf3d: Sf3dMock } } } }).midniteStudio.media.model.sf3d;

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'model', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
  useModelPrefs.setState({ tier: 'procedural', engineId: 'ollama', ollamaModel: 'qwen2.5-coder:7b', agentModel: 'default', visionModel: '', maxIterations: 5 });
});
afterEach(cleanup);

describe('SF3D tier', () => {
  it('switches tier without downloading, then shows the licence and the US$1M line before any install', async () => {
    open();
    const install = vi.spyOn(mock(), 'install');
    fireEvent.click(await screen.findByTestId('model-tier-sf3d', {}, SLOW));
    expect(useModelPrefs.getState().tier).toBe('sf3d');
    const panel = await screen.findByTestId('sf3d-panel');
    await waitFor(() => expect(within(panel).getByTestId('sf3d-state').textContent).toBe('Not installed'));
    expect(install).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByTestId('sf3d-setup'));
    const dialog = await screen.findByTestId('sf3d-consent');
    expect(within(dialog).getByTestId('sf3d-licence-text').textContent).toContain('STABILITY AI COMMUNITY LICENSE AGREEMENT');
    expect(within(dialog).getByTestId('sf3d-revenue-note').textContent).toContain('US$1,000,000');

    const accept = within(dialog).getByTestId('sf3d-consent-accept') as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    fireEvent.click(within(dialog).getByTestId('sf3d-consent-read'));
    expect(accept.disabled).toBe(true);
    fireEvent.click(within(dialog).getByTestId('sf3d-consent-revenue'));
    expect(accept.disabled).toBe(false);
    expect(install).not.toHaveBeenCalled();

    const consent = vi.spyOn(mock(), 'consent');
    fireEvent.click(accept);
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(consent).toHaveBeenCalledWith({ licenceSha256: SF3D_LICENCE_SHA256, revenueAcknowledged: true });
    await waitFor(() => expect(screen.getByTestId('sf3d-state').textContent).toBe('Installed'), SLOW);
    expect(screen.getByTestId('sf3d-generate-area')).toBeTruthy();
  });

  it('closing the dialog downloads nothing', async () => {
    useModelPrefs.setState({ tier: 'sf3d' });
    open();
    const install = vi.spyOn(mock(), 'install');
    fireEvent.click(await screen.findByTestId('sf3d-setup', {}, SLOW));
    fireEvent.click(within(await screen.findByTestId('sf3d-consent')).getByText('Not now'));
    await waitFor(() => expect(screen.queryByTestId('sf3d-consent')).toBeNull());
    expect(install).not.toHaveBeenCalled();
  });

  it('shows download progress with a cancel that returns to a resumable state', async () => {
    useModelPrefs.setState({ tier: 'sf3d' });
    open({ hold: true, holdFraction: 0.42 });
    fireEvent.click(await screen.findByTestId('sf3d-setup', {}, SLOW));
    const dialog = await screen.findByTestId('sf3d-consent');
    fireEvent.click(within(dialog).getByTestId('sf3d-consent-read'));
    fireEvent.click(within(dialog).getByTestId('sf3d-consent-revenue'));
    fireEvent.click(within(dialog).getByTestId('sf3d-consent-accept'));
    const progress = await screen.findByTestId('sf3d-install-progress');
    await waitFor(() => expect(within(progress).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42'));
    expect(progress.textContent).toContain('backbone_fp16.onnx');
    fireEvent.click(screen.getByTestId('sf3d-cancel-install'));
    await waitFor(() => expect(screen.getByTestId('sf3d-setup').textContent).toMatch(/Resume install/), SLOW);
  });

  it('generates from an attached picture and uninstalls in two steps', async () => {
    useModelPrefs.setState({ tier: 'sf3d' });
    open({ state: 'installed', licenceSha256: SF3D_LICENCE_SHA256 });
    await waitFor(() => expect(screen.getByTestId('sf3d-state').textContent).toBe('Installed'), SLOW);
    const generateButton = screen.getByTestId('sf3d-generate') as HTMLButtonElement;
    expect(generateButton.disabled).toBe(true);
    expect(generateButton.title).toMatch(/Attach a picture/);

    fireEvent.click(screen.getByTestId('sf3d-uninstall'));
    fireEvent.click(await screen.findByTestId('sf3d-uninstall-yes'));
    await waitFor(() => expect(screen.getByTestId('sf3d-state').textContent).toBe('Not installed'), SLOW);
  });
});
