import { isPageWindowRole, type PageWindowRole } from '@midnite/studio-shared';
import { LuSquareArrowOutUpRight, LuSquareArrowDownLeft } from 'react-icons/lu';

import { bridge } from '../services/bridge';
import { useUiStore } from '../store/ui-store';
import { IconButton } from './icon-button';
import { VIEW_ICON } from './nav-icons';

/** The human name each page role wears in a tooltip and a popout's title bar. */
export const PAGE_ROLE_TITLE: Record<PageWindowRole, string> = {
  graph: 'Graph',
  actions: 'Actions',
  changes: 'Changes',
  files: 'File Explorer',
  database: 'DB Explorer',
};

/**
 * The hover-morph mark that heads a detachable **page**'s own header row.
 *
 * The same affordance the docked panel headers already draw (`terminal-header`,
 * `repos-panel`, `tab-strip`): the view's rail glyph at rest, swapped for an
 * action on hover, so the control costs no width it was not already spending
 * on an icon.
 *
 * What differs is the semantics behind it, and it is the whole point of this
 * component existing rather than reusing the panels' path. Detaching a panel
 * MOVES it — `terminalDetached` collapses the docked slot and the popout
 * becomes the only copy. Detaching a page DUPLICATES it: `app.tsx` goes on
 * rendering the view exactly as before, and a second window mounts a second
 * instance of the same component. So there is no placeholder to draw, nothing
 * to move back, and "dock" degenerates into "close that window" — which is
 * why the detached copy's own mark says *Close* rather than *Dock*.
 *
 * Three states, one button:
 * - main window, no popout → open one (`window.detach`)
 * - main window, popout already open → focus it (`window.focusRole`), because
 *   `windowForRole` allows only one window per role and silently focusing an
 *   existing window is a worse answer than saying so in the label
 * - inside the popout itself → close it (`window.dock`)
 */
export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const Icon = VIEW_ICON[role];
  const title = PAGE_ROLE_TITLE[role];
  const api = bridge();
  const windowRole = api?.windowRole ?? 'main';
  const isThisPopout = isPageWindowRole(windowRole) && windowRole === role;
  // Subscribed unconditionally — the rules of hooks forbid skipping it in the
  // popout branch, and the read is a plain array membership test.
  const detached = useUiStore((s) => s.detachedPages.includes(role));

  const action = isThisPopout
    ? { icon: LuSquareArrowDownLeft, label: `Close the ${title} window`, run: () => api?.window.dock({ role }) }
    : detached
      ? {
          icon: LuSquareArrowOutUpRight,
          label: `Focus the detached ${title} window`,
          run: () => api?.window.focusRole({ role }),
        }
      : {
          icon: LuSquareArrowOutUpRight,
          label: `Detach ${title} into its own window`,
          run: () => api?.window.detach({ role }),
        };

  return (
    <div
      data-page-detach-mark={role}
      className="group/detach relative flex h-6 w-6 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center transition-opacity group-hover/detach:opacity-0"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </span>
      <IconButton
        icon={action.icon}
        label={action.label}
        size="sm"
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/detach:opacity-100"
        onClick={action.run}
      />
    </div>
  );
}
