import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';

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

/** Length of one header pulse; `styles.css`'s `explorer-*` and `session-guide-shimmer` loops share it. */
const PULSE_MS = 6000;

/**
 * Phase-lock a pulse element to the document clock, so the halo, ring, sweep,
 * logo, title and guide node stay in step however late each one mounts (the
 * guide lives in the collapsible body and remounts on every expand).
 */
function syncPulse(node: HTMLElement | null) {
  if (!node || typeof performance === 'undefined') return;
  node.dataset.pulseSync = '';
  lockPhase(node);
  installFocusResync();
}

function lockPhase(node: HTMLElement) {
  node.style.animationDelay = `${-(performance.now() % PULSE_MS)}ms`;
}

// The loops pause while the window is blurred and the clock does not, so on
// focus every pulse element is re-locked together.
let focusResyncInstalled = false;
function installFocusResync() {
  if (focusResyncInstalled || typeof window === 'undefined') return;
  focusResyncInstalled = true;
  window.addEventListener('focus', () => {
    document.querySelectorAll<HTMLElement>('[data-pulse-sync]').forEach(lockPhase);
  });
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
  wrapperRef,
  headerAttributes,
  headerListeners,
  isDragging = false,
  guideLine,
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
  wrapperRef?: (node: HTMLElement | null) => void;
  headerAttributes?: Record<string, unknown>;
  headerListeners?: Record<string, unknown>;
  isDragging?: boolean;
  /** Optional vertical indent guide aligned with the chevron center when expanded. */
  guideLine?: 'active' | 'muted';
  children: ReactNode;
}) {
  const pulse = guideLine === 'active';
  return (
    <div
      ref={wrapperRef}
      className={`border-b border-border/40 last:border-b-0 ${isDragging ? 'opacity-80' : ''} ${className}`}
      style={style}
    >
      <div
        className="sticky top-0 z-10 flex min-h-9 items-center gap-1 bg-background/95 py-1.5 pl-1.5 pr-2 text-[11px] font-medium text-muted-foreground backdrop-blur"
        data-pulse={pulse ? 'true' : undefined}
        {...headerAttributes}
        {...headerListeners}
      >
        {pulse ? (
          // The sweep leaves the chevron's halo each time it releases a ring.
          <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <span ref={syncPulse} className="explorer-header-sweep absolute inset-y-0 w-2/5" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left transition-colors hover:text-foreground"
        >
          <span
            aria-hidden
            data-testid="explorer-group-orb"
            className="relative grid size-4 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.22)_0%,hsl(var(--primary)/0.08)_60%,transparent_100%)] shadow-[0_0_6px_hsl(var(--primary)/0.3)]"
          >
            {pulse ? (
              <>
                <span ref={syncPulse} className="explorer-orb-halo absolute inset-0 rounded-full" />
                <span ref={syncPulse} className="explorer-orb-ring absolute inset-0 rounded-full border border-primary/60" />
              </>
            ) : null}
            <LuChevronRight
              className={`relative h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ease-in-out ${
                open ? 'rotate-90' : ''
              }`}
            />
          </span>
          <span className="relative flex min-w-0 flex-1 items-center gap-1.5">
            {/* Very faint band behind the logo and name, fading out to the right. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-1 inset-y-0 right-0 -z-10 rounded-sm bg-gradient-to-r from-primary/[0.08] via-primary/[0.02] to-transparent"
            />
            {leading ? (
              <span ref={pulse ? syncPulse : undefined} className={`flex shrink-0 ${pulse ? 'explorer-logo-shimmer' : ''}`}>
                {leading}
              </span>
            ) : null}
            <span className="relative min-w-0 truncate font-semibold uppercase tracking-wide">
              {title}
              {pulse ? (
                <span
                  ref={syncPulse}
                  aria-hidden
                  className="explorer-title-stroke pointer-events-none absolute inset-0 truncate"
                >
                  {title}
                </span>
              ) : null}
            </span>
            {meta}
            <span className="tabular-nums text-muted-foreground/70">{count}</span>
          </span>
        </button>
        {trailing}
      </div>
      <Collapse open={open} id={bodyId} aria-label={title}>
        {guideLine ? (
          <div className="relative" data-guide-line={guideLine}>
            {/* Aligned with the chevron orb's centre: pl-1.5 (6px) + half the 16px orb = 14px. */}
            <div
              aria-hidden
              data-testid="explorer-group-guide"
              className="pointer-events-none absolute top-0 bottom-0 left-[14px] flex w-3 -translate-x-1/2 justify-center overflow-hidden"
            >
              <div
                className={
                  guideLine === 'active'
                    ? 'h-full w-px bg-primary/40'
                    : 'h-full w-px bg-border/60'
                }
              />
              {guideLine === 'active' ? (
                <div
                  ref={syncPulse}
                  data-testid="explorer-group-guide-shimmer"
                  className="session-guide-shimmer pointer-events-none absolute inset-x-0 top-0 flex h-14 flex-col items-center"
                >
                  <div className="h-full w-px bg-gradient-to-b from-transparent via-primary to-transparent opacity-90" />
                  <div className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.85)_0%,hsl(var(--primary)/0.3)_45%,transparent_72%)] blur-[1px]" />
                </div>
              ) : null}
            </div>
            {children}
          </div>
        ) : (
          children
        )}
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

/** One repository bucket produced by {@link groupItemsByRepo}. */
export type RepoGroup<T> = {
  repoId: string;
  title: string;
  items: T[];
};

/** Group repo-scoped items by `repoId`, preserving first-seen repo and item order. */
export function groupItemsByRepo<T extends { repoId: string; title: string }>(
  items: readonly T[],
): RepoGroup<T>[] {
  const byRepo = new Map<string, T[]>();
  for (const item of items) {
    const existing = byRepo.get(item.repoId);
    if (existing) existing.push(item);
    else byRepo.set(item.repoId, [item]);
  }
  return [...byRepo.entries()].map(([repoId, grouped]) => ({
    repoId,
    title: grouped[0]?.title || repoId,
    items: grouped,
  }));
}

/** Track per-group collapsed state for {@link ExplorerGroup} accordions (all open by default). */
export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const isOpen = useCallback((key: string) => !collapsed.has(key), [collapsed]);
  return { collapsed, isOpen, toggle };
}
