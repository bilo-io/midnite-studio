import type { Workflow } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuCopy, LuHistory, LuLoaderCircle, LuPencil, LuPlay, LuX } from 'react-icons/lu';

import { SwitchRow } from '../../components/form/toggle-rows';
import { TextArea, TextField } from '../../components/form/field';
import { Popover } from '../../components/popover';

/**
 * The Workflows page header (Phase 95 Theme I, ported from midnite's
 * `workflow-page-header.tsx`) — sits above the palette/canvas/detail row,
 * carrying what the doc names as this port's toolbar behaviour: **edit
 * details** (a popover over name + description, not a modal — both are one
 * short field, and a modal for two text fields is more ceremony than the
 * edit), **run history**, **save-as-template**, an **enabled** toggle,
 * **Run**, a **Save/Saved** indicator riding the same autosave
 * `workflows-view.tsx` already debounces, and a busy spinner shared by both
 * "a save is in flight" and "a run is in flight".
 */
export function WorkflowToolbar({
  workflow,
  onRename,
  onDescriptionChange,
  enabled,
  onToggleEnabled,
  onOpenHistory,
  hasRunningRun,
  onSaveAsTemplate,
  saveState,
  mode,
  onBackToEditing,
  onRun,
  runDisabledReason,
  isRunning,
}: {
  workflow: Workflow;
  onRename: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  enabled: boolean;
  onToggleEnabled: (on: boolean) => void;
  onOpenHistory: () => void;
  hasRunningRun: boolean;
  onSaveAsTemplate: () => void;
  saveState: 'saved' | 'saving';
  mode: 'edit' | 'run';
  onBackToEditing: () => void;
  /** Absent hides Run entirely — only `mode === 'edit'` ever passes one. */
  onRun?: () => void;
  runDisabledReason?: string;
  isRunning?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
      <Popover
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        label="Edit workflow details"
        side="bottom"
        align="start"
        trigger={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-medium text-foreground">{workflow.name}</span>
            <LuPencil aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
          </span>
        }
      >
        <div className="flex w-72 flex-col gap-2 p-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Name</span>
            <TextField label="Workflow name" value={workflow.name} onChange={onRename} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Description</span>
            <TextArea
              label="Workflow description"
              value={workflow.description ?? ''}
              onChange={onDescriptionChange}
              rows={3}
              placeholder="What this workflow does…"
            />
          </label>
        </div>
      </Popover>

      <SwitchRow
        id="workflow-enabled"
        label="Enabled"
        title={enabled ? 'Disable this workflow — Run stays off until re-enabled.' : 'Re-enable this workflow.'}
        on={enabled}
        onToggle={(_id, on) => onToggleEnabled(on)}
        className="ml-1 w-auto shrink-0 gap-1.5"
      />

      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        {saveState === 'saving' ? <LuLoaderCircle aria-hidden className="h-3 w-3 animate-spin" /> : null}
        {saveState === 'saving' ? 'Saving…' : 'Saved'}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          title="Save as template — duplicates this workflow, ready to build another run from"
          onClick={onSaveAsTemplate}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuCopy aria-hidden className="h-3.5 w-3.5" />
          Save as template
        </button>

        {mode === 'run' ? (
          <button
            type="button"
            onClick={onBackToEditing}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LuX aria-hidden className="h-3 w-3" />
            Back to editing
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="Run history"
            className={`flex h-6 w-6 items-center justify-center rounded-md border border-transparent hover:bg-accent ${
              hasRunningRun ? 'agent-run-glow is-running' : ''
            }`}
          >
            <LuHistory aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}

        {onRun ? (
          <button
            type="button"
            disabled={Boolean(runDisabledReason) || isRunning || !enabled}
            title={!enabled ? 'This workflow is disabled.' : runDisabledReason}
            onClick={onRun}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {isRunning ? <LuLoaderCircle aria-hidden className="h-3 w-3 animate-spin" /> : <LuPlay aria-hidden className="h-3 w-3" />}
            {isRunning ? 'Running…' : 'Run'}
          </button>
        ) : null}
      </span>
    </div>
  );
}

