import type { ReactNode } from 'react';
import { LuChevronDown, LuChevronUp } from 'react-icons/lu';

import { ResizeHandle } from '../resizable/resize-handle';
import { useBottomPanel, type BottomPanelOptions } from './use-bottom-panel';

/**
 * The header row of a collapsible panel: a chevron and a title that toggle it, with `actions` (filter
 * buttons, Clear, New…) beside them that do not.
 *
 * The toggle is a real `<button aria-expanded>`, so Enter and Space work natively; the whole row also
 * toggles on a click so the target is the width of the panel, not the width of a word. That click
 * lands on the row and the button's click bubbles to it, so one handler serves both — and `actions`
 * sit in a wrapper that stops the click, so pressing Clear never collapses the console.
 */
export function BottomPanelHeader({
  title,
  collapsed,
  onToggle,
  actions,
  className = '',
}: {
  title: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      onClick={onToggle}
      className={`flex h-7 shrink-0 cursor-pointer items-center gap-1 border-border px-2 hover:bg-accent/40 ${collapsed ? '' : 'border-b'} ${className}`}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        className="mr-1 flex items-center gap-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
      >
        {collapsed ? <LuChevronUp aria-hidden className="h-3 w-3" /> : <LuChevronDown aria-hidden className="h-3 w-3" />}
        {title}
      </button>
      {actions ? (
        // `contents`: no box of its own, so the row's empty space still toggles and only the controls do not.
        <div className="contents" onClick={(event) => event.stopPropagation()}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A bottom-docked panel with a resize handle on its top edge and a collapsible header (see
 * {@link useBottomPanel}). Expanded it is `height` tall, collapsed only its header row shows, and
 * the column above — which should be `min-h-0 flex-1` — takes the space.
 *
 * The body stays unmounted while collapsed, so a panel with a live subscription that is hidden costs
 * nothing; state a feature wants to survive a collapse belongs in the feature, above this component.
 */
export function BottomPanel({
  id,
  title,
  actions,
  ariaLabel,
  testId,
  resize,
  bodyClassName = 'flex min-h-0 flex-1',
  children,
}: {
  /** Persistence key, namespaced by feature (`game.console`). */
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  ariaLabel: string;
  testId?: string;
  resize: BottomPanelOptions;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const panel = useBottomPanel(id, resize);

  return (
    <>
      {panel.collapsed ? null : <ResizeHandle resizable={panel.resizable} axis="y" label={`Resize ${ariaLabel.toLowerCase()}`} />}
      <section
        aria-label={ariaLabel}
        data-testid={testId}
        data-collapsed={panel.collapsed || undefined}
        style={panel.collapsed ? undefined : { height: panel.height }}
        className={`flex shrink-0 flex-col ${panel.collapsed ? 'border-t border-border' : ''}`}
      >
        <BottomPanelHeader title={title} collapsed={panel.collapsed} onToggle={panel.toggle} actions={actions} />
        {panel.collapsed ? null : <div className={bodyClassName}>{children}</div>}
      </section>
    </>
  );
}
