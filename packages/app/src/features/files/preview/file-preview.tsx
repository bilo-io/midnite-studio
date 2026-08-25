import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { LuFileQuestion } from 'react-icons/lu';

import { mgitFileUrl } from '@midnite/git-shared';

import { languageForFile, previewKindForFile } from '../../../lib/languages';
import { bridge, hasBridge } from '../../../services/bridge';
import { fsScopeKey, type FsScopeInput } from '../file-tree';
import { CodePreview } from './code-preview';
import { MarkdownPreview } from './markdown-preview';

/**
 * The right-hand pane of the Folder view: one file, rendered the best way its
 * type allows, read-only throughout. Media never crosses IPC — those render
 * straight off `mgit-file://` (see fs-protocol.ts); only text comes through
 * `fs:readFile`, capped and sniffed in main.
 *
 * The component keys off a content DESCRIPTOR (scope + relPath), not a raw
 * path — the seam that later lets the commit inspector mount it against a
 * blob-at-commit source instead of the worktree.
 */
export type FilePreviewProps = {
  scope: FsScopeInput;
  relPath: string;
};

export function FilePreview({ scope, relPath }: FilePreviewProps) {
  const fileName = relPath.slice(relPath.lastIndexOf('/') + 1);
  const kind = previewKindForFile(fileName);
  const [showSource, setShowSource] = useState(false);

  const wantsText = kind === 'text' || kind === 'markdown';
  const { data } = useQuery({
    queryKey: [...fsScopeKey(scope), 'file', relPath],
    queryFn: async () => bridge()!.fs.readFile({ ...scope, relPath }),
    enabled: hasBridge() && wantsText,
  });

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
      <span className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
        read-only
      </span>
      {kind === 'markdown' && data?.kind === 'text' ? (
        <button
          type="button"
          onClick={() => setShowSource((value) => !value)}
          aria-pressed={showSource}
          className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
        >
          {showSource ? 'Rendered' : 'Source'}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col">
        {kind === 'image' ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            <img src={mediaUrl} alt={fileName} className="max-h-full max-w-full object-contain" />
          </div>
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
          kind === 'markdown' && !showSource ? (
            <MarkdownPreview content={data.content} />
          ) : (
            <CodePreview content={data.content} language={languageForFile(fileName)} />
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
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <LuFileQuestion aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-medium">{fileName}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {result.kind === 'error'
          ? result.message
          : result.kind === 'binary'
            ? `Binary file · ${formatSize(result.size)} — no preview for this type yet.`
            : `Too large to preview · ${formatSize(result.size)}.`}
      </p>
    </div>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
