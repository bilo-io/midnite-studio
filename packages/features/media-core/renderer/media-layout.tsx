import type { MediaTab } from '@midnite/studio-shared';
import { useCallback } from 'react';
import { LuPanelLeftClose, LuPanelLeftOpen, LuPanelRightClose, LuPanelRightOpen } from 'react-icons/lu';

import {
  mediaPanelId,
  mediaTabId,
  ResizeHandle,
  useFrameChrome,
  useResizable,
  type MediaLayoutProps,
  type MediaPane,
  type Resizable,
} from '@midnite/studio-frame';

import { useMediaHost } from './host';

/**
 * The shared Media frame (Phase 99 Theme A): a toolbar over a three-pane body
 * — explorer left, content centre, detail right. Every tab renders through
 * it; Themes B–E only fill the slots.
 *
 * - Widths persist per tab (`mediaLayoutKeys(tab)` in `LayoutSizes`).
 * - **Double-click a divider to collapse its pane** (and again to reopen it);
 *   dragging far past the minimum collapses too. Collapse state is remembered
 *   per tab (`mediaPaneCollapsed`).
 * - A collapsed pane stays mounted but `inert`, so its state survives.
 * - `openMediaPane(tab, pane)` reopens and focuses a pane programmatically —
 *   the Images "+" tile uses it to bring up the create panel.
 */
export type { MediaLayoutProps };

const FLOATING_TOGGLE =
  'pointer-events-auto rounded-md border border-border bg-background/70 shadow-sm backdrop-blur-sm';

/**
 * Floating side-panel toggles, as Workflows' toolbar has — pinned to the top corners of the nearest
 * `relative` ancestor so a collapsed pane can always be reopened. The wrapper ignores the pointer; only
 * the buttons take it. State is the per-tab `mediaPaneCollapsed`, shared with the divider gestures.
 */
export function MediaPaneToggles({
  tab,
  hasDetail,
  explorerName = 'explorer',
  detailName = 'composer',
}: {
  tab: MediaTab;
  hasDetail: boolean;
  explorerName?: string;
  detailName?: string;
}) {
  const { IconButton } = useFrameChrome();
  const host = useMediaHost();
  const explorerCollapsed = host.usePaneCollapsed(tab, 'explorer');
  const detailCollapsed = host.usePaneCollapsed(tab, 'detail');
  const setCollapsed = host.setPaneCollapsed;
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between">
      <span className={FLOATING_TOGGLE}>
        <IconButton
          icon={explorerCollapsed ? LuPanelLeftOpen : LuPanelLeftClose}
          label={explorerCollapsed ? `Show ${explorerName}` : `Hide ${explorerName}`}
          size="sm"
          tooltipSide="bottom"
          aria-expanded={!explorerCollapsed}
          onClick={() => setCollapsed(tab, 'explorer', !explorerCollapsed)}
        />
      </span>
      {hasDetail ? (
        <span className={FLOATING_TOGGLE}>
          <IconButton
            icon={detailCollapsed ? LuPanelRightOpen : LuPanelRightClose}
            label={detailCollapsed ? `Show ${detailName}` : `Hide ${detailName}`}
            size="sm"
            tooltipSide="bottom"
            aria-expanded={!detailCollapsed}
            onClick={() => setCollapsed(tab, 'detail', !detailCollapsed)}
          />
        </span>
      ) : null}
    </div>
  );
}

export function MediaLayout({
  tab,
  toolbar,
  explorer,
  content,
  detail,
  explorerLabel = 'Resize explorer',
  detailLabel = 'Resize detail',
  explorerName = 'explorer',
  detailName = 'composer',
  floatingToggles = true,
}: MediaLayoutProps) {
  const host = useMediaHost();
  const explorerSize = host.usePaneSize(tab, 'explorer');
  const detailSize = host.usePaneSize(tab, 'detail');
  const explorerCollapsed = host.usePaneCollapsed(tab, 'explorer');
  const detailCollapsed = host.usePaneCollapsed(tab, 'detail');
  const setCollapsed = host.setPaneCollapsed;

  const explorerResizable = useResizable({
    size: explorerSize.size,
    onSize: explorerSize.setSize,
    initial: explorerSize.initial,
    axis: 'x',
    edge: 'start',
    onCollapse: () => setCollapsed(tab, 'explorer', true),
    min: explorerSize.min,
    max: explorerSize.max,
  });
  const detailResizable = useResizable({
    size: detailSize.size,
    onSize: detailSize.setSize,
    initial: detailSize.initial,
    axis: 'x',
    edge: 'end',
    onCollapse: () => setCollapsed(tab, 'detail', true),
    min: detailSize.min,
    max: detailSize.max,
  });

  /** Double-click toggles collapse instead of `useResizable`'s reset-to-initial. */
  const toggling = (resizable: Resizable, pane: MediaPane, isCollapsed: boolean): Resizable => ({
    ...resizable,
    handleProps: {
      ...resizable.handleProps,
      onDoubleClick: () => setCollapsed(tab, pane, !isCollapsed),
    },
  });

  const paneWidth = (resizable: Resizable, isCollapsed: boolean): number =>
    isCollapsed || resizable.snap === 'collapse' ? 0 : resizable.current;

  return (
    <div
      role="tabpanel"
      id={mediaPanelId(tab)}
      aria-labelledby={mediaTabId(tab)}
      className="flex h-full min-h-0 flex-col"
    >
      {toolbar ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">{toolbar}</div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div
          data-media-pane="explorer"
          data-collapsed={explorerCollapsed || undefined}
          className="flex shrink-0 flex-col overflow-hidden border-r border-border"
          style={{ width: paneWidth(explorerResizable, explorerCollapsed) }}
          {...(explorerCollapsed ? { inert: true, 'aria-hidden': true } : {})}
        >
          {explorer}
        </div>
        <ResizeHandle
          resizable={toggling(explorerResizable, 'explorer', explorerCollapsed)}
          axis="x"
          label={explorerLabel}
        />
        <div className="relative min-h-0 min-w-0 flex-1">
          <div data-media-pane="content" className="h-full min-h-0 min-w-0">
            {content}
          </div>
          {floatingToggles ? (
            <MediaPaneToggles tab={tab} hasDetail={detail !== undefined} explorerName={explorerName} detailName={detailName} />
          ) : null}
        </div>
        {detail !== undefined ? (
          <>
            <ResizeHandle
              resizable={toggling(detailResizable, 'detail', detailCollapsed)}
              axis="x"
              label={detailLabel}
            />
            <div
              data-media-pane="detail"
              data-collapsed={detailCollapsed || undefined}
              // `rainbow-panel` (styles.css): the shared rotating-rainbow border + inner glow arc every
              // Media composer wears. It reads `data-collapsed` to stop animating while hidden.
              className="rainbow-panel flex h-full shrink-0 flex-col overflow-hidden"
              style={{ width: paneWidth(detailResizable, detailCollapsed) }}
              {...(detailCollapsed ? { inert: true, 'aria-hidden': true } : {})}
            >
              {detail}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Reopen a Media side pane and move focus into it — the seam Images' "+"
 * tile (Theme C) calls to bring up its create panel. Focus lands on the
 * pane's first focusable element once React has committed the reopen.
 * A hook: the opener writes through the host.
 */
export function useOpenMediaPane(): (tab: MediaTab, pane: MediaPane, options?: { focus?: boolean }) => void {
  const { setPaneCollapsed } = useMediaHost();
  return useCallback(
    (tab, pane, { focus = true } = {}) => {
      setPaneCollapsed(tab, pane, false);
      if (!focus) return;
      requestAnimationFrame(() => {
        const root = document.getElementById(mediaPanelId(tab))?.querySelector(`[data-media-pane="${pane}"]`);
        const target = root?.querySelector<HTMLElement>(
          'textarea, input, select, button, [tabindex]:not([tabindex="-1"])',
        );
        target?.focus();
      });
    },
    [setPaneCollapsed],
  );
}
