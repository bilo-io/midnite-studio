import { useEffect, useState } from 'react';

import { Modal } from '../../components/modal';
import { WandField } from '../../components/wand-field';
import { useDialogs } from '../../components/dialog-host';
import { useActiveForgeCapability, useCreateProject, useDeleteProject, useEditProject } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/** Create, or edit an existing board. `itemCount` (edit only) is the
 *  blast-radius number for its delete confirm — the caller's own already-
 *  fetched board item count (`useForgeProjectItems`), never re-fetched here:
 *  the dialog only ever opens on the board the caller has selected, which
 *  has already paid for that read. */
export type ProjectDialogMode =
  | { kind: 'create' }
  | { kind: 'edit'; projectId: string; title: string; closed: boolean; itemCount: number };

export function ProjectDialog({
  open,
  onClose,
  repoId,
  repoName,
  mode,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  repoId: string;
  /** For the wand's prompt only — "owner/name", never a `repoId`. */
  repoName: string;
  mode: ProjectDialogMode;
  /** Fired with the new board's node id on a successful create, so the
   *  caller can select it immediately rather than leave the picker on
   *  "Pick a board…" until the next listing refresh. */
  onCreated?: (projectId: string) => void;
}) {
  const dialogs = useDialogs();
  const { capability } = useActiveForgeCapability(repoId);
  const agentId = useUiStore((s) => s.primaryAgent);

  const isEdit = mode.kind === 'edit';

  const create = useCreateProject(repoId);
  const edit = useEditProject(repoId);
  const del = useDeleteProject(repoId);

  const [title, setTitle] = useState('');
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!open) return;
    create.reset();
    edit.reset();
    del.reset();
    setTitle(isEdit ? mode.title : '');
    setClosed(isEdit ? mode.closed : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only keys on `open`
  }, [open]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !create.isPending && !edit.isPending;

  const submit = () => {
    if (!canSubmit) return;
    if (isEdit) {
      const titleChanged = trimmedTitle !== mode.title;
      const closedChanged = closed !== mode.closed;
      if (!titleChanged && !closedChanged) {
        onClose();
        return;
      }
      edit.mutate(
        {
          projectId: mode.projectId,
          ...(titleChanged ? { title: trimmedTitle } : {}),
          ...(closedChanged ? { closed } : {}),
        },
        { onSuccess: (result) => result.ok && onClose() },
      );
    } else {
      create.mutate(
        { title: trimmedTitle },
        {
          onSuccess: (result) => {
            if (!result.ok) return;
            onCreated?.(result.project.id);
            onClose();
          },
        },
      );
    }
  };

  const requestDelete = () => {
    if (!isEdit) return;
    dialogs.confirm({
      title: `Delete "${mode.title}"?`,
      body: 'GitHub project deletion is irreversible.',
      confirmLabel: 'Delete board',
      danger: true,
      blastRadiusKind: 'project',
      blastRadius: { count: mode.itemCount, sample: [] },
      onConfirm: () =>
        del.mutate({ projectId: mode.projectId }, { onSuccess: (result) => result.ok && onClose() }),
    });
  };

  const createError =
    create.data && !create.data.ok
      ? create.data.kind === 'error'
        ? create.data.message
        : create.data.hint
      : '';
  const editError =
    edit.data && !edit.data.ok ? (edit.data.kind === 'error' ? edit.data.message : edit.data.hint) : '';
  const deleteError =
    del.data && !del.data.ok ? (del.data.kind === 'error' ? del.data.message : del.data.hint) : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit board' : 'New board'}
      size="sm"
      testId="project-dialog"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">{isEdit ? 'Edit board' : 'New board'}</h2>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Title</span>
          <WandField
            fieldName="title"
            value={title}
            onChange={setTitle}
            repoName={repoName}
            agentId={agentId}
            inputProps={{ 'aria-label': 'Title' }}
          />
        </label>

        {isEdit ? (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={closed}
              onChange={(event) => setClosed(event.target.checked)}
            />
            <span>Closed</span>
          </label>
        ) : null}

        {createError || editError || deleteError ? (
          <p role="alert" className="text-xs text-destructive">
            {createError || editError || deleteError}
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-end gap-2">
          {isEdit && capability?.ops.deleteProject ? (
            <button
              type="button"
              onClick={requestDelete}
              disabled={del.isPending}
              className="mr-auto rounded-md px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isEdit ? (edit.isPending ? 'Saving…' : 'Save') : create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
