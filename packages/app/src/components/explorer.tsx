import type { CSSProperties, ReactNode } from 'react';

import { Collapse } from '@bilo-io/ui';
import { LuChevronRight, LuSearch, LuX } from 'react-icons/lu';

/**
 * The building blocks of a "left explorer" list — the Sessions page's search
 * field, collapsible sticky-headed groups and empty/error notice, hoisted so
 * the Chats page wears the same ones instead of a second copy that would drift
 * the first time either is restyled.
 */

/** The search field: gradient border, leading magnifier, clear button once there is text. */
export function ExplorerSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearLabel: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 gradient-border rounded-md">
      <LuSearch
        aria-hidden
        className="pointer-events-none absolute left-2 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="block h-7 w-full rounded-md border-0 bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <LuX aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * One group in the list: a sticky header (chevron toggle, optional leading
 * glyph, title, optional meta, count, optional trailing controls) over a
 * `Collapse` body. `className`/`style` land on the outer wrapper — the
 * Sessions page uses them for its cascade-reveal animation.
 */
export function ExplorerGroup({
  title,
  count,
  open,
  onToggle,
  bodyId,
  leading,
  meta,
  trailing,
  className = '',
  style,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  bodyId: string;
  leading?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`border-b border-border/40 last:border-b-0 ${className}`} style={style}>
      <div className="sticky top-0 z-10 flex h-7 items-center gap-1 bg-background/95 px-2 text-[11px] font-medium text-muted-foreground backdrop-blur">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left transition-colors hover:text-foreground"
        >
          <LuChevronRight
            aria-hidden
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
              open ? 'rotate-90' : ''
            }`}
          />
          {leading}
          <span className="truncate font-semibold uppercase tracking-wide">{title}</span>
          {meta}
          <span className="tabular-nums text-muted-foreground/70">{count}</span>
        </button>
        {trailing}
      </div>
      <Collapse open={open} id={bodyId} aria-label={title}>
        {children}
      </Collapse>
    </div>
  );
}

/** A centred sentence filling the pane — "nothing selected", a load failure. */
export function ExplorerNotice({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p
        className={`max-w-md text-center text-sm leading-relaxed ${
          tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {children}
      </p>
    </div>
  );
}
