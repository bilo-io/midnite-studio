import { cloneElement, useId, useState, type ComponentProps, type ComponentType, type ReactElement, type ReactNode } from 'react';

import type { NavLinkComponent } from '@bilo-io/shell';

import { navViewForPath } from './nav-config';

/** The tooltip a rail row wears. Studio passes its own (`components/tooltip.tsx`); the default is below. */
export type ViewLinkTooltip = ComponentType<{
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
}>;

export type ViewLinkOptions = {
  /** Maps a row's `href` back to its view id. Defaults to `/<id>` → `<id>`; Studio passes `viewForPath`. */
  viewForHref?: (href: string) => string;
  /** The tooltip component. Defaults to `RailChordTooltip`. */
  Tooltip?: ViewLinkTooltip;
};

/** The class the active row carries so the app's brand accent colours it (decision 11). */
export const APP_ACCENT_ACTIVE_CLASS = 'app-accent-active !text-[color:var(--app-accent)]';

/**
 * The rail's own tooltip for an app that brings none: shown on hover and keyboard focus, beside the row
 * (`side="right"`), and named as the row's accessible description. Deliberately small — no portal, no
 * dismissal layer — because it only ever carries a chord of a few characters. Studio keeps its richer
 * `Tooltip` by passing it in.
 */
export function RailChordTooltip({ label, children }: { label: ReactNode; side?: 'top' | 'bottom' | 'right'; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return (
    <span className="relative flex flex-col" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="pointer-events-none absolute left-full top-1/2 z-tooltip ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[11px] text-popover-foreground shadow"
      >
        {label}
      </span>
    </span>
  );
}

/**
 * The rail's link component (Phase 123 Theme B, moved from Studio's `app.tsx` `ViewLink`): a click
 * navigates in-app rather than following the `href`, and a row whose view has a chord shows that chord —
 * and ONLY the chord — on hover, because hovering the rail expands it and the label is already on screen
 * (CLAUDE.md's rail rule). A row with no chord gets no bubble at all rather than an empty one.
 */
export function createViewLink(
  onNavigate: (view: string) => void,
  chordFor: (view: string) => string | undefined,
  options: ViewLinkOptions = {},
): NavLinkComponent {
  const viewForHref = options.viewForHref ?? navViewForPath;
  const Tooltip = options.Tooltip ?? RailChordTooltip;
  function ViewLink({ href, className, children, ...rest }: ComponentProps<NavLinkComponent>) {
    const view = viewForHref(href);
    const chord = chordFor(view);
    const active = rest['aria-current'] === 'page';
    const link = (
      <a
        href={href}
        className={`${className ?? ''} shrink-0${active ? ` ${APP_ACCENT_ACTIVE_CLASS}` : ''}`}
        data-view={view}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(view);
        }}
        {...rest}
      >
        {children}
      </a>
    );
    return chord === undefined ? (
      link
    ) : (
      <Tooltip label={chord} side="right">
        {link}
      </Tooltip>
    );
  }
  return ViewLink;
}
