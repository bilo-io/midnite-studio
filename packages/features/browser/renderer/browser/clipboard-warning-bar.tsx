import { LuClipboardX, LuX } from 'react-icons/lu';

import { bridge } from '@midnite/studio-frame';

import { useBrowserStore } from '../browser-store';
import { IconButton } from '../ui';

/**
 * The ClickFix bar (Phase 117 Theme G). A page the user just clicked put a shell command on the
 * clipboard, which is how a "verify you are human" lure gets someone to paste malware into Terminal.
 * Main spotted the shape (`shared/clickfix.ts`); this bar says so plainly and offers to clear it.
 * It never shows the whole command, only the first line, so the bar is not itself a place to copy it from.
 */
export function ClipboardWarningBar() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const warning = useBrowserStore((s) => (activeTabId ? s.clipboardWarnings[activeTabId] : undefined));
  const setWarning = useBrowserStore((s) => s.setClipboardWarning);

  if (!warning) return null;

  const dismiss = () => setWarning(warning.tabId, undefined);
  const clear = () => {
    bridge()?.browser.clearClipboard({ tabId: warning.tabId });
    dismiss();
  };

  return (
    <div
      role="alert"
      data-testid="browser-clipboard-warning"
      className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-destructive/40 bg-card/95 px-3 py-2 backdrop-blur-xs shadow-md animate-in slide-in-from-top-2 duration-150"
    >
      <div className="flex min-w-0 items-center gap-2 pr-3">
        <LuClipboardX className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">
            <strong className="font-semibold">This page just put a command on your clipboard.</strong>{' '}
            {warning.origin ? <span className="text-muted-foreground">({warning.origin}) </span> : null}
            It {warning.label}. Do not paste it into Terminal or a Run box.
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title="The start of what was copied">
            {warning.preview}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded border border-destructive/40 bg-card px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          Clear clipboard
        </button>
        <IconButton icon={LuX} label="Dismiss" size="sm" onClick={dismiss} />
      </div>
    </div>
  );
}
