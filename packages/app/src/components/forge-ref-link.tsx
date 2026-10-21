import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { openLinkFromEvent } from '../services/open-in-midnite';

/**
 * A `#123` PR/issue reference that is a link.
 *
 * Plain click opens the thing in Midnite (PR -> Reviews, issue -> the app-wide issue
 * modal) via `openLinkFromEvent` with `preferInAppRoute`; Cmd/Ctrl-click
 * opens the forge URL in the system browser. Both rules live in
 * `resolveDestination`, so this stays a thin wrapper.
 *
 * A `<span role="link">`, not a `<button>`/`<a>`: refs sit inside row buttons
 * (nested buttons are invalid) and a real `href` would navigate the `file://`
 * window away. Click is stopped so the enclosing row's own handler does not fire.
 */
export function ForgeRefLink({
  url,
  number,
  repoId,
  children,
  className = '',
}: {
  /** The forge URL of the PR/issue (resolved to an in-app route on plain click). */
  url: string;
  number: number;
  /** Tags a browser tab with its repo group. */
  repoId?: string;
  /** Defaults to `#<number>`. */
  children?: ReactNode;
  className?: string;
}) {
  const open = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const mods = {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      button: 'button' in event ? event.button : 0,
    };
    openLinkFromEvent(url, mods, { originRepoId: repoId, preferInAppRoute: true });
  };
  return (
    <span
      role="link"
      tabIndex={0}
      data-testid="forge-ref-link"
      title={`Open #${number} (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}-click for browser)`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open(e);
      }}
      className={`cursor-pointer tabular-nums hover:text-foreground hover:underline ${className}`}
    >
      {children ?? `#${number}`}
    </span>
  );
}
