import { WORKFLOW_NODE_KINDS } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NODE_GROUPS, NODE_KIND_META } from './node-kind-meta';
import { NodePalette, paletteGroups } from './node-palette';

function palette() {
  return screen.getByRole('region', { name: 'Node types' });
}

function rows(): Element[] {
  return Array.from(palette().querySelectorAll('[role="listitem"]'));
}

function groupToggle(label: string): HTMLElement {
  return within(palette()).getByRole('button', { name: new RegExp(`^${label}`) });
}

describe('NodePalette', () => {
  afterEach(() => cleanup());

  it('lists every node kind by default, each exactly once', () => {
    render(<NodePalette onAddNode={() => {}} />);
    expect(rows()).toHaveLength(WORKFLOW_NODE_KINDS.length);
    for (const kind of WORKFLOW_NODE_KINDS) {
      expect(screen.getAllByLabelText(`Add ${NODE_KIND_META[kind].label} node`)).toHaveLength(1);
    }
  });

  it('puts each kind under its own labelled group, in NODE_GROUPS order', () => {
    render(<NodePalette onAddNode={() => {}} />);
    const lists = within(palette()).getAllByRole('list');
    expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual(NODE_GROUPS.map((group) => group.label));
    const control = within(palette()).getByRole('list', { name: 'Control flow' });
    expect(within(control).getByLabelText('Add Condition node')).not.toBeNull();
    expect(within(control).queryByLabelText('Add HTTP node')).toBeNull();
  });

  it('collapses and re-expands a group from its heading', () => {
    render(<NodePalette onAddNode={() => {}} />);
    const toggle = groupToggle('Control flow');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(groupToggle('Control flow').getAttribute('aria-expanded')).toBe('false');
    // Folding one group leaves the others alone.
    expect(groupToggle('Actions').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(groupToggle('Control flow'));
    expect(groupToggle('Control flow').getAttribute('aria-expanded')).toBe('true');
  });

  it('filters rows by label as the query changes', () => {
    render(<NodePalette onAddNode={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'http' } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByLabelText('Add HTTP node')).not.toBeNull();
  });

  it('also filters by description, not just the label', () => {
    render(<NodePalette onAddNode={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'comparison' } });
    expect(screen.getByLabelText('Add Condition node')).not.toBeNull();
  });

  it('searches across groups, dropping groups with no match', () => {
    render(<NodePalette onAddNode={() => {}} />);
    // "run" hits kinds in several groups (agent, script, trigger, …).
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'run' } });
    const expected = paletteGroups('run');
    expect(expected.length).toBeGreaterThan(1);
    const lists = within(palette()).getAllByRole('list');
    expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual(expected.map((group) => group.label));
    expect(rows()).toHaveLength(expected.reduce((sum, group) => sum + group.kinds.length, 0));
  });

  it('opens a folded group while a query matches inside it, and restores the fold after', () => {
    render(<NodePalette onAddNode={() => {}} />);
    fireEvent.click(groupToggle('Control flow'));
    expect(groupToggle('Control flow').getAttribute('aria-expanded')).toBe('false');

    const filter = screen.getByPlaceholderText('Filter nodes…');
    fireEvent.change(filter, { target: { value: 'router' } });
    expect(groupToggle('Control flow').getAttribute('aria-expanded')).toBe('true');

    fireEvent.change(filter, { target: { value: '' } });
    expect(groupToggle('Control flow').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows an empty state when nothing matches', () => {
    render(<NodePalette onAddNode={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Filter nodes…'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No node matches this filter.')).not.toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('calls onAddNode with the clicked kind', () => {
    const onAddNode = vi.fn();
    render(<NodePalette onAddNode={onAddNode} />);
    fireEvent.click(screen.getByLabelText('Add Delay node'));
    expect(onAddNode).toHaveBeenCalledWith('delay');
  });

  it('sets the drag payload to the node kind on dragstart', () => {
    render(<NodePalette onAddNode={() => {}} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByLabelText('Add Transform node'), {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith('application/x-midnite-workflow-node-kind', 'transform');
  });

  it('disables every row (no drag, no click) in read-only run view', () => {
    const onAddNode = vi.fn();
    render(<NodePalette onAddNode={onAddNode} disabled />);
    const button = screen.getByLabelText('Add HTTP node') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.draggable).toBe(false);
  });

  it('carries no show/hide control of its own — that toggle lives in the canvas toolbar', () => {
    render(<NodePalette onAddNode={() => {}} />);
    expect(screen.queryByLabelText('Show node palette')).toBeNull();
    expect(screen.queryByLabelText('Hide node palette')).toBeNull();
  });
});
