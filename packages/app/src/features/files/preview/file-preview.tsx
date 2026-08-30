import { lazy, Suspense, useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { LuFileQuestion } from 'react-icons/lu';

import { mgitFileUrl } from '@midnite/git-shared';

import { EmptyState } from '../../../components/empty-state';
import { languageForFile, previewKindForFile } from '../../../lib/languages';
import { bridge, hasBridge } from '../../../services/bridge';
import { keys } from '../../../services/queries';
import { useRepoStatus } from '../../../services/use-status';
import { useFileEditorStore } from '../../../store/file-editor-store';
import { IMAGE_CHECKERBOARD, ImageDiff } from '../../diff/image-diff';
import { differsFromHead, headToWorktreeImage } from '../../diff/image-sources';
import { PresentButton } from '../../slides/present-button';
import { type FsScopeInput } from '../file-tree';
import { useBlameStore } from './blame-store';
import { CodePreview } from './code-preview';
import { MarkdownPreview } from './markdown-preview';

// Code-split: CodeMirror is the one dependency this theme adds, and every
// other Files-view load (the common case — most opens never click Edit)
// should not pay to parse it.
const CodeEditor = lazy(() => import('./code-editor').then((m) => ({ default: m.CodeEditor })));

/**
 * The right-hand pane of the Files view: one file, rendered the best way its
 * type allows. Opens read-only; a repo-scope text file gets an Edit toggle
 * into a real `CodeEditor` (Phase 24 D) — `claude-home` and every non-text
 * kind stay read-only, with no toggle offered at all. Media never crosses
 * IPC — those render straight off `mgit-file://` (see fs-protocol.ts); only
 * text comes through `fs:readFile`, capped and sniffed in main.
 *
 * The component keys off a content DESCRIPTOR (scope + relPath), not a raw
 * path — the seam that later lets the commit inspector mount it against a
 * blob-at-commit source instead of the worktree.
 */
export type FilePreviewProps = {
  scope: FsScopeInput;
  relPath: string;
  /** A find-in-files result's line, to scroll to and briefly highlight. */
  targetLine?: number;
  /** Navigate to another file (e.g. from a relative markdown link). */
  onNavigate?: (relPath: string) => void;
};

export function FilePreview({ scope, relPath, targetLine, onNavigate }: FilePreviewProps) {
  const fileName = relPath.slice(relPath.lastIndexOf('/') + 1);
  const kind = previewKindForFile(fileName);
  // A search hit into a markdown file has nothing to scroll to in the
  // rendered view — force the source view so `targetLine` means something.
  const [showSource, setShowSource] = useState(targetLine !== undefined);
  useEffect(() => {
    if (targetLine !== undefined) setShowSource(true);
  }, [targetLine]);
  const [comparing, setComparing] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const dirty = useFileEditorStore((s) => s.target !== null && s.content !== s.savedContent);
  const saving = useFileEditorStore((s) => s.saving);
  const repoId = scope.scope === 'repo' ? scope.repoId : '';
  const fileKey = repoId ? `${repoId}:${relPath}` : '';
  const showBlame = useBlameStore((s) => Boolean(s.blameByFile[fileKey]));
  const toggleBlame = useBlameStore((s) => s.toggleBlame);
  const staleWrite = useFileEditorStore((s) => s.staleWrite);
  const saveError = useFileEditorStore((s) => s.saveError);

  /*
    Status, for one question only: does HEAD hold a different version of this
    image? A changed asset is the case where a browser is not enough — you can
    see what the picture is now and still not know what moved — so the pane
    offers the same before/after the diff pane does, off the same `?rev=` URLs.

    `useRepoStatus` is already fetched for this checkout by the sidebar and the
    Changes panel, so this is a cache read rather than another subprocess. In
    `claude-home` scope there is no repo and the query is disabled, which is why
    the target is built with a null repoId rather than the hook being skipped.
  */
  const status = useRepoStatus(
    scope.scope === 'repo'
      ? { repoId: scope.repoId, ...(scope.worktreePath ? { worktreePath: scope.worktreePath } : {}) }
      : { repoId: null },
  );
  const canCompare =
    kind === 'image' &&
    scope.scope === 'repo' &&
    differsFromHead(status.data?.entries.find((entry) => entry.path === relPath));

  const wantsText = kind === 'text' || kind === 'markdown';
  const { data } = useQuery({
    queryKey: [...keys.fs(scope), 'file', relPath],
    queryFn: async () => bridge()!.fs.readFile({ ...scope, relPath }),
    enabled: hasBridge() && wantsText,
  });

  // Editing is repo scope only — `claude-home` cannot be expressed in
  // `FsWriteScopeSchema` — and refused, visibly, for anything the read did
  // not come back as plain text (binary, too-large, error).
  const canEdit = scope.scope === 'repo' && data?.kind === 'text';
  const editorKey =
    scope.scope === 'repo' ? `${scope.repoId}:${scope.worktreePath ?? ''}:${relPath}` : null;

  // Opens/closes the store's editor target on the read↔edit transition only —
  // a background query refetch (e.g. the watcher noticing an external change)
  // must not clobber a buffer the user is actively typing into.
  useEffect(() => {
    if (!editing || scope.scope !== 'repo' || data?.kind !== 'text' || !editorKey) return;
    useFileEditorStore
      .getState()
      .openFile(
        { repoId: scope.repoId, worktreePath: scope.worktreePath, relPath, key: editorKey },
        data.content,
        data.version,
      );
    return () => useFileEditorStore.getState().closeFile(editorKey);
    // Deliberately keyed on `editing` alone — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const exitEditing = () =>
    useFileEditorStore.getState().guardNavigation(() => setEditing(false));

  const mediaUrl = mgitFileUrl(
    scope.scope,
    scope.scope === 'repo' ? scope.repoId : null,
    relPath,
    scope.scope === 'repo' ? scope.worktreePath : null,
  );

  const header = (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
      <span className="truncate font-mono text-xs" title={relPath}>
        {relPath}
      </span>
      {data?.kind === 'text' ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatSize(data.size)}
          {kind === 'text' && languageForFile(fileName) ? ` · ${languageForFile(fileName)}` : ''}
        </span>
      ) : null}
      {kind === 'image' && dims && !comparing ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {dims.width}×{dims.height}
        </span>
      ) : null}
      {editing && dirty ? (
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground" title="Unsaved changes">
          ●
        </span>
      ) : null}
      {canEdit ? (
        editing ? (
          <>
            <button
              type="button"
              onClick={() => void useFileEditorStore.getState().save()}
              disabled={!dirty || saving}
              className="ml-auto shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={exitEditing}
              className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
            >
              Done
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
          >
            Edit
          </button>
        )
      ) : (
        <span className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          read-only
        </span>
      )}
      {canCompare ? (
        <button
          type="button"
          onClick={() => setComparing((value) => !value)}
          aria-pressed={comparing}
          className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
        >
          {comparing ? 'Current' : 'Compare'}
        </button>
      ) : null}
      {kind === 'markdown' && data?.kind === 'text' && !editing ? (
        <>
          <button
            type="button"
            onClick={() => setShowSource((value) => !value)}
            aria-pressed={showSource}
            className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
          >
            {showSource ? 'Rendered' : 'Source'}
          </button>
          <PresentButton source={{ content: data.content, label: fileName }} />
        </>
      ) : null}
      {data?.kind === 'text' && !editing && repoId ? (
        <button
          type="button"
          onClick={() => toggleBlame(fileKey)}
          aria-pressed={showBlame}
          className={`shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] transition-colors ${
            showBlame ? 'bg-primary/20 text-primary font-medium border-primary/30' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          Blame
        </button>
      ) : null}
    </div>
  );

  const staleWriteBanner =
    editing && staleWrite ? (
      <div className="flex shrink-0 items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
        <span className="flex-1">
          {saveError ?? 'This file changed on disk since it was last read.'}
        </span>
        <button
          type="button"
          onClick={() => void useFileEditorStore.getState().reloadFromDisk()}
          className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 font-medium transition-colors hover:bg-destructive/20"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => useFileEditorStore.getState().dismissStaleWrite()}
          className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 transition-colors hover:bg-destructive/20"
        >
          Keep editing
        </button>
      </div>
    ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col">
        {kind === 'image' ? (
          comparing && scope.scope === 'repo' ? (
            /*
              The diff pane's viewer, unchanged: two-up, swipe and onion over
              HEAD → the file on disk. Nothing about it is diff-specific, and a
              second implementation here would drift from that one.
            */
            <ImageDiff
              sources={headToWorktreeImage(
                {
                  repoId: scope.repoId,
                  ...(scope.worktreePath ? { worktreePath: scope.worktreePath } : {}),
                },
                relPath,
              )}
            />
          ) : (
            <div
              className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
              style={{ background: IMAGE_CHECKERBOARD }}
            >
              <img
                src={mediaUrl}
                alt={fileName}
                className="max-h-full max-w-full object-contain"
                onLoad={(event) =>
                  setDims({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
              />
            </div>
          )
        ) : kind === 'video' ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            {/* Read-only preview surface; the media itself carries any captions. */}
            <video src={mediaUrl} controls className="max-h-full max-w-full" />
          </div>
        ) : kind === 'audio' ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <audio src={mediaUrl} controls />
          </div>
        ) : kind === 'pdf' ? (
          // Chromium's built-in viewer, fed the right content-type by the
          // protocol handler. If the sandbox refuses it, the iframe shows the
          // download UI — the agreed fallback, not a loosened sandbox.
          <iframe src={mediaUrl} title={fileName} className="min-h-0 flex-1 border-0" />
        ) : !data ? (
          <p className="p-4 text-xs text-muted-foreground">Loading…</p>
        ) : data.kind === 'text' ? (
          editing ? (
            <>
              {staleWriteBanner}
              <Suspense
                fallback={<p className="p-4 text-xs text-muted-foreground">Loading editor…</p>}
              >
                <CodeEditor fileName={fileName} />
              </Suspense>
            </>
          ) : kind === 'markdown' && !showSource ? (
            <MarkdownPreview
              content={data.content}
              label={fileName}
              currentRelPath={relPath}
              onNavigate={onNavigate}
            />
          ) : (
            <CodePreview
              content={data.content}
              language={languageForFile(fileName)}
              highlightLine={targetLine}
              showBlame={showBlame}
              repoId={repoId}
              relPath={relPath}
            />
          )
        ) : (
          <FallbackCard fileName={fileName} result={data} />
        )}
      </div>
    </div>
  );
}

function FallbackCard({
  fileName,
  result,
}: {
  fileName: string;
  result: { kind: 'binary' | 'too-large'; size: number } | { kind: 'error'; message: string };
}) {
  return (
    <EmptyState
      icon={LuFileQuestion}
      title={fileName}
      bodySize="xs"
      body={
        result.kind === 'error'
          ? result.message
          : result.kind === 'binary'
            ? `Binary file · ${formatSize(result.size)} — no preview for this type yet.`
            : `Too large to preview · ${formatSize(result.size)}.`
      }
    />
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
