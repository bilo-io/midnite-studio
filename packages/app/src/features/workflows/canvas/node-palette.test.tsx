import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NodePalette } from './node-palette';

describe('NodePalette', () => {
  afterEach(() => cleanup());

  it('lists every node kind by default', () => {
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={() => {}} />);
    // 5 from Phase 43's MVP vocabulary, Phase 95 Theme J's `agent`/`script`,
    // Phase 97 Theme B's `join`, Phase 97 Theme D's `gate`, and Phase 97
    // Theme F's `router`.
    expect(screen.getByRole('list', { name: 'Node types' }).querySelectorAll('[role="listitem"]')).toHaveLength(10);
  });

  it('filters rows by label as the query changes', () => {
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'http' } });
    const rows = screen.getByRole('list', { name: 'Node types' }).querySelectorAll('[role="listitem"]');
    expect(rows).toHaveLength(1);
    expect(screen.getByLabelText('Add HTTP node')).not.toBeNull();
  });

  it('also filters by description, not just the label', () => {
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'comparison' } });
    expect(screen.getByLabelText('Add Condition node')).not.toBeNull();
  });

  it('shows an empty state when nothing matches', () => {
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No node matches this filter.')).not.toBeNull();
  });

  it('calls onAddNode with the clicked kind', () => {
    const onAddNode = vi.fn();
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={onAddNode} />);
    fireEvent.click(screen.getByLabelText('Add Delay node'));
    expect(onAddNode).toHaveBeenCalledWith('delay');
  });

  it('sets the drag payload to the node kind on dragstart', () => {
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={() => {}} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByLabelText('Add Transform node'), {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith('application/x-midnite-workflow-node-kind', 'transform');
  });

  it('disables every row (no drag, no click) in read-only run view', () => {
    const onAddNode = vi.fn();
    render(<NodePalette collapsed={false} onToggleCollapsed={() => {}} onAddNode={onAddNode} disabled />);
    const button = screen.getByLabelText('Add HTTP node') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.draggable).toBe(false);
  });

  it('collapses to a rail with a single toggle button', () => {
    const onToggleCollapsed = vi.fn();
    render(<NodePalette collapsed onToggleCollapsed={onToggleCollapsed} onAddNode={() => {}} />);
    expect(screen.queryByRole('list', { name: 'Node types' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Show node palette'));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
