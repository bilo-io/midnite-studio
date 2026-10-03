import { useEffect, useMemo, useState } from 'react';

import type { ChatChangeDecision, ChatChangedFile, FileDiff } from '@midnite/studio-shared';
import { LuCheck, LuTriangleAlert, LuX } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { Modal } from '../../components/modal';
import { bridge } from '../../services/bridge';
import { useToastStore } from '../../store/toast-store';
import { DiffView } from '../diff/diff-view';
import { ChangeStatusChip, Counts, FILE_KIND_ICON } from './chat-changes-card';
import { decisionsFor, fileDecision, fileNeedsDecision } from './chat-changes';
import { useChatsStore } from './chats-store';

/**
 * The review modal: every file the agent changed, its full diff, and the
 * decisions — accept or reject per file and per hunk, plus accept-all and
 * reject-all. It reuses the git client's own `DiffView` (virtualised rows,
 * intraline marks, syntax highlighting, unified/split), adding only the
 * per-hunk controls through its `renderHunkActions` slot.
 *
 * Every click is one `resolveChanges` call and takes effect immediately: an
 * accept applies that file or hunk to the real checkout as a patch (through the
 * per-repo write queue in main), a reject only marks it. The change set shown
 * is read live from the store, so a result — including a conflict — is on screen
 * the moment main answers; nothing here keeps a second copy of the status.
 */

export function ChatChangesModal({
  chatId,
  changeSetId,
  onClose,
}: {
  chatId: string;
  changeSetId: string;
  onClose: () => void;
}) {
  const changeSet = useChatsStore((s) => {
    for (const message of s.chats[chatId]?.messages ?? []) if (message.changeSet?.id === changeSetId) return message.changeSet;
    return undefined;
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const diffs = useChangeDiffs(chatId, changeSetId);

  const files = changeSet?.files ?? [];
  const current = files.find((f) => f.path === selectedPath) ?? files[0];
  const diff = current ? diffs.byPath.get(current.path) : undefined;

  const resolve = async (decisions: ChatChangeDecision[]) => {
    if (decisions.length === 0 || busy) return;
    setBusy(true);
    try {
      const result = await useChatsStore.getState().resolveChanges(chatId, changeSetId, decisions);
      if (result.ok) setConflicts([]);
      else if (result.kind === 'conflict') setConflicts(result.files);
      else useToastStore.getState().addToast({ message: result.message, status: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!changeSet) return null;
  const insertions = files.reduce((n, f) => n + f.insertions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  const remaining = files.filter(fileNeedsDecision).length;

  return (
    <Modal open onClose={onClose} title="Review changes" size="lg" testId="chat-changes-modal">
      <div className="flex h-[min(80vh,760px)] min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold">Review changes</h2>
          <span className="text-xs text-muted-foreground">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
          <Counts insertions={insertions} deletions={deletions} />
          <ChangeStatusChip status={changeSet.status} testId="chat-modal-status" />
          <span className="flex-1" />
          <button
            type="button"
            disabled={busy || remaining === 0}
            onClick={() => void resolve(decisionsFor(changeSet, 'reject'))}
            data-testid="chat-modal-reject-all"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <LuX aria-hidden className="h-3.5 w-3.5" /> Reject all
          </button>
          <button
            type="button"
            disabled={busy || remaining === 0}
            onClick={() => void resolve(decisionsFor(changeSet, 'accept'))}
            data-testid="chat-modal-accept-all"
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <LuCheck aria-hidden className="h-3.5 w-3.5" /> Accept all
          </button>
          <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} />
        </header>

        {conflicts.length > 0 ? (
          <p role="alert" data-testid="chat-modal-conflict" className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <LuTriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {conflicts.length === 1 ? 'One file' : `${conflicts.length} files`} could not be applied because your working tree
              changed since the agent made them: {conflicts.join(', ')}. Everything else went through. Reject the conflicting
              {conflicts.length === 1 ? ' file' : ' files'}, or fix your working tree and accept again.
            </span>
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <ul role="listbox" aria-label="Changed files" className="hide-scrollbar w-60 shrink-0 overflow-auto border-r border-border">
            {files.map((file) => {
              const Icon = FILE_KIND_ICON[file.change];
              const selected = file.path === current?.path;
              return (
                <li key={file.path} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-testid="chat-modal-file"
                    data-status={file.status}
                    onClick={() => setSelectedPath(file.path)}
                    className={`flex w-full flex-col gap-0.5 border-l-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                      selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
                        {file.path}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 pl-5">
                      <Counts insertions={file.insertions} deletions={file.deletions} />
                      {file.status !== 'pending' ? <ChangeStatusChip status={file.status} /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex min-w-0 flex-1 flex-col">
            {current ? (
              <FilePane
                file={current}
                diff={diff}
                loading={diffs.loading}
                error={diffs.error}
                busy={busy}
                onDecide={(decision) => void resolve([decision])}
              />
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function FilePane({
  file,
  diff,
  loading,
  error,
  busy,
  onDecide,
}: {
  file: ChatChangedFile;
  diff: FileDiff | undefined;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onDecide: (decision: ChatChangeDecision) => void;
}) {
  const needs = fileNeedsDecision(file);
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        <ChangeStatusChip status={file.status} testId="chat-modal-file-status" />
        <button
          type="button"
          disabled={busy || !needs}
          onClick={() => onDecide(fileDecision(file, 'reject'))}
          data-testid="chat-modal-reject-file"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <LuX aria-hidden className="h-3 w-3" /> Reject file
        </button>
        <button
          type="button"
          disabled={busy || !needs}
          onClick={() => onDecide(fileDecision(file, 'accept'))}
          data-testid="chat-modal-accept-file"
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <LuCheck aria-hidden className="h-3 w-3" /> Accept file
        </button>
      </div>
      {file.conflict ? (
        <p data-testid="chat-modal-file-conflict" className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {file.conflict}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        {error ? (
          <p className="p-3 text-xs text-destructive">{error}</p>
        ) : file.binary ? (
          <p className="p-3 text-xs text-muted-foreground">Binary file — accept or reject it as a whole.</p>
        ) : (
          <DiffView
            diff={diff}
            isLoading={loading}
            emptyMessage="This change has no textual diff (a mode change, for instance)."
            renderHunkActions={(index) => {
              const hunk = file.hunks[index];
              if (!hunk) return null;
              return (
                <>
                  <span className="mr-1 tabular-nums">Hunk {index + 1}</span>
                  {hunk.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Reject hunk ${index + 1}`}
                        data-testid={`chat-modal-reject-hunk-${index}`}
                        onClick={() => onDecide(fileDecision(file, 'reject', index))}
                        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        <LuX aria-hidden className="h-3 w-3" /> Reject
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Accept hunk ${index + 1}`}
                        data-testid={`chat-modal-accept-hunk-${index}`}
                        onClick={() => onDecide(fileDecision(file, 'accept', index))}
                        className="flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        <LuCheck aria-hidden className="h-3 w-3" /> Accept
                      </button>
                    </>
                  ) : (
                    <span data-testid={`chat-modal-hunk-status-${index}`} className={hunk.status === 'accepted' ? 'text-success' : ''}>
                      {hunk.status === 'accepted' ? 'Accepted' : 'Rejected'}
                    </span>
                  )}
                </>
              );
            }}
          />
        )}
      </div>
    </>
  );
}

/** The parsed per-file diffs of one change set, fetched once when the modal opens. */
function useChangeDiffs(chatId: string, changeSetId: string): { byPath: Map<string, FileDiff>; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ files: { path: string; diff: FileDiff }[] | null; error: string | null }>({ files: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ files: null, error: null });
    const api = bridge();
    if (!api) {
      setState({ files: null, error: 'The app bridge is unavailable.' });
      return undefined;
    }
    void api.chats.changeDiffs({ chatId, changeSetId }).then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ files: result.value.files, error: null });
      else setState({ files: null, error: result.kind === 'error' ? result.message : 'Could not load the diff.' });
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, changeSetId]);

  const byPath = useMemo(() => new Map((state.files ?? []).map((f) => [f.path, f.diff])), [state.files]);
  return { byPath, loading: state.files === null && state.error === null, error: state.error };
}

