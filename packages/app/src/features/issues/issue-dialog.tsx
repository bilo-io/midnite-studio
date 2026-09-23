import { useEffect, useState } from 'react';

import { pickForgeRemote } from '@midnite/studio-shared';

import { Modal } from '../../components/modal';
import { WandField } from '../../components/wand-field';
import { useDialogs } from '../../components/dialog-host';
import {
  useActiveForgeCapability,
  useCreateIssue,
  useDeleteIssue,
  useEditIssue,
  useForgeIssueDetail,
  useRemotes,
} from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/** Create, or edit an existing issue by number. `linkedPrCount` (edit only)
 *  is the blast-radius number for its delete confirm — the card's own
 *  `item.content.linkedPrs.length` when opened from a project board, `0`
 *  when opened from anywhere else (nothing else in the app tracks it). */
export type IssueDialogMode =
  | { kind: 'create' }
  | { kind: 'edit'; number: number; linkedPrCount?: number };

/** Comma-separated free text, parsed to the list the write actually takes —
 *  `gh issue create --label/--assignee`'s own grammar, and the minimal field
 *  this theme's "fields shown per capability" bar asks for. A picker would
 *  need a new IPC read (the repo's labels/collaborators) this theme did not
 *  ask for. */
function parseList(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Create/edit an issue (Phase 95 Theme E) — `report-issue-dialog.tsx`'s shape
 * (a form on `Modal`, one `open`/`onClose` pair the caller owns), plus the
 * wand beside its two text fields and, in edit mode, the delete blast-radius
 * confirm Theme D deferred here.
 */
export function IssueDialog({
  open,
  onClose,
  repoId,
  worktreePath,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  repoId: string;
  worktreePath?: string | null | undefined;
  mode: IssueDialogMode;
}) {
  const dialogs = useDialogs();
  const { capability } = useActiveForgeCapability(repoId);
  const remotes = useRemotes(repoId);
  const forge = pickForgeRemote(remotes.data ?? [])?.forge ?? null;
  const repoName = forge ? `${forge.owner}/${forge.repo}` : '';
  const agentId = useUiStore((s) => s.primaryAgent);

  const isEdit = mode.kind === 'edit';
  const number = isEdit ? mode.number : null;
  const detail = useForgeIssueDetail(repoId, number, open && isEdit);

  const create = useCreateIssue(repoId);
  const edit = useEditIssue(repoId, number);
  const del = useDeleteIssue(repoId);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [labels, setLabels] = useState('');
  const [assignees, setAssignees] = useState('');
  const [milestone, setMilestone] = useState('');

  // Fresh draft every open, exactly `ReportIssueDialog`'s own reset effect —
  // and in edit mode, populated from the fetched detail once it lands.
  useEffect(() => {
    if (!open) return;
    create.reset();
    edit.reset();
    del.reset();
    if (!isEdit) {
      setTitle('');
      setBody('');
      setLabels('');
      setAssignees('');
      setMilestone('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only keys on `open`
  }, [open]);

  const fetchedIssue = detail.data && detail.data.issue ? detail.data.issue : null;

  useEffect(() => {
    if (!isEdit || fetchedIssue === null) return;
    const { issue, body: issueBody } = fetchedIssue;
    setTitle(issue.title);
    setBody(issueBody);
    setLabels(issue.labels.map((label) => label.name).join(', '));
    setAssignees(issue.assignees.join(', '));
    setMilestone(issue.milestone?.title ?? '');
    // Only when the fetched issue itself changes — typing must not be
    // clobbered by an unrelated re-render of this same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedIssue]);

  const trimmedTitle = title.trim();
  const loadingEdit = isEdit && detail.isLoading && fetchedIssue === null;
  const canSubmit = trimmedTitle.length > 0 && !create.isPending && !edit.isPending && !loadingEdit;

  const submit = () => {
    if (!canSubmit) return;
    if (isEdit) {
      edit.mutate(
        {
          title: trimmedTitle,
          body,
          labels: parseList(labels),
          assignees: parseList(assignees),
          milestone: milestone.trim().length > 0 ? milestone.trim() : null,
        },
        { onSuccess: (result) => result.ok && onClose() },
      );
    } else {
      create.mutate(
        {
          title: trimmedTitle,
          body,
          labels: parseList(labels),
          assignees: parseList(assignees),
          ...(milestone.trim() ? { milestone: milestone.trim() } : {}),
        },
        { onSuccess: (result) => result.ok && onClose() },
      );
    }
  };

  const requestDelete = () => {
    if (!isEdit) return;
    const count = mode.linkedPrCount ?? 0;
    dialogs.confirm({
      title: `Delete issue #${mode.number}?`,
      body: 'This removes it from GitHub entirely — it is not the same as closing it.',
      confirmLabel: 'Delete issue',
      danger: true,
      blastRadiusKind: 'issue',
      blastRadius: { count, sample: [] },
      onConfirm: () =>
        del.mutate({ number: mode.number }, { onSuccess: (result) => result.ok && onClose() }),
    });
  };

  const submitError = create.data && !create.data.ok ? (create.data.error ?? '') : '';
  const editError = edit.data && !edit.data.ok ? (edit.data.error ?? '') : '';
  const deleteError = del.data && !del.data.ok ? (del.data.error ?? '') : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit issue #${mode.number}` : 'New issue'}
      size="md"
      testId="issue-dialog"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">{isEdit ? `Edit issue #${mode.number}` : 'New issue'}</h2>

        {loadingEdit ? (
          <p className="text-xs text-muted-foreground">Reading the issue…</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Title</span>
              <WandField
                fieldName="title"
                value={title}
                onChange={setTitle}
                repoName={repoName}
                repoPath={worktreePath}
                agentId={agentId}
                otherFields={{ body }}
                inputProps={{ 'aria-label': 'Title' }}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Body</span>
              <WandField
                fieldName="body"
                value={body}
                onChange={setBody}
                repoName={repoName}
                repoPath={worktreePath}
                agentId={agentId}
                multiline
                rows={6}
                otherFields={{ title }}
                inputProps={{ 'aria-label': 'Body' }}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Labels (comma-separated)</span>
              <input
                aria-label="Labels"
                value={labels}
                onChange={(event) => setLabels(event.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Assignees (comma-separated)</span>
              <input
                aria-label="Assignees"
                value={assignees}
                onChange={(event) => setAssignees(event.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Milestone</span>
              <input
                aria-label="Milestone"
                value={milestone}
                onChange={(event) => setMilestone(event.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </>
        )}

        {submitError || editError || deleteError ? (
          <p role="alert" className="text-xs text-destructive">
            {submitError || editError || deleteError}
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-end gap-2">
          {isEdit && capability?.ops.deleteIssue ? (
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
