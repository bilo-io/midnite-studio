import type { ReactNode } from 'react';

import { openLinkFromEvent } from '../../services/open-in-midnite';

/**
 * A link in rendered markdown — a commit body, a PR/issue description, a
 * review comment — routed through `openLinkFromEvent` (Phase 71 Theme B; the
 * ad hoc click-modifier theme's `preferInAppRoute: true`). Mod/Ctrl-click
 * always leaves for the system browser, Alt/Option-click always opens the
 * embedded one, and a plain click prefers the app's own view for the link —
 * a `#42` written as a full PR URL lands on `PrDetail`, not a browser tab —
 * falling back to the stored embedded/system preference when nothing in the
 * app covers it. See `open-in-midnite.ts`'s module docblock for the full
 * precedence.
 *
 * `onClick`/`onAuxClick` + `preventDefault` rather than a bare `href`, and the
 * reason is not styling. The renderer is a single-page app loaded from
 * `file://` in production: letting a real navigation happen replaces the
 * entire application with the target page, with no back button, because there
 * is no browser chrome around it. `window.ts`'s `setWindowOpenHandler` catches
 * `target="_blank"`, but a same-window navigation never reaches it.
 *
 * The `href` is kept on the element regardless, so the status bar, middle-click
 * and "Copy link" all still see the real destination — and so a keyboard
 * activation goes through the same handler as a click.
 *
 * Protocols are enforced in `packages/shared/src/ipc/schemas.ts`
 * (`OPEN_EXTERNAL_PROTOCOLS`) and re-checked in `remote-handlers.ts`, not here:
 * a check in the renderer is a courtesy, and the one that matters sits on the
 * line that calls `shell.openExternal`.
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
        openLinkFromEvent(href, event, { preferInAppRoute: true });
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        openLinkFromEvent(href, event, { preferInAppRoute: true });
      }}
    >
      {children}
    </a>
  );
}
