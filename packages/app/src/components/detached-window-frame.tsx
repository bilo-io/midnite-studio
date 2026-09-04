import type { ReactNode } from 'react';

import { TitleBar } from '@bilo-io/shell';
import type { WindowRole } from '@midnite/studio-shared';
import { LuSquareArrowDownLeft } from 'react-icons/lu';

import { bridge } from '../services/bridge';
import { useRepos } from '../services/queries';
import { useUiStore } from '../store/ui-store';
import { IconButton } from './icon-button';

/** The last path segment — `packages/app` may not import `node:path`. */
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * The chrome every popout window (Phase 55) draws around its one panel.
 *
 * Wraps `@bilo-io/shell`'s `<TitleBar>` rather than drawing its own —
 * `WindowChromeBridge` is already implemented in the preload and already
 * per-window, so re-implementing traffic-light spacing here would fork
 * chrome behaviour between the main window and popouts for no gain.
 * `<TitleBar>` itself renders nothing when the platform keeps its native
 * frame, so there is no per-platform branch here either.
 */
export function DetachedWindowFrame({
  role,
  title,
  titleBarLeft,
  titleBarRight,
  children,
}: {
  role: WindowRole;
  title: string;
  titleBarLeft?: ReactNode;
  titleBarRight?: ReactNode;
  children: ReactNode;
}) {
  const windowChrome = bridge()?.windowChrome ?? null;
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const { data: repos } = useRepos();
  const selectedRepo = repos?.find((repo) => repo.id === selectedRepoId) ?? null;

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      style={{ paddingTop: 'var(--titlebar-h, 0px)' }}
    >
      <TitleBar
        windowChrome={windowChrome}
        left={
          titleBarLeft ?? <span className="truncate px-1 text-xs font-medium">{title}</span>
        }
        right={
          titleBarRight ?? (
            <div className="flex items-center gap-2">
              {selectedRepo ? (
                <span className="truncate text-xs text-muted-foreground">
                  {basename(selectedRepo.path)}
                </span>
              ) : null}
              <IconButton
                icon={LuSquareArrowDownLeft}
                label={`Re-dock ${title}`}
                size="sm"
                onClick={() => bridge()?.window.dock({ role })}
              />
            </div>
          )
        }
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
