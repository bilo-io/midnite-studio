import type { Workflow } from '@midnite/studio-shared';
import { useRef } from 'react';
import { LuCopy, LuDownload, LuPlus, LuTrash2, LuUpload, LuWorkflow } from 'react-icons/lu';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { useToastStore } from '../../store/toast-store';
import { useDeleteWorkflow, useSaveWorkflow, useWorkflows } from './use-workflow';
import {
  cloneWorkflowWithFreshIds,
  createEmptyWorkflow,
  exportWorkflowFilename,
  exportWorkflowJson,
  parseImportedWorkflow,
} from './workflow-io';

/**
 * The workflow list (Phase 43 Theme H) — `workflows-view.tsx`'s left rail,
 * modelled directly on `council-list.tsx`: same header shape, same empty
 * state, same row. Duplicate/Export/Delete live on the row's context menu
 * rather than as always-visible buttons, matching every other list in this
 * app (`repos-panel.tsx`, `tab-strip.tsx`) rather than inventing a hover
 * toolbar for this one.
 */
export function WorkflowList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const workflows = useWorkflows();
  const save = useSaveWorkflow();
  const remove = useDeleteWorkflow();
  const dialogs = useDialogs();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rows: Workflow[] = workflows.data ?? [];

  const createNewWorkflow = () => {
    const workflow = createEmptyWorkflow(Date.now());
    save.mutate(workflow, {
      onSuccess: (result) => {
        if (result.ok) onSelect(workflow.id);
      },
    });
  };

  const duplicate = (workflow: Workflow) => {
    const clone = cloneWorkflowWithFreshIds(workflow, Date.now(), `${workflow.name} (copy)`);
    save.mutate(clone, {
      onSuccess: (result) => {
        if (result.ok) onSelect(clone.id);
      },
    });
  };

  // No IPC save-dialog exists for this — see `workflow-io.ts`'s docblock.
  const exportWorkflow = (workflow: Workflow) => {
    const url = URL.createObjectURL(new Blob([exportWorkflowJson(workflow)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportWorkflowFilename(workflow);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFromFile = async (file: File) => {
    const result = parseImportedWorkflow(await file.text(), Date.now());
    if (!result.ok) {
      useToastStore.getState().addToast({ message: `Could not import: ${result.error}`, status: 'error' });
      return;
    }
    save.mutate(result.workflow, {
      onSuccess: (saved) => {
        if (saved.ok) onSelect(result.workflow.id);
      },
    });
  };

  const deleteWorkflow = (workflow: Workflow) => {
    dialogs.confirm({
      title: `Delete "${workflow.name}"?`,
      body: `This removes its ${workflow.nodes.length} node${workflow.nodes.length === 1 ? '' : 's'} and run history. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      // Known and finite already, unlike a git blast radius — nothing to
      // count asynchronously, so `null` skips the dialog's "Checking what
      // this affects…" line rather than leaving it stuck showing forever.
      blastRadius: null,
      onConfirm: () => remove.mutate(workflow.id),
    });
  };

  const menuFor = (workflow: Workflow): MenuItem[] => [
    { label: 'Duplicate', icon: LuCopy, onSelect: () => duplicate(workflow) },
    { label: 'Export…', icon: LuDownload, onSelect: () => exportWorkflow(workflow) },
    { type: 'separator' },
    { label: 'Delete', icon: LuTrash2, danger: true, onSelect: () => deleteWorkflow(workflow) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workflows</h2>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">{rows.length}</span>
        <IconButton
          icon={LuUpload}
          label="Import workflow"
          size="sm"
          className="ml-auto"
          onClick={() => fileInputRef.current?.click()}
        />
        <IconButton icon={LuPlus} label="New workflow" size="sm" onClick={createNewWorkflow} />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFromFile(file);
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {workflows.isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={LuWorkflow} title="No workflows yet" body="Create one to get started." />
        ) : (
          rows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => onSelect(workflow.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                dialogs.openMenu(event, menuFor(workflow));
              }}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2 py-2 text-left transition-colors hover:bg-accent ${
                selectedId === workflow.id ? 'bg-accent' : ''
              }`}
            >
              <span className="truncate text-xs font-medium text-foreground">{workflow.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {workflow.nodes.length} node{workflow.nodes.length === 1 ? '' : 's'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
