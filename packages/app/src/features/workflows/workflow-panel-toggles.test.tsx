import type { MidniteStudioBridge, Workflow } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { DEFAULT_LAYOUT, useUiStore } from '../../store/ui-store';
import { WorkflowsView } from './workflows-view';

/**
 * Both side panels' show/hide toggles, now in the canvas toolbar (left one
 * first, right one last), and the zero-width collapsed state they drive.
 * vitest/jsdom: roles, attributes and inline widths — nothing here needs a
 * real layout pass.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.setConfig({ testTimeout: 15000 });
});

function installBridge() {
  const workflows: Workflow[] = [{ id: 'w1', name: 'Fetch and log', nodes: [], edges: [], createdAt: 1, updatedAt: 1 }];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: {
      list: vi.fn().mockResolvedValue({ workflows }),
      save: vi.fn().mockResolvedValue({ ok: true, value: workflows[0] }),
      delete: vi.fn(),
      run: vi.fn(),
      cancel: vi.fn(),
      runs: { list: vi.fn().mockResolvedValue({ runs: [] }), get: vi.fn(async () => ({ run: null })) },
      onRunChanged: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
}

async function openEditor() {
  installBridge();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <WorkflowsView />
      </DialogHost>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText('Fetch and log'));
  await screen.findByText('Inspector');
}

/** The canvas toolbar — the row holding Undo. */
function toolbar(): HTMLElement {
  return screen.getByRole('button', { name: 'Undo' }).parentElement!;
}

describe('workflow side-panel toggles', () => {
  beforeEach(() => {
    useUiStore.setState({ layout: DEFAULT_LAYOUT, workflowPaletteCollapsed: false, workflowInspectorCollapsed: true });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('puts the palette toggle first in the canvas toolbar and the inspector toggle last', async () => {
    await openEditor();
    const buttons = within(toolbar()).getAllByRole('button');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Hide node palette');
    expect(buttons.at(-1)?.getAttribute('aria-label')).toBe('Show inspector');
  });

  it('collapses the palette to zero width, keeping its existing ui-store flag', async () => {
    await openEditor();
    const panel = screen.getByTestId('workflow-palette-panel');
    const toggle = screen.getByRole('button', { name: 'Hide node palette' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.style.width).toBe(`${DEFAULT_LAYOUT.workflowPaletteWidth}px`);

    fireEvent.click(toggle);
    expect(useUiStore.getState().workflowPaletteCollapsed).toBe(true);
    expect(panel.style.width).toBe('0px');
    expect(panel.hasAttribute('inert')).toBe(true);
    const show = screen.getByRole('button', { name: 'Show node palette' });
    expect(show.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(show);
    expect(useUiStore.getState().workflowPaletteCollapsed).toBe(false);
    expect(panel.style.width).toBe(`${DEFAULT_LAYOUT.workflowPaletteWidth}px`);
  });

  it('starts the inspector collapsed at zero width with nothing selected, and opens it by hand', async () => {
    await openEditor();
    const panel = screen.getByTestId('workflow-inspector-panel');
    expect(panel.style.width).toBe('0px');
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(screen.queryByRole('separator', { name: 'Resize graph detail' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
    expect(panel.style.width).toBe(`${DEFAULT_LAYOUT.workflowDetailWidth}px`);
    expect(screen.getByRole('button', { name: 'Hide inspector' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('separator', { name: 'Resize graph detail' })).toBeTruthy();
  });

  it('opens the inspector for run history', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Run history' }));
    expect(screen.getByTestId('workflow-inspector-panel').dataset.collapsed).toBe('false');
  });
});
