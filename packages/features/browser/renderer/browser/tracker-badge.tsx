import { useState } from 'react';
import { LuShieldCheck } from 'react-icons/lu';

import { bridge } from '@midnite/studio-frame';

import { useBrowserStore } from '../browser-store';

/**
 * The blocked-request counter (Phase 117 Theme E): a shield with the count for the active page and
 * a popover listing the blocked hosts, with a per-site exception.
 *
 * Interim: the end state is ONE badge — Theme C's `site-badge.tsx`, fed by
 * `SiteVerdict.trackersBlocked`. Whichever of the two PRs merges second folds this into it (calls
 * `noteTrackerBlocked()` from the `trackers-blocked` path) and deletes this file.
 */
export function TrackerBadge() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const blocks = useBrowserStore((s) => (activeTabId ? s.trackerBlocks[activeTabId] : undefined));
  const url = useBrowserStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.url ?? '');
  const [open, setOpen] = useState(false);
  if (!activeTabId || !blocks || blocks.count === 0) return null;

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* no host: the exception buttons stay hidden */
  }

  const except = (allow: boolean) => {
    if (!host) return;
    bridge()?.browser.setTrackerException({ host, allow });
    bridge()?.browser.reload({ tabId: activeTabId });
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid="browser-tracker-badge"
        aria-label={`${blocks.count} trackers blocked`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded border border-border bg-card px-1.5 py-1 text-[11px] tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LuShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
        {blocks.count}
      </button>
      {open ? (
        <div
          data-testid="browser-tracker-popover"
          role="dialog"
          aria-label="Blocked trackers"
          className="absolute right-0 top-full z-40 mt-1 w-72 rounded-md border border-border bg-card p-3 text-xs shadow-lg"
        >
          <div className="mb-2 font-semibold text-foreground">
            {blocks.count} {blocks.count === 1 ? 'request' : 'requests'} blocked on this page
          </div>
          <ul className="mb-3 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground">
            {blocks.hosts.map((h) => (
              <li key={h} className="truncate">
                {h}
              </li>
            ))}
          </ul>
          {host ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => except(true)}
                className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
              >
                Allow on {host}
              </button>
              <button
                type="button"
                onClick={() => except(false)}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
              >
                Block again
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
