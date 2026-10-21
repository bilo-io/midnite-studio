import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { LuChevronRight } from 'react-icons/lu';

import type { IconComponent } from '../chrome/types';
import { TREE_INDENT } from '../layout/tree-indent';

/*
  The suite app kit's plain chrome (Phase 113 Theme O) — the pieces of Studio's chrome a small app
  composing a feature can use as they are, so each feature does not carry a third copy of them:
  a click-toggled popover, a labelled collapsible section, and Escape-to-close. Studio keeps its own
  (portals, occluder stack, collapse animation); these draw over the same tokens with none of that.
*/

/** Escape closes the surface while it is open. The kit's whole dismissal stack. */
export function useEscapeDismiss(open: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);
}

export type KitPopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

/** A click-toggled panel anchored to its trigger; closes on an outside press and on Escape. Controlled or not. */
export function KitPopover(props: KitPopoverProps) {
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const ref = useRef<HTMLDivElement>(null);
  const { onOpenChange } = props;
  const setOpen = (next: boolean) => {
    setOwn(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOwn(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onOpenChange]);
  useEscapeDismiss(open, () => setOpen(false));

  const side = props.side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
  const align = props.align === 'end' ? 'right-0' : props.align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={props.label}
        aria-expanded={open}
        title={props.title}
        disabled={props.disabled}
        data-testid={props.testId}
        className={props.triggerClassName}
        onClick={() => setOpen(!open)}
      >
        {props.trigger}
      </button>
      {open ? (
        <div role="dialog" aria-label={props.label} className={`absolute z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md ${side} ${align} ${props.panelClassName ?? ''}`}>
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

export type KitTreeSectionProps = {
  title: string;
  count?: number;
  icon?: ReactNode;
  meta?: ReactNode;
  action?: { label: string; onClick: () => void; icon?: IconComponent };
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  hideWhenEmpty?: boolean;
  depth?: 0 | 1 | 2 | 3;
  tone?: 'primary';
  tinted?: boolean;
  children: ReactNode;
};

/** A labelled, optionally collapsible group of rows — the sidebar tree's section, without the collapse animation. */
export function KitTreeSection({
  title,
  count,
  icon,
  meta,
  action,
  collapsible = false,
  open = true,
  onToggle,
  hideWhenEmpty = true,
  depth = 0,
  tone,
  tinted = false,
  children,
}: KitTreeSectionProps) {
  const bodyId = useId();
  if (hideWhenEmpty && count === 0) return null;
  const tint = tone === 'primary' ? 'text-primary' : 'text-muted-foreground';
  const heading = (
    <>
      {collapsible ? <LuChevronRight aria-hidden className={`h-3 w-3 shrink-0 ${tint} transition-transform ${open ? 'rotate-90' : ''}`} /> : null}
      {icon}
      <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${tint}`}>{title}</h3>
      {count === undefined ? null : <span className="text-[11px] tabular-nums text-muted-foreground/70">{count}</span>}
    </>
  );
  const ActionIcon = action?.icon;
  return (
    <section>
      <header className={`flex h-7 items-center gap-1.5 pr-2 ${TREE_INDENT[depth]} ${tinted ? 'bg-primary/15' : ''}`}>
        {collapsible ? (
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId} className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left hover:text-foreground">
            {heading}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">{heading}</span>
        )}
        {meta ? <span className="ml-auto shrink-0 pl-2">{meta}</span> : null}
        {action ? (
          <button type="button" aria-label={action.label} title={action.label} onClick={action.onClick} className="ml-auto shrink-0 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground">
            {ActionIcon ? <ActionIcon className="h-3.5 w-3.5" /> : action.label}
          </button>
        ) : null}
      </header>
      <div id={bodyId} hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
