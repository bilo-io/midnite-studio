import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { DEFAULT_LAYOUT, useUiStore, type UiState } from '../../store/ui-store';
import { MediaView } from './media-view';
import { exportDisabledReason } from './use-media';

/**
 * Phase 99 Theme A — the Media shell, assembled through the mock bridge:
 * tab strip roving focus + active-only label, per-tab layout widths and
 * double-click collapse, the repo-scoped empty state, and the projects
 * accordion reading `media.project.list`.
 */

const open = (data: MockFixtures = fixtures, uiState: Partial<UiState> = {}) =>
  renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1', ...uiState } });

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'doc', mediaPaneCollapsed: {}, collapsedAccordionSections: [] });
});
afterEach(cleanup);

describe('MediaTabStrip', () => {
  it('renders four icon tabs and the label only on the active one', () => {
    open();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['Docs', 'Images', 'Video', 'Audio']);
    expect(screen.getAllByTestId('media-tab-label')).toHaveLength(1);
    expect(within(tabs[0]!).getByTestId('media-tab-label').textContent).toBe('Docs');
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('tabindex')).toBe('-1');
  });

  it('moves and selects with arrow keys, wrapping, plus Home/End', () => {
    open();
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(useUiStore.getState().mediaTab).toBe('image');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Images');
    fireEvent.keyDown(list, { key: 'End' });
    expect(useUiStore.getState().mediaTab).toBe('audio');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(useUiStore.getState().mediaTab).toBe('doc');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(useUiStore.getState().mediaTab).toBe('audio');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(useUiStore.getState().mediaTab).toBe('doc');
    expect(screen.getByTestId('media-tab-label').textContent).toBe('Docs');
  });
});

describe('MediaLayout', () => {
  it('sizes each tab from its own persisted widths', () => {
    useUiStore.setState((s) => ({ layout: { ...s.layout, mediaDocExplorerWidth: 300 } }));
    open();
    const explorer = document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;
    expect(explorer.style.width).toBe('300px');
    const detail = document.querySelector<HTMLElement>('[data-media-pane="detail"]')!;
    expect(detail.style.width).toBe(`${DEFAULT_LAYOUT.mediaDocDetailWidth}px`);
  });

  it('double-click on a divider collapses its pane, per tab, and again reopens it', () => {
    open();
    const handle = screen.getByRole('separator', { name: 'Resize detail' });
    fireEvent.doubleClick(handle);
    expect(useUiStore.getState().mediaPaneCollapsed.doc?.detail).toBe(true);
    const detail = document.querySelector<HTMLElement>('[data-media-pane="detail"]')!;
    expect(detail.style.width).toBe('0px');
    expect(detail.hasAttribute('inert')).toBe(true);
    expect(useUiStore.getState().mediaPaneCollapsed.image).toBeUndefined();
    fireEvent.doubleClick(handle);
    expect(useUiStore.getState().mediaPaneCollapsed.doc?.detail).toBe(false);
  });
});

describe('repo-scoped tabs', () => {
  it('shows "Open a repo" with no repo selected', () => {
    open(fixtures, { selectedRepoId: null });
    expect(screen.getByText('Open a repo')).toBeTruthy();
  });

  it('lists projects from the media store in an accordion that remembers its fold', async () => {
    open({ ...fixtures, media: { files: { 'doc:launch': { 'brief.md': '# hi' } } } });
    expect(await screen.findByText('brief.md')).toBeTruthy();
    const header = screen.getByRole('button', { name: /^launch/, expanded: true });
    await act(async () => {
      fireEvent.click(header);
    });
    expect(useUiStore.getState().collapsedAccordionSections).toEqual(['media-doc-projects:launch']);
  });
});

describe('exportDisabledReason', () => {
  it('needs a selection, and ffmpeg only for ffmpeg formats', () => {
    const missing = { found: false as const, reason: 'no ffmpeg' };
    const found = { found: true as const, path: '/ffmpeg', version: null };
    expect(exportDisabledReason('png', false, found)).toBe('Select something to export.');
    expect(exportDisabledReason('png', true, missing)).toBe('no ffmpeg');
    expect(exportDisabledReason('png', true, found)).toBeUndefined();
    expect(exportDisabledReason('md', true, missing)).toBeUndefined();
  });
});
