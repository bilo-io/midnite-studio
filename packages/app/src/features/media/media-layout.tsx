import type { MediaTab } from '@midnite/studio-shared';
import type { ReactNode } from 'react';
import { LuPanelLeftClose, LuPanelLeftOpen, LuPanelRightClose, LuPanelRightOpen } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable, type Resizable } from '../../components/resizable/use-resizable';
import {
  DEFAULT_LAYOUT,
  LAYOUT_BOUNDS,
  mediaLayoutKeys,
  useUiStore,
  type MediaPane,
} from '../../store/ui-store';
import { mediaPanelId, mediaTabId } from './media-tabs';

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
export type MediaLayoutProps = {
  tab: MediaTab;
  toolbar?: ReactNode;
  explorer: ReactNode;
  content: ReactNode;
  /** Omit for a two-pane tab; the right divider then disappears too. */
  detail?: ReactNode;
  /** Accessible names for the two dividers. */
  explorerLabel?: string;
  detailLabel?: string;
  /** Noun for the floating toggle buttons: "Show explorer" / "Hide composer". */
  explorerName?: string;
  detailName?: string;
  /**
   * Tailwind `top-*` class for the floating toggles. Default sits just under the toolbar; a tab whose content
   * opens with its own tool row (Models' editor toolbar) passes a larger inset to clear it.
   */
  toggleTop?: string;
};

const FLOATING_TOGGLE =
  'pointer-events-auto rounded-md border border-border bg-background/70 shadow-sm backdrop-blur-sm';

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
  toggleTop = 'top-2',
}: MediaLayoutProps) {
  const keys = mediaLayoutKeys(tab);
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const collapsed = useUiStore((s) => s.mediaPaneCollapsed[tab]);
  const setCollapsed = useUiStore((s) => s.setMediaPaneCollapsed);

  const explorerCollapsed = collapsed?.explorer === true;
  const detailCollapsed = collapsed?.detail === true;

  const explorerResizable = useResizable({
    size: layout[keys.explorer],
    onSize: (value) => setLayout(keys.explorer, value),
    initial: DEFAULT_LAYOUT[keys.explorer],
    axis: 'x',
    edge: 'start',
    onCollapse: () => setCollapsed(tab, 'explorer', true),
    ...LAYOUT_BOUNDS[keys.explorer],
  });
  const detailResizable = useResizable({
    size: layout[keys.detail],
    onSize: (value) => setLayout(keys.detail, value),
    initial: DEFAULT_LAYOUT[keys.detail],
    axis: 'x',
    edge: 'end',
    onCollapse: () => setCollapsed(tab, 'detail', true),
    ...LAYOUT_BOUNDS[keys.detail],
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
          {/* Floating side-panel toggles, as Workflows' toolbar has — pinned just under the toolbar so a
              collapsed pane can always be reopened. The wrapper ignores the pointer; only the buttons take it. */}
          <div className={`pointer-events-none absolute inset-x-2 ${toggleTop} z-20 flex items-start justify-between`}>
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
            {detail !== undefined ? (
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
 */
export function openMediaPane(tab: MediaTab, pane: MediaPane, { focus = true } = {}): void {
  useUiStore.getState().setMediaPaneCollapsed(tab, pane, false);
  if (!focus) return;
  requestAnimationFrame(() => {
    const root = document.getElementById(mediaPanelId(tab))?.querySelector(`[data-media-pane="${pane}"]`);
    const target = root?.querySelector<HTMLElement>(
      'textarea, input, select, button, [tabindex]:not([tabindex="-1"])',
    );
    target?.focus();
  });
}
