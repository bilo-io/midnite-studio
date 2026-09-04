import type { ForgeIssue, ForgeProjectWriteResult } from '@midnite/studio-shared';
import { LuCircleCheck, LuKanban, LuMessageSquare, LuRotateCcw } from 'react-icons/lu';
import { useState, type MouseEvent } from 'react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { Spinner } from '../../components/skeleton';
import { useAddProjectItem, useCommentIssue, useForgeProjects, useSetIssueState } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/**
 * Everything this app can change about an issue, in one row (Phase 54 Theme G).
 *
 * **Two writes, and only two — comment and close/reopen** — plus "Add to
 * project ▸" (Theme F), reusing `useAddProjectItem` and the board picker
 * `ReviewActionBar` already built rather than a second implementation.
 * Labels, assignees and milestone editing are out of scope: each needs its
 * own picker over its own remote vocabulary, which is the reason
 * `ReviewActionBar` is 561 lines and this one is not.
 *
 * Same gate, same envelope discipline as `ReviewActionBar`:
 * `forgeWritesEnabled` disables every control here too — one switch for every
 * write this app makes, not a second one to discover — and nothing is
 * optimistic; a close that appeared before `gh` accepted it would be the app
 * lying at exactly the moment trust matters.
 */
export function IssueActionBar({ repoId, issue }: { repoId: string; issue: ForgeIssue }) {
  const enabled = useUiStore((s) => s.forgeWritesEnabled);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');

  const comment = useCommentIssue(repoId, issue.number);
  const setState = useSetIssueState(repoId, issue.number);

  /*
    "Add to project" reuses exactly the data `ReviewActionBar`'s own menu
    reads — the repo's boards and the per-repo `boardByRepo` memory — rather
    than a second picker component. See that file's identical comment for why
    this is fetched unconditionally rather than gated behind the menu opening.
  */
  const boards = useForgeProjects(repoId, true);
  const boardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const setProjectBoard = useUiStore((s) => s.setProjectBoard);
  const addToProject = useAddProjectItem();
  const dialogs = useDialogs();

  const openProjectMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const list = boards.data?.projects ?? [];
    const lastPicked = boardByRepo[repoId];
    const items: MenuItem[] =
      list.length > 0
        ? list.map((board) => ({
            label: board.title + (board.id === lastPicked ? ' (last used)' : ''),
            onSelect: () => {
              setProjectBoard(repoId, board.id);
              addToProject.mutate({ projectId: board.id, contentId: issue.id });
            },
          }))
        : [{ label: 'No projects for this repo', disabled: true, onSelect: () => {} }];
    dialogs.openMenu({ clientX: rect.left, clientY: rect.bottom }, items);
  };

  const busy = comment.isPending || setState.isPending || addToProject.isPending;
  const problem =
    failureOf(comment) ?? failureOf(setState) ?? projectWriteFailure(addToProject.data);

  const submit = () => {
    if (body.trim().length === 0) return;
    comment.mutate(
      { body },
      {
        onSuccess: (result) => {
          if (!result.ok) return;
          setComposing(false);
          setBody('');
        },
      },
    );
  };

  const closing = issue.state === 'open';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          icon={LuMessageSquare}
          label="Comment on the conversation"
          shortLabel="Comment"
          enabled={enabled}
          disabled={busy}
          pressed={composing}
          onClick={() => setComposing((open) => !open)}
        />

        <ActionButton
          icon={closing ? LuCircleCheck : LuRotateCcw}
          label={closing ? 'Close this issue' : 'Reopen this issue'}
          shortLabel={closing ? 'Close' : 'Reopen'}
          enabled={enabled}
          disabled={busy}
          onClick={() => setState.mutate({ state: closing ? 'closed' : 'open' })}
        />

        <ActionButton
          icon={LuKanban}
          label="Add to project ▸"
          shortLabel="Add to project"
          enabled={enabled}
          // `isLoading`, not `isFetching` — see `ReviewActionBar`'s identical
          // comment on the same gate.
          disabled={busy || boards.isLoading}
          onClick={openProjectMenu}
        />

        {!enabled ? (
          <span className="text-[11px] text-muted-foreground">
            Issue actions are off — turn them on in Settings → Reviews.
          </span>
        ) : null}
      </div>

      {composing ? (
        <div className="flex flex-col gap-1.5 rounded border border-border bg-muted/30 p-2">
          <label htmlFor="issue-comment-body" className="text-[11px] text-muted-foreground">
            Comment on the conversation (required)
          </label>
          <textarea
            id="issue-comment-body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Markdown, as GitHub renders it."
            className="resize-y rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setBody('');
              }}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || body.trim().length === 0}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {comment.isPending ? (
                <>
                  <Spinner className="size-3 border-primary-foreground/30 border-r-primary-foreground border-t-primary-foreground" />
                  Submitting…
                </>
              ) : (
                'Comment'
              )}
            </button>
          </div>
        </div>
      ) : null}

      {problem !== null ? (
        <p role="alert" className="text-[11px] leading-relaxed text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  shortLabel,
  enabled,
  disabled,
  pressed,
  onClick,
}: {
  icon: typeof LuMessageSquare;
  label: string;
  shortLabel?: string;
  enabled: boolean;
  disabled: boolean;
  pressed?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled || disabled}
      aria-pressed={pressed}
      onClick={onClick}
      title={enabled ? label : `${label} — enable issue actions in Settings → Reviews`}
      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {shortLabel ?? label}
    </button>
  );
}

/** Same reading as `ReviewActionBar`'s own `failureOf` — see its doc comment. */
function failureOf(mutation: {
  data?: { ok: boolean; error: string | null; cli: { reason: string; hint: string } };
}): string | null {
  const result = mutation.data;
  if (result === undefined || result.ok) return null;
  if (result.error !== null) return result.error;
  if (result.cli.reason !== 'ready') {
    return result.cli.hint.length > 0 ? result.cli.hint : 'The GitHub CLI is not available.';
  }
  return 'The GitHub CLI could not complete that request.';
}

/** Same envelope as `ReviewActionBar`'s own `projectWriteFailure`. */
function projectWriteFailure(result: ForgeProjectWriteResult | undefined): string | null {
  if (result === undefined || result.ok) return null;
  return result.kind === 'insufficient-scope' ? result.hint : result.message;
}
