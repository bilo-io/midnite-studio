import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/** Phase 101 Theme A — Editor | Generator on Media ▸ Audio. Plain DOM roles, so vitest/jsdom. */
const open = () => renderView(<MediaView />, { fixtures, uiState: { selectedRepoId: 'repo-1' } });

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'audio', mediaPaneCollapsed: {}, activeView: 'media', audioTabByRepo: {} });
});
afterEach(cleanup);

describe('Audio modes', () => {
  it('defaults to Generator for a repo with no saved choice', async () => {
    open();
    const generator = await screen.findByRole('tab', { name: 'Generator' });
    expect(generator.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Editor' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('music-editor-empty')).toBeNull();
  });

  it('switches to the Editor and remembers it per repo', async () => {
    open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Editor' }));
    expect(await screen.findByTestId('music-editor-empty')).toBeTruthy();
    expect(useUiStore.getState().audioTabByRepo['repo-1']).toBe('editor');
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  it('opens straight onto the Editor when it was the saved choice', async () => {
    useUiStore.setState({ audioTabByRepo: { 'repo-1': 'editor' } });
    open();
    expect(await screen.findByTestId('music-editor-empty')).toBeTruthy();
  });
});
