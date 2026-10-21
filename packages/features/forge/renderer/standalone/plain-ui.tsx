import { cloneElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { LuCheck, LuChevronDown, LuChevronRight } from 'react-icons/lu';

import type {
  ForgeExternalLinkProps,
  ForgeMultiSelectMenuProps,
  ForgePopoverProps,
  ForgeRefLinkProps,
  ForgeTooltipProps,
  ForgeTreeSectionProps,
  ForgeUserAvatarProps,
} from '../host';

/**
 * Plain chrome for an app that is not Studio (Phase 113 Theme O) — the members
 * of {@link ForgeHost} that Studio fills from its own `components/`, drawn over
 * the frame's tokens with no occluder stack, no avatar cache and no network:
 * an avatar is an initial, a tooltip is a native `title`.
 */

export function PlainTooltip({ label, children }: ForgeTooltipProps) {
  return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
}

export function PlainUserAvatar({ login, name, size = 16, withTooltip = true, detail, className = '' }: ForgeUserAvatarProps) {
  const who = login || name || '?';
  const title = withTooltip ? [who, detail].filter(Boolean).join(' — ') : undefined;
  return (
    <span
      aria-hidden
      title={title}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-muted font-semibold uppercase text-muted-foreground ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.5)) }}
    >
      {who.slice(0, 1)}
    </span>
  );
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function PlainPopover(props: ForgePopoverProps) {
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const setOpen = (next: boolean) => (props.onOpenChange ? props.onOpenChange(next) : setOwn(next));
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={props.label}
        title={props.title}
        disabled={props.disabled}
        aria-expanded={open}
        className={props.triggerClassName}
        data-testid={props.testId}
        onClick={() => setOpen(!open)}
      >
        {props.trigger}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={props.label}
          className={`absolute z-50 mt-1 rounded-md border border-border bg-popover shadow-lg ${props.side === 'top' ? 'bottom-full mb-1' : 'top-full'} ${props.align === 'end' ? 'right-0' : 'left-0'} ${props.panelClassName ?? ''}`}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

export function PlainMultiSelectMenu(props: ForgeMultiSelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useOutsideClose(open, () => setOpen(false));
  const needle = query.trim().toLowerCase();
  const shown = props.options.filter((o) => !needle || `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(needle));
  const toggle = (value: string) =>
    props.onChange(props.selected.includes(value) ? props.selected.filter((v) => v !== value) : [...props.selected, value]);
  const summary = props.selected.length === 0 ? props.allLabel : props.selected.length === 1 ? (props.options.find((o) => o.value === props.selected[0])?.label ?? props.summarise(1)) : props.summarise(props.selected.length);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={props.label} aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground">
        {props.icon}
        <span className="max-w-32 truncate">{summary}</span>
        <LuChevronDown aria-hidden className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-popover p-1 shadow-lg">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={props.searchPlaceholder} className="mb-1 h-7 w-full rounded border border-border bg-background px-2 text-[11px]" />
          {shown.length === 0 ? <p className="px-2 py-1 text-[11px] text-muted-foreground">{props.emptyLabel}</p> : null}
          {shown.map((option) => (
            <button key={option.value} type="button" role="menuitemcheckbox" aria-checked={props.selected.includes(option.value)} onClick={() => toggle(option.value)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-accent">
              <LuCheck aria-hidden className={`h-3 w-3 ${props.selected.includes(option.value) ? '' : 'invisible'}`} />
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.meta}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PlainTreeSection({ title, count, collapsible, open = true, onToggle, children }: ForgeTreeSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <button id={id} type="button" disabled={!collapsible} aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {collapsible ? <LuChevronRight aria-hidden className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} /> : null}
        <span className="flex-1 truncate">{title}</span>
        {count === undefined ? null : <span className="tabular-nums">{count}</span>}
      </button>
      {open ? children : null}
    </section>
  );
}

export function plainExternalLink(openExternal: (url: string) => void) {
  return function PlainExternalLink({ href, children, className = '' }: ForgeExternalLinkProps) {
    if (!href) return <span className={className}>{children}</span>;
    return (
      <a href={href} className={`text-primary underline-offset-2 hover:underline ${className}`} onClick={(event) => { event.preventDefault(); openExternal(href); }}>
        {children as ReactNode}
      </a>
    );
  };
}

export function plainForgeRefLink(openExternal: (url: string) => void) {
  return function PlainForgeRefLink({ url, number }: ForgeRefLinkProps) {
    return (
      <a href={url} className="tabular-nums text-muted-foreground hover:underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openExternal(url); }}>
        #{number}
      </a>
    );
  };
}
