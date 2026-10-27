import { LuDownload, LuX } from 'react-icons/lu';

import { bridge } from '@midnite/studio-frame';

import { useBrowserStore } from '../browser-store';
import { IconButton } from '../ui';

const CLASS_LABELS: Record<string, string> = {
  'disk-image': 'a disk image',
  installer: 'an installer',
  script: 'a script',
  executable: 'an application',
  archive: 'an archive',
  other: 'a file of unknown type',
};

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'unknown size';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** The confirm for a download the policy flagged (Phase 117 Theme D) — same bar as a permission prompt. */
export function DownloadPromptBar() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const prompt = useBrowserStore((s) => (activeTabId ? s.pendingDownloadRequests[activeTabId] : undefined));
  const setPending = useBrowserStore((s) => s.setPendingDownloadRequest);

  if (!prompt) return null;

  const answer = (decision: 'allow' | 'deny') => {
    bridge()?.browser.respondDownload({ requestId: prompt.requestId, decision });
    setPending(prompt.tabId, undefined);
  };

  return (
    <div
      data-testid="browser-download-bar"
      className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-3 py-2 backdrop-blur-xs shadow-md animate-in slide-in-from-top-2 duration-150"
    >
      <div className="flex min-w-0 items-center gap-2 pr-3">
        <LuDownload className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate text-xs text-foreground">
          Save <strong className="font-semibold">{prompt.filename}</strong> ({formatBytes(prompt.size)}) from{' '}
          <strong className="font-semibold">{prompt.origin || 'an unknown site'}</strong>? It is{' '}
          {CLASS_LABELS[prompt.fileClass] ?? 'a file'} and will go to quarantine, never opened.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => answer('deny')}
          className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => answer('allow')}
          className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Save
        </button>
        <IconButton icon={LuX} label="Cancel download" size="sm" onClick={() => answer('deny')} />
      </div>
    </div>
  );
}
