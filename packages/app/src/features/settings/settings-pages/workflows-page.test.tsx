import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { WorkflowsPage } from './workflows-page';

function installBridge() {
  const setDefaults = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: { setDefaults } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
  return { setDefaults };
}

describe('WorkflowsPage', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useUiStore.setState({ workflowDefaultTimeoutS: 120, workflowRunHistoryCap: 20 });
  });

  it('renders the persisted defaults', () => {
    useUiStore.setState({ workflowDefaultTimeoutS: 60, workflowRunHistoryCap: 10 });
    render(<WorkflowsPage />);
    expect(screen.getByLabelText('Default node timeout')).toHaveProperty('value', '60');
    expect(screen.getByLabelText('Runs kept per workflow')).toHaveProperty('value', '10');
  });

  it('changing the timeout slider updates the store and sends both values to main', () => {
    const { setDefaults } = installBridge();
    render(<WorkflowsPage />);

    fireEvent.change(screen.getByLabelText('Default node timeout'), { target: { value: '300' } });

    expect(useUiStore.getState().workflowDefaultTimeoutS).toBe(300);
    expect(setDefaults).toHaveBeenCalledWith({ defaultTimeoutMs: 300_000, runHistoryCap: 20 });
  });

  it('changing the run-history cap updates the store and sends both values to main', () => {
    const { setDefaults } = installBridge();
    render(<WorkflowsPage />);

    fireEvent.change(screen.getByLabelText('Runs kept per workflow'), { target: { value: '5' } });

    expect(useUiStore.getState().workflowRunHistoryCap).toBe(5);
    expect(setDefaults).toHaveBeenCalledWith({ defaultTimeoutMs: 120_000, runHistoryCap: 5 });
  });

  it('does nothing (rather than throwing) with no bridge present', () => {
    render(<WorkflowsPage />);
    expect(() =>
      fireEvent.change(screen.getByLabelText('Default node timeout'), { target: { value: '90' } }),
    ).not.toThrow();
    expect(useUiStore.getState().workflowDefaultTimeoutS).toBe(90);
  });
});
