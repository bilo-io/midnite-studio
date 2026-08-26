import type { ReactNode } from 'react';

import { openExternal } from '../../services/queries';

/**
 * A link in rendered markdown, opened in the user's browser.
 *
 * `onClick` + `preventDefault` rather than a bare `href`, and the reason is not
 * styling. The renderer is a single-page app loaded from `file://` in
 * production: letting a real navigation happen replaces the entire application
 * with the target page, with no back button, because there is no browser chrome
 * around it. `window.ts`'s `setWindowOpenHandler` catches `target="_blank"`, but
 * a same-window navigation never reaches it.
 *
 * The `href` is kept on the element regardless, so the status bar, middle-click
 * and "Copy link" all still see the real destination — and so a keyboard
 * activation goes through the same handler as a click.
 *
 * Protocols are enforced in main (OPEN_EXTERNAL_PROTOCOLS), not here: a check in
 * the renderer is a courtesy, and the one that matters sits on the line that
 * calls `shell.openExternal`.
 */
export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href?: string | undefined;
  children?: ReactNode;
  className?: string;
}) {
  if (href === undefined || href.length === 0) {
    return <span className={className}>{children}</span>;
  }

  return (
    <a
      href={href}
      title={href}
      className={`text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary ${className}`}
      onClick={(event) => {
        event.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}
