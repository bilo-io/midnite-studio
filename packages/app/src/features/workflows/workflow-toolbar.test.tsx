import type { Workflow } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowToolbar } from './workflow-toolbar';

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'w1',
    name: 'My workflow',
    nodes: [],
    edges: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function noop() {}

describe('WorkflowToolbar', () => {
  afterEach(() => cleanup());

  it('shows the workflow name and a Saved indicator by default', () => {
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
      />,
    );
    expect(screen.getByText('My workflow')).not.toBeNull();
    expect(screen.getByText('Saved')).not.toBeNull();
  });

  it('shows Saving… while a save is in flight', () => {
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saving"
        mode="edit"
        onBackToEditing={noop}
      />,
    );
    expect(screen.getByText('Saving…')).not.toBeNull();
  });

  it('opens the details popover and renames through it', () => {
    const onRename = vi.fn();
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={onRename}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
      />,
    );
    fireEvent.click(screen.getByText('My workflow'));
    const input = screen.getByLabelText('Workflow name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed' } });
    expect(onRename).toHaveBeenCalledWith('Renamed');
  });

  it('toggles enabled and disables Run with a reason while disabled', () => {
    const onToggleEnabled = vi.fn();
    const onRun = vi.fn();
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled={false}
        onToggleEnabled={onToggleEnabled}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
        onRun={onRun}
      />,
    );
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(run.getAttribute('title')).toBe('This workflow is disabled.');

    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onToggleEnabled).toHaveBeenCalledWith(true);
  });

  it('runs when enabled and valid', () => {
    const onRun = vi.fn();
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
        onRun={onRun}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('opens run history on click, and wears the running glow while a run is in flight', () => {
    const onOpenHistory = vi.fn();
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={onOpenHistory}
        hasRunningRun
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
      />,
    );
    const history = screen.getByLabelText('Run history');
    expect(history.className).toContain('agent-run-glow');
    fireEvent.click(history);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('shows "Back to editing" instead of the history button in run mode', () => {
    const onBackToEditing = vi.fn();
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="run"
        onBackToEditing={onBackToEditing}
      />,
    );
    expect(screen.queryByLabelText('Run history')).toBeNull();
    fireEvent.click(screen.getByText('Back to editing'));
    expect(onBackToEditing).toHaveBeenCalledTimes(1);
  });

  it('calls onSaveAsTemplate from its own button', () => {
    const onSaveAsTemplate = vi.fn();
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={onSaveAsTemplate}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
      />,
    );
    fireEvent.click(screen.getByText('Save as template'));
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
  });

  it('hides Run entirely when no onRun is passed', () => {
    render(
      <WorkflowToolbar
        workflow={workflow()}
        onRename={noop}
        onDescriptionChange={noop}
        enabled
        onToggleEnabled={noop}
        onOpenHistory={noop}
        hasRunningRun={false}
        onSaveAsTemplate={noop}
        saveState="saved"
        mode="edit"
        onBackToEditing={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });
});
