// vitest/jsdom: the store transitions behind Studio's Knowledge host, and two lists the frame had to copy.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { KNOWLEDGE_TAB_GROUP_COLORS } from '@midnite/studio-frame';

import { TAB_GROUP_COLORS as BROWSER_TAB_GROUP_COLORS } from '@midnite/studio-feature-browser/renderer/store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';
import { STUDIO_KNOWLEDGE_HOST } from './knowledge-host';

describe('STUDIO_KNOWLEDGE_HOST', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: null });
  });

  it('reads the corpus from the selected repository and worktree', () => {
    useUiStore.setState({ selectedRepoId: 'repo:1', selectedWorktreePath: '/w/a' });
    const { result } = renderHook(() => STUDIO_KNOWLEDGE_HOST.useCorpus());
    expect(result.current).toEqual({ repoId: 'repo:1', worktreePath: '/w/a' });
  });

  it('writes the renderer, layout, detail and widths through to ui-store', () => {
    STUDIO_KNOWLEDGE_HOST.setSettings({
      rendererVariant: 'cytoscape',
      layoutId: 'hierarchical',
      detailId: 'all',
      filtersWidth: 300,
      detailWidth: 400,
    });
    const ui = useUiStore.getState();
    expect(ui.rendererVariant).toBe('cytoscape');
    expect(ui.layoutId).toBe('hierarchical');
    expect(ui.knowledgeDetailId).toBe('all');
    expect(ui.layout.knowledgeFiltersWidth).toBe(300);
    expect(ui.layout.knowledgeDetailWidth).toBe(400);
    expect(STUDIO_KNOWLEDGE_HOST.getSettings().rendererVariant).toBe('cytoscape');
  });

  it('useSettings follows ui-store', () => {
    const { result } = renderHook(() => STUDIO_KNOWLEDGE_HOST.useSettings());
    act(() => STUDIO_KNOWLEDGE_HOST.setSettings({ filtersWidth: 333 }));
    expect(result.current.filtersWidth).toBe(333);
  });

  it('panel bounds match ui-store, which the frame no longer imports', () => {
    expect(STUDIO_KNOWLEDGE_HOST.panelBounds.filtersWidth).toEqual({
      ...LAYOUT_BOUNDS.knowledgeFiltersWidth,
      initial: DEFAULT_LAYOUT.knowledgeFiltersWidth,
    });
    expect(STUDIO_KNOWLEDGE_HOST.panelBounds.detailWidth).toEqual({
      ...LAYOUT_BOUNDS.knowledgeDetailWidth,
      initial: DEFAULT_LAYOUT.knowledgeDetailWidth,
    });
  });

  it('the frame keeps its own copy of the tab-group colour tokens, and it has not drifted', () => {
    expect([...KNOWLEDGE_TAB_GROUP_COLORS]).toEqual([...BROWSER_TAB_GROUP_COLORS]);
  });
});
