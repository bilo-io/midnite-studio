import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SPRITE_APPROVE_FIRST, SPRITE_NO_REFERENCE, SPRITE_REFERENCE_CHANGED } from '@midnite/studio-shared';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Hand-drawn step 1 (Phase 106 Theme D) through the mock bridge — vitest/jsdom is enough (DOM roles
 * and text, no layout): the reference card gates frame generation until the reference is approved,
 * asks Keep / Mark all for re-roll when frames already exist, and the create panel disables
 * providers that cannot take a reference image.
 */
const ASSET = 'hero-20261004-120000';
const sheet = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, kind: 'sheet', name: 'hero', prompt: 'a knight', method: 'hand-drawn', provider: 'gemini', clips: [{ name: 'idle', frames: 2, fps: 6, loop: 'loop' }], ...extra });

const open = (files: Record<string, string>) => {
  const seeded: MockFixtures = { ...fixtures, media: { files: { 'sprite:characters': files } } };
  return renderView(<MediaView />, { fixtures: seeded, uiState: { selectedRepoId: 'repo-1' } });
};
const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;
const select = async () => {
  fireEvent.click(await within(explorer()).findByRole('button', { name: 'hero' }));
  return screen.findByTestId('sprite-overview');
};

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'sprite', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(cleanup);

describe('hand-drawn reference', () => {
  it('with no reference, Generate frames is disabled and the card offers a turnaround', async () => {
    open({ [`${ASSET}/sprite.json`]: sheet() });
    const overview = await select();
    const generate = within(overview).getByRole('button', { name: 'Generate frames' });
    expect(generate.hasAttribute('disabled')).toBe(true);
    expect(generate.getAttribute('title')).toBe(SPRITE_NO_REFERENCE);
    const card = within(overview).getByRole('region', { name: 'Reference' });
    expect(within(card).getByRole('button', { name: /Generate turnaround/ })).toBeTruthy();
  }, 30_000);

  it('approving the reference locks it and enables frame generation', async () => {
    open({ [`${ASSET}/sprite.json`]: sheet({ reference: { kind: 'image', file: 'reference/reference.png', approved: false } }) });
    const overview = await select();
    expect(within(overview).getByRole('button', { name: 'Generate frames' }).getAttribute('title')).toBe(SPRITE_APPROVE_FIRST);
    fireEvent.click(within(overview).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(within(screen.getByTestId('sprite-overview')).getByText('Locked')).toBeTruthy());
    expect(within(screen.getByTestId('sprite-overview')).getByRole('button', { name: 'Generate frames' }).hasAttribute('disabled')).toBe(false);
  });

  it('asks Keep / Mark all for re-roll when frames were drawn from the old reference, and lists flagged frames', async () => {
    open({
      [`${ASSET}/sprite.json`]: sheet({ reference: { kind: 'image', file: 'reference/reference.png', approved: false } }),
      [`${ASSET}/frames/frames.json`]: JSON.stringify({
        frames: {
          'idle/e/000': { anchorNudge: [0, 0], flipped: false, source: 'generated', badges: ['inconsistent'], score: 0.3, issues: ['wrong helmet'] },
          'idle/e/001': { anchorNudge: [0, 0], flipped: false, source: 'generated', badges: [] },
        },
      }),
    });
    const overview = await select();
    expect(within(overview).getByText(SPRITE_REFERENCE_CHANGED)).toBeTruthy();
    expect(within(overview).getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(within(overview).getByRole('button', { name: 'Mark all for re-roll' })).toBeTruthy();
    const flagged = within(overview).getByRole('region', { name: 'Flagged frames' });
    expect(within(flagged).getByTitle('wrong helmet').textContent).toContain('idle/e/000');
  });
});

describe('hand-drawn create panel', () => {
  it('starts on Gemini, offers the consistency and mirroring switches, and generates a reference first', async () => {
    open({});
    const panel = await screen.findByTestId('sprite-create-panel');
    const options = within(panel).getByTestId('hand-drawn-options');
    expect(within(options).getByLabelText('Check consistency')).toBeTruthy();
    expect(within(options).getByLabelText('My character is asymmetric')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Generate reference' })).toBeTruthy();
    expect(within(panel).getByTestId('sprite-picker').textContent).toContain('Gemini');
  });
});
