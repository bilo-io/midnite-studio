import type { ChatChangeSet, ChatChangeStatus, ChatChangedFile } from '@midnite/studio-shared';
import { changeSetNeedsReview } from '@midnite/studio-shared';
import { LuCheck, LuCircleCheck, LuCircleX, LuFileDiff, LuFileMinus, LuFilePen, LuFilePlus, LuTriangleAlert, LuX } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';

/**
 * The inline "changes" card in the thread: what the agent changed, at a glance,
 * and the way into the review modal.
 *
 * The summary half is ONE button — the whole card is the target for "open the
 * larger diff", as the brief puts it — and the quick Accept all / Reject all
 * sit below it as siblings (a button inside a button is invalid, and a mis-click
 * on a file row must never apply anything). Nothing here talks to main: the
 * page passes `onOpen` and `onResolveAll`.
 */

export const CHANGE_STATUS_LABEL: Record<ChatChangeStatus, string> = {
  pending: 'Pending review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  partial: 'Partially accepted',
  conflict: 'Conflict',
};

const STATUS_TONE: Record<ChatChangeStatus, string> = {
  pending: 'bg-primary/10 text-primary',
  accepted: 'bg-success/15 text-success',
  rejected: 'bg-muted text-muted-foreground',
  partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  conflict: 'bg-destructive/15 text-destructive',
};

const STATUS_ICON: Record<ChatChangeStatus, IconComponent> = {
  pending: LuFileDiff,
  accepted: LuCircleCheck,
  rejected: LuCircleX,
  partial: LuCircleCheck,
  conflict: LuTriangleAlert,
};

export function ChangeStatusChip({ status, testId }: { status: ChatChangeStatus; testId?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      data-testid={testId}
      data-status={status}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[status]}`}
    >
      <Icon aria-hidden className="h-3 w-3" />
      {CHANGE_STATUS_LABEL[status]}
    </span>
  );
}

export const FILE_KIND_ICON: Record<ChatChangedFile['change'], IconComponent> = {
  added: LuFilePlus,
  deleted: LuFileMinus,
  modified: LuFilePen,
  renamed: LuFilePen,
  copied: LuFilePlus,
  'type-changed': LuFilePen,
};

export function Counts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums">
      <span className="text-success">+{insertions}</span> <span className="text-destructive">−{deletions}</span>
    </span>
  );
}

const VISIBLE_FILES = 4;
const PREVIEWED_FILES = 2;

export function ChatChangesCard({
  changeSet,
  onOpen,
  onResolveAll,
  busy = false,
}: {
  changeSet: ChatChangeSet;
  onOpen: () => void;
  onResolveAll: (action: 'accept' | 'reject') => void;
  busy?: boolean;
}) {
  const insertions = changeSet.files.reduce((n, f) => n + f.insertions, 0);
  const deletions = changeSet.files.reduce((n, f) => n + f.deletions, 0);
  const shown = changeSet.files.slice(0, VISIBLE_FILES);
  const hidden = changeSet.files.length - shown.length;
  const needsReview = changeSetNeedsReview(changeSet);
  const fileLabel = `${changeSet.files.length} file${changeSet.files.length === 1 ? '' : 's'} changed`;

  return (
    <section
      aria-label="Proposed changes"
      data-testid="chat-changes-card"
      data-status={changeSet.status}
      className={`mt-2 overflow-hidden rounded-lg border bg-card ${changeSet.status === 'conflict' ? 'border-destructive/50' : 'border-border'}`}
    >
      <button
        type="button"
        onClick={onOpen}
        data-testid="chat-changes-open"
        aria-label={`Review ${fileLabel}`}
        className="block w-full text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
      >
        <span className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
          <LuFileDiff aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">{fileLabel}</span>
          <Counts insertions={insertions} deletions={deletions} />
          <span className="ml-auto" />
          <ChangeStatusChip status={changeSet.status} testId="chat-changes-status" />
        </span>
        <span className="block">
          {shown.map((file, index) => {
            const Icon = FILE_KIND_ICON[file.change];
            return (
              <span key={file.path} className="block border-b border-border/40 last:border-b-0" data-testid="chat-changes-file">
                <span className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
                    {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                  </span>
                  <Counts insertions={file.insertions} deletions={file.deletions} />
                  {file.status !== 'pending' ? <ChangeStatusChip status={file.status} /> : null}
                </span>
                {index < PREVIEWED_FILES && file.preview.length > 0 ? (
                  <span className="block bg-muted/30 px-3 py-1 font-mono text-[11px] leading-[16px]" data-testid="chat-changes-preview">
                    {file.preview.slice(0, 4).map((line, i) => (
                      <span
                        key={i}
                        className={`block truncate ${line.startsWith('+') ? 'text-success' : line.startsWith('-') ? 'text-destructive' : 'text-muted-foreground'}`}
                      >
                        {line}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            );
          })}
          {hidden > 0 ? <span className="block px-3 py-1.5 text-[11px] text-muted-foreground">+ {hidden} more file{hidden === 1 ? '' : 's'}</span> : null}
        </span>
      </button>
      <div className="flex items-center gap-1.5 border-t border-border/60 px-2 py-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {needsReview ? 'Review changes' : 'View changes'}
        </button>
        <span className="flex-1" />
        {needsReview ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolveAll('reject')}
              data-testid="chat-changes-reject-all"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <LuX aria-hidden className="h-3 w-3" /> Reject all
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolveAll('accept')}
              data-testid="chat-changes-accept-all"
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <LuCheck aria-hidden className="h-3 w-3" /> Accept all
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
